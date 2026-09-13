import { decodePublicReport } from '../src';

export interface RetryPolicy {
  readonly operation: string;
  readonly retryableCodes: readonly string[];
  readonly remainingAttempts: number;
}

export type RecoveryAction =
  | {
      readonly action: 'retry';
      readonly reference: string;
      readonly operation: string;
      readonly remainingAttempts: number;
      readonly tool?: string;
    }
  | {
      readonly action: 'escalate';
      readonly reference: string;
      readonly reason: 'invalid-report' | 'unknown-code' | 'retry-budget-exhausted';
      readonly detail?: string;
    };

function selectedTool(asJson: unknown): string | undefined {
  if (typeof asJson !== 'object' || asJson === null || Array.isArray(asJson))
    return undefined;
  const tool = (asJson as Record<string, unknown>)['tool'];
  return typeof tool === 'string' && tool.length > 0 && tool.length <= 128
    ? tool
    : undefined;
}

/** Decide what to do with a public report received from a tool: retry on a known code within the budget, else escalate. */
export function chooseRecoveryAction(
  externalValue: unknown,
  policy: RetryPolicy,
): RecoveryAction {
  const decoded = decodePublicReport(externalValue);
  if (!decoded.ok) {
    return {
      action: 'escalate',
      reference: 'unavailable',
      reason: 'invalid-report',
      detail: `${decoded.reason} at ${decoded.path}`,
    };
  }
  const { reference, code, as_json } = decoded.report;
  // The message is display text. Only the code selects an action.
  if (!policy.retryableCodes.includes(code)) {
    return { action: 'escalate', reference, reason: 'unknown-code' };
  }
  if (
    !Number.isSafeInteger(policy.remainingAttempts) ||
    policy.remainingAttempts <= 0
  ) {
    return { action: 'escalate', reference, reason: 'retry-budget-exhausted' };
  }
  const tool = selectedTool(as_json);
  return {
    action: 'retry',
    reference,
    operation: policy.operation,
    remainingAttempts: policy.remainingAttempts - 1,
    ...(tool === undefined ? {} : { tool }),
  };
}

if (require.main === module) {
  const action = chooseRecoveryAction(
    {
      v: 'appex/public/v3',
      reference: 'AE_example',
      code: 'TOOL_UNAVAILABLE',
      message: 'The requested tool is temporarily unavailable.',
      as_json: { tool: 'search' },
    },
    { operation: 'read-only-search', retryableCodes: ['TOOL_UNAVAILABLE'], remainingAttempts: 1 },
  );
  process.stdout.write(`${JSON.stringify(action)}\n`);
}
