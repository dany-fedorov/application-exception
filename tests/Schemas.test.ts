import Ajv2020 from 'ajv/dist/2020';
import { CORJ_VERSION } from 'caught-object-report-json';
import {
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src/reporting';
import { defineException } from '../src/typed';

const diagnosticSchema = require('../schemas/diagnostic-report-v4.json') as {
  $defs: { appexExtension: { properties: { v: { enum: string[] } } } };
};
const publicSchema: object = require('../schemas/public-report-v3.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateDiagnostic = ajv.compile(diagnosticSchema);
const validatePublic = ajv.compile(publicSchema);

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});

describe('shipped schemas', () => {
  test('embed the installed corj version', () => {
    expect(diagnosticSchema.$defs.appexExtension.properties.v.enum).toContain(
      CORJ_VERSION,
    );
  });

  test('accept generated diagnostic reports', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search' },
      causes: [new Error('a'), Object.assign(new Error('b'), { code: 1 })],
    });
    Object.defineProperty(error, 'stack', {
      get() {
        throw new Error('stack boom');
      },
    });
    const report = JSON.parse(
      JSON.stringify(
        toDiagnosticReport(error, {
          context: { runId: 'run-1' },
          maxReportSize: 2048,
        }),
      ),
    ) as unknown;
    expect(validateDiagnostic(report)).toBe(true);
    for (const caught of ['text', 42, null, undefined, { plain: true }]) {
      expect(
        validateDiagnostic(
          JSON.parse(JSON.stringify(toDiagnosticReport(caught))),
        ),
      ).toBe(true);
    }
  });

  test('accept budgeted and paired reports', () => {
    const bounded = toDiagnosticReport(new Error('failure'), {
      maxReportSize: 1024,
      maxFinalReportSize: 1024,
      context: { text: 'x'.repeat(12_000) },
    });
    expect(bounded.report_omitted).toEqual(['context']);
    expect(validateDiagnostic(JSON.parse(JSON.stringify(bounded)))).toBe(true);
    const captured = toReports(
      new ToolUnavailable({ details: { tool: 'search' } }),
      { diagnostic: { context: { runId: 'run-1' } } },
    );
    expect(
      validateDiagnostic(JSON.parse(JSON.stringify(captured.diagnostic))),
    ).toBe(true);
    expect(validatePublic(JSON.parse(JSON.stringify(captured.public)))).toBe(
      true,
    );
  });

  test('reject diagnostic reports without the extension contract', () => {
    const report = toDiagnosticReport(new Error('x'));
    expect(validateDiagnostic({ ...report, occurrence_id: undefined })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, occurrence_id: '' })).toBe(false);
    expect(validateDiagnostic({ ...report, v: 'corj/v0.11' })).toBe(false);
    expect(validateDiagnostic({ ...report, reporting_errors: [{}] })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, context: undefined })).toBe(true);
    expect(validateDiagnostic({ ...report, report_omitted: ['context'] })).toBe(
      true,
    );
    expect(validateDiagnostic({ ...report, report_omitted: ['stack'] })).toBe(
      false,
    );
    expect(
      validateDiagnostic({
        ...report,
        report_omitted: ['context', 'context'],
      }),
    ).toBe(false);
  });

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
});
