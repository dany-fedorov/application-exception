import { CORJ_VERSION } from 'caught-object-report-json';
import type { AppexCorjOptions } from './corj-maker';
import type { RedactionPolicy } from './redaction';
import type { DetailsRecord } from './typed';
import type { TrustRealm } from './typed-internals';
import type {
  CorjJsonValue,
  CorjReport,
  CorjReportingError,
  CorjVersion,
} from 'caught-object-report-json';

/** The `v` of every diagnostic report: corj's report version. */
export const DIAGNOSTIC_REPORT_VERSION: typeof CORJ_VERSION = CORJ_VERSION;

/** The `v` of every public report. */
export const PUBLIC_REPORT_VERSION = 'appex/public/v3' as const;

/** A problem corj met while producing a report: `stage`, `path`, the report `key`, the source `prop`, and a scrubbed description. */
export type ReportingError = CorjReportingError;

/**
 * A corj report object (see caught-object-report-json) of one occurrence.
 * `occurrence_id` is the id shared with the public report, and `v` is always
 * present: corj never trims either. `context` is the JSON form of
 * `options.context`, `reporting_errors` lists inspection failures (at most 8),
 * and `context_omitted` / `reporting_errors_omitted` say when one of those two
 * was left out to meet `corj.maxReportSize`.
 */
export type DiagnosticReport = CorjReport & {
  readonly v: CorjVersion;
  readonly occurrence_id: string;
};

/**
 * Options of `toDiagnosticReport`. `occurrenceId` overrides the occurrence id.
 * `context` is any caller data to report beside the caught value; corj bounds
 * it and drops it whole when the report is over budget. `redact` is the policy
 * both reports share. `corj` carries every option of
 * caught-object-report-json, `maxReportSize` and `inspection` included.
 */
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly redact?: RedactionPolicy;
  readonly corj?: AppexCorjOptions;
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

/**
 * A per-call override of a kind's public policy, merged field by field: a
 * field the override leaves out keeps what the kind's policy says. `message`
 * and `details` are read exactly as a policy's are, so a function is given the
 * kind's details record, and `details: null` suppresses the kind's selector.
 */
export type PublicOverride = {
  readonly code?: string;
  readonly message?: string | ((details: DetailsRecord<object>) => string);
  readonly details?: ((details: DetailsRecord<object>) => unknown) | null;
};

/**
 * Options of `toPublicReport`. `occurrenceId` overrides the occurrence id.
 * `public` overrides the kind's public policy for this call. `redact` is the
 * policy both reports share, `realm` is the trust realm to read a foreign
 * value's policy from, and `corj` carries the options of
 * caught-object-report-json used to inspect the selected details.
 */
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly public?: PublicOverride;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
  readonly corj?: AppexCorjOptions;
}

/**
 * Options of `toReports`. `occurrenceId` overrides the occurrence id of both
 * reports. `diagnostic` and `public` are the per-report option bags, each
 * without its own `occurrenceId`, so that the shared id stays unambiguous;
 * the public bag's own `public` key is the per-call policy override.
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
