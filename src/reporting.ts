import { invalid } from './errors';
import { createOccurrence } from './occurrence';
import { PUBLIC_REPORT_VERSION } from './report-types';
import type {
  CapturedReports,
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicReport,
  PublicReportOptions,
  ToReportsOptions,
} from './report-types';
import type { CorjJsonValue } from 'caught-object-report-json';
import {
  ID_PATTERN,
  brandedOccurrenceId,
  memoizedOccurrenceId,
  trustRealmApi,
  trustedPublicPolicyOf,
} from './typed-internals';
import type { PublicPolicyRecord } from './typed-internals';
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
  'code',
  'message',
  'details',
  'redact',
  'realm',
] satisfies readonly (keyof PublicReportOptions)[];
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
  'code',
  'message',
  'as_json',
  'truncated',
]);
const DECODE_MAX_DEPTH = 32;
const DECODE_MAX_VALUES = 10_000;

function assertOptions(
  options: unknown,
  known: readonly string[],
): asserts options is object {
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    throw invalid('APPEX_INVALID_OPTIONS', 'options must be an object');
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
      'code must be a nonempty string of at most 128 characters',
    );
  return value;
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

function diagnosticReportOf(
  caught: unknown,
  options: DiagnosticReportOptions,
  occurrenceId: string,
): DiagnosticReport {
  // The id is always the call argument: toPublicReport needs the same id
  // without building a corj report, and two loaded copies of corj would each
  // hold their own memo.
  return makerFor(options.corj, options.redact).makeReportObject(caught, {
    occurrenceId,
    context: options.context,
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
 * bytes of compact JSON. Over budget, corj drops `context` whole, then
 * `reporting_errors`, leaving `context_omitted: 'max_size'` and
 * `reporting_errors_omitted: 'max_size'`, and only then trims error content.
 * `occurrence_id`, `fingerprint` and `v` are never trimmed.
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
  return diagnosticReportOf(
    caught,
    options,
    occurrenceIdFor(caught, options.occurrenceId),
  );
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
  policy: PublicPolicyRecord | undefined,
  details: object,
): string {
  if (policy?.message === undefined) return GENERIC_MESSAGE;
  if (typeof policy.message === 'string') return policy.message;
  try {
    const rendered = policy.message(details);
    return typeof rendered === 'string' ? rendered : GENERIC_MESSAGE;
  } catch {
    return GENERIC_MESSAGE;
  }
}

function selectPublicDetails(
  policy: PublicPolicyRecord | undefined,
  details: object,
): unknown {
  if (policy?.details === undefined) return undefined;
  try {
    return policy.details(details);
  } catch {
    return undefined;
  }
}

/**
 * Report a failure to an agent or user: the kind's `public` policy rendered
 * into `code`, `message`, and `as_json`, with the same `occurrence_id` as the
 * diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
 * generic message. Nothing is read from the error except its policy inputs.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`
 * @example
 * ```ts
 * import { defineException, toPublicReport } from 'application-exception';
 * const ToolUnavailable = defineException({
 *   tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
 *   public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
 * });
 * const report = toPublicReport(new ToolUnavailable({ details: { tool: 'search' } }));
 * // { v: 'appex/public/v3', occurrence_id: 'AE_…', code: 'TOOL_UNAVAILABLE', message: 'Something went wrong',
 * //   as_json: { tool: 'search' } }
 * console.log(report.code, toPublicReport(new Error('secret')).code); // … 'INTERNAL_ERROR'
 * ```
 */
export function toPublicReport(
  caught: unknown,
  options: PublicReportOptions = {},
): PublicReport {
  assertOptions(options, PUBLIC_OPTION_KEYS);
  return publicReportOf(
    caught,
    options,
    occurrenceIdFor(caught, options.occurrenceId),
  );
}

function publicReportOf(
  caught: unknown,
  options: PublicReportOptions,
  occurrenceId: string,
): PublicReport {
  if (options.message !== undefined && typeof options.message !== 'string')
    throw invalid('APPEX_INVALID_PUBLIC_MESSAGE', 'message must be a string');
  const maker = makerFor(undefined, options.redact);
  const policy = trustedPublicPolicyOf(caught, trustRealmApi(options.realm));
  const details = policy === undefined ? {} : ownDetails(caught);
  const code =
    options.code === undefined
      ? (policy?.code ?? GENERIC_CODE)
      : publicCodeOf(options.code);
  const rendered = options.message ?? renderPublicMessage(policy, details);
  // The public message is one of the two strings corj never sees. It is scrubbed
  // before the length bound is applied, so a replacement longer than what it
  // replaced can never push the message past it.
  const message = maker.scrubText(rendered, {
    path: '$public.message',
    key: 'message',
  });
  const selected =
    options.details === undefined
      ? selectPublicDetails(policy, details)
      : options.details;
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
  // Redaction runs after selection: the policy is only ever given what the
  // kind's selector returned, never anything the selector left out.
  return {
    v: PUBLIC_REPORT_VERSION,
    occurrence_id: occurrenceId,
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
 * overridden for both at the top level. All option bags are validated before
 * either report is built, and a failure to build either one throws instead of
 * returning half a pair.
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
  const diagnosticOptions =
    options.diagnostic === undefined ? {} : options.diagnostic;
  const publicOptions = options.public === undefined ? {} : options.public;
  assertOptions(diagnosticOptions, NESTED_DIAGNOSTIC_OPTION_KEYS);
  assertOptions(publicOptions, NESTED_PUBLIC_OPTION_KEYS);
  const occurrenceId = occurrenceIdFor(caught, options.occurrenceId);
  const disclosed = publicReportOf(caught, publicOptions, occurrenceId);
  return {
    occurrence_id: occurrenceId,
    diagnostic: diagnosticReportOf(caught, diagnosticOptions, occurrenceId),
    public: disclosed,
  };
}

class Rejection {
  constructor(
    readonly reason: string,
    readonly path: string,
  ) {}
}

function reject(reason: string, path: string): never {
  throw new Rejection(reason, path);
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
      value: detachJson(item, `${path}.${key}`, depth + 1, budget),
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

/**
 * Validate a public report received as JSON and return a detached copy, or
 * the first reason it is not a public report. Branch on `report.code` after
 * `ok`; escalate on `!ok` with `reason` and `path`.
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
        reject('Unexpected field', `$.${key.slice(0, 64)}`);
    }
    if (value['v'] !== PUBLIC_REPORT_VERSION)
      reject(`Expected version ${PUBLIC_REPORT_VERSION}`, '$.v');
    const base = {
      v: PUBLIC_REPORT_VERSION,
      occurrence_id: boundedText(
        value['occurrence_id'],
        '$.occurrence_id',
        1,
        128,
      ),
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
