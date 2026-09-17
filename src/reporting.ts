import { CorjMaker } from 'caught-object-report-json';
import type {
  CorjErrorContext,
  CorjJsonValue,
  CorjReport,
} from 'caught-object-report-json';
import { describeValue, invalid } from './errors';
import { createOccurrence } from './occurrence';
import {
  DIAGNOSTIC_REPORT_VERSION,
  PUBLIC_REPORT_VERSION,
} from './report-types';
import type {
  CapturedReports,
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicReport,
  PublicReportOptions,
  ReportingError,
  ToReportsOptions,
} from './report-types';
import {
  brandedOccurrenceId,
  memoizedOccurrenceId,
  trustRealmApi,
  trustedPublicPolicyOf,
} from './typed-internals';
import type { PublicPolicyRecord } from './typed-internals';
import {
  PUBLIC_PROTECTED,
  applyRedaction,
  compiledPolicy,
} from './redaction';
import type { CompiledRedactionPolicy } from './redaction';

const CONTEXT_MAX_BYTES = 16_384;
const PUBLIC_DETAILS_MAX_BYTES = 16_384;
const PUBLIC_MESSAGE_MAX_LENGTH = 4_096;
const MAX_REPORTING_ERRORS = 8;
const GENERIC_CODE = 'INTERNAL_ERROR';
const GENERIC_MESSAGE = 'Something went wrong';
const CORJ_DEFAULT_MAX_REPORT_SIZE = 100_000;
const CORJ_MIN_REPORT_SIZE = 256;
const DIAGNOSTIC_OPTION_KEYS = [
  'occurrenceId',
  'context',
  'maxReportSize',
  'maxFinalReportSize',
  'maxDepth',
  'maxChildren',
  'stackFormat',
  'redact',
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

type Compacted<T> = { [K in keyof T]?: Exclude<T[K], undefined> };
type OnError = (caught: unknown, context: CorjErrorContext) => void;

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
  code: 'APPEX_INVALID_OCCURRENCE_ID' | 'APPEX_INVALID_PUBLIC_CODE',
  name: string,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    throw invalid(
      code,
      `${name} must be a nonempty string of at most 128 characters`,
    );
  return value;
}

function occurrenceIdFor(caught: unknown, explicit: unknown): string {
  if (explicit !== undefined)
    return boundedIdentifier(
      explicit,
      'APPEX_INVALID_OCCURRENCE_ID',
      'occurrenceId',
    );
  return (
    brandedOccurrenceId(caught) ??
    memoizedOccurrenceId(caught, () => createOccurrence().id)
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
        error: describeValue(caught),
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
 * Rewrite an assembled diagnostic report through a policy. Failures of a
 * throwing `transform` are appended as `reporting_errors` and are not
 * themselves redacted: re-running the broken transform over them would erase
 * the only record that it broke. A transform that puts the value it was given
 * into its own error message therefore surfaces it here — the policy owns its
 * error text.
 */
function redactDiagnostic(
  report: DiagnosticReport,
  policy: CompiledRedactionPolicy | undefined,
): DiagnosticReport {
  if (policy === undefined) return report;
  const failures: ReportingError[] = [];
  const redacted = applyRedaction(
    report as unknown as CorjJsonValue,
    policy,
    (path, error) => {
      if (failures.length < MAX_REPORTING_ERRORS)
        failures.push({ stage: 'other', path, error });
    },
  ) as unknown as DiagnosticReport;
  // A budget that already dropped `reporting_errors` says so in
  // `report_omitted`; re-adding records here would contradict it.
  if (failures.length === 0 || redacted.report_omitted?.includes('reporting_errors'))
    return redacted;
  return {
    ...redacted,
    reporting_errors: [
      ...(redacted.reporting_errors ?? []),
      ...failures,
    ].slice(0, MAX_REPORTING_ERRORS),
  };
}

type ContextField = { readonly context: CorjJsonValue | null };
type OmittedField = 'context' | 'reporting_errors';

/** UTF-8 bytes of the compact serialization: the quantity `maxFinalReportSize` bounds. */
function finalReportSize(report: DiagnosticReport): number {
  return new TextEncoder().encode(JSON.stringify(report)).byteLength;
}

function finalBudgetOf(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1)
    throw invalid(
      'APPEX_INVALID_OPTIONS',
      'maxFinalReportSize must be a safe integer >= 1, or null to disable the limit',
    );
  return value;
}

function corjReportOf(
  caught: unknown,
  options: DiagnosticReportOptions,
  maxReportSize: number | null | undefined,
  errors: ReportingError[],
): CorjReport {
  return new CorjMaker({
    ...compact({
      maxReportSize,
      maxDepth: options.maxDepth,
      maxChildren: options.maxChildren,
      stackFormat: options.stackFormat,
    }),
    onError: recorder(errors, '$'),
  }).makeReportObject(caught);
}

/**
 * The final object in field order. corj drops `v` when its own budget cannot
 * hold the metadata, so the version is restored here: the report identifies
 * itself even at the smallest size the halving loop reaches.
 */
function assembleDiagnostic(
  occurrenceId: string,
  report: CorjReport,
  context: ContextField | undefined,
  errors: readonly ReportingError[],
  omitted: readonly OmittedField[],
): DiagnosticReport {
  return {
    occurrence_id: occurrenceId,
    ...report,
    v: report.v ?? DIAGNOSTIC_REPORT_VERSION,
    ...(context === undefined ? {} : context),
    ...(errors.length > 0 ? { reporting_errors: errors } : {}),
    ...(omitted.length > 0 ? { report_omitted: omitted } : {}),
  } as DiagnosticReport;
}

/** The final object as it will be emitted: assembled, then redacted, so every size measurement sees what a sink receives. */
function assembleRedacted(
  occurrenceId: string,
  report: CorjReport,
  context: ContextField | undefined,
  errors: readonly ReportingError[],
  omitted: readonly OmittedField[],
  policy: CompiledRedactionPolicy | undefined,
): DiagnosticReport {
  return redactDiagnostic(
    assembleDiagnostic(occurrenceId, report, context, errors, omitted),
    policy,
  );
}

/** The corj budget the halving starts from: the effective one, never above the final budget. */
function startingCorjLimit(
  maxReportSize: number | null | undefined,
  budget: number,
): number {
  const effective =
    maxReportSize === undefined
      ? CORJ_DEFAULT_MAX_REPORT_SIZE
      : (maxReportSize ?? budget);
  return Math.max(CORJ_MIN_REPORT_SIZE, Math.min(effective, budget));
}

/**
 * Fit the report into `budget` by dropping `context`, then `reporting_errors`,
 * then shrinking corj's own budget down to its 256-byte floor; throws when even
 * the smallest report does not fit. Each retry scales corj's budget by how far
 * the last one overshot, rather than halving, so the report that comes back
 * uses the budget the caller actually granted.
 */
function shrinkToBudget(
  caught: unknown,
  options: DiagnosticReportOptions,
  occurrenceId: string,
  budget: number,
  report: CorjReport,
  context: ContextField | undefined,
  errors: readonly ReportingError[],
  policy: CompiledRedactionPolicy | undefined,
): DiagnosticReport {
  const omitted: OmittedField[] = [];
  if (context !== undefined) {
    omitted.push('context');
    const next = assembleRedacted(
      occurrenceId,
      report,
      undefined,
      errors,
      omitted,
      policy,
    );
    if (finalReportSize(next) <= budget) return next;
  }
  if (errors.length > 0) {
    omitted.push('reporting_errors');
    const next = assembleRedacted(
      occurrenceId,
      report,
      undefined,
      [],
      omitted,
      policy,
    );
    if (finalReportSize(next) <= budget) return next;
  }
  let limit = startingCorjLimit(options.maxReportSize, budget);
  let overshot: number | undefined;
  for (;;) {
    if (overshot !== undefined)
      limit = Math.max(
        CORJ_MIN_REPORT_SIZE,
        Math.min(limit - 1, Math.floor((limit * budget) / overshot)),
      );
    const retryErrors: ReportingError[] = [];
    const smaller = corjReportOf(caught, options, limit, retryErrors);
    const marks =
      retryErrors.length > 0 && !omitted.includes('reporting_errors')
        ? [...omitted, 'reporting_errors' as const]
        : omitted;
    const next = assembleRedacted(
      occurrenceId,
      smaller,
      undefined,
      [],
      marks,
      policy,
    );
    const size = finalReportSize(next);
    if (size <= budget) return next;
    const stalled = limit === CORJ_MIN_REPORT_SIZE && overshot !== undefined;
    overshot = size;
    if (stalled)
      throw invalid(
        'APPEX_REPORT_BUDGET_TOO_SMALL',
        `maxFinalReportSize ${budget} cannot hold the required report envelope; the smallest report of this occurrence is ${size} bytes${options.redact === undefined ? '' : ', which a redaction policy can enlarge but never shrink'}`,
      );
  }
}

function diagnosticReportOf(
  caught: unknown,
  options: DiagnosticReportOptions,
  occurrenceId: string,
): DiagnosticReport {
  const budget = finalBudgetOf(options.maxFinalReportSize);
  const policy = compiledPolicy(options.redact);
  const errors: ReportingError[] = [];
  const report = corjReportOf(caught, options, options.maxReportSize, errors);
  const context =
    options.context === undefined
      ? undefined
      : {
          context: jsonView(
            options.context,
            CONTEXT_MAX_BYTES,
            recorder(errors, '$.context'),
          ).value,
        };
  const assembled = assembleRedacted(
    occurrenceId,
    report,
    context,
    errors,
    [],
    policy,
  );
  if (budget === null || finalReportSize(assembled) <= budget) return assembled;
  return shrinkToBudget(
    caught,
    options,
    occurrenceId,
    budget,
    report,
    context,
    errors,
    policy,
  );
}

/**
 * Report any caught value for operators: a corj report with `occurrence_id`,
 * optional `context`, and `reporting_errors`. Send it to a trusted sink; it
 * contains messages, stacks, and every enumerable property of the error graph.
 * With `maxFinalReportSize`, the whole report is bounded by that many UTF-8
 * bytes of compact JSON: `context` is dropped, then `reporting_errors` (both
 * named in `report_omitted`), then corj's own budget is halved until the
 * report fits; a budget too small for the envelope throws.
 *
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_REPORT_BUDGET_TOO_SMALL`; corj option errors propagate.
 * @example
 * ```ts
 * import { toDiagnosticReport } from 'application-exception';
 * const caught: unknown = new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
 * const report = toDiagnosticReport(caught, { context: { runId: 'run-1' } });
 * // { "v": "corj/v0.12", "occurrence_id": "AE_…", "stack": [...], "children": [{ "path": "$.cause", ... }],
 * //   "context": { "runId": "run-1" } }
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
  const redact = compiledPolicy(options.redact);
  const policy = trustedPublicPolicyOf(caught, trustRealmApi(options.realm));
  const details = policy === undefined ? {} : ownDetails(caught);
  const code =
    options.code === undefined
      ? (policy?.code ?? GENERIC_CODE)
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
  const report: PublicReport = {
    v: PUBLIC_REPORT_VERSION,
    occurrence_id: occurrenceId,
    code,
    message: cut ? message.slice(0, PUBLIC_MESSAGE_MAX_LENGTH) : message,
    ...(view === undefined ? {} : { as_json: view.value }),
    ...(truncated ? { truncated: true } : {}),
  };
  if (redact === undefined) return report;
  // Redaction runs after selection: it can only narrow what the policy chose,
  // never disclose a field the selector left out. A replacement can be longer
  // than what it replaced, so the message bound is re-applied afterwards.
  const redacted = applyRedaction(
    report as unknown as CorjJsonValue,
    redact,
    () => undefined,
    PUBLIC_PROTECTED,
  ) as unknown as PublicReport;
  if (redacted.message.length <= PUBLIC_MESSAGE_MAX_LENGTH) return redacted;
  return {
    ...redacted,
    message: redacted.message.slice(0, PUBLIC_MESSAGE_MAX_LENGTH),
    truncated: true,
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
 * @throws `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`, `APPEX_REPORT_BUDGET_TOO_SMALL`; corj option errors propagate.
 * @example
 * ```ts
 * import { toReports } from 'application-exception';
 * const { occurrence_id, diagnostic, public: disclosed } = toReports('socket closed', {
 *   diagnostic: { context: { runId: 'run-1' }, maxFinalReportSize: 4096 },
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
