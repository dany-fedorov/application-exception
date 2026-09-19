import { describeValue, invalid } from './errors';

/** Global brand: a diagnostic hint that a value came from some copy of this package, never proof of local identity. */
export const TYPED_EXCEPTION_BRAND = Symbol.for(
  'application-exception/TypedException',
);

/** A validated `public` policy as stored for instances of one kind. */
export type PublicPolicyRecord = {
  readonly code: string;
  readonly message?: string | ((details: object) => string);
  readonly details?: (details: object) => unknown;
};

const instances = new WeakSet<object>();
const policies = new WeakMap<object, PublicPolicyRecord>();
const occurrenceIds = new WeakMap<object, string>();

export function registerTypedException(
  error: object,
  policy: PublicPolicyRecord | undefined,
  realm?: TrustRealmApi,
): void {
  instances.add(error);
  if (policy !== undefined) policies.set(error, policy);
  realm?.register(error, policy);
}

export function isLocalTypedException(value: unknown): value is object {
  return typeof value === 'object' && value !== null && instances.has(value);
}

export function publicPolicyOf(value: unknown): PublicPolicyRecord | undefined {
  return isLocalTypedException(value) ? policies.get(value) : undefined;
}

function ownData(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Ids this package accepts and emits: printable ASCII without spaces, at most 128 characters. */
export const ID_PATTERN = /^[\x21-\x7e]{1,128}$/;

/** The `occurrenceId` of a branded occurrence (local or from another package copy), read from data properties only. */
export function brandedOccurrenceId(value: unknown): string | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      ownData(value, TYPED_EXCEPTION_BRAND) !== true
    )
      return undefined;
    const id = ownData(value, 'occurrenceId');
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** One occurrence id per object or function for the life of the process; primitives get a new one each time. */
export function memoizedOccurrenceId(
  value: unknown,
  create: () => string,
): string {
  const keyable =
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function';
  if (!keyable) return create();
  const existing = occurrenceIds.get(value);
  if (existing !== undefined) return existing;
  const created = create();
  occurrenceIds.set(value, created);
  return created;
}

/** Global key of a trust realm's cross-copy API; the realm object itself is the capability, this is only where its methods live. */
export const TRUST_REALM_API = Symbol.for('application-exception/TrustRealm');

/** The realm protocol this copy speaks. A realm built by another protocol is rejected, never silently half-trusted. */
export const TRUST_REALM_PROTOCOL = 'appex/realm/v1' as const;

/**
 * The methods a realm exposes so copies with different module-local state can
 * still share one registry. Only object identity is ever used as a key, so no
 * tag, brand, or deserialized value can acquire a policy.
 */
export interface TrustRealmApi {
  readonly protocol: string;
  readonly register: (
    error: object,
    policy: PublicPolicyRecord | undefined,
  ) => void;
  readonly has: (value: object) => boolean;
  readonly policyOf: (value: object) => PublicPolicyRecord | undefined;
}

/** An explicit trust boundary shared between cooperating copies of this package. */
export interface TrustRealm {
  readonly [TRUST_REALM_API]: TrustRealmApi;
}

export function makeTrustRealm(): TrustRealm {
  const realmInstances = new WeakSet<object>();
  const realmPolicies = new WeakMap<object, PublicPolicyRecord>();
  const api: TrustRealmApi = {
    protocol: TRUST_REALM_PROTOCOL,
    register(error, policy) {
      realmInstances.add(error);
      if (policy !== undefined) realmPolicies.set(error, policy);
    },
    has: (value) => realmInstances.has(value),
    policyOf: (value) => realmPolicies.get(value),
  };
  return Object.freeze({ [TRUST_REALM_API]: Object.freeze(api) });
}

/** The realm's API, or `undefined` for `undefined`; anything else is a caller mistake and throws. */
export function trustRealmApi(realm: unknown): TrustRealmApi | undefined {
  if (realm === undefined) return undefined;
  let api: unknown;
  try {
    api =
      typeof realm === 'object' && realm !== null
        ? (realm as Record<symbol, unknown>)[TRUST_REALM_API]
        : undefined;
  } catch {
    api = undefined;
  }
  if (typeof api !== 'object' || api === null)
    throw invalid(
      'APPEX_INVALID_TRUST_REALM',
      'realm must be a value returned by createTrustRealm',
    );
  const candidate = api as Partial<TrustRealmApi>;
  if (candidate.protocol !== TRUST_REALM_PROTOCOL)
    throw invalid(
      'APPEX_INVALID_TRUST_REALM',
      `realm speaks ${describeValue(candidate.protocol)}; this copy speaks ${TRUST_REALM_PROTOCOL}`,
    );
  if (
    typeof candidate.register !== 'function' ||
    typeof candidate.has !== 'function' ||
    typeof candidate.policyOf !== 'function'
  )
    throw invalid(
      'APPEX_INVALID_TRUST_REALM',
      `realm claims ${TRUST_REALM_PROTOCOL} without its methods`,
    );
  return candidate as TrustRealmApi;
}

/** Whether a value is an occurrence of this copy, or of a copy that shares the given realm. */
export function isTrustedTypedException(
  value: unknown,
  api: TrustRealmApi | undefined,
): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (instances.has(value)) return true;
  if (api === undefined) return false;
  try {
    return api.has(value) === true;
  } catch {
    return false;
  }
}

/** The public policy of a value trusted locally or through the realm; the local registry wins. */
export function trustedPublicPolicyOf(
  value: unknown,
  api: TrustRealmApi | undefined,
): PublicPolicyRecord | undefined {
  const local = publicPolicyOf(value);
  if (local !== undefined) return local;
  if (api === undefined || typeof value !== 'object' || value === null)
    return undefined;
  try {
    return validForeignPolicy(api.policyOf(value));
  } catch {
    return undefined;
  }
}

/**
 * A policy that crossed a realm boundary, accepted only in the shape
 * `defineException` validates. A realm is trusted to say *which* values are
 * typed, never to hand back a policy that would make a public report invalid.
 */
function validForeignPolicy(policy: unknown): PublicPolicyRecord | undefined {
  if (typeof policy !== 'object' || policy === null) return undefined;
  const { code, message, details } = policy as Record<string, unknown>;
  if (typeof code !== 'string' || code.length === 0 || code.length > 128)
    return undefined;
  if (
    message !== undefined &&
    typeof message !== 'string' &&
    typeof message !== 'function'
  )
    return undefined;
  if (details !== undefined && typeof details !== 'function') return undefined;
  return policy as PublicPolicyRecord;
}
