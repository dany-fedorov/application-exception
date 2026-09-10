import Ajv from 'ajv';
import { PublicReport, toPublicReport } from '../src';

const publicReportSchema: object = require('../schemas/public-report-v2.json');
const validatePublicReport = new Ajv({ strict: true }).compile<PublicReport>(
  publicReportSchema,
);

export interface OperationRetryPolicy {
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
      readonly reason:
        | 'invalid-report'
        | 'unknown-code'
        | 'retry-budget-exhausted';
    };

export function selectToolFailureReport(
  reference: string,
  tool: string,
): PublicReport {
  return toPublicReport(reference, {
    code: 'TOOL_UNAVAILABLE',
    message: 'The requested tool is temporarily unavailable.',
    details: { tool },
  });
}

function selectedTool(report: PublicReport): string | undefined {
  const details = report.details;
  if (typeof details !== 'object' || details === null || Array.isArray(details))
    return undefined;
  const tool = details['tool'];
  return typeof tool === 'string' ? tool : undefined;
}

export function chooseRecoveryAction(
  externalValue: unknown,
  policy: OperationRetryPolicy,
): RecoveryAction {
  if (!validatePublicReport(externalValue)) {
    return {
      action: 'escalate',
      reference: 'unavailable',
      reason: 'invalid-report',
    };
  }

  // The free-form message is display data. It never selects an action.
  if (!policy.retryableCodes.includes(externalValue.code)) {
    return {
      action: 'escalate',
      reference: externalValue.reference,
      reason: 'unknown-code',
    };
  }
  if (
    !Number.isSafeInteger(policy.remainingAttempts) ||
    policy.remainingAttempts <= 0
  ) {
    return {
      action: 'escalate',
      reference: externalValue.reference,
      reason: 'retry-budget-exhausted',
    };
  }
  return {
    action: 'retry',
    reference: externalValue.reference,
    operation: policy.operation,
    remainingAttempts: policy.remainingAttempts - 1,
    ...(selectedTool(externalValue) !== undefined
      ? { tool: selectedTool(externalValue) }
      : {}),
  };
}

if (require.main === module) {
  const report = selectToolFailureReport('AE_example', 'search');
  const action = chooseRecoveryAction(report, {
    operation: 'read-only-search',
    retryableCodes: ['TOOL_UNAVAILABLE'],
    remainingAttempts: 1,
  });
  process.stdout.write(`${JSON.stringify(action)}\n`);
}
