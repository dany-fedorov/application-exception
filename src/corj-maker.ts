import { CorjMaker } from 'caught-object-report-json';
import type { CorjOptionsInput } from 'caught-object-report-json';
import { invalid } from './errors';
import { compiledPolicy } from './redaction';

/** CORJ configuration accepted by diagnostic reports. Total size and units are owned by the top-level report options. */
export type DiagnosticReportCorjOptions = Omit<
  CorjOptionsInput,
  'redact' | 'maxReportSize' | 'reportSizeUnit'
>;

/** The CORJ settings that affect public detail serialization or fingerprinting. */
export type PublicReportCorjOptions = Pick<
  CorjOptionsInput,
  | 'inspection'
  | 'maxDepth'
  | 'maxChildren'
  | 'childrenSources'
  | 'fingerprintParts'
  | 'onReportingError'
>;

const DIAGNOSTIC_KEYS = [
  'maxContextSize',
  'omitExpectedValues',
  'stackFormat',
  'inspection',
  'metadata',
  'maxDepth',
  'maxChildren',
  'childrenSources',
  'occurrenceIdSources',
  'fingerprintParts',
  'makeReportId',
  'onReportingError',
] as const satisfies readonly (keyof DiagnosticReportCorjOptions)[];

const PUBLIC_KEYS = [
  'inspection',
  'maxDepth',
  'maxChildren',
  'childrenSources',
  'fingerprintParts',
  'onReportingError',
] as const satisfies readonly (keyof PublicReportCorjOptions)[];

const REJECTED_CORJ_KEYS = [
  'redact',
  'maxReportSize',
  'reportSizeUnit',
  'onError',
] as const;

function silent(): void {
  return undefined;
}

function metadataFor(value: unknown): CorjOptionsInput['metadata'] {
  if (value === undefined) return { v: true };
  if (typeof value === 'boolean') return { v: true, $schema: value };
  if (typeof value === 'object' && value !== null)
    return { ...(value as object), v: true };
  return value as CorjOptionsInput['metadata'];
}

function snapshotOptions(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    value !== undefined &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  )
    throw invalid(
      'APPEX_INVALID_OPTIONS',
      'corj must be an object of caught-object-report-json options',
    );
  if (value === undefined) return {};
  const input = value as Record<string, unknown>;
  for (const key of REJECTED_CORJ_KEYS) {
    if (key in input)
      throw invalid(
        'APPEX_INVALID_OPTIONS',
        `unknown corj option "${key}"; known options: ${keys.join(', ')}`,
      );
  }
  for (const key of Object.keys(input)) {
    if (!keys.includes(key))
      throw invalid(
        'APPEX_INVALID_OPTIONS',
        `unknown corj option "${key}"; known options: ${keys.join(', ')}`,
      );
  }
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const item = input[key];
    if (item !== undefined) output[key] = item;
  }
  return output;
}

/** Build a diagnostic maker from a detached snapshot of the caller's current bag. */
export function diagnosticMakerFor(
  corj: unknown,
  redact: unknown,
  maxReportBytes: number | null | undefined,
): CorjMaker {
  const options = snapshotOptions(corj, DIAGNOSTIC_KEYS);
  return new CorjMaker({
    ...options,
    ...(maxReportBytes === undefined ? {} : { maxReportSize: maxReportBytes }),
    reportSizeUnit: 'utf8-bytes',
    onReportingError:
      options['onReportingError'] === undefined
        ? silent
        : options['onReportingError'],
    redact: compiledPolicy(redact) ?? null,
    metadata: metadataFor(options['metadata']),
  } as CorjOptionsInput);
}

/** Build a public maker from the six options that affect public output. */
export function publicMakerFor(corj: unknown, redact: unknown): CorjMaker {
  const options = snapshotOptions(corj, PUBLIC_KEYS);
  return new CorjMaker({
    ...options,
    reportSizeUnit: 'utf8-bytes',
    onReportingError:
      options['onReportingError'] === undefined
        ? silent
        : options['onReportingError'],
    redact: compiledPolicy(redact) ?? null,
  } as CorjOptionsInput);
}
