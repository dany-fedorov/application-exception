import Ajv2020 from 'ajv/dist/2020';
import { CORJ_VERSION, restoreExpectedValues } from 'caught-object-report-json';
import {
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src/reporting';
import { defineException } from '../src/typed';

const diagnosticSchema = require('../schemas/diagnostic-report-v5.json') as {
  $defs: { appexExtension: { properties: { v: { enum: string[] } } } };
};
const publicSchema: object = require('../schemas/public-report-v4.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateDiagnostic = ajv.compile(diagnosticSchema);
const validatePublic = ajv.compile(publicSchema);

const json = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});

/** An error whose `message` getter throws long, so the report carries reporting errors. */
const failing = () => {
  const error = new Error('base');
  Object.defineProperty(error, 'message', {
    get(): string {
      throw new Error(`message boom ${'b'.repeat(120)}`);
    },
  });
  return error;
};

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
      get(): string {
        throw new Error('stack boom');
      },
    });
    const report = toDiagnosticReport(error, {
      context: { runId: 'run-1' },
    });
    expect(report.context).toEqual({ runId: 'run-1' });
    expect(report.reporting_errors?.length).toBeGreaterThan(0);
    expect(report.children?.length).toBeGreaterThan(0);
    expect(validateDiagnostic(json(report))).toBe(true);
    for (const caught of ['text', 42, null, undefined, { plain: true }]) {
      expect(validateDiagnostic(json(toDiagnosticReport(caught)))).toBe(true);
    }
  });

  test('accept a report that lost its context and its reporting errors', () => {
    const budgeted = toDiagnosticReport(failing(), {
      context: { runId: 'r'.repeat(200) },
      corj: { maxReportSize: 600 },
    });
    expect(budgeted.context_omitted).toBe('max_size');
    expect(budgeted.reporting_errors_omitted).toBe('max_size');
    expect(validateDiagnostic(json(budgeted))).toBe(true);
  });

  test('accept a report with its expected values restored', () => {
    const restored = restoreExpectedValues(
      toDiagnosticReport(new Error('outer', { cause: new Error('inner') })),
    );
    expect(restored.v).toBe(`${CORJ_VERSION}-full`);
    expect(validateDiagnostic(json(restored))).toBe(true);
  });

  test('reject diagnostic reports without the extension contract', () => {
    const report = toDiagnosticReport(new Error('x'));
    expect(validateDiagnostic({ ...report, occurrence_id: undefined })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, occurrence_id: '' })).toBe(false);
    expect(validateDiagnostic({ ...report, occurrence_id: 'has space' })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, v: 'corj/v0.13' })).toBe(false);
    expect(validateDiagnostic({ ...report, fingerprint: 'has space' })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, reporting_errors: [{}] })).toBe(
      false,
    );
    expect(validateDiagnostic({ ...report, context_omitted: 'nope' })).toBe(
      false,
    );
    expect(
      validateDiagnostic({ ...report, reporting_errors_omitted: 'nope' }),
    ).toBe(false);
    expect(validateDiagnostic({ ...report, context: undefined })).toBe(true);
    expect(validateDiagnostic({ ...report, context_omitted: 'max_size' })).toBe(
      true,
    );
  });

  test('accept generated public reports and reject additions', () => {
    const error = new ToolUnavailable({ details: { tool: 'search' } });
    const report = toPublicReport(error, {
      public: { message: 'm'.repeat(5000) },
    });
    expect(validatePublic(json(report))).toBe(true);
    expect(validatePublic(toPublicReport('x'))).toBe(true);
    expect(validatePublic({ ...report, stack: [] })).toBe(false);
    expect(validatePublic({ ...report, truncated: false })).toBe(false);
    expect(validatePublic({ ...report, code: '' })).toBe(false);
    expect(validatePublic({ ...report, v: 'appex/public/v2' })).toBe(false);
    expect(validatePublic({ ...report, fingerprint: 'has space' })).toBe(false);
  });

  test('accept a public report whose fingerprint is turned off', () => {
    const withoutFingerprint = toPublicReport(new Error('x'), {
      corj: { fingerprintParts: null },
    });
    expect(withoutFingerprint).not.toHaveProperty('fingerprint');
    expect(validatePublic(json(withoutFingerprint))).toBe(true);
  });

  test('accept the public half of a paired capture', () => {
    const captured = toReports(
      new ToolUnavailable({ details: { tool: 'search' } }),
      { diagnostic: { context: { runId: 'run-1' } } },
    );
    expect(validateDiagnostic(json(captured.diagnostic))).toBe(true);
    expect(validatePublic(json(captured.public))).toBe(true);
  });
});

describe('the frozen schemas of earlier versions', () => {
  const diagnosticV3: object = require('../schemas/diagnostic-report-v3.json');
  const diagnosticV4: object = require('../schemas/diagnostic-report-v4.json');
  const publicV3: object = require('../schemas/public-report-v3.json');
  const frozenAjv = new Ajv2020({ strict: true, allErrors: true });
  const validateDiagnosticV3 = frozenAjv.compile(diagnosticV3);
  const validateDiagnosticV4 = frozenAjv.compile(diagnosticV4);
  const validatePublicV3 = frozenAjv.compile(publicV3);

  test('still load', () => {
    expect(typeof validateDiagnosticV3).toBe('function');
    expect(typeof validateDiagnosticV4).toBe('function');
    expect(typeof validatePublicV3).toBe('function');
  });

  test('do not accept the reports of the version after them', () => {
    const report = toPublicReport(new Error('x'));
    expect(report.v).toBe('appex/public/v4');
    expect(validatePublicV3(json(report))).toBe(false);
    const asV3 = { ...json(report), v: 'appex/public/v3' };
    delete (asV3 as { fingerprint?: unknown }).fingerprint;
    expect(validatePublicV3(asV3)).toBe(true);
    expect(validatePublic(asV3)).toBe(false);
    expect(validateDiagnosticV4(json(toDiagnosticReport(new Error('x'))))).toBe(
      false,
    );
  });
});
