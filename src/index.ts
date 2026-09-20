export {
  makeTrustRealm,
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
export type {
  DiagnosticReportCorjOptions,
  PublicReportCorjOptions,
} from './corj-maker';
export { makeRedactionPolicy } from './redaction';
export type {
  RedactionContext,
  RedactionPolicy,
  RedactionPolicyOptions,
} from './redaction';
export {
  decodePublicReport,
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from './reporting';
export {
  DIAGNOSTIC_REPORT_VERSION,
  PUBLIC_REPORT_VERSION,
} from './report-types';
export type {
  ReportPair,
  DecodePublicReportResult,
  DiagnosticReport,
  DiagnosticReportOptions,
  PublicPolicyOverride,
  PublicReport,
  PublicReportOptions,
  PublicReportVersion,
  ReportingError,
  ReportPairOptions,
} from './report-types';
export { APPEX_ERROR_CODES } from './errors';
export type { AppexErrorCode, AppexTypeError } from './errors';
export {
  /**
   * The exact frozen CORJ utility namespace for one-off reports, policy resolution, and restoration of omitted fields.
   *
   * @example
   * ```ts
   * import { Corj, makeDiagnosticReport } from 'application-exception'; console.log(Corj.restoreExpectedValues(makeDiagnosticReport(new Error('x'))).v); // 'corj/v0.15-full'
   * ```
   */
  Corj,
} from 'caught-object-report-json';
export type {
  /** Any value that survives `JSON.stringify`: a string, number, boolean, `null`, or an array or object of those. */
  CorjJsonValue,
  /** CORJ's complete option input, used to derive the audience-specific option types. */
  CorjOptionsInput,
  /** The corj report object a `DiagnosticReport` extends: the root node plus its flattened `children`. */
  CorjReport,
  /** One node of the flattened error tree in `children`, with its `id`, `path`, `level` and `child_ids`. */
  CorjReportNode,
  /** One failure met while a report was produced, as `reporting_errors` lists it. */
  CorjReportingError,
} from 'caught-object-report-json';
