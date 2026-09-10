import {
  createAgentToolFailure,
  observeAgentToolFailure,
  presentAgentToolFailure,
} from '../examples/agent-tool-observations';

describe('agent tool observation example', () => {
  test('retains aggregate failures and correlates independent observations', () => {
    const primary = new Error('primary timed out');
    const fallback = new Error('fallback refused');
    const error = createAgentToolFailure('search', 'research', [
      primary,
      fallback,
    ]);
    const request: Record<string, unknown> = {
      query: 'Ada',
      authorization: 'Bearer secret',
    };
    request['self'] = request;

    const planner = observeAgentToolFailure(error, 'planner', request);
    const executor = observeAgentToolFailure(error, 'executor', request);
    const cause = planner.cause as Record<string, unknown>;
    const errors = cause['errors'] as Array<Record<string, unknown>>;

    expect(planner.reference).toBe(error.id);
    expect(executor.reference).toBe(error.id);
    expect(planner.context).toMatchObject({ observer: 'planner' });
    expect(executor.context).toMatchObject({ observer: 'executor' });
    expect(errors.map((item) => item['message'])).toEqual([
      'primary timed out',
      'fallback refused',
    ]);
    expect(JSON.stringify(planner.context)).toContain('"$appex":"redacted"');
    expect(JSON.stringify(planner.context)).toContain('"$appex":"cycle"');
  });

  test('keeps operational diagnostics out of the public response', () => {
    const error = createAgentToolFailure('search', 'research', [
      new Error('provider token expired'),
    ]);

    const response = presentAgentToolFailure(error);

    expect(response.reference).toBe(error.id);
    expect(response.code).toBe('TOOL_UNAVAILABLE');
    expect(JSON.stringify(response)).not.toContain('provider token');
    expect(JSON.stringify(response)).not.toContain('research');
  });
});
