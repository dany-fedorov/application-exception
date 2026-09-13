import { defineException, toDiagnosticReport, toPublicReport } from '../src';
import type { DiagnosticReport, PublicReport } from '../src';

export const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool, reason }: { tool: string; reason: string }) =>
    `Tool ${tool} is unavailable: ${reason}`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The requested tool is temporarily unavailable.',
    details: ({ tool }) => ({ tool }),
  },
});

export type ToolOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly diagnostic: DiagnosticReport;
      readonly response: PublicReport;
    };

/** Run a tool; on failure return the operator report and the agent-facing report, correlated by reference. */
export function runTool<T>(
  runId: string,
  tool: string,
  execute: () => T,
): ToolOutcome<T> {
  try {
    return { ok: true, value: execute() };
  } catch (caught: unknown) {
    const diagnostic = toDiagnosticReport(caught, { context: { runId, tool } });
    return { ok: false, diagnostic, response: toPublicReport(caught) };
  }
}

if (require.main === module) {
  const outcome = runTool('run-example', 'search', () => {
    throw new ToolUnavailable({
      details: { tool: 'search', reason: 'backend connection refused' },
      cause: Object.assign(new Error('connect ECONNREFUSED 10.0.0.7:5432'), {
        code: 'ECONNREFUSED',
      }),
    });
  });
  if (!outcome.ok) {
    process.stderr.write(`diagnostic=${JSON.stringify(outcome.diagnostic)}\n`);
    process.stdout.write(
      `response=${JSON.stringify(outcome.response, null, 2)}\n`,
    );
  }
}
