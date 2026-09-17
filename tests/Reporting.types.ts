import {
  CapturedReports,
  DecodePublicReportResult,
  DiagnosticReport,
  PublicReport,
  restoreExpectedValues,
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src';
import { defineException } from '../src/typed';

const Failure = defineException({
  tag: 'agent/Failure',
  message: ({ operation }: { operation: string }) => `${operation} failed`,
  public: { code: 'FAILED', details: ({ operation }) => ({ operation }) },
});
const error = new Failure({ details: { operation: 'search' } });

const diagnostic: DiagnosticReport = toDiagnosticReport(error, {
  context: { requestId: 'req' },
  maxDepth: 2,
  maxChildren: 10,
  maxReportSize: 4096,
  stackFormat: 'string',
});
const version: 'corj/v0.12' | 'corj/v0.12-full' = diagnostic.v;
const stack: string | string[] | null | undefined = diagnostic.stack;
const restored: DiagnosticReport = restoreExpectedValues(diagnostic);
void version;
void stack;
void restored;

const publicReport: PublicReport = toPublicReport(error, {
  code: 'X',
  message: 'x',
  details: { a: 1 },
  occurrenceId: diagnostic.occurrence_id,
});
const occurrenceId: string = publicReport.occurrence_id;
void occurrenceId;

// @ts-expect-error public reports never expose a stack.
publicReport.stack;
// @ts-expect-error public reports never expose children.
publicReport.children;
// @ts-expect-error diagnostic options do not include redaction.
toDiagnosticReport(error, { redactKeys: [] });
// @ts-expect-error public options do not include a stack switch.
toPublicReport(error, { includeStack: true });

function consume(result: DecodePublicReportResult): PublicReport | null {
  if (result.ok) return result.report;
  const reason: string = result.reason;
  const path: string = result.path;
  void reason;
  void path;
  return null;
}
void consume;

const captured: CapturedReports = toReports(error, {
  occurrenceId: 'trace-1',
  diagnostic: { context: { requestId: 'req' }, maxFinalReportSize: 4096 },
  public: { code: 'X', message: 'x' },
});
const capturedId: string = captured.occurrence_id;
const capturedDiagnostic: DiagnosticReport = captured.diagnostic;
const capturedPublic: PublicReport = captured.public;
const omitted: readonly ('context' | 'reporting_errors')[] | undefined =
  capturedDiagnostic.report_omitted;
void capturedId;
void capturedPublic;
void omitted;

// @ts-expect-error the occurrence id belongs to the top-level bag only.
toReports(error, { diagnostic: { occurrenceId: 'trace-1' } });
// @ts-expect-error the public bag never carries its own occurrence id.
toReports(error, { public: { occurrenceId: 'trace-1' } });
// @ts-expect-error per-report options are nested, never flat.
toReports(error, { context: { requestId: 'req' } });
