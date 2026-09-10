import {
  DecodeDiagnosticReportResult,
  DiagnosticReport,
  PublicReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src/reporting';
import { defineException } from '../src/typed';

const Failure = defineException({
  tag: 'agent/Failure',
  message: ({ operation }: { operation: string }) => `${operation} failed`,
});
const error = new Failure({ details: { operation: 'search' } });

const diagnostic: DiagnosticReport = toDiagnosticReport(error);
const publicReport: PublicReport = toPublicReport(diagnostic.reference);
const reference: string = publicReport.reference;
void reference;

// Diagnostic fields are absent from the public contract.
// @ts-expect-error public reports never expose a stack.
publicReport.stack;
// @ts-expect-error public reports never expose causes.
publicReport.cause;

function consume(
  result: DecodeDiagnosticReportResult,
): DiagnosticReport | null {
  if (result.success) {
    return result.value;
  }
  const code: 'INVALID_REPORT' | 'UNSUPPORTED_VERSION' = result.error.code;
  void code;
  return null;
}
void consume;

interface RequestContext {
  requestId: string;
}
const context: RequestContext = { requestId: 'req' };
toDiagnosticReport(error, {
  context,
  includeStack: false,
  limits: { maxBytes: 4096 },
});
// @ts-expect-error public projection accepts only an explicit reference.
toPublicReport(error);
// @ts-expect-error diagnostic objects must be projected by reference.
toPublicReport(diagnostic);
