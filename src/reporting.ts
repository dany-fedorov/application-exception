import { invalid } from './errors';
import { createOccurrence } from './occurrence';
import { PUBLIC_REPORT_VERSION } from './report-types';
import type {
  CapturedReports,
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicOverride,
  PublicReport,
  PublicReportOptions,
  PublicReportVersion,
  ToReportsOptions,
} from './report-types';
import type { CorjJsonValue, CorjMaker } from 'caught-object-report-json';
import {
  ID_PATTERN,
  brandedOccurrenceId,
  memoizedOccurrenceId,
  trustRealmApi,
  trustedPublicPolicyOf,
} from './typed-internals';
import type { PublicPolicyRecord, TrustRealmApi } from './typed-internals';
import { makerFor } from './corj-maker';

const PUBLIC_DETAILS_MAX_BYTES = 16_384;
const PUBLIC_MESSAGE_MAX_LENGTH = 4_096;
const GENERIC_CODE = 'INTERNAL_ERROR';
const GENERIC_MESSAGE = 'Something went wrong';
const DIAGNOSTIC_OPTION_KEYS = [
  'occurrenceId',
  'context',
  'redact',
  'corj',
] satisfies readonly (keyof DiagnosticReportOptions)[];
const PUBLIC_OPTION_KEYS = [
  'occurrenceId',
  'public',
  'redact',
  'realm',
  'corj',
] satisfies readonly (keyof PublicReportOptions)[];
const PUBLIC_OVERRIDE_KEYS = [
  'code',
  'message',
  'details',
] satisfies readonly (keyof PublicOverride)[];
const NESTED_DIAGNOSTIC_OPTION_KEYS = DIAGNOSTIC_OPTION_KEYS.filter(
  (key) => key !== 'occurrenceId',
);
const NESTED_PUBLIC_OPTION_KEYS = PUBLIC_OPTION_KEYS.filter(
  (key) => key !== 'occurrenceId',
);
const TO_REPORTS_OPTION_KEYS = [
  'occurrenceId',
  'diagnostic',
  'public',
] satisfies readonly (keyof ToReportsOptions)[];
const PUBLIC_FIELDS = new Set([
  'v',
  'occurrence_id',
  'fingerprint',
  'code',
  'message',
  'as_json',
  'truncated',
]);
const PUBLIC_REPORT_VERSION_V3: PublicReportVersion = 'appex/public/v3';
const FINGERPRINT_PATTERN = /^[\x21-\x7e]{1,64}$/;
const DECODE_MAX_DEPTH = 32;
const DECODE_MAX_VALUES = 10_000;
const DECODE_MAX_PATH_KEY = 64;
const DECODE_MAX_PATH = 256;

function assertOptions(
  options: unknown,
  known: readonly string[],
  name = 'options',
): asserts options is object {
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    throw invalid('APPEX_INVALID_OPTIONS', `${name} must be an object`);
  for (const key of Object.keys(options)) {
    if (!known.includes(key))
      throw invalid(
        'APPEX_INVALID_OPTIONS',
        `unknown option "${key}"; known options: ${known.join(', ')}`,
      );
  }
}

/** The public `code`: a length-only rule, because it never reaches corj. */
function publicCodeOf(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    throw invalid(
      'APPEX_INVALID_PUBLIC_CODE',
      'public.code must be a nonempty string of at most 128 characters',
    );
  return value;
}

const NO_OVERRIDE: PublicOverride = Object.freeze({});

/**
 * The call's `public` override as a frozen snapshot, validated field by field
 * before anything is built. Each field of the caller's bag is read exactly
 * once, and the report is built from that snapshot: an accessor that answers
 * differently the second time cannot show the validator one value and the
 * report another. A getter that throws is the caller's own input and
 * propagates, before either report exists.
 */
function publicOverrideOf(value: unknown): PublicOverride {
  if (value === undefined) return NO_OVERRIDE;
  assertOptions(value, PUBLIC_OVERRIDE_KEYS, 'public');
  const { code, message, details } = value as Record<string, unknown>;
  const validCode = code === undefined ? undefined : publicCodeOf(code);
  if (
    message !== undefined &&
    typeof message !== 'string' &&
    typeof message !== 'function'
  )
    throw invalid(
      'APPEX_INVALID_PUBLIC_MESSAGE',
      'public.message must be a string or a function of the details',
    );
  if (
    details !== undefined &&
    details !== null &&
    typeof details !== 'function'
  )
    throw invalid(
      'APPEX_INVALID_OPTIONS',
      'public.details must be a function that selects the JSON to disclose, or null',
    );
  return Object.freeze({
    ...(validCode === undefined ? {} : { code: validCode }),
    ...(message === undefined
      ? {}
      : { message: message as NonNullable<PublicOverride['message']> }),
    ...(details === undefined
      ? {}
      : {
          details: details as Exclude<PublicOverride['details'], undefined>,
        }),
  });
}

/** The kind's policy with the call's override laid over it, field by field. */
function effectivePolicy(
  policy: PublicPolicyRecord | undefined,
  override: PublicOverride,
): {
  readonly code: string;
  readonly message: PublicPolicyRecord['message'];
  readonly details: PublicPolicyRecord['details'] | null;
} {
  return {
    code: override.code ?? policy?.code ?? GENERIC_CODE,
    message: override.message ?? policy?.message,
    details:
      override.details === undefined ? policy?.details : override.details,
  };
}

/**
 * An explicit occurrence id. corj validates the same pattern and throws a plain
 * `TypeError`, so the check happens here first: a caller sees this package's
 * coded error.
 */
function occurrenceIdOf(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value))
    throw invalid(
      'APPEX_INVALID_OCCURRENCE_ID',
      'occurrenceId must be 1 to 128 printable ASCII characters without spaces',
    );
  return value;
}

function occurrenceIdFor(caught: unknown, explicit: unknown): string {
  if (explicit !== undefined) return occurrenceIdOf(explicit);
  return (
    brandedOccurrenceId(caught) ??
    memoizedOccurrenceId(caught, () => createOccurrence().id)
  );
}

/** Everything a diagnostic report is built from, with the caller's bag left behind. */
interface ResolvedDiagnostic {
  readonly maker: CorjMaker;
  readonly context: unknown;
}

/** Everything a public report is built from, with the caller's bag left behind. */
interface ResolvedPublic {
  readonly override: PublicOverride;
  readonly maker: CorjMaker;
  readonly realmApi: TrustRealmApi | undefined;
}

/**
 * Read a diagnostic bag once and validate it. Every later step works from the
 * result, so an accessor that answers differently the second time cannot show
 * the validator one value and the report another, and a bag that throws or is
 * rejected does so before any report exists.
 */
function resolveDiagnostic(
  options: DiagnosticReportOptions,
): ResolvedDiagnostic {
  return {
    maker: makerFor(options.corj, options.redact),
    context: options.context,
  };
}

/** Read a public bag once and validate it, `realm` included; see `resolveDiagnostic`. */
function resolvePublic(options: PublicReportOptions): ResolvedPublic {
  return {
    override: publicOverrideOf(options.public),
    maker: makerFor(options.corj, options.redact),
    realmApi: trustRealmApi(options.realm),
  };
}

function diagnosticReportOf(
  caught: unknown,
  resolved: ResolvedDiagnostic,
  occurrenceId: string,
): DiagnosticReport {
  // The id is always the call argument: toPublicReport needs the same id
  // without building a corj report, and two loaded copies of corj would each
  // hold their own memo.
  return resolved.maker.makeReportObject(caught, {
    occurrenceId,
    context: resolved.context,
  }) as DiagnosticReport;
}

/**
 * Report any caught value for operators: a corj report with `occurrence_id`,
 * `fingerprint`, the optional `context`, and `reporting_errors`. Send it to a
 * trusted sink; it contains messages, stacks, and every enumerable property of
 * the error graph. Every option of caught-object-report-json is reachable
 * through `corj`, except `redact`, which both reports share at the top level.
 *
 * `corj: { maxReportSize }` (at least 512) bounds the whole report in UTF-8
 * bytes of compact JSON: over budget, corj drops `context` whole, then
 * `reporting_errors` — leaving `context_omitted` and `reporting_errors_omitted`
 * at `'max_size'` — and only then trims error content. `occurrence_id`,
 * `fingerprint` and `v` are never trimmed.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_REDACTION_POLICY`; corj option errors propagate.
 * @example
 * ```ts
 * import { toDiagnosticReport } from 'application-exception';
 * const caught: unknown = new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
 * const report = toDiagnosticReport(caught, {
 *   context: { runId: 'run-1' },
 *   corj: { maxReportSize: 4096 },
 * });
 * // { "v": "corj/v0.14", "occurrence_id": "AE_…", "fingerprint": "fp1_…", "stack": [...],
 * //   "children": [{ "path": "$.cause", ... }], "context": { "runId": "run-1" } }
 * console.error(JSON.stringify(report));
 * ```
 */
export function toDiagnosticReport(
  caught: unknown,
  options: DiagnosticReportOptions = {},
): DiagnosticReport {
  assertOptions(options, DIAGNOSTIC_OPTION_KEYS);
  const occurrenceId = occurrenceIdFor(caught, options.occurrenceId);
  return diagnosticReportOf(caught, resolveDiagnostic(options), occurrenceId);
}

/** The `details` data property of a caught value, never running an accessor and never throwing. */
function ownDetails(caught: unknown): object {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(
      caught as object,
      'details',
    );
    const value =
      descriptor && 'value' in descriptor ? descriptor.value : undefined;
    return typeof value === 'object' && value !== null ? (value as object) : {};
  } catch {
    return {};
  }
}

function renderPublicMessage(
  message: PublicPolicyRecord['message'],
  details: object,
): string {
  if (message === undefined) return GENERIC_MESSAGE;
  if (typeof message === 'string') return message;
  try {
    const rendered = message(details);
    return typeof rendered === 'string' ? rendered : GENERIC_MESSAGE;
  } catch {
    return GENERIC_MESSAGE;
  }
}

function selectPublicDetails(
  select: PublicPolicyRecord['details'] | null,
  details: object,
): unknown {
  if (select === undefined || select === null) return undefined;
  try {
    return select(details);
  } catch {
    return undefined;
  }
}

/**
 * Report a failure to an agent or user: the kind's `public` policy rendered
 * into `code`, `message`, and `as_json`, with the same `occurrence_id` as the
 * diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
 * generic message. Nothing from the error is emitted except the policy's
 * outputs, `occurrence_id` and the fingerprint, a hash. The default recipe
 * hashes constructor names and stack text under this call's own `corj` and
 * `redact`; `corj: { fingerprintParts: null }` reads nothing. It is published
 * only when backed by real stack frames: a stackless value and any recipe
 * without `stack` publish none — that hash is over the value's own text.
 *
 * The `public` option overrides that policy for this call, field by field:
 * `code`, `message` (a string or a function of the details) and `details` (a
 * selector function, or `null` to disclose nothing). A field left out keeps
 * what the kind says.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`; corj option errors propagate.
 * @example
 * ```ts
 * import { defineException, toPublicReport } from 'application-exception';
 * const ToolUnavailable = defineException({
 *   tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
 *   public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
 * });
 * const failure = new ToolUnavailable({ details: { tool: 'search' } });
 * const report = toPublicReport(failure, { public: { message: 'Search is down.' } });
 * // { v: 'appex/public/v4', occurrence_id: 'AE_…', fingerprint: 'fp1_…',
 * //   code: 'TOOL_UNAVAILABLE', message: 'Search is down.', as_json: { tool: 'search' } }
 * console.log(report.code, toPublicReport(new Error('secret')).code); // … 'INTERNAL_ERROR'
 * ```
 */
export function toPublicReport(
  caught: unknown,
  options: PublicReportOptions = {},
): PublicReport {
  assertOptions(options, PUBLIC_OPTION_KEYS);
  const occurrenceId = occurrenceIdFor(caught, options.occurrenceId);
  return publicReportOf(caught, resolvePublic(options), occurrenceId);
}

/**
 * The fingerprint is always this bag's own: `requireStack` withholds it unless
 * the hash is backed by the root's real stack frames, so it never comes from
 * the value's own text, which a reader who can guess that text could confirm.
 */
function publicReportOf(
  caught: unknown,
  resolved: ResolvedPublic,
  occurrenceId: string,
): PublicReport {
  const { override, maker } = resolved;
  const policy = trustedPublicPolicyOf(caught, resolved.realmApi);
  const details = policy === undefined ? {} : ownDetails(caught);
  const effective = effectivePolicy(policy, override);
  const { code } = effective;
  const rendered = renderPublicMessage(effective.message, details);
  // The public message is one of the two strings corj never sees. It is scrubbed
  // before the length bound is applied, so a replacement longer than what it
  // replaced can never push the message past it.
  const message = maker.scrubText(rendered, {
    path: '$public.message',
    key: 'message',
  });
  const selected = selectPublicDetails(effective.details, details);
  const view =
    selected === undefined
      ? undefined
      : // `view.errors` is ignored: a public report never reports inspection failures.
        maker.makeJson(selected, {
          root: '$public',
          maxSize: PUBLIC_DETAILS_MAX_BYTES,
        });
  const cut = message.length > PUBLIC_MESSAGE_MAX_LENGTH;
  const truncated = cut || view?.truncated === true;
  const print = maker.makeFingerprint(caught, { requireStack: true });
  // Redaction runs after selection: the policy is only ever given what the
  // kind's selector returned, never anything the selector left out.
  return {
    v: PUBLIC_REPORT_VERSION,
    occurrence_id: occurrenceId,
    ...(typeof print === 'string' ? { fingerprint: print } : {}),
    code,
    message: cut ? message.slice(0, PUBLIC_MESSAGE_MAX_LENGTH) : message,
    ...(view === undefined ? {} : { as_json: view.value }),
    ...(truncated ? { truncated: true } : {}),
  };
}

/**
 * Report one failure to both audiences at once: the occurrence id is resolved
 * once and shared, so `diagnostic.occurrence_id === public.occurrence_id`
 * holds for every caught value, primitives included. The per-report options
 * live in `options.diagnostic` and `options.public`; the occurrence id is
 * overridden for both at the top level. Every option bag is read once and
 * validated before either report is built, `realm` included, and a failure to
 * build either one throws instead of returning half a pair. Each report's
 * fingerprint comes from its own bag, so they agree when both bags carry the
 * same `corj` and `redact`.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`; corj option errors propagate.
 * @example
 * ```ts
 * import { toReports } from 'application-exception';
 * const { occurrence_id, diagnostic, public: disclosed } = toReports('socket closed', {
 *   diagnostic: { context: { runId: 'run-1' }, corj: { maxReportSize: 4096 } },
 * });
 * console.error(JSON.stringify(diagnostic)); // the operator copy
 * console.log(disclosed.code, occurrence_id); // 'INTERNAL_ERROR' 'AE_…'
 * ```
 */
export function toReports(
  caught: unknown,
  options: ToReportsOptions = {},
): CapturedReports {
  assertOptions(options, TO_REPORTS_OPTION_KEYS);
  const diagnosticBag = options.diagnostic;
  const publicBag = options.public;
  const diagnosticOptions = diagnosticBag === undefined ? {} : diagnosticBag;
  const publicOptions = publicBag === undefined ? {} : publicBag;
  assertOptions(diagnosticOptions, NESTED_DIAGNOSTIC_OPTION_KEYS);
  assertOptions(publicOptions, NESTED_PUBLIC_OPTION_KEYS);
  // Both bags are read and validated here and never read again, so everything
  // that rejects one — the public override, `realm`, and each maker, which is
  // where corj rejects its own options — throws before either report exists,
  // and the reports are built from exactly the values that were validated. The
  // diagnostic report is built first because it is the fuller of the two.
  const resolvedPublic = resolvePublic(publicOptions);
  const resolvedDiagnostic = resolveDiagnostic(diagnosticOptions);
  const occurrenceId = occurrenceIdFor(caught, options.occurrenceId);
  const diagnostic = diagnosticReportOf(
    caught,
    resolvedDiagnostic,
    occurrenceId,
  );
  return {
    occurrence_id: occurrenceId,
    diagnostic,
    public: publicReportOf(caught, resolvedPublic, occurrenceId),
  };
}

class Rejection {
  constructor(
    readonly reason: string,
    readonly path: string,
  ) {}
}

/**
 * A rejection `path` is built from keys the sender chose and the recipes hand it
 * to an agent, so it is bounded like any other text that crosses the boundary:
 * each key segment at 64 characters, the whole path at 256.
 */
function reject(reason: string, path: string): never {
  throw new Rejection(
    reason,
    path.length > DECODE_MAX_PATH ? path.slice(0, DECODE_MAX_PATH) : path,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function detachJson(
  value: unknown,
  path: string,
  depth: number,
  budget: { values: number },
): CorjJsonValue {
  if (++budget.values > DECODE_MAX_VALUES)
    reject(
      `as_json exceeds ${DECODE_MAX_VALUES.toLocaleString('en-US')} values`,
      path,
    );
  if (depth > DECODE_MAX_DEPTH)
    reject(`as_json exceeds depth ${DECODE_MAX_DEPTH}`, path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? value
      : reject('Expected a finite number', path);
  if (Array.isArray(value))
    return value.map((item, index) =>
      detachJson(item, `${path}[${index}]`, depth + 1, budget),
    );
  if (!isPlainObject(value)) reject('Expected a JSON value', path);
  const output: Record<string, CorjJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(output, key, {
      value: detachJson(
        item,
        `${path}.${key.slice(0, DECODE_MAX_PATH_KEY)}`,
        depth + 1,
        budget,
      ),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function boundedText(
  value: unknown,
  path: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') reject('Expected a string', path);
  if (value.length < min || value.length > max)
    reject(`Expected ${min} to ${max} characters`, path);
  return value;
}

/** The report's own format, which a decoded report keeps: this version, or the one before it. */
function publicVersionOf(value: unknown): PublicReportVersion {
  if (value !== PUBLIC_REPORT_VERSION && value !== PUBLIC_REPORT_VERSION_V3)
    reject(
      `Expected version ${PUBLIC_REPORT_VERSION_V3} or ${PUBLIC_REPORT_VERSION}`,
      '$.v',
    );
  return value as PublicReportVersion;
}

/**
 * A v4 `occurrence_id` is the token this package mints and the v4 schema
 * enforces: recipes quote it into escalation text, so a v4 sender may not put
 * free text with spaces or newlines where the receiver expects an identifier.
 * v3 predates the rule and stays length-only, so a 0.4 sender remains readable.
 */
function decodedOccurrenceIdOf(
  value: unknown,
  version: PublicReportVersion,
): string {
  const id = boundedText(value, '$.occurrence_id', 1, 128);
  if (version === PUBLIC_REPORT_VERSION && !ID_PATTERN.test(id))
    reject(
      'Expected 1 to 128 printable ASCII characters without spaces',
      '$.occurrence_id',
    );
  return id;
}

function fingerprintOf(value: unknown): string {
  if (typeof value !== 'string') reject('Expected a string', '$.fingerprint');
  if (!FINGERPRINT_PATTERN.test(value))
    reject(
      'Expected 1 to 64 printable ASCII characters without spaces',
      '$.fingerprint',
    );
  return value;
}

/**
 * Validate a public report received as JSON and return a detached copy, or
 * the first reason it is not a public report. Branch on `report.code` after
 * `ok`; escalate on `!ok` with `reason` and `path`. Both `appex/public/v3` and
 * `appex/public/v4` are accepted, and the decoded report keeps the `v` it
 * arrived with, so a v3 sender stays readable while services upgrade.
 *
 * @example
 * ```ts
 * import { decodePublicReport } from 'application-exception';
 * const json = '{"v":"appex/public/v3","occurrence_id":"AE_1","code":"TOOL_UNAVAILABLE","message":"Down."}';
 * const decoded = decodePublicReport(JSON.parse(json) as unknown);
 * if (decoded.ok) console.log(decoded.report.code); // 'TOOL_UNAVAILABLE'
 * else console.log(decoded.reason, decoded.path);
 * ```
 */
export function decodePublicReport(value: unknown): DecodePublicReportResult {
  try {
    if (!isPlainObject(value)) reject('Expected an object', '$');
    for (const key of Object.keys(value)) {
      if (!PUBLIC_FIELDS.has(key))
        reject('Unexpected field', `$.${key.slice(0, DECODE_MAX_PATH_KEY)}`);
    }
    const version = publicVersionOf(value['v']);
    // `fingerprint` arrived with v4: a v3 report that carries the key at all was
    // built by something that is not that format, so it is an unexpected field,
    // whatever its value. On a v4 report it is an optional field, and a key
    // explicitly set to `undefined` reads as absent, as `truncated` does.
    if ('fingerprint' in value && version === PUBLIC_REPORT_VERSION_V3)
      reject('Unexpected field', '$.fingerprint');
    const fingerprint = value['fingerprint'];
    const base = {
      v: version,
      occurrence_id: decodedOccurrenceIdOf(value['occurrence_id'], version),
      ...(fingerprint === undefined
        ? {}
        : { fingerprint: fingerprintOf(fingerprint) }),
      code: boundedText(value['code'], '$.code', 1, 128),
      message: boundedText(
        value['message'],
        '$.message',
        0,
        PUBLIC_MESSAGE_MAX_LENGTH,
      ),
      ...(value['as_json'] !== undefined
        ? {
            as_json: detachJson(value['as_json'], '$.as_json', 0, {
              values: 0,
            }),
          }
        : {}),
    };
    if (value['truncated'] !== undefined && value['truncated'] !== true)
      reject('Expected true', '$.truncated');
    const report: PublicReport = {
      ...base,
      ...(value['truncated'] === true ? { truncated: true } : {}),
    };
    return { ok: true, report };
  } catch (failure: unknown) {
    if (failure instanceof Rejection)
      return { ok: false, reason: failure.reason, path: failure.path };
    return { ok: false, reason: 'Could not inspect value', path: '$' };
  }
}
