import { createOccurrence } from './occurrence';
import { getMessageRenderingFailure } from './typed-internals';
import {
  boundedBigIntText,
  dataValue,
  exhausted,
  diagnosticTypedView,
  DEFAULT_LIMITS,
  isErrorObject,
  makeState,
  marker,
  normalizeRead,
  normalizeValue,
  providerField,
  readProperty,
  readStack,
} from './diagnostic-value';
import {
  DIAGNOSTIC_REPORT_VERSION,
  PUBLIC_REPORT_VERSION,
} from './report-types';
import type {
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicPresentation,
  PublicReport,
} from './report-types';
export * from './report-types';
export { decodeDiagnosticReport } from './report-codec';

function safeString(
  value: unknown,
  state: ReturnType<typeof makeState>,
): string {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return String(value);
    case 'bigint': {
      if (exhausted(state)) return 'BigInt value was thrown';
      const text = boundedBigIntText(value, state);
      return text.success ? text.value : 'BigInt value was thrown';
    }
    case 'symbol':
      return value.description ?? 'Symbol';
    default:
      return value === null ? 'null' : 'Non-Error value was thrown';
  }
}
const stringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

export function toDiagnosticReport(
  caught: unknown,
  options: DiagnosticReportOptions = {},
): DiagnosticReport {
  const state = makeState(options);
  const typed = diagnosticTypedView(caught);
  const error =
    typeof caught === 'object' &&
    caught !== null &&
    (typed !== undefined || isErrorObject(caught))
      ? caught
      : undefined;
  const generated =
    typed?.id && typed.timestamp ? undefined : createOccurrence();
  const occurrence = {
    id: typed?.id ?? generated!.id,
    timestamp: typed?.timestamp ?? generated!.timestamp,
  };
  const rawName = error
    ? stringOr(dataValue(error, 'name'), typed?.tag ?? 'Error')
    : 'NonErrorThrown';
  const rawMessage = error
    ? stringOr(dataValue(error, 'message'), typed?.tag ?? '')
    : safeString(caught, state);
  const messageOmitted = Math.max(
    0,
    rawMessage.length - state.limits.maxStringLength,
  );
  const nameOmitted = Math.max(0, rawName.length - 128);
  const truncation = {
    ...(messageOmitted ? { messageOmitted } : {}),
    ...(nameOmitted ? { nameOmitted } : {}),
  };
  const report: DiagnosticReport = {
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: occurrence.id,
    name: rawName.slice(0, 128),
    message: rawMessage.slice(0, state.limits.maxStringLength),
    timestamp: occurrence.timestamp,
    ...(typed?.tag !== undefined ? { kind: typed.tag } : {}),
    ...(typed ? { details: normalizeRead(typed.details, state) } : {}),
    ...(Object.keys(truncation).length ? { truncation } : {}),
    ...(!error ? { thrown: normalizeValue(caught, state) } : {}),
    ...(options.context !== undefined
      ? { context: normalizeValue(options.context, state) }
      : {}),
  };
  if (error) {
    const output = report as unknown as Record<string, unknown>;
    for (const key of ['code', 'status'] as const) {
      const value = providerField(error, key);
      if (value !== undefined) output[key] = value;
    }
    for (const [property, field] of [
      ['cause', 'cause'],
      ['errors', 'thrown'],
    ] as const) {
      const read = readProperty(error, property);
      if (read.found) output[field] = normalizeRead(read, state);
    }
    const failure = getMessageRenderingFailure(error);
    if (failure.present)
      output['messageRenderingError'] = normalizeValue(failure.value, state);
    if (state.includeStack) {
      const stack = readStack(error);
      if (stack.found) output['stack'] = normalizeRead(stack, state);
    }
  }
  if (Buffer.byteLength(JSON.stringify(report)) <= state.limits.maxBytes)
    return report;
  // Compact envelope remains below the 4096 minimum even with JSON escaping.
  return {
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: report.reference,
    name: report.name,
    message: '',
    timestamp: occurrence.timestamp,
    ...(typed?.tag !== undefined ? { kind: typed.tag } : {}),
    truncation: {
      ...truncation,
      ...(rawMessage.length ? { messageOmitted: rawMessage.length } : {}),
      diagnosticsOmitted: true,
    },
  };
}

export function toPublicReport(
  reference: string,
  presentation: PublicPresentation = {},
): PublicReport {
  if (
    typeof reference !== 'string' ||
    reference.length === 0 ||
    reference.length > 128
  ) {
    throw new TypeError(
      'reference must be a nonempty string of at most 128 characters',
    );
  }
  const selectedCode = presentation.code;
  const code = selectedCode === undefined ? 'INTERNAL_ERROR' : selectedCode;
  const message = presentation.message ?? 'Something went wrong';
  if (typeof code !== 'string' || typeof message !== 'string')
    throw new TypeError('Public code and message must be strings');
  if (code.length === 0 || code.length > 128)
    throw new TypeError(
      'Public code must be a nonempty string of at most 128 characters',
    );
  const messageOmitted = Math.max(0, message.length - 4096);
  const truncation = {
    ...(messageOmitted ? { messageOmitted } : {}),
  };
  const report: PublicReport = {
    v: PUBLIC_REPORT_VERSION,
    reference,
    code,
    message: message.slice(0, 4096),
    ...(Object.hasOwn(presentation, 'details')
      ? { details: normalizeValue(presentation.details, makeState()) }
      : {}),
    ...(Object.keys(truncation).length ? { truncation } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(report)) <= DEFAULT_LIMITS.maxBytes)
    return report;
  return {
    ...report,
    details: marker('truncated', { reason: 'bytes' }),
    truncation: { ...truncation, detailsOmitted: true },
  };
}
