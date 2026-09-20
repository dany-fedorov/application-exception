import { CORJ_VERSION } from 'caught-object-report-json';
import type {
  DiagnosticReportCorjOptions,
  PublicReportCorjOptions,
} from './corj-maker';
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

/** The `v` of every public report this version emits. */
export const PUBLIC_REPORT_VERSION = 'appex/public/v4' as const;

/** Every public report format `decodePublicReport` reads. */
export type PublicReportVersion = 'appex/public/v3' | 'appex/public/v4';

/** A problem corj met while producing a report. */
export type ReportingError = CorjReportingError;

/**
 * A corj report for one occurrence. `occurrence_id` is shared with the public
 * report. `context_omitted` and `reporting_errors_omitted` mark fields removed
 * to meet `maxReportBytes`; corj never removes `v` or `occurrence_id`.
 */
export type DiagnosticReport = CorjReport & {
  readonly v: CorjVersion;
  readonly occurrence_id: string;
};

/**
 * Options of `makeDiagnosticReport`. `occurrenceId` overrides the occurrence id.
 * `context` is any caller data to report beside the caught value; corj bounds
 * it and drops it whole when the report is over budget. `redact` is the policy
 * both reports share. `corj` carries every option of
 * caught-object-report-json, except CORJ's own total-size and size-unit keys.
 * `maxReportBytes` owns the complete diagnostic report's UTF-8 byte limit.
 */
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly redact?: RedactionPolicy;
  readonly corj?: DiagnosticReportCorjOptions;
  readonly maxReportBytes?: number | null;
}

/**
 * What an application discloses about one failure. `code` is the branching
 * protocol, `occurrence_id` correlates with the diagnostic report, `message`
 * is display text, `as_json` is the selected JSON. `truncated` marks a cut
 * message or `as_json`. `fingerprint` is equal for failures of the same kind
 * from the same place; a retry signal, not a lookup key. It is absent when
 * `corj: { fingerprintParts: null }` turned it off, and on a decoded report of
 * format `appex/public/v3`, which predates it.
 */
export interface PublicReport {
  readonly v: PublicReportVersion;
  readonly occurrence_id: string;
  readonly fingerprint?: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}

/**
 * A per-call override of a kind's public policy, merged field by field: a
 * field the override leaves out keeps what the kind's policy says. `message`
 * and `detailsSelector` are read exactly as a policy's are, so a function is
 * given the kind's details record, and `detailsSelector: null` suppresses the
 * kind's selector.
 */
export type PublicPolicyOverride = {
  readonly code?: string;
  readonly message?: string | ((details: DetailsRecord<object>) => string);
  readonly detailsSelector?:
    ((details: DetailsRecord<object>) => unknown) | null;
};

/**
 * Options of `makePublicReport`. `occurrenceId` overrides the occurrence id.
 * `policyOverride` overrides the kind's public policy for this call. `redact` is the
 * policy both reports share, `realm` is the trust realm to read a foreign
 * value's policy from, and `corj` carries the options of
 * caught-object-report-json used to inspect the selected details and build the
 * fingerprint. `maxReportBytes` optionally caps the complete compact JSON in
 * UTF-8 bytes; `null` explicitly disables that total cap.
 */
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly policyOverride?: PublicPolicyOverride;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
  readonly corj?: PublicReportCorjOptions;
  readonly maxReportBytes?: number | null;
}

/**
 * Options of `makeReportPair`. `occurrenceId` overrides the occurrence id of both
 * reports. `diagnostic` and `public` are the per-report option bags, each
 * without its own `occurrenceId`, so that the shared id stays unambiguous;
 * the public bag's own `policyOverride` key is the per-call policy override.
 */
export interface ReportPairOptions {
  readonly occurrenceId?: string;
  readonly diagnostic?: Omit<DiagnosticReportOptions, 'occurrenceId'>;
  readonly public?: Omit<PublicReportOptions, 'occurrenceId'>;
}

/** Both reports of one occurrence, produced together; the three `occurrence_id`s are the same string. */
export interface ReportPair {
  readonly occurrence_id: string;
  readonly diagnostic: DiagnosticReport;
  readonly public: PublicReport;
}

/** Result of `decodePublicReport`: a detached report, or the first reason it was rejected and where. */
export type DecodePublicReportResult =
  | { readonly ok: true; readonly report: PublicReport }
  | { readonly ok: false; readonly reason: string; readonly path: string };
