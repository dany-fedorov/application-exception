import { decodePublicReport } from '../src';
import { ToolUnavailable, runTool } from '../examples/tool-boundary';

describe('tool boundary example', () => {
  test('returns the value when the tool succeeds', () => {
    expect(runTool('run-1', 'search', () => 'results')).toEqual({
      ok: true,
      value: 'results',
    });
  });

  test('produces two correlated reports for a known failure', () => {
    const outcome = runTool('run-1', 'search', () => {
      throw new ToolUnavailable({
        details: { tool: 'search', reason: 'backend refused' },
        cause: new Error('connect ECONNREFUSED 10.0.0.7:5432'),
      });
    });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.response).toEqual({
      v: 'appex/public/v3',
      reference: outcome.diagnostic.reference,
      code: 'TOOL_UNAVAILABLE',
      message: 'The requested tool is temporarily unavailable.',
      as_json: { tool: 'search' },
    });
    expect(JSON.stringify(outcome.response)).not.toContain('10.0.0.7');
    expect(JSON.stringify(outcome.diagnostic)).toContain('10.0.0.7');
    expect(outcome.diagnostic.context).toEqual({
      runId: 'run-1',
      tool: 'search',
    });
    expect(
      decodePublicReport(JSON.parse(JSON.stringify(outcome.response))),
    ).toEqual({
      ok: true,
      report: outcome.response,
    });
  });

  test('keeps unexpected failures generic', () => {
    const outcome = runTool('run-2', 'search', () => {
      throw new Error('secret internal path');
    });
    if (outcome.ok) throw new Error('expected a failure');
    expect(outcome.response.code).toBe('INTERNAL_ERROR');
    expect(outcome.response.reference).toBe(outcome.diagnostic.reference);
    expect(JSON.stringify(outcome.response)).not.toContain('secret');
  });
});
