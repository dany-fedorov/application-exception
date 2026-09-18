import Ajv2020 from 'ajv/dist/2020';
import { toPublicReport, toReports } from '../src/reporting';
import { defineException } from '../src/typed';

const publicSchema: object = require('../schemas/public-report-v3.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validatePublic = ajv.compile(publicSchema);

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
    const report = toPublicReport(error, { message: 'm'.repeat(5000) });
    expect(validatePublic(JSON.parse(JSON.stringify(report)))).toBe(true);
    expect(validatePublic(toPublicReport('x'))).toBe(true);
    expect(validatePublic({ ...report, stack: [] })).toBe(false);
    expect(validatePublic({ ...report, truncated: false })).toBe(false);
    expect(validatePublic({ ...report, code: '' })).toBe(false);
    expect(validatePublic({ ...report, v: 'appex/public/v2' })).toBe(false);
  });

  test('accept the public half of a paired capture', () => {
    const captured = toReports(
      new ToolUnavailable({ details: { tool: 'search' } }),
      { diagnostic: { context: { runId: 'run-1' } } },
    );
    expect(validatePublic(JSON.parse(JSON.stringify(captured.public)))).toBe(
      true,
    );
  });
});
