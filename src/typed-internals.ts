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
const references = new WeakMap<object, string>();

export function registerTypedException(
  error: object,
  policy: PublicPolicyRecord | undefined,
): void {
  instances.add(error);
  if (policy !== undefined) policies.set(error, policy);
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

/** The `id` of a branded occurrence (local or from another package copy), read from data properties only. */
export function brandedOccurrenceId(value: unknown): string | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      ownData(value, TYPED_EXCEPTION_BRAND) !== true
    )
      return undefined;
    const id = ownData(value, 'id');
    return typeof id === 'string' && id.length > 0 && id.length <= 128
      ? id
      : undefined;
  } catch {
    return undefined;
  }
}

/** One reference per object or function for the life of the process; primitives get a new one each time. */
export function memoizedReference(
  value: unknown,
  create: () => string,
): string {
  const keyable =
    (typeof value === 'object' && value !== null) || typeof value === 'function';
  if (!keyable) return create();
  const existing = references.get(value);
  if (existing !== undefined) return existing;
  const created = create();
  references.set(value, created);
  return created;
}
