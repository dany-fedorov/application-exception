import { CORJ_VERSION } from 'caught-object-report-json';
import type { RedactionPolicy } from './redaction';
import type { TrustRealm } from './typed-internals';
import type {
  CorjErrorStage,
  CorjJsonValue,
  CorjReport,
  CorjVersion,
} from 'caught-object-report-json';

/** The `v` of every diagnostic report: corj's report version. */
export const DIAGNOSTIC_REPORT_VERSION: typeof CORJ_VERSION = CORJ_VERSION;

/** The `v` of every public report. */
export const PUBLIC_REPORT_VERSION = 'appex/public/v3' as const;

/** A problem corj met while inspecting the caught value; `message: null` and friends mark where. */
export interface ReportingError {
  readonly stage: CorjErrorStage;
  readonly path: string;
  readonly key?: string;
  readonly prop?: string;
  readonly error: string;
}

/**
 * A corj report object (see caught-object-report-json) with four extension
 * fields. `occurrence_id` is the occurrence id shared with the public
 * report. `context` is the normalized `options.context`. `reporting_errors`
 * lists inspection failures (at most 8). `report_omitted` names the optional
 * fields dropped to meet `maxFinalReportSize`.
 */
export type DiagnosticReport = Omit<CorjReport, 'v'> & {
  readonly v: CorjVersion;
  readonly occurrence_id: string;
  readonly context?: CorjJsonValue | null;
  readonly reporting_errors?: readonly ReportingError[];
  readonly report_omitted?: readonly ('context' | 'reporting_errors')[];
};

/**
 * Options of `toDiagnosticReport`. `maxReportSize`, `maxDepth`, `maxChildren`,
 * and `stackFormat` are corj options with corj's defaults (100,000 bytes, 5,
 * 100, `'lines'`). `context` is normalized with a 16,384-byte budget outside
 * the report budget. `occurrenceId` overrides the occurrence id.
 * `maxFinalReportSize` bounds the UTF-8 bytes of `JSON.stringify(report)` for
 * the whole report, extension fields included; `null` (the default) disables
 * it and leaves `maxReportSize` alone.
 */
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly maxReportSize?: number | null;
  readonly maxFinalReportSize?: number | null;
  readonly maxDepth?: number;
  readonly maxChildren?: number;
  readonly stackFormat?: 'lines' | 'string';
  readonly redact?: RedactionPolicy;
}

/**
 * What an application discloses about one failure. `code` is the branching
 * protocol, `occurrence_id` correlates with the diagnostic report, `message`
 * is display text, `as_json` is the selected JSON. `truncated` marks a cut
 * message or `as_json`.
 */
export interface PublicReport {
  readonly v: typeof PUBLIC_REPORT_VERSION;
  readonly occurrence_id: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}

/** Per-call overrides of the kind's public policy; `details: null` suppresses the policy's selection. */
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
}

/**
 * Options of `toReports`. `occurrenceId` overrides the occurrence id of both
 * reports. `diagnostic` and `public` are the per-report option bags, each
 * without its own `occurrenceId`, so that `message` and `context` stay
 * unambiguous.
 */
export interface ToReportsOptions {
  readonly occurrenceId?: string;
  readonly diagnostic?: Omit<DiagnosticReportOptions, 'occurrenceId'>;
  readonly public?: Omit<PublicReportOptions, 'occurrenceId'>;
}

/** Both reports of one occurrence, produced together; the three `occurrence_id`s are the same string. */
export interface CapturedReports {
  readonly occurrence_id: string;
  readonly diagnostic: DiagnosticReport;
  readonly public: PublicReport;
}

/** Result of `decodePublicReport`: a detached report, or the first reason it was rejected and where. */
export type DecodePublicReportResult =
  | { readonly ok: true; readonly report: PublicReport }
  | { readonly ok: false; readonly reason: string; readonly path: string };
