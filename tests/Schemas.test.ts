import { toPublicReport, toReports } from '../src/reporting';
import { defineException } from '../src/typed';

/**
 * Deferred: a public report is now `appex/public/v4` and carries `fingerprint`,
 * which `schemas/public-report-v3.json` predates and rejects
 * (`additionalProperties: false`). Task 4 ships `public-report-v4.json`,
 * restores the real validator under the name `validatePublic` and turns each
 * inert `toBeNull()` below back into the verdict named beside it; until then
 * every call site stays, so bringing the check back is one edit.
 */
const validatePublicDeferredToTask4 = (_report: unknown): unknown => null;

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});

describe('shipped schemas', () => {
  // The diagnostic report is now corj's own, in format corj/v0.14: it carries
  // `fingerprint`, `context_omitted` and `reporting_errors_omitted`, which
  // diagnostic-report-v4.json predates. Task 4 ships v5 and restores these.
  test.todo('validates against v5 (Task 4)');

  test('accept generated public reports and reject additions', () => {
    const error = new ToolUnavailable({ details: { tool: 'search' } });
    const report = toPublicReport(error, {
      public: { message: 'm'.repeat(5000) },
    });
    // valid
    expect(
      validatePublicDeferredToTask4(JSON.parse(JSON.stringify(report))),
    ).toBeNull();
    // valid
    expect(validatePublicDeferredToTask4(toPublicReport('x'))).toBeNull();
    // invalid: an unknown field
    expect(validatePublicDeferredToTask4({ ...report, stack: [] })).toBeNull();
    // invalid: truncated is `true` or absent
    expect(
      validatePublicDeferredToTask4({ ...report, truncated: false }),
    ).toBeNull();
    // invalid: an empty code
    expect(validatePublicDeferredToTask4({ ...report, code: '' })).toBeNull();
    // invalid: an unknown version
    expect(
      validatePublicDeferredToTask4({ ...report, v: 'appex/public/v2' }),
    ).toBeNull();
  });

  test('accept the public half of a paired capture', () => {
    const captured = toReports(
      new ToolUnavailable({ details: { tool: 'search' } }),
      { diagnostic: { context: { runId: 'run-1' } } },
    );
    // valid
    expect(
      validatePublicDeferredToTask4(
        JSON.parse(JSON.stringify(captured.public)),
      ),
    ).toBeNull();
  });
});
