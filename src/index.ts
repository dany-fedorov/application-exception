import {
  makeCaughtObjectReport,
  makeCaughtObjectReportArray,
  resolveCaughtObjectReportRedactPolicy,
  restoreCaughtObjectReportExpectedValues,
} from 'caught-object-report-json';

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
/**
 * The four stateless CORJ utilities under their corj names, frozen: one-off
 * reports, redaction-policy resolution, and restoration of omitted fields. Each
 * member is the dependency's own root function.
 *
 * @example
 * ```ts
 * import * as AppEx from 'application-exception';
 * const report = AppEx.makeDiagnosticReport(new Error('connection refused'));
 * const full = AppEx.Corj.restoreCaughtObjectReportExpectedValues(report);
 * console.log(full.v, full.message); // 'corj/v0.15-full' 'connection refused'
 * ```
 */
export const Corj = Object.freeze({
  makeCaughtObjectReport,
  makeCaughtObjectReportArray,
  restoreCaughtObjectReportExpectedValues,
  resolveCaughtObjectReportRedactPolicy,
});
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
