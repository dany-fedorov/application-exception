import { ApplicationException } from './ApplicationException';
import { createOccurrence } from './occurrence';
import {
  getMessageRenderingError,
  isTypedException,
  TypedException,
} from './typed';

export const DIAGNOSTIC_REPORT_VERSION = 'appex/diagnostic/v1' as const;
export const PUBLIC_REPORT_VERSION = 'appex/public/v1' as const;

export type DiagnosticPrimitive = string | number | boolean | null;

export type DiagnosticMarker = {
  readonly $appex:
    | 'bigint'
    | 'cycle'
    | 'function'
    | 'invalid-date'
    | 'non-finite-number'
    | 'redacted'
    | 'symbol'
    | 'truncated'
    | 'undefined'
    | 'unreadable';
  readonly reason?: string;
  readonly value?: string;
  readonly omitted?: number;
};

export type DiagnosticValue =
  | DiagnosticPrimitive
  | DiagnosticMarker
  | readonly DiagnosticValue[]
  | { readonly [key: string]: DiagnosticValue };

export interface DiagnosticLimits {
  readonly maxDepth: number;
  readonly maxValues: number;
  readonly maxEntries: number;
  readonly maxStringLength: number;
}

export interface DiagnosticReportOptions {
  readonly context?: Record<string, unknown>;
  readonly limits?: Partial<DiagnosticLimits>;
  readonly redactKeys?: readonly string[];
}

export interface DiagnosticReport {
  readonly v: typeof DIAGNOSTIC_REPORT_VERSION;
  readonly reference: string;
  readonly kind?: string;
  readonly name: string;
  readonly message: string;
  readonly truncation?: { readonly messageOmitted: number };
  readonly timestamp?: string;
  readonly stack?: DiagnosticValue;
  readonly details?: DiagnosticValue;
  readonly context?: DiagnosticValue;
  readonly cause?: DiagnosticValue;
  readonly thrown?: DiagnosticValue;
  readonly messageRenderingError?: DiagnosticValue;
}

export interface PublicPresentation {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
}

export interface PublicReport {
  readonly v: typeof PUBLIC_REPORT_VERSION;
  readonly reference: string;
  readonly code: string;
  readonly message: string;
  readonly details?: DiagnosticValue;
}

export type DecodeDiagnosticReportError = {
  readonly code: 'INVALID_REPORT' | 'UNSUPPORTED_VERSION';
  readonly message: string;
  readonly path?: string;
};

export type DecodeDiagnosticReportResult =
  | { readonly success: true; readonly value: DiagnosticReport }
  | { readonly success: false; readonly error: DecodeDiagnosticReportError };

const DEFAULT_LIMITS: DiagnosticLimits = {
  maxDepth: 8,
  maxValues: 1_000,
  maxEntries: 50,
  maxStringLength: 4_096,
};

const DEFAULT_REDACT_KEYS = [
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
] as const;

type NormalizationState = {
  readonly limits: DiagnosticLimits;
  readonly redactKeys: ReadonlySet<string>;
  readonly ancestors: WeakSet<object>;
  values: number;
};

type PropertyRead =
  | { readonly found: false }
  | { readonly found: true; readonly readable: false }
  | { readonly found: true; readonly readable: true; readonly value: unknown };

function marker(
  kind: DiagnosticMarker['$appex'],
  extras: Omit<DiagnosticMarker, '$appex'> = {},
): DiagnosticMarker {
  return { $appex: kind, ...extras };
}

function makeState(options: DiagnosticReportOptions = {}): NormalizationState {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative integer`);
    }
  }
  return {
    limits,
    redactKeys: new Set(
      [...DEFAULT_REDACT_KEYS, ...(options.redactKeys ?? [])].map((key) =>
        key.toLowerCase(),
      ),
    ),
    ancestors: new WeakSet(),
    values: 0,
  };
}

function readPropertyWithoutGetter(
  value: object,
  property: PropertyKey,
): PropertyRead {
  let current: object | null = value;
  try {
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (descriptor) {
        if ('value' in descriptor) {
          return { found: true, readable: true, value: descriptor.value };
        }
        return { found: true, readable: false };
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
    return { found: false };
  } catch (_error: unknown) {
    return { found: true, readable: false };
  }
}

function diagnosticString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function boundedMessage(
  message: string,
  state: NormalizationState,
): Pick<DiagnosticReport, 'message' | 'truncation'> {
  const omitted = message.length - state.limits.maxStringLength;
  return omitted <= 0
    ? { message }
    : {
        message: message.slice(0, state.limits.maxStringLength),
        truncation: { messageOmitted: omitted },
      };
}

function normalizeError(
  error: Error,
  state: NormalizationState,
  depth: number,
): DiagnosticValue {
  const name = readPropertyWithoutGetter(error, 'name');
  const message = readPropertyWithoutGetter(error, 'message');
  const stack = readPropertyWithoutGetter(error, 'stack');
  const cause = readPropertyWithoutGetter(error, 'cause');
  const errors = readPropertyWithoutGetter(error, 'errors');
  const output: Record<string, DiagnosticValue> = {
    name: diagnosticString(
      name.found && name.readable ? name.value : undefined,
      'Error',
    ),
    message: diagnosticString(
      message.found && message.readable ? message.value : undefined,
      '',
    ),
  };
  if (stack.found) {
    output['stack'] = stack.readable
      ? normalizeValue(stack.value, state, depth + 1)
      : marker('unreadable', { reason: 'accessor' });
  }
  if (cause.found) {
    output['cause'] = cause.readable
      ? normalizeValue(cause.value, state, depth + 1)
      : marker('unreadable', { reason: 'accessor' });
  }
  if (errors.found) {
    output['errors'] = errors.readable
      ? normalizeValue(errors.value, state, depth + 1)
      : marker('unreadable', { reason: 'accessor' });
  }
  if (isTypedException(error)) {
    output['kind'] = error._tag;
    output['reference'] = error.id;
    output['timestamp'] = error.timestamp;
    output['details'] = normalizeValue(error.details, state, depth + 1);
  }
  return output;
}

function truncationKey(output: Record<string, DiagnosticValue>): string {
  let key = '$appex:truncated';
  while (Object.prototype.hasOwnProperty.call(output, key)) {
    key = `$appex:${key}`;
  }
  return key;
}

function normalizeObject(
  value: object,
  state: NormalizationState,
  depth: number,
): DiagnosticValue {
  if (state.ancestors.has(value)) {
    return marker('cycle');
  }
  if (depth >= state.limits.maxDepth) {
    return marker('truncated', { reason: 'depth' });
  }

  let isError = false;
  try {
    isError = value instanceof Error;
  } catch (_error: unknown) {
    return marker('unreadable', { reason: 'object-inspection' });
  }

  state.ancestors.add(value);
  try {
    if (isError) {
      return normalizeError(value as Error, state, depth);
    }
    if (value instanceof Date) {
      try {
        const time = value.getTime();
        return Number.isNaN(time)
          ? marker('invalid-date')
          : value.toISOString();
      } catch (_error: unknown) {
        return marker('unreadable', { reason: 'date-inspection' });
      }
    }

    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch (_error: unknown) {
      return marker('unreadable', { reason: 'object-inspection' });
    }

    if (Array.isArray(value)) {
      const output: DiagnosticValue[] = [];
      const length = Math.min(value.length, state.limits.maxEntries);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        output.push(
          !descriptor || !('value' in descriptor)
            ? marker('unreadable', { reason: 'accessor' })
            : normalizeValue(descriptor.value, state, depth + 1),
        );
      }
      if (value.length > length) {
        output.push(
          marker('truncated', {
            reason: 'entries',
            omitted: value.length - length,
          }),
        );
      }
      return output;
    }

    const output: Record<string, DiagnosticValue> = {};
    const keys = Object.keys(descriptors).filter(
      (key) => descriptors[key]?.enumerable === true,
    );
    const selected = keys.slice(0, state.limits.maxEntries);
    for (const key of selected) {
      if (state.redactKeys.has(key.toLowerCase())) {
        output[key] = marker('redacted');
        continue;
      }
      const descriptor = descriptors[key];
      output[key] =
        descriptor && 'value' in descriptor
          ? normalizeValue(descriptor.value, state, depth + 1)
          : marker('unreadable', { reason: 'accessor' });
    }
    if (keys.length > selected.length) {
      output[truncationKey(output)] = marker('truncated', {
        reason: 'entries',
        omitted: keys.length - selected.length,
      });
    }
    return output;
  } finally {
    state.ancestors.delete(value);
  }
}

function normalizeValue(
  value: unknown,
  state: NormalizationState,
  depth = 0,
): DiagnosticValue {
  state.values += 1;
  if (state.values > state.limits.maxValues) {
    return marker('truncated', { reason: 'values' });
  }
  switch (typeof value) {
    case 'string':
      return value.length <= state.limits.maxStringLength
        ? value
        : marker('truncated', {
            reason: 'string',
            value: value.slice(0, state.limits.maxStringLength),
            omitted: value.length - state.limits.maxStringLength,
          });
    case 'number':
      return Number.isFinite(value)
        ? value
        : marker('non-finite-number', { value: String(value) });
    case 'boolean':
      return value;
    case 'undefined':
      return marker('undefined');
    case 'bigint':
      return marker('bigint', { value: String(value) });
    case 'function': {
      let name = '';
      try {
        name = value.name;
      } catch (_error: unknown) {
        return marker('unreadable', { reason: 'function-inspection' });
      }
      return marker('function', { value: name });
    }
    case 'symbol':
      return marker('symbol', { value: value.description ?? '' });
    case 'object':
      return value === null ? null : normalizeObject(value, state, depth);
    default:
      return marker('unreadable', { reason: 'unknown-type' });
  }
}

function errorField(error: Error, property: PropertyKey): unknown {
  const read = readPropertyWithoutGetter(error, property);
  return read.found && read.readable ? read.value : undefined;
}

function reportTypedException(
  error: TypedException,
  options: DiagnosticReportOptions,
  state: NormalizationState,
): DiagnosticReport {
  const renderingError = getMessageRenderingError(error);
  const cause = readPropertyWithoutGetter(error, 'cause');
  return {
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: error.id,
    kind: error._tag,
    name: error.name,
    ...boundedMessage(error.message, state),
    timestamp: error.timestamp,
    details: normalizeValue(error.details, state),
    ...(options.context
      ? { context: normalizeValue(options.context, state) }
      : {}),
    ...(cause.found
      ? {
          cause: cause.readable
            ? normalizeValue(cause.value, state)
            : marker('unreadable', { reason: 'accessor' }),
        }
      : {}),
    ...(renderingError !== undefined
      ? { messageRenderingError: normalizeValue(renderingError, state) }
      : {}),
    ...(typeof error.stack === 'string'
      ? { stack: normalizeValue(error.stack, state) }
      : {}),
  };
}

function reportLegacyException(
  error: ApplicationException,
  options: DiagnosticReportOptions,
  state: NormalizationState,
): DiagnosticReport {
  const kind = error.getCode();
  const details = error.getDetails();
  const cause = readPropertyWithoutGetter(error, 'cause');
  return {
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: error.getId(),
    ...(kind === undefined ? {} : { kind }),
    name: error.name,
    ...boundedMessage(error.getMessage(), state),
    timestamp: error.getTimestampIsoString(),
    ...(details === undefined
      ? {}
      : { details: normalizeValue(details, state) }),
    ...(options.context
      ? { context: normalizeValue(options.context, state) }
      : {}),
    ...(cause.found
      ? {
          cause: cause.readable
            ? normalizeValue(cause.value, state)
            : marker('unreadable', { reason: 'accessor' }),
        }
      : {}),
    ...(typeof error.stack === 'string'
      ? { stack: normalizeValue(error.stack, state) }
      : {}),
  };
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch (_error: unknown) {
    return 'Unknown thrown value';
  }
}

export function toDiagnosticReport(
  caught: unknown,
  options: DiagnosticReportOptions = {},
): DiagnosticReport {
  const state = makeState(options);
  try {
    if (isTypedException(caught)) {
      return reportTypedException(caught, options, state);
    }
    if (caught instanceof ApplicationException) {
      return reportLegacyException(caught, options, state);
    }
    if (caught instanceof Error) {
      const occurrence = createOccurrence();
      const cause = readPropertyWithoutGetter(caught, 'cause');
      const errors = readPropertyWithoutGetter(caught, 'errors');
      return {
        v: DIAGNOSTIC_REPORT_VERSION,
        reference: occurrence.id,
        name: diagnosticString(errorField(caught, 'name'), 'Error'),
        ...boundedMessage(
          diagnosticString(errorField(caught, 'message'), ''),
          state,
        ),
        timestamp: occurrence.timestamp,
        ...(typeof errorField(caught, 'stack') === 'string'
          ? { stack: normalizeValue(errorField(caught, 'stack'), state) }
          : {}),
        ...(options.context
          ? { context: normalizeValue(options.context, state) }
          : {}),
        ...(cause.found
          ? {
              cause: cause.readable
                ? normalizeValue(cause.value, state)
                : marker('unreadable', { reason: 'accessor' }),
            }
          : {}),
        ...(errors.found
          ? {
              thrown: errors.readable
                ? normalizeValue(errors.value, state)
                : marker('unreadable', { reason: 'accessor' }),
            }
          : {}),
      };
    }
  } catch (_error: unknown) {
    // Treat hostile branded values and proxies as arbitrary thrown data.
  }

  const occurrence = createOccurrence();
  return {
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: occurrence.id,
    name: 'NonErrorThrown',
    ...boundedMessage(safeString(caught), state),
    timestamp: occurrence.timestamp,
    thrown: normalizeValue(caught, state),
    ...(options.context
      ? { context: normalizeValue(options.context, state) }
      : {}),
  };
}

function isDiagnosticReport(value: unknown): value is DiagnosticReport {
  return decodeDiagnosticReport(value).success;
}

export function toPublicReport(
  caughtOrReport: unknown,
  presentation: PublicPresentation = {},
): PublicReport {
  const diagnostic = isDiagnosticReport(caughtOrReport)
    ? caughtOrReport
    : toDiagnosticReport(caughtOrReport);
  const state = makeState();
  return {
    v: PUBLIC_REPORT_VERSION,
    reference: diagnostic.reference,
    code: presentation.code ?? 'INTERNAL_ERROR',
    message: presentation.message ?? 'Something went wrong',
    ...(Object.prototype.hasOwnProperty.call(presentation, 'details')
      ? { details: normalizeValue(presentation.details, state) }
      : {}),
  };
}

type JsonCloneResult =
  | { readonly success: true; readonly value: DiagnosticValue }
  | {
      readonly success: false;
      readonly message: string;
      readonly path: string;
    };

function cloneDiagnosticValue(
  value: unknown,
  path: string,
  ancestors = new WeakSet<object>(),
): JsonCloneResult {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return { success: true, value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { success: true, value };
  }
  if (typeof value !== 'object') {
    return { success: false, message: 'Expected a JSON value', path };
  }
  if (ancestors.has(value)) {
    return { success: false, message: 'Expected an acyclic JSON value', path };
  }
  ancestors.add(value);
  try {
    if (!Array.isArray(value)) {
      let prototype: object | null;
      try {
        prototype = Object.getPrototypeOf(value) as object | null;
      } catch (_error: unknown) {
        return { success: false, message: 'Could not inspect value', path };
      }
      if (prototype !== Object.prototype && prototype !== null) {
        return {
          success: false,
          message: 'Expected a plain JSON object',
          path,
        };
      }
    }
    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch (_error: unknown) {
      return { success: false, message: 'Could not inspect value', path };
    }
    if (Array.isArray(value)) {
      const output: DiagnosticValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) {
          return {
            success: false,
            message: 'Expected a data property',
            path: `${path}[${index}]`,
          };
        }
        const cloned = cloneDiagnosticValue(
          descriptor.value,
          `${path}[${index}]`,
          ancestors,
        );
        if (!cloned.success) return cloned;
        output.push(cloned.value);
      }
      return { success: true, value: output };
    }
    const output: Record<string, DiagnosticValue> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable) continue;
      if (!('value' in descriptor)) {
        return {
          success: false,
          message: 'Expected a data property',
          path: `${path}.${key}`,
        };
      }
      const cloned = cloneDiagnosticValue(
        descriptor.value,
        `${path}.${key}`,
        ancestors,
      );
      if (!cloned.success) return cloned;
      output[key] = cloned.value;
    }
    return { success: true, value: output };
  } finally {
    ancestors.delete(value);
  }
}

function invalidReport(
  message: string,
  path: string,
): DecodeDiagnosticReportResult {
  return {
    success: false,
    error: { code: 'INVALID_REPORT', message, path },
  };
}

export function decodeDiagnosticReport(
  input: unknown,
): DecodeDiagnosticReportResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalidReport('Expected an object', '$');
  }
  const version = readPropertyWithoutGetter(input, 'v');
  if (
    !version.found ||
    !version.readable ||
    typeof version.value !== 'string'
  ) {
    return invalidReport('Expected a string', '$.v');
  }
  if (version.value !== DIAGNOSTIC_REPORT_VERSION) {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: `Unsupported diagnostic report version: ${version.value}`,
      },
    };
  }

  const required = ['reference', 'name', 'message'] as const;
  for (const field of required) {
    const read = readPropertyWithoutGetter(input, field);
    if (!read.found || !read.readable || typeof read.value !== 'string') {
      return invalidReport('Expected a string', `$.${field}`);
    }
  }
  const optionalStrings = ['kind', 'timestamp'] as const;
  for (const field of optionalStrings) {
    const read = readPropertyWithoutGetter(input, field);
    if (read.found && (!read.readable || typeof read.value !== 'string')) {
      return invalidReport('Expected a string', `$.${field}`);
    }
  }

  const cloned = cloneDiagnosticValue(input, '$');
  if (!cloned.success) {
    return invalidReport(cloned.message, cloned.path);
  }
  return {
    success: true,
    value: cloned.value as unknown as DiagnosticReport,
  };
}
