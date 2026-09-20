import {
  ReportPair,
  makeRedactionPolicy,
  DecodePublicReportResult,
  DiagnosticReport,
  PublicReport,
  PublicReportVersion,
  restoreExpectedValues,
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from '../src';
import type { RedactionContext, RedactionPolicy } from '../src';
import { defineException } from '../src/typed';

const Failure = defineException({
  tag: 'agent/Failure',
  message: ({ operation }: { operation: string }) => `${operation} failed`,
  public: {
    code: 'FAILED',
    detailsSelector: ({ operation }) => ({ operation }),
  },
});
const error = new Failure({ details: { operation: 'search' } });

const diagnostic: DiagnosticReport = makeDiagnosticReport(error, {
  context: { requestId: 'req' },
  corj: {
    maxDepth: 2,
    maxChildren: 10,
    stackFormat: 'string',
    inspection: 'no-invoke',
  },
  maxReportBytes: 4096,
});
const version: 'corj/v0.15' | 'corj/v0.15-full' = diagnostic.v;
const fingerprint: string | undefined = diagnostic.fingerprint;
void fingerprint;
const stack: string | string[] | null | undefined = diagnostic.stack;
const restored: DiagnosticReport = restoreExpectedValues(diagnostic);
void version;
void stack;
void restored;

const publicReport: PublicReport = makePublicReport(error, {
  policyOverride: {
    code: 'X',
    message: 'x',
    detailsSelector: () => ({ a: 1 }),
  },
  occurrenceId: diagnostic.occurrence_id,
});
const occurrenceId: string = publicReport.occurrence_id;
const publicVersion: PublicReportVersion = publicReport.v;
const publicVersions: PublicReportVersion[] = [
  'appex/public/v3',
  'appex/public/v4',
];
void publicVersions;
const publicFingerprint: string | undefined = publicReport.fingerprint;
void publicVersion;
void publicFingerprint;
void occurrenceId;

// @ts-expect-error public reports never expose a stack.
publicReport.stack;
// @ts-expect-error public reports never expose children.
publicReport.children;
// @ts-expect-error diagnostic options do not include redaction.
makeDiagnosticReport(error, { redactKeys: [] });
// @ts-expect-error public options do not include a stack switch.
makePublicReport(error, { includeStack: true });
// @ts-expect-error the per-call override lives in the public bag, never flat.
makePublicReport(error, { code: 'X' });
// @ts-expect-error policyOverride.detailsSelector is a function or null, never a value.
makePublicReport(error, { policyOverride: { detailsSelector: { a: 1 } } });

function consume(result: DecodePublicReportResult): PublicReport | null {
  if (result.ok) return result.report;
  const reason: string = result.reason;
  const path: string = result.path;
  void reason;
  void path;
  return null;
}
void consume;

const captured: ReportPair = makeReportPair(error, {
  occurrenceId: 'trace-1',
  diagnostic: {
    context: { requestId: 'req' },
    maxReportBytes: 4096,
  },
  public: {
    policyOverride: {
      code: 'X',
      message: () => 'x',
      detailsSelector: null,
    },
  },
});
const capturedId: string = captured.occurrence_id;
const capturedDiagnostic: DiagnosticReport = captured.diagnostic;
const capturedPublic: PublicReport = captured.public;
const contextOmitted: 'max_size' | undefined =
  capturedDiagnostic.context_omitted;
const errorsOmitted: 'max_size' | undefined =
  capturedDiagnostic.reporting_errors_omitted;
void capturedId;
void capturedPublic;
void contextOmitted;
void errorsOmitted;

// @ts-expect-error the occurrence id belongs to the top-level bag only.
makeReportPair(error, { diagnostic: { occurrenceId: 'trace-1' } });
// @ts-expect-error the public bag never carries its own occurrence id.
makeReportPair(error, { public: { occurrenceId: 'trace-1' } });
// @ts-expect-error per-report options are nested, never flat.
makeReportPair(error, { context: { requestId: 'req' } });
// @ts-expect-error corj options live in the corj bag, never at the top level.
makeDiagnosticReport(error, { maxDepth: 2 });
// @ts-expect-error the redaction policy is shared; corj.redact is not accepted.
makeDiagnosticReport(error, { corj: { redact: { keys: ['password'] } } });

const redact: RedactionPolicy = makeRedactionPolicy({
  keys: ['password', /token$/i],
  paths: ['$.config.headers', /^\$\.cause\./, '$context.user.email'],
  patterns: [/sk-[a-z]+/g],
  replacement: '[redacted]',
  transform: (value: unknown, context: RedactionContext) =>
    context.reportKey === 'message' ? value : undefined,
});
const redacted: DiagnosticReport = makeDiagnosticReport(error, { redact });
const redactedPublic: PublicReport = makePublicReport(error, { redact });
void redacted;
void redactedPublic;

// @ts-expect-error `values` was renamed `patterns` when the policy moved into corj.
makeRedactionPolicy({ values: [/sk-[a-z]+/g] });
// @ts-expect-error a policy is opaque: only makeRedactionPolicy mints one.
makeDiagnosticReport(error, { redact: { keys: ['password'] } });
