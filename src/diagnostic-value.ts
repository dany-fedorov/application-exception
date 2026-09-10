import { types } from 'node:util';
import {
  getMessageRenderingFailure,
  getTypedExceptionView,
  isLocalTypedException,
} from './typed-internals';
import type {
  DiagnosticLimits,
  DiagnosticMarker,
  DiagnosticReportOptions,
  DiagnosticValue,
} from './report-types';

export const DEFAULT_LIMITS: DiagnosticLimits = {
  maxDepth: 8,
  maxValues: 1000,
  maxEntries: 50,
  maxStringLength: 4096,
  maxBytes: 65_536,
};
const MAX_LIMITS: DiagnosticLimits = {
  maxDepth: 32,
  maxValues: 10_000,
  maxEntries: 1000,
  maxStringLength: 65_536,
  maxBytes: 1_048_576,
};
const REDACT_KEYS = [
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
];
export interface NormalizationState {
  readonly limits: DiagnosticLimits;
  readonly redactKeys: ReadonlySet<string>;
  readonly ancestors: WeakSet<object>;
  readonly includeStack: boolean;
  values: number;
  bytes: number;
}
export type PropertyRead =
  | { readonly found: false }
  | { readonly found: true; readonly readable: false; readonly reason?: string }
  | { readonly found: true; readonly readable: true; readonly value: unknown };
export const marker = (
  kind: DiagnosticMarker['$appex'],
  extras: Omit<DiagnosticMarker, '$appex'> = {},
): DiagnosticMarker => ({ $appex: kind, ...extras });
export function makeState(
  options: DiagnosticReportOptions = {},
): NormalizationState {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof DiagnosticLimits)[]) {
    const value = limits[key];
    if (
      !Number.isInteger(value) ||
      value < (key === 'maxBytes' ? 4096 : 0) ||
      value > MAX_LIMITS[key]
    ) {
      throw new TypeError(`${key} is outside the supported integer range`);
    }
  }
  return {
    limits,
    redactKeys: new Set(
      [...REDACT_KEYS, ...(options.redactKeys ?? [])].map((key) =>
        key.toLowerCase(),
      ),
    ),
    ancestors: new WeakSet(),
    includeStack: options.includeStack === true,
    values: 0,
    bytes: limits.maxBytes,
  };
}
export function setData(
  output: Record<string, DiagnosticValue>,
  key: string,
  value: DiagnosticValue,
): void {
  Object.defineProperty(output, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
export function readProperty(value: object, key: PropertyKey): PropertyRead {
  try {
    let current: object | null = value;
    for (let depth = 0; current !== null && depth < 32; depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor)
        return 'value' in descriptor
          ? { found: true, readable: true, value: descriptor.value }
          : { found: true, readable: false };
      current = Object.getPrototypeOf(current) as object | null;
    }
    return current === null
      ? { found: false }
      : { found: true, readable: false };
  } catch {
    return { found: true, readable: false };
  }
}
export function dataValue(value: object, key: PropertyKey): unknown {
  const read = readProperty(value, key);
  return read.found && read.readable ? read.value : undefined;
}
interface DiagnosticTypedView {
  readonly tag?: string;
  readonly id?: string;
  readonly timestamp?: string;
  readonly details: PropertyRead;
}
export function diagnosticTypedView(
  value: unknown,
): DiagnosticTypedView | undefined {
  if (isLocalTypedException(value)) {
    const error = value as object;
    const tag = dataValue(error, '_tag');
    const id = dataValue(error, 'id');
    const timestamp = dataValue(error, 'timestamp');
    return {
      ...(typeof tag === 'string' && tag.length <= 128 ? { tag } : {}),
      ...(typeof id === 'string' && id.length > 0 && id.length <= 128
        ? { id }
        : {}),
      ...(typeof timestamp === 'string' && timestamp.length <= 128
        ? { timestamp }
        : {}),
      details: readProperty(error, 'details'),
    };
  }
  const foreign = getTypedExceptionView(value);
  return foreign
    ? {
        tag: foreign.tag,
        id: foreign.id,
        timestamp: foreign.timestamp,
        details: { found: true, readable: true, value: foreign.details },
      }
    : undefined;
}
// Native inspection avoids unbounded instanceof walks, including foreign realms.
// Error proxies have no native slot; recognize their prototype with a capped walk.
export function isErrorObject(value: object): boolean {
  if (types.isNativeError(value)) return true;
  try {
    let current: object | null = value;
    for (let depth = 0; current !== null && depth < 32; depth++) {
      if (current === Error.prototype) return true;
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    /* A revoked or hostile proxy is arbitrary diagnostic data. */
  }
  return false;
}
let nativeStackGetter: (() => unknown) | undefined;
let inspectedNativeStack = false;
export function readStack(error: object): PropertyRead {
  // Called only on opt-in: Node 18 descriptor inspection itself formats stacks.
  try {
    // Native formatting calls Error.toString, which can otherwise invoke custom
    // name/message getters or object coercion before we receive the stack.
    for (const key of ['name', 'message']) {
      const metadata = readProperty(error, key);
      if (metadata.found && !metadata.readable)
        return { found: true, readable: false };
      if (
        metadata.found &&
        metadata.readable &&
        metadata.value !== undefined &&
        typeof metadata.value !== 'string'
      ) {
        return { found: true, readable: false, reason: 'stack-metadata' };
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(error, 'stack');
    if (!descriptor) return { found: false };
    if ('value' in descriptor)
      return { found: true, readable: true, value: descriptor.value };
    if (!inspectedNativeStack) {
      nativeStackGetter = Object.getOwnPropertyDescriptor(
        new Error(),
        'stack',
      )?.get;
      inspectedNativeStack = true;
    }
    if (
      descriptor.get &&
      descriptor.get === nativeStackGetter &&
      types.isNativeError(error)
    ) {
      return { found: true, readable: true, value: descriptor.get.call(error) };
    }
    return { found: true, readable: false };
  } catch {
    return { found: true, readable: false };
  }
}
export function providerField(
  error: object,
  key: 'code' | 'status',
): string | number | undefined {
  const value = dataValue(error, key);
  return typeof value === 'string'
    ? value.slice(0, 128)
    : typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
function boundedMarker(
  kind: DiagnosticMarker['$appex'],
  value: string,
  state: NormalizationState,
): DiagnosticMarker {
  const omitted = value.length - state.limits.maxStringLength;
  const selected = value.slice(0, state.limits.maxStringLength);
  if (!chargeText(selected, state))
    return marker('truncated', { reason: 'bytes' });
  return marker(kind, { value: selected, ...(omitted > 0 ? { omitted } : {}) });
}
export function exhausted(
  state: NormalizationState,
): 'values' | 'bytes' | undefined {
  return state.values >= state.limits.maxValues
    ? 'values'
    : state.bytes < 128
    ? 'bytes'
    : undefined;
}
function chargeText(value: string, state: NormalizationState): boolean {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > state.bytes) {
    state.bytes = 0;
    return false;
  }
  state.bytes -= bytes;
  return true;
}
function stopMarker(
  state: NormalizationState,
  reason: string,
  omitted?: number,
): DiagnosticMarker {
  // Count the terminal slot too. Exhaustion permits this one marker per open
  // container (including maxValues=0), followed by no more input traversal.
  state.values++;
  state.bytes -= 128;
  return marker('truncated', {
    reason,
    ...(omitted === undefined ? {} : { omitted }),
  });
}
function terminate(
  output: Record<string, DiagnosticValue>,
  state: NormalizationState,
  reason: string,
  omitted?: number,
): void {
  // At most maxEntries collisions; even the longest resulting key stays <4096.
  let key = '$appex:truncated';
  while (Object.hasOwn(output, key)) key += ':';
  setData(output, key, stopMarker(state, reason, omitted));
}
export function normalizeRead(
  read: PropertyRead,
  state: NormalizationState,
  depth = 0,
): DiagnosticValue {
  if (!read.found) return normalizeValue(undefined, state, depth);
  if (read.readable) return normalizeValue(read.value, state, depth);
  if (exhausted(state)) return stopMarker(state, exhausted(state)!);
  state.values++;
  state.bytes -= 128;
  return marker('unreadable', { reason: read.reason ?? 'accessor' });
}
function normalizeError(
  error: object,
  state: NormalizationState,
  depth: number,
): DiagnosticValue {
  const output: Record<string, DiagnosticValue> = {};
  const typed = diagnosticTypedView(error);
  const failure = getMessageRenderingFailure(error);
  const fields: [string, () => PropertyRead][] = [
    [
      'name',
      () => {
        const value = dataValue(error, 'name');
        return {
          found: true,
          readable: true,
          value: typeof value === 'string' ? value : 'Error',
        };
      },
    ],
    [
      'message',
      () => {
        const value = dataValue(error, 'message');
        return {
          found: true,
          readable: true,
          value: typeof value === 'string' ? value : '',
        };
      },
    ],
  ];
  if (typed) {
    for (const [key, value] of Object.entries({
      kind: typed.tag,
      reference: typed.id,
      timestamp: typed.timestamp,
    })) {
      if (value !== undefined)
        fields.push([key, () => ({ found: true, readable: true, value })]);
    }
    fields.push(['details', () => typed.details]);
  }
  for (const key of ['code', 'status'] as const)
    fields.push([
      key,
      () => {
        const value = providerField(error, key);
        return value === undefined
          ? { found: false }
          : { found: true, readable: true, value };
      },
    ]);
  for (const key of ['cause', 'errors'])
    fields.push([key, () => readProperty(error, key)]);
  if (failure.present)
    fields.push([
      'messageRenderingError',
      () => ({ found: true, readable: true, value: failure.value }),
    ]);
  if (state.includeStack) fields.push(['stack', () => readStack(error)]);
  let entries = 0;
  for (const [key, read] of fields) {
    if (exhausted(state)) {
      terminate(output, state, exhausted(state)!);
      break;
    }
    if (entries >= state.limits.maxEntries) {
      terminate(output, state, 'entries');
      break;
    }
    const field = read();
    if (!field.found) continue;
    entries++;
    setData(output, key, normalizeRead(field, state, depth + 1));
  }
  return output;
}
function unsupported(value: object): string | undefined {
  if (types.isMap(value)) return 'Map';
  if (types.isSet(value)) return 'Set';
  if (types.isWeakMap(value)) return 'WeakMap';
  if (types.isWeakSet(value)) return 'WeakSet';
  if (types.isArrayBufferView(value)) return 'ArrayBufferView';
  if (types.isAnyArrayBuffer(value)) return 'ArrayBuffer';
  if (types.isPromise(value)) return 'Promise';
  if (types.isRegExp(value)) return 'RegExp';
  if (types.isMapIterator(value)) return 'MapIterator';
  if (types.isSetIterator(value)) return 'SetIterator';
  return undefined;
}
function normalizeObject(
  value: object,
  state: NormalizationState,
  depth: number,
): DiagnosticValue {
  if (state.ancestors.has(value)) return marker('cycle');
  if (depth >= state.limits.maxDepth)
    return marker('truncated', { reason: 'depth' });
  const unsupportedKind = unsupported(value);
  if (unsupportedKind)
    return marker('unsupported', { reason: unsupportedKind });
  if (types.isDate(value)) {
    return Number.isNaN(Date.prototype.getTime.call(value))
      ? marker('invalid-date')
      : normalizeString(Date.prototype.toISOString.call(value), state);
  }
  state.ancestors.add(value);
  try {
    if (isErrorObject(value)) return normalizeError(value, state, depth);
    if (Array.isArray(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !Number.isSafeInteger(descriptor.value) ||
        descriptor.value < 0
      )
        return marker('unreadable', { reason: 'array-length' });
      const length: number = descriptor.value;
      const output: DiagnosticValue[] = [];
      for (let i = 0; i < length; i++) {
        if (exhausted(state)) {
          output.push(stopMarker(state, exhausted(state)!));
          break;
        }
        if (i >= state.limits.maxEntries) {
          output.push(stopMarker(state, 'entries', length - i));
          break;
        }
        const item = Object.getOwnPropertyDescriptor(value, String(i));
        output.push(
          normalizeRead(
            item && 'value' in item
              ? { found: true, readable: true, value: item.value }
              : { found: true, readable: false },
            state,
            depth + 1,
          ),
        );
      }
      return output;
    }
    // Enumeration still costs O(input width); only selected descriptors are read.
    const keys = Reflect.ownKeys(value);
    const output: Record<string, DiagnosticValue> = {};
    let inspected = 0;
    let longKeys = 0;
    for (let i = 0; i < keys.length; i++) {
      if (exhausted(state)) {
        terminate(output, state, exhausted(state)!);
        return output;
      }
      if (inspected >= state.limits.maxEntries) {
        terminate(output, state, 'entries', keys.length - i);
        return output;
      }
      const key = keys[i]!;
      inspected++;
      if (typeof key !== 'string' || key.length > 4096) {
        state.values++;
        state.bytes -= 128;
        longKeys++;
        continue;
      }
      if (!chargeText(key, state)) {
        terminate(output, state, 'bytes');
        return output;
      }
      // Redaction precedes even the selected property descriptor read.
      if (state.redactKeys.has(key.toLowerCase())) {
        state.values++;
        state.bytes -= 128;
        setData(output, key, marker('redacted'));
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) {
        state.values++;
        state.bytes -= 128;
        continue;
      }
      setData(
        output,
        key,
        normalizeRead(
          'value' in descriptor
            ? { found: true, readable: true, value: descriptor.value }
            : { found: true, readable: false },
          state,
          depth + 1,
        ),
      );
    }
    if (longKeys > 0) terminate(output, state, 'key-length', longKeys);
    return output;
  } catch {
    return marker('unreadable', { reason: 'object-inspection' });
  } finally {
    state.ancestors.delete(value);
  }
}
function normalizeString(
  value: string,
  state: NormalizationState,
): DiagnosticValue {
  if (!chargeText(value.slice(0, state.limits.maxStringLength), state))
    return marker('truncated', { reason: 'bytes' });
  return value.length <= state.limits.maxStringLength
    ? value
    : marker('truncated', {
        reason: 'string',
        value: value.slice(0, state.limits.maxStringLength),
        omitted: value.length - state.limits.maxStringLength,
      });
}
let bigintUpperBound: bigint | undefined;
let bigintLowerBound: bigint | undefined;
export function boundedBigIntText(
  value: bigint,
  state: NormalizationState,
):
  | { readonly success: true; readonly value: string }
  | {
      readonly success: false;
      readonly reason: 'string' | 'bytes' | 'bigint-magnitude';
    } {
  if (state.limits.maxStringLength === 0)
    return { success: false, reason: 'string' };
  if (state.bytes <= 0) return { success: false, reason: 'bytes' };
  // Bound conversion work before allocating decimal text. Negate only the small
  // fixed threshold, never the arbitrary input; huge values need no digit count.
  if (bigintUpperBound === undefined) {
    bigintUpperBound = 10n ** 4096n;
    bigintLowerBound = -bigintUpperBound;
  }
  if (value >= bigintUpperBound || value <= bigintLowerBound!) {
    return { success: false, reason: 'bigint-magnitude' };
  }
  return { success: true, value: String(value) };
}
export function normalizeValue(
  value: unknown,
  state: NormalizationState,
  depth = 0,
): DiagnosticValue {
  if (exhausted(state)) return stopMarker(state, exhausted(state)!);
  state.values++;
  state.bytes -= 128;
  switch (typeof value) {
    case 'string':
      return normalizeString(value, state);
    case 'number':
      return Number.isFinite(value)
        ? value
        : marker('non-finite-number', { value: String(value) });
    case 'boolean':
      return value;
    case 'undefined':
      return marker('undefined');
    case 'bigint': {
      const text = boundedBigIntText(value, state);
      return text.success
        ? boundedMarker('bigint', text.value, state)
        : marker('truncated', { reason: text.reason });
    }
    case 'symbol':
      return boundedMarker('symbol', value.description ?? '', state);
    case 'function': {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'name');
        if (descriptor && !('value' in descriptor))
          return marker('unreadable', { reason: 'accessor' });
        return boundedMarker(
          'function',
          typeof descriptor?.value === 'string' ? descriptor.value : '',
          state,
        );
      } catch {
        return marker('unreadable', { reason: 'function-inspection' });
      }
    }
    case 'object':
      return value === null ? null : normalizeObject(value, state, depth);
  }
}
