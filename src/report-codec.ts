import { setData } from './diagnostic-value';
import { DIAGNOSTIC_REPORT_VERSION } from './report-types';
import type {
  DecodeDiagnosticReportResult,
  DiagnosticReport,
  DiagnosticValue,
} from './report-types';

const MAX_BYTES = 1_048_576;
type CloneState = {
  values: number;
  bytes: number;
  inspected: number;
  ancestors: WeakSet<object>;
};
class InvalidJson extends Error {
  constructor(message: string, readonly path: string) {
    super(message);
  }
}
function charge(state: CloneState, bytes: number, path: string): void {
  state.bytes += bytes;
  if (state.bytes > MAX_BYTES)
    throw new InvalidJson('Report exceeds decode byte limit', path);
}
function textBytes(value: string, path: string): number {
  if (value.length > MAX_BYTES)
    throw new InvalidJson('Report exceeds decode byte limit', path);
  return Buffer.byteLength(JSON.stringify(value));
}
function detach(
  value: unknown,
  state: CloneState,
  depth = 0,
  path = '$',
): DiagnosticValue {
  if (++state.values > 100_000)
    throw new InvalidJson('Report exceeds decode value limit', path);
  if (depth > 64)
    throw new InvalidJson('Report exceeds decode depth limit', path);
  if (typeof value === 'string') {
    charge(state, textBytes(value, path), path);
    return value;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    charge(state, String(value).length, path);
    return value;
  }
  if (typeof value !== 'object')
    throw new InvalidJson('Expected a JSON value', path);
  if (state.ancestors.has(value))
    throw new InvalidJson('Expected an acyclic JSON value', path);
  state.ancestors.add(value);
  try {
    charge(state, 2, path);
    if (Array.isArray(value)) {
      if (++state.inspected > 100_000)
        throw new InvalidJson('Report exceeds decode inspection limit', path);
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        !length ||
        !('value' in length) ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0
      )
        throw new InvalidJson('Expected an array length', path);
      if (length.value > 100_000 - state.values)
        throw new InvalidJson('Report exceeds decode value limit', path);
      const output: DiagnosticValue[] = [];
      for (let index = 0; index < length.value; index++) {
        const childPath = `${path}[${index}]`;
        if (++state.inspected > 100_000)
          throw new InvalidJson('Report exceeds decode inspection limit', path);
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !('value' in descriptor))
          throw new InvalidJson('Expected a data property', childPath);
        if (index > 0) charge(state, 1, path);
        output.push(detach(descriptor.value, state, depth + 1, childPath));
      }
      return output;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new InvalidJson('Expected a plain JSON object', path);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 100_000 - state.values)
      throw new InvalidJson('Report exceeds decode value limit', path);
    if (keys.length > 100_000 - state.inspected)
      throw new InvalidJson('Report exceeds decode inspection limit', path);
    const output: Record<string, DiagnosticValue> = {};
    let entries = 0;
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new InvalidJson('Expected a string key', path);
      if (key.length > 4096)
        throw new InvalidJson('Report key exceeds decode length limit', path);
      const childPath = `${path}.${key.slice(0, 64)}`;
      state.inspected++;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor)
        throw new InvalidJson('Could not inspect value', childPath);
      if (!descriptor.enumerable) continue;
      if (!('value' in descriptor))
        throw new InvalidJson('Expected a data property', childPath);
      charge(state, textBytes(key, path) + 1 + (entries++ > 0 ? 1 : 0), path);
      setData(
        output,
        key,
        detach(descriptor.value, state, depth + 1, childPath),
      );
    }
    return output;
  } finally {
    state.ancestors.delete(value);
  }
}
function invalid(message: string, path: string): DecodeDiagnosticReportResult {
  return { success: false, error: { code: 'INVALID_REPORT', message, path } };
}
const ENVELOPE_FIELDS = new Set([
  'v',
  'reference',
  'kind',
  'name',
  'message',
  'timestamp',
  'truncation',
  'code',
  'status',
  'stack',
  'details',
  'context',
  'cause',
  'thrown',
  'messageRenderingError',
]);
function record(value: unknown): value is Record<string, DiagnosticValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function decodeDiagnosticReport(
  input: unknown,
): DecodeDiagnosticReportResult {
  let value: unknown;
  try {
    value = detach(input, {
      values: 0,
      bytes: 0,
      inspected: 0,
      ancestors: new WeakSet(),
    });
  } catch (error: unknown) {
    return error instanceof InvalidJson
      ? invalid(error.message, error.path)
      : invalid('Could not inspect value', '$');
  }
  if (!record(value)) return invalid('Expected an object', '$');
  if (!Object.hasOwn(value, 'v') || typeof value['v'] !== 'string')
    return invalid('Expected a string', '$.v');
  if (value['v'] !== DIAGNOSTIC_REPORT_VERSION)
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: 'Unsupported diagnostic report version',
      },
    };
  for (const key of Object.keys(value))
    if (!ENVELOPE_FIELDS.has(key))
      return invalid('Unexpected report field', `$.${key.slice(0, 64)}`);
  for (const [key, max] of [
    ['reference', 128],
    ['name', 128],
    ['message', 65_536],
  ] as const) {
    const field = value[key];
    if (!Object.hasOwn(value, key) || typeof field !== 'string')
      return invalid('Expected a string', `$.${key}`);
    if (field.length > max || (key === 'reference' && field.length === 0))
      return invalid(
        'String length is outside the supported range',
        `$.${key}`,
      );
  }
  for (const key of ['kind', 'timestamp'])
    if (Object.hasOwn(value, key)) {
      const field = value[key];
      if (typeof field !== 'string' || field.length > 128)
        return invalid(
          'Expected a string of at most 128 characters',
          `$.${key}`,
        );
    }
  for (const key of ['code', 'status'])
    if (Object.hasOwn(value, key)) {
      const field = value[key];
      if (
        !(typeof field === 'string' && field.length <= 128) &&
        !(typeof field === 'number' && Number.isFinite(field))
      )
        return invalid(
          'Expected a bounded string or finite number',
          `$.${key}`,
        );
    }
  if (Object.hasOwn(value, 'truncation')) {
    const truncation: unknown = value['truncation'];
    if (!record(truncation))
      return invalid('Expected an object', '$.truncation');
    const keys = Object.keys(truncation);
    if (!keys.length)
      return invalid('Expected an omission field', '$.truncation');
    for (const key of keys) {
      if (key === 'diagnosticsOmitted') {
        if (truncation[key] !== true)
          return invalid('Expected true', '$.truncation.diagnosticsOmitted');
      } else if (key === 'messageOmitted' || key === 'nameOmitted') {
        const omitted = truncation[key];
        if (
          typeof omitted !== 'number' ||
          !Number.isSafeInteger(omitted) ||
          omitted < 0
        )
          return invalid(
            'Expected a non-negative integer',
            `$.truncation.${key}`,
          );
      } else return invalid('Unexpected truncation field', '$.truncation');
    }
  }
  return { success: true, value: value as unknown as DiagnosticReport };
}
