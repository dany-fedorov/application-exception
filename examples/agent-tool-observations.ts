import {
  defineException,
  DiagnosticReport,
  PublicReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src';

export const AgentToolFailed = defineException<{
  readonly tool: string;
  readonly operation: string;
}>()({
  tag: 'agent/ToolFailed',
  message: ({ tool, operation }) => `${tool} failed during ${operation}`,
});

export type AgentToolFailure = InstanceType<typeof AgentToolFailed>;

export function createAgentToolFailure(
  tool: string,
  operation: string,
  providerFailures: readonly unknown[],
): AgentToolFailure {
  return new AgentToolFailed({
    details: { tool, operation },
    causes: providerFailures,
  });
}

export function observeAgentToolFailure(
  error: AgentToolFailure,
  observer: string,
  request: Record<string, unknown>,
): DiagnosticReport {
  return toDiagnosticReport(error, {
    context: { observer, request },
  });
}

export function presentAgentToolFailure(error: AgentToolFailure): PublicReport {
  return toPublicReport(error, {
    code: 'TOOL_UNAVAILABLE',
    message: 'The requested tool is temporarily unavailable.',
  });
}

if (require.main === module) {
  const error = createAgentToolFailure('search', 'research', [
    new Error('primary provider timed out'),
    new Error('fallback provider refused the request'),
  ]);
  const request: Record<string, unknown> = {
    query: 'Ada Lovelace',
    authorization: 'Bearer example-secret',
  };
  request['self'] = request;

  process.stderr.write(
    `diagnostic=${JSON.stringify(
      observeAgentToolFailure(error, 'research-agent', request),
    )}\n`,
  );
  process.stdout.write(
    `response=${JSON.stringify(presentAgentToolFailure(error))}\n`,
  );
}
