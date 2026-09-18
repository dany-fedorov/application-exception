export {
  createTrustRealm,
  defineException,
  isTrustedException,
  isTypedException,
} from './typed';
export type {
  DetailsRecord,
  ExceptionDefinition,
  ExceptionInput,
  PublicPolicy,
  TrustRealm,
  TypedException,
  TypedExceptionClass,
} from './typed';
export type { AppexCorjOptions } from './corj-maker';
export { createRedactionPolicy } from './redaction';
export type {
  RedactionContext,
  RedactionPolicy,
  RedactionPolicyOptions,
} from './redaction';
export {
  decodePublicReport,
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from './reporting';
export {
  DIAGNOSTIC_REPORT_VERSION,
  PUBLIC_REPORT_VERSION,
} from './report-types';
export type {
  CapturedReports,
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicOverride,
  PublicReport,
  PublicReportOptions,
  PublicReportVersion,
  ReportingError,
  ToReportsOptions,
} from './report-types';
export { APPEX_ERROR_CODES } from './errors';
export type { AppexErrorCode, AppexTypeError } from './errors';
export {
  /** Fill in the fields a diagnostic report omitted as expected values, so every node carries them; `v` and `$schema` become the `-full` version. */
  restoreExpectedValues,
} from 'caught-object-report-json';
export type {
  /** Any value that survives `JSON.stringify`: a string, number, boolean, `null`, or an array or object of those. */
  CorjJsonValue,
  /** Every option of caught-object-report-json; `corj` takes all of them but `redact`. */
  CorjOptionsInput,
  /** The corj report object a `DiagnosticReport` extends: the root node plus its flattened `children`. */
  CorjReport,
  /** One node of the flattened error tree in `children`, with its `id`, `path`, `level` and `child_ids`. */
  CorjReportChild,
  /** One failure met while a report was produced, as `reporting_errors` lists it. */
  CorjReportingError,
} from 'caught-object-report-json';
