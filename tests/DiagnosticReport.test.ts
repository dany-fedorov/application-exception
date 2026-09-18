import { CorjMaker, restoreExpectedValues } from 'caught-object-report-json';
import { toDiagnosticReport, toPublicReport } from '../src/reporting';
import { DIAGNOSTIC_REPORT_VERSION } from '../src/report-types';
import { createRedactionPolicy } from '../src/redaction';
import { defineException } from '../src/typed';
import { TYPED_EXCEPTION_BRAND } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

describe('toDiagnosticReport', () => {
  const ToolFailure = defineException({
    tag: 'agent/ToolFailure',
    message: ({ tool }: { tool: string; input: Record<string, unknown> }) =>
      `${tool} failed`,
  });

  test('is a corj report of the occurrence plus an occurrence id', () => {
    const cause = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });
    const error = new ToolFailure({
      details: { tool: 'search', input: { query: 'Ada' } },
      cause,
    });

    const report = toDiagnosticReport(error);

    expect(report.v).toBe('corj/v0.13');
    expect(DIAGNOSTIC_REPORT_VERSION).toBe('corj/v0.13');
    expect(report.occurrence_id).toBe(error.occurrenceId);
    expect(report.as_json).toEqual({
      _tag: 'agent/ToolFailure',
      occurrenceId: error.occurrenceId,
      timestamp: error.timestamp,
      details: { tool: 'search', input: { query: 'Ada' } },
    });
    expect(Array.isArray(report.stack)).toBe(true);
    expect((report.stack as string[])[0]).toBe(
      'agent/ToolFailure: search failed',
    );
    expect(report.children).toHaveLength(1);
    expect(report.children?.[0]).toMatchObject({
      id: '0',
      path: '$.cause',
      level: 1,
      as_json: { code: 'ECONNREFUSED' },
    });
    expect(report).not.toHaveProperty('context');
    expect(report).not.toHaveProperty('reporting_errors');
    expect(Object.keys(report)[0]).toBe('occurrence_id');

    const full = restoreExpectedValues(report);
    expect(full.constructor_name).toBe('agent/ToolFailure');
    expect(full.message).toBe('search failed');
    expect(full.instanceof_error).toBe(true);
  });

  test('reports thrown primitives with a fresh occurrence id per call', () => {
    const first = toDiagnosticReport('socket closed');
    const second = toDiagnosticReport('socket closed');
    expect(first.occurrence_id).toMatch(/^AE_/);
    expect(second.occurrence_id).not.toBe(first.occurrence_id);
    expect(first.as_json).toBe('socket closed');
    expect(first.typeof).toBe('string');
    expect(toDiagnosticReport(null).as_json).toBeNull();
  });

  test('keeps one occurrence id per object across both report functions', () => {
    const error = new Error('plain');
    const diagnostic = toDiagnosticReport(error);
    expect(toDiagnosticReport(error).occurrence_id).toBe(
      diagnostic.occurrence_id,
    );
    expect(toPublicReport(error).occurrence_id).toBe(diagnostic.occurrence_id);
    const thrownObject = { code: 'E_PLAIN' };
    expect(toPublicReport(thrownObject).occurrence_id).toBe(
      toDiagnosticReport(thrownObject).occurrence_id,
    );
  });

  test('uses the occurrence id of an occurrence from another copy of the package', () => {
    const foreign = Object.assign(new Error('foreign'), {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 'AE_foreign',
    });
    expect(toDiagnosticReport(foreign).occurrence_id).toBe('AE_foreign');
    const forged = Object.assign(new Error('forged'), {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 42,
    });
    expect(toDiagnosticReport(forged).occurrence_id).toMatch(/^AE_/);
  });

  test('honors and validates an explicit occurrence id', () => {
    expect(
      toDiagnosticReport('x', { occurrenceId: 'trace-1' }).occurrence_id,
    ).toBe('trace-1');
    const error = new ToolFailure({ details: { tool: 'a', input: {} } });
    expect(
      toDiagnosticReport(error, { occurrenceId: 'override' }).occurrence_id,
    ).toBe('override');
    for (const occurrenceId of ['', 'x'.repeat(129), 42, null]) {
      expect(() => toDiagnosticReport('x', { occurrenceId } as never)).toThrow(
        code('APPEX_INVALID_OCCURRENCE_ID'),
      );
    }
  });

  test('normalizes context through corj and keeps it bounded', () => {
    const context: Record<string, unknown> = {
      runId: 'run-1',
      attempt: 2,
      when: new Date(0),
    };
    context['self'] = context;
    const report = toDiagnosticReport(new Error('x'), { context });
    expect(report.context).toEqual({
      runId: 'run-1',
      attempt: 2,
      when: '1970-01-01T00:00:00.000Z',
      self: '[circular]',
    });
    expect(toDiagnosticReport(new Error('x'), { context: {} }).context).toEqual(
      {},
    );
    expect(
      toDiagnosticReport(new Error('x'), { context: 'run-1' }).context,
    ).toBe('run-1');
    expect(
      toDiagnosticReport(new Error('x'), { context: undefined }),
    ).not.toHaveProperty('context');
    const big = toDiagnosticReport(new Error('x'), {
      context: { blob: 'x'.repeat(40_000) },
    });
    expect(Buffer.byteLength(JSON.stringify(big.context))).toBeLessThan(17_000);
    expect(JSON.stringify(big.context)).toContain('[truncated]');
  });

  test('records context serialization failures under $.context', () => {
    const report = toDiagnosticReport(new Error('x'), {
      context: {
        get secret() {
          throw new Error('getter boom');
        },
      },
    });
    expect(report.context).toBeNull();
    expect(report.reporting_errors).toEqual([
      {
        stage: 'as_json',
        path: '$.context',
        key: 'as_json',
        error: 'Error: getter boom',
      },
    ]);
  });

  test('records inspection failures instead of warning to the console', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const error = new Error('base');
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('message boom');
      },
    });
    const report = toDiagnosticReport(error);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(report.message).toBeNull();
    expect(report.reporting_errors?.[0]).toEqual({
      stage: 'prop-access',
      path: '$',
      key: 'message',
      prop: 'message',
      error: 'Error: message boom',
    });
  });

  test('caps reporting errors at eight and describes unprintable failures', () => {
    const unprintable = {
      toString() {
        throw new Error('no string form');
      },
    };
    const hostile = new Proxy(new Error('hostile'), {
      get() {
        throw unprintable;
      },
      has: () => true,
    });
    const report = toDiagnosticReport(hostile);
    expect(report.reporting_errors).toHaveLength(8);
    expect(report.reporting_errors?.[0]?.error).toBe('[unprintable value]');
  });

  test('bounds each recorded error description to 256 characters', () => {
    const error = new Error('base');
    Object.defineProperty(error, 'message', {
      get() {
        throw 'x'.repeat(1000);
      },
    });
    expect(toDiagnosticReport(error).reporting_errors?.[0]?.error).toHaveLength(
      256,
    );
  });

  test('passes corj options through', () => {
    const nested = new Error('outer', { cause: new Error('inner') });
    expect(toDiagnosticReport(nested, { maxDepth: 0 }).children_omitted).toBe(
      'max_depth',
    );
    const aggregate = new AggregateError([new Error('a'), new Error('b')]);
    expect(
      toDiagnosticReport(aggregate, { maxChildren: 1 }).children_omitted,
    ).toBe('max_children');
    expect(
      typeof toDiagnosticReport(nested, { stackFormat: 'string' }).stack,
    ).toBe('string');
    const small = toDiagnosticReport(new Error('x'.repeat(2000)), {
      maxReportSize: 512,
    });
    expect(small.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(small))).toBeLessThan(700);
    expect(() => toDiagnosticReport('x', { maxDepth: -1 })).toThrow(RangeError);
  });

  test('rejects malformed options with a coded error', () => {
    for (const options of [null, [], 'x', 42]) {
      expect(() => toDiagnosticReport('x', options as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() => toDiagnosticReport('x', { maxDepht: 1 } as never)).toThrow(
      /APPEX_INVALID_OPTIONS: unknown option "maxDepht"; known options: occurrenceId, context, maxReportSize, maxFinalReportSize, maxDepth, maxChildren, stackFormat/,
    );
  });
});

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

describe('toDiagnosticReport with maxFinalReportSize', () => {
  test('bounds the complete report of the reported reproducer', () => {
    const options = {
      maxReportSize: 1024,
      context: { text: 'x'.repeat(12_000) },
    };
    const unbounded = toDiagnosticReport(new Error('failure'), options);
    expect(bytes(unbounded)).toBeGreaterThan(1024);
    expect(unbounded).not.toHaveProperty('report_omitted');

    const bounded = toDiagnosticReport(new Error('failure'), {
      ...options,
      maxFinalReportSize: 1024,
    });
    expect(bytes(bounded)).toBeLessThanOrEqual(1024);
    expect(bounded.v).toBe('corj/v0.13');
    expect(bounded.occurrence_id).toMatch(/^AE_/);
    expect(bounded).not.toHaveProperty('context');
    expect(bounded.report_omitted).toEqual(['context']);
  });

  test('keeps the report unbounded when the budget is disabled', () => {
    const disabled = toDiagnosticReport(new Error('failure'), {
      maxReportSize: 1024,
      maxFinalReportSize: null,
      context: { text: 'x'.repeat(12_000) },
    });
    expect(bytes(disabled)).toBeGreaterThan(1024);
    expect(disabled).not.toHaveProperty('report_omitted');
    expect(disabled.context).toBeDefined();
  });

  test('drops context first and reporting_errors second', () => {
    const error = new Error('base');
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('message boom');
      },
    });
    const context = { runId: 'r'.repeat(200) };
    const complete = toDiagnosticReport(error, { context });
    const withoutContext = bytes({
      ...complete,
      context: undefined,
      report_omitted: ['context'],
    });
    const withoutErrors = bytes({
      ...complete,
      context: undefined,
      reporting_errors: undefined,
      report_omitted: ['context', 'reporting_errors'],
    });

    const one = toDiagnosticReport(error, {
      context,
      maxFinalReportSize: withoutContext,
    });
    expect(one.report_omitted).toEqual(['context']);
    expect(one.reporting_errors).toHaveLength(3);
    expect(one).not.toHaveProperty('context');
    expect(bytes(one)).toBeLessThanOrEqual(withoutContext);

    const two = toDiagnosticReport(error, {
      context,
      maxFinalReportSize: withoutErrors,
    });
    expect(two.report_omitted).toEqual(['context', 'reporting_errors']);
    expect(two).not.toHaveProperty('reporting_errors');
    expect(two.truncated).toBeUndefined();
    expect(bytes(two)).toBeLessThanOrEqual(withoutErrors);
  });

  test('drops reporting_errors alone when there is no context', () => {
    const unprintable = {
      toString() {
        throw new Error('no string form');
      },
    };
    const hostile = new Proxy(new Error('hostile'), {
      get() {
        throw unprintable;
      },
      has: () => true,
    });
    const complete = toDiagnosticReport(hostile);
    expect(complete.reporting_errors).toHaveLength(8);
    const budget = bytes({
      ...complete,
      reporting_errors: undefined,
      report_omitted: ['reporting_errors'],
    });
    const report = toDiagnosticReport(hostile, {
      maxFinalReportSize: budget,
    });
    expect(report.report_omitted).toEqual(['reporting_errors']);
    expect(report).not.toHaveProperty('reporting_errors');
    expect(bytes(report)).toBeLessThanOrEqual(budget);
  });

  test('halves the corj budget until the report fits', () => {
    const report = toDiagnosticReport(new Error('e'.repeat(4_000)), {
      maxFinalReportSize: 900,
    });
    expect(bytes(report)).toBeLessThanOrEqual(900);
    expect(report.truncated).toBe(true);
    expect(report.occurrence_id).toMatch(/^AE_/);
    expect(report).not.toHaveProperty('report_omitted');

    const unlimited = toDiagnosticReport(new Error('x'.repeat(5_000)), {
      maxReportSize: null,
      maxFinalReportSize: 800,
    });
    expect(bytes(unlimited)).toBeLessThanOrEqual(800);
    expect(unlimited.truncated).toBe(true);
  });

  test('marks reporting errors met while shrinking', () => {
    const calibrate = () => {
      let reads = 0;
      const probe = new Error('base');
      Object.defineProperty(probe, 'message', {
        get() {
          reads += 1;
          return 'm'.repeat(6_000);
        },
      });
      toDiagnosticReport(probe);
      return reads;
    };
    const budget = calibrate();
    let reads = 0;
    const error = new Error('base');
    Object.defineProperty(error, 'message', {
      get() {
        reads += 1;
        if (reads > budget) throw new Error('late boom');
        return 'm'.repeat(6_000);
      },
    });
    const complete = toDiagnosticReport(error, { maxFinalReportSize: 600 });
    expect(complete.report_omitted).toEqual(['reporting_errors']);
    expect(complete).not.toHaveProperty('reporting_errors');
    expect(bytes(complete)).toBeLessThanOrEqual(600);
  });

  test('counts bytes and not string length for unicode content', () => {
    const message = '🛰 спутник недоступен '.repeat(200);
    const unbounded = toDiagnosticReport(new Error(message));
    expect(bytes(unbounded)).toBeGreaterThan(JSON.stringify(unbounded).length);
    const report = toDiagnosticReport(new Error(message), {
      context: { note: '✅'.repeat(2_000) },
      maxFinalReportSize: 700,
    });
    expect(bytes(report)).toBeLessThanOrEqual(700);
    expect(report.report_omitted).toEqual(['context']);
  });

  test('keeps identity fields under nested causes and long identifiers', () => {
    const deep = new Error('level 0', {
      cause: new Error('level 1', {
        cause: new AggregateError(
          [new Error('leaf a'), new Error('leaf b')],
          'level 2',
        ),
      }),
    });
    const occurrenceId = 'o'.repeat(128);
    const report = toDiagnosticReport(deep, {
      occurrenceId,
      context: { runId: 'r'.repeat(4_000) },
      maxFinalReportSize: 1_200,
    });
    expect(bytes(report)).toBeLessThanOrEqual(1_200);
    expect(report.occurrence_id).toBe(occurrenceId);
    expect(report.v).toBe('corj/v0.13');
    expect(report.report_omitted).toEqual(['context']);
  });

  test('throws when the budget cannot hold the envelope', () => {
    expect(() =>
      toDiagnosticReport(new Error('failure'), { maxFinalReportSize: 64 }),
    ).toThrow(code('APPEX_REPORT_BUDGET_TOO_SMALL'));
    expect(() =>
      toDiagnosticReport('x', {
        occurrenceId: 'o'.repeat(128),
        maxFinalReportSize: 150,
      }),
    ).toThrow(/cannot hold the required report envelope/);
  });

  test('rejects budgets that are not positive safe integers', () => {
    for (const maxFinalReportSize of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 2,
      '1024',
    ]) {
      expect(() =>
        toDiagnosticReport('x', { maxFinalReportSize } as never),
      ).toThrow(code('APPEX_INVALID_OPTIONS'));
    }
    expect(
      toDiagnosticReport('x', { maxFinalReportSize: null }).occurrence_id,
    ).toMatch(/^AE_/);
  });
});

describe('maxFinalReportSize drop order', () => {
  /**
   * The explicit context and reporting_errors steps must do the work, not the
   * corj shrink that follows them: at a budget the un-shrunk corj report
   * already fits, only the two drop steps can bring the report inside it.
   */
  test('drops context and reporting_errors without shrinking the corj report', () => {
    const caught = {
      message: 'boom',
      get password(): never {
        throw new Error('unreadable');
      },
    };
    const full = toDiagnosticReport(caught, {
      context: { text: 'x'.repeat(400) },
    });
    const corjOnly = toDiagnosticReport(caught);
    const corjBytes = new TextEncoder().encode(
      JSON.stringify(corjOnly),
    ).byteLength;
    const fullBytes = new TextEncoder().encode(JSON.stringify(full)).byteLength;

    expect(fullBytes).toBeGreaterThan(corjBytes);
    expect(full.reporting_errors).toBeDefined();

    // Room for everything except context and reporting_errors, plus the
    // report_omitted marker the two drops add.
    const errorsBytes = new TextEncoder().encode(
      `,"reporting_errors":${JSON.stringify(corjOnly.reporting_errors)}`,
    ).byteLength;
    const budget = corjBytes - errorsBytes + 60;
    const bounded = toDiagnosticReport(caught, {
      context: { text: 'x'.repeat(400) },
      maxFinalReportSize: budget,
    });

    expect(bounded.report_omitted).toEqual(['context', 'reporting_errors']);
    expect(bounded.context).toBeUndefined();
    expect(bounded.reporting_errors).toBeUndefined();
    // The corj report itself was never shrunk: its own content survives whole.
    expect(bounded.truncated).toBeUndefined();
    expect(bounded.as_json).toEqual(corjOnly.as_json);
  });

  test('drops context alone when that is enough', () => {
    const caught = new Error('boom');
    const corjBytes = new TextEncoder().encode(
      JSON.stringify(toDiagnosticReport(caught)),
    ).byteLength;

    const bounded = toDiagnosticReport(caught, {
      context: { text: 'x'.repeat(400) },
      maxFinalReportSize: corjBytes + 40,
    });

    expect(bounded.report_omitted).toEqual(['context']);
    expect(bounded.truncated).toBeUndefined();
  });
});

describe('the report always identifies itself', () => {
  test('restores the version corj dropped to meet its own budget', () => {
    const corjAlone = new CorjMaker({ maxReportSize: 256 }).makeReportObject(
      new Error('e'.repeat(3_000)),
    );
    expect(corjAlone.v).toBeUndefined();

    const report = toDiagnosticReport(new Error('e'.repeat(3_000)), {
      maxReportSize: 256,
    });

    expect(report.v).toBe(DIAGNOSTIC_REPORT_VERSION);
    expect(report.truncated).toBe(true);
  });
});

describe('APPEX_REPORT_BUDGET_TOO_SMALL', () => {
  test('names the redaction policy when one is in play', () => {
    expect(() =>
      toDiagnosticReport(new Error('boom'), {
        maxFinalReportSize: 300,
        redact: createRedactionPolicy({
          patterns: [/./g],
          replacement: 'x'.repeat(128),
        }),
      }),
    ).toThrow(/a redaction policy can enlarge but never shrink/);
  });

  test('does not mention a policy when there is none', () => {
    let message = '';
    try {
      toDiagnosticReport(new Error('boom'), { maxFinalReportSize: 20 });
    } catch (failure: unknown) {
      message = (failure as Error).message;
    }

    expect(message).toContain('APPEX_REPORT_BUDGET_TOO_SMALL');
    expect(message).not.toContain('redaction policy');
  });
});
