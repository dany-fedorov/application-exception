import { CorjMaker } from 'caught-object-report-json';
import type {
  CorjErrorContext,
  CorjJsonValue,
} from 'caught-object-report-json';
import { invalid } from './errors';
import { createOccurrence } from './occurrence';
import { PUBLIC_REPORT_VERSION } from './report-types';
import type {
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicReport,
  PublicReportOptions,
  ReportingError,
} from './report-types';
import {
  brandedOccurrenceId,
  memoizedReference,
  publicPolicyOf,
} from './typed-internals';
import type { PublicPolicyRecord } from './typed-internals';

const CONTEXT_MAX_BYTES = 16_384;
const PUBLIC_DETAILS_MAX_BYTES = 16_384;
const PUBLIC_MESSAGE_MAX_LENGTH = 4_096;
const MAX_REPORTING_ERRORS = 8;
const GENERIC_CODE = 'INTERNAL_ERROR';
const GENERIC_MESSAGE = 'Something went wrong';
const DIAGNOSTIC_OPTION_KEYS = [
  'reference',
  'context',
  'maxReportSize',
  'maxDepth',
  'maxChildren',
  'stackFormat',
];
const PUBLIC_OPTION_KEYS = ['reference', 'code', 'message', 'details'];
const PUBLIC_FIELDS = new Set([
  'v',
  'reference',
  'code',
  'message',
  'as_json',
  'truncated',
]);
const DECODE_MAX_DEPTH = 32;
const DECODE_MAX_VALUES = 10_000;

type Compacted<T> = { [K in keyof T]?: Exclude<T[K], undefined> };
type OnError = (caught: unknown, context: CorjErrorContext) => void;

function describe(value: unknown): string {
  try {
    return String(value).slice(0, 256);
  } catch {
    return '[unprintable value]';
  }
}

function compact<T extends object>(value: T): Compacted<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Compacted<T>;
}

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

function boundedIdentifier(
  value: unknown,
  code: 'APPEX_INVALID_REFERENCE' | 'APPEX_INVALID_PUBLIC_CODE',
  name: string,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    throw invalid(
      code,
      `${name} must be a nonempty string of at most 128 characters`,
    );
  return value;
}

function referenceFor(caught: unknown, explicit: unknown): string {
  if (explicit !== undefined)
    return boundedIdentifier(explicit, 'APPEX_INVALID_REFERENCE', 'reference');
  return (
    brandedOccurrenceId(caught) ??
    memoizedReference(caught, () => createOccurrence().id)
  );
}

function recorder(errors: ReportingError[], prefix: string): OnError {
  return (caught, context) => {
    if (errors.length >= MAX_REPORTING_ERRORS) return;
    errors.push(
      compact({
        stage: context.stage,
        path: prefix + context.path.slice(1),
        key: context.key,
        prop: context.prop,
        error: describe(caught),
      }) as ReportingError,
    );
  };
}

/** corj's bounded JSON view of any value: `as_json` of a childless report. */
function jsonView(
  value: unknown,
  maxBytes: number,
  onError: OnError,
): { readonly value: CorjJsonValue | null; readonly truncated: boolean } {
  const view = new CorjMaker({
    childrenSources: [],
    maxDepth: 0,
    maxReportSize: maxBytes,
    metadata: false,
    onError,
  }).makeReportObject(value);
  return {
    value: view.as_json === undefined ? {} : view.as_json,
    truncated: view.truncated === true,
  };
}

/**
 * Report any caught value for operators: a corj report with `reference`,
 * optional `context`, and `reporting_errors`. Send it to a trusted sink; it
 * contains messages, stacks, and every enumerable property of the error graph.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_REFERENCE`; corj option errors propagate.
 * @example
 * ```ts
 * import { toDiagnosticReport } from 'application-exception';
 *
 * try {
 *   throw new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
 * } catch (caught: unknown) {
 *   const report = toDiagnosticReport(caught, {
 *     context: { runId: 'run-1', tool: 'search' },
 *   });
 *   console.error(JSON.stringify(report));
 *   // { "reference": "AE_…", "stack": [...], "children": [{ "path": "$.cause", ... }],
 *   //   "v": "corj/v0.12", "context": { "runId": "run-1", "tool": "search" } }
 * }
 * ```
 */
export function toDiagnosticReport(
  caught: unknown,
  options: DiagnosticReportOptions = {},
): DiagnosticReport {
  assertOptions(options, DIAGNOSTIC_OPTION_KEYS);
  const reference = referenceFor(caught, options.reference);
  const errors: ReportingError[] = [];
  const report = new CorjMaker({
    ...compact({
      maxReportSize: options.maxReportSize,
      maxDepth: options.maxDepth,
      maxChildren: options.maxChildren,
      stackFormat: options.stackFormat,
    }),
    onError: recorder(errors, '$'),
  }).makeReportObject(caught);
  const context =
    options.context === undefined
      ? {}
      : {
          context: jsonView(
            options.context,
            CONTEXT_MAX_BYTES,
            recorder(errors, '$.context'),
          ).value,
        };
  // corj always emits `v` under these options (metadata.v defaults to true).
  return {
    reference,
    ...report,
    ...context,
    ...(errors.length > 0 ? { reporting_errors: errors } : {}),
  } as DiagnosticReport;
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
 * into `code`, `message`, and `as_json`, with the same `reference` as the
 * diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
 * generic message. Nothing is read from the error except its policy inputs.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_REFERENCE`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`
 * @example
 * ```ts
 * import { defineException, toPublicReport } from 'application-exception';
 *
 * const ToolUnavailable = defineException({
 *   tag: 'tools/Unavailable',
 *   message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
 *   public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
 * });
 *
 * const report = toPublicReport(new ToolUnavailable({ details: { tool: 'search' } }));
 * // { v: 'appex/public/v3', reference: 'AE_…', code: 'TOOL_UNAVAILABLE',
 * //   message: 'Something went wrong', as_json: { tool: 'search' } }
 * const generic = toPublicReport(new Error('secret'));
 * // { v: 'appex/public/v3', reference: 'AE_…', code: 'INTERNAL_ERROR', message: 'Something went wrong' }
 * console.log(report.code, generic.code);
 * ```
 */
export function toPublicReport(
  caught: unknown,
  options: PublicReportOptions = {},
): PublicReport {
  assertOptions(options, PUBLIC_OPTION_KEYS);
  const reference = referenceFor(caught, options.reference);
  if (options.message !== undefined && typeof options.message !== 'string')
    throw invalid('APPEX_INVALID_PUBLIC_MESSAGE', 'message must be a string');
  const policy = publicPolicyOf(caught);
  const details =
    policy === undefined ? {} : (caught as { readonly details: object }).details;
  const code =
    options.code === undefined
      ? policy?.code ?? GENERIC_CODE
      : boundedIdentifier(options.code, 'APPEX_INVALID_PUBLIC_CODE', 'code');
  const message = options.message ?? renderPublicMessage(policy, details);
  const selected =
    options.details === undefined
      ? selectPublicDetails(policy, details)
      : options.details;
  const view =
    selected === undefined
      ? undefined
      : jsonView(selected, PUBLIC_DETAILS_MAX_BYTES, () => undefined);
  const cut = message.length > PUBLIC_MESSAGE_MAX_LENGTH;
  const truncated = cut || view?.truncated === true;
  return {
    v: PUBLIC_REPORT_VERSION,
    reference,
    code,
    message: cut ? message.slice(0, PUBLIC_MESSAGE_MAX_LENGTH) : message,
    ...(view === undefined ? {} : { as_json: view.value }),
    ...(truncated ? { truncated: true } : {}),
  };
}

class Rejection {
  constructor(readonly reason: string, readonly path: string) {}
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
    reject(`as_json exceeds ${DECODE_MAX_VALUES.toLocaleString('en-US')} values`, path);
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
 *
 * const received: unknown = JSON.parse(
 *   '{"v":"appex/public/v3","reference":"AE_1","code":"TOOL_UNAVAILABLE","message":"Down."}',
 * );
 * const decoded = decodePublicReport(received);
 * if (decoded.ok) {
 *   console.log(decoded.report.code); // 'TOOL_UNAVAILABLE'
 * } else {
 *   console.log(decoded.reason, decoded.path);
 * }
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
      reference: boundedText(value['reference'], '$.reference', 1, 128),
      code: boundedText(value['code'], '$.code', 1, 128),
      message: boundedText(
        value['message'],
        '$.message',
        0,
        PUBLIC_MESSAGE_MAX_LENGTH,
      ),
      ...(value['as_json'] !== undefined
        ? { as_json: detachJson(value['as_json'], '$.as_json', 0, { values: 0 }) }
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
