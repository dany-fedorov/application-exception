import { Corj } from '../src';
import { makeDiagnosticReport, makePublicReport } from '../src/reporting';
import { DIAGNOSTIC_REPORT_VERSION } from '../src/report-types';
import { defineException } from '../src/typed';
import { TYPED_EXCEPTION_BRAND } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

describe('makeDiagnosticReport', () => {
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

    const report = makeDiagnosticReport(error);

    expect(report.v).toBe('corj/v0.15');
    expect(DIAGNOSTIC_REPORT_VERSION).toBe('corj/v0.15');
    expect(report.occurrence_id).toBe(error.occurrenceId);
    expect(report.fingerprint).toEqual(
      expect.stringMatching(/^fp1_[0-9a-f]{32}$/),
    );
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

    const full = Corj.restoreExpectedValues(report);
    expect(full.occurrence_id).toBe(report.occurrence_id);
    expect(full.v).toBe('corj/v0.15-full');
    expect(full.constructor_name).toBe('agent/ToolFailure');
    expect(full.message).toBe('search failed');
    expect(full.instanceof_error).toBe(true);
  });

  test('reports thrown primitives with a fresh occurrence id per call', () => {
    const first = makeDiagnosticReport('socket closed');
    const second = makeDiagnosticReport('socket closed');
    expect(first.occurrence_id).toMatch(/^AE_/);
    expect(second.occurrence_id).not.toBe(first.occurrence_id);
    expect(first.as_json).toBe('socket closed');
    expect(first.typeof).toBe('string');
    expect(makeDiagnosticReport(null).as_json).toBeNull();
  });

  test('keeps one occurrence id per object across both report functions', () => {
    const error = new Error('plain');
    const diagnostic = makeDiagnosticReport(error);
    expect(makeDiagnosticReport(error).occurrence_id).toBe(
      diagnostic.occurrence_id,
    );
    expect(makePublicReport(error).occurrence_id).toBe(
      diagnostic.occurrence_id,
    );
    const thrownObject = { code: 'E_PLAIN' };
    expect(makePublicReport(thrownObject).occurrence_id).toBe(
      makeDiagnosticReport(thrownObject).occurrence_id,
    );
  });

  test('uses the occurrence id of an occurrence from another copy of the package', () => {
    const foreign = Object.assign(new Error('foreign'), {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 'AE_foreign',
    });
    expect(makeDiagnosticReport(foreign).occurrence_id).toBe('AE_foreign');
    const forged = Object.assign(new Error('forged'), {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 42,
    });
    expect(makeDiagnosticReport(forged).occurrence_id).toMatch(/^AE_/);
    // A branded id corj would reject falls through to the memo, as a too-long
    // one does: the report keeps an id corj can carry.
    const spaced = Object.assign(new Error('spaced'), {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 'has space',
    });
    expect(makeDiagnosticReport(spaced).occurrence_id).toMatch(/^AE_/);
  });

  test('honors and validates an explicit occurrence id', () => {
    expect(
      makeDiagnosticReport('x', { occurrenceId: 'trace-1' }).occurrence_id,
    ).toBe('trace-1');
    const error = new ToolFailure({ details: { tool: 'a', input: {} } });
    expect(
      makeDiagnosticReport(error, { occurrenceId: 'override' }).occurrence_id,
    ).toBe('override');
    for (const occurrenceId of [
      '',
      'x'.repeat(129),
      42,
      null,
      'has space',
      'caf\u00e9',
    ]) {
      expect(() =>
        makeDiagnosticReport('x', { occurrenceId } as never),
      ).toThrow(code('APPEX_INVALID_OCCURRENCE_ID'));
    }
  });

  test('normalizes context through corj and keeps it bounded', () => {
    const context: Record<string, unknown> = {
      runId: 'run-1',
      attempt: 2,
      when: new Date(0),
    };
    context['self'] = context;
    const report = makeDiagnosticReport(new Error('x'), { context });
    expect(report.context).toEqual({
      runId: 'run-1',
      attempt: 2,
      when: '1970-01-01T00:00:00.000Z',
      self: '[circular]',
    });
    expect(
      makeDiagnosticReport(new Error('x'), { context: {} }).context,
    ).toEqual({});
    expect(
      makeDiagnosticReport(new Error('x'), { context: 'run-1' }).context,
    ).toBe('run-1');
    expect(
      makeDiagnosticReport(new Error('x'), { context: undefined }),
    ).not.toHaveProperty('context');
    const big = makeDiagnosticReport(new Error('x'), {
      context: { blob: 'x'.repeat(40_000) },
    });
    expect(Buffer.byteLength(JSON.stringify(big.context))).toBeLessThanOrEqual(
      16_384,
    );
    expect(JSON.stringify(big.context)).toContain('[truncated]');
  });

  test('records context serialization failures under $context', () => {
    const report = makeDiagnosticReport(new Error('x'), {
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
        path: '$context',
        reportKey: 'as_json',
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
    const report = makeDiagnosticReport(error);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(report.message).toBeNull();
    expect(report.reporting_errors?.[0]).toEqual({
      stage: 'prop-access',
      path: '$',
      reportKey: 'message',
      sourceProperty: 'message',
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
    const report = makeDiagnosticReport(hostile);
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
    expect(
      makeDiagnosticReport(error).reporting_errors?.[0]?.error,
    ).toHaveLength(256);
  });

  test('passes corj options through', () => {
    const nested = new Error('outer', { cause: new Error('inner') });
    expect(
      makeDiagnosticReport(nested, { corj: { maxDepth: 0 } }).children_omitted,
    ).toBe('max_depth');
    const aggregate = new AggregateError([new Error('a'), new Error('b')]);
    expect(
      makeDiagnosticReport(aggregate, { corj: { maxChildren: 1 } })
        .children_omitted,
    ).toBe('max_children');
    expect(
      typeof makeDiagnosticReport(nested, { corj: { stackFormat: 'string' } })
        .stack,
    ).toBe('string');
    const small = makeDiagnosticReport(new Error('x'.repeat(2000)), {
      maxReportBytes: 512,
    });
    expect(small.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(small))).toBeLessThanOrEqual(512);
    expect(() => makeDiagnosticReport('x', { corj: { maxDepth: -1 } })).toThrow(
      RangeError,
    );
  });

  test('every corj option is reachable: no-invoke runs no getter', () => {
    let ran = 0;
    class Lazy extends Error {
      get secret() {
        ran++;
        return 's';
      }
    }
    makeDiagnosticReport(new Lazy('x'), { corj: { inspection: 'no-invoke' } });
    expect(ran).toBe(0);
  });

  test('reads every option of the bag exactly once', () => {
    const reads: string[] = [];
    const report = makeDiagnosticReport(new Error('x'), {
      get occurrenceId() {
        reads.push('occurrenceId');
        return 'trace-once';
      },
      get corj() {
        reads.push('corj');
        return { maxDepth: 1 };
      },
      get redact() {
        reads.push('redact');
        return undefined;
      },
      get context() {
        reads.push('context');
        return { runId: 'run-1' };
      },
    });

    expect(reads).toEqual(['occurrenceId', 'corj', 'redact', 'context']);
    expect(report.occurrence_id).toBe('trace-once');
    expect(report.context).toEqual({ runId: 'run-1' });
  });

  test('rejects malformed options with a coded error', () => {
    for (const options of [null, [], 'x', 42]) {
      expect(() => makeDiagnosticReport('x', options as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() => makeDiagnosticReport('x', { maxDepht: 1 } as never)).toThrow(
      /APPEX_INVALID_OPTIONS: unknown option "maxDepht"; known options: occurrenceId, context, redact, corj/,
    );
    expect(() => makeDiagnosticReport('x', { maxDepth: 1 } as never)).toThrow(
      /unknown option "maxDepth"/,
    );
  });
});

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

describe('makeDiagnosticReport with maxReportBytes', () => {
  /** An error whose `message` getter throws, so the report carries reporting errors too. */
  const failing = () => {
    const error = new Error('base');
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('message boom');
      },
    });
    return error;
  };

  test('one budget bounds the whole report, context and errors included', () => {
    const report = makeDiagnosticReport(new Error('m'.repeat(5000)), {
      context: { blob: 'c'.repeat(5000) },
      maxReportBytes: 1024,
    });
    expect(
      new TextEncoder().encode(JSON.stringify(report)).length,
    ).toBeLessThanOrEqual(1024);
    expect(report.context_omitted).toBe('max_size');
    expect(report.occurrence_id).toMatch(/^AE_/);
    expect(report.v).toBe(DIAGNOSTIC_REPORT_VERSION);
  });

  test("the id is application-exception's, never corj's random one", () => {
    expect(makeDiagnosticReport(new Error('x')).occurrence_id).toMatch(/^AE_/);
    expect(
      makeDiagnosticReport('primitive', { occurrenceId: 'req-1' })
        .occurrence_id,
    ).toBe('req-1');
  });

  test('keeps the report unbounded when the budget is disabled', () => {
    const disabled = makeDiagnosticReport(new Error('failure'), {
      maxReportBytes: null,
      context: { text: 'x'.repeat(12_000) },
    });
    expect(bytes(disabled)).toBeGreaterThan(1024);
    expect(disabled).not.toHaveProperty('context_omitted');
    expect(disabled.context).toBeDefined();
  });

  test('drops context first and reporting_errors second', () => {
    const error = failing();
    const context = { runId: 'r'.repeat(200) };
    const complete = makeDiagnosticReport(error, { context });
    expect(complete.context).toBeDefined();
    expect(complete.reporting_errors).toHaveLength(3);

    const one = makeDiagnosticReport(error, {
      context,
      maxReportBytes: bytes(complete) - 1,
    });
    expect(one.context_omitted).toBe('max_size');
    expect(one).not.toHaveProperty('context');
    expect(one.reporting_errors).toHaveLength(3);
    expect(one).not.toHaveProperty('reporting_errors_omitted');
    expect(bytes(one)).toBeLessThanOrEqual(bytes(complete) - 1);

    const two = makeDiagnosticReport(error, {
      context,
      maxReportBytes: 512,
    });
    expect(two.context_omitted).toBe('max_size');
    expect(two.reporting_errors_omitted).toBe('max_size');
    expect(two).not.toHaveProperty('reporting_errors');
    expect(bytes(two)).toBeLessThanOrEqual(512);
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
    const complete = makeDiagnosticReport(hostile);
    expect(complete.reporting_errors).toHaveLength(8);

    const report = makeDiagnosticReport(hostile, {
      maxReportBytes: 512,
    });
    expect(report.reporting_errors_omitted).toBe('max_size');
    expect(report).not.toHaveProperty('reporting_errors');
    expect(report).not.toHaveProperty('context_omitted');
    expect(bytes(report)).toBeLessThanOrEqual(512);
  });

  test('trims the content of an error too large for the budget', () => {
    const report = makeDiagnosticReport(new Error('e'.repeat(4_000)), {
      maxReportBytes: 900,
    });
    expect(bytes(report)).toBeLessThanOrEqual(900);
    expect(report.truncated).toBe(true);
    expect(report.occurrence_id).toMatch(/^AE_/);
    expect(report).not.toHaveProperty('context_omitted');
  });

  test('counts bytes and not string length for unicode content', () => {
    const message =
      '\u{1f6f0} \u0441\u043f\u0443\u0442\u043d\u0438\u043a \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d '.repeat(
        200,
      );
    const unbounded = makeDiagnosticReport(new Error(message));
    expect(bytes(unbounded)).toBeGreaterThan(JSON.stringify(unbounded).length);
    const report = makeDiagnosticReport(new Error(message), {
      context: { note: '\u2705'.repeat(2_000) },
      maxReportBytes: 700,
    });
    expect(bytes(report)).toBeLessThanOrEqual(700);
    expect(report.context_omitted).toBe('max_size');
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
    const report = makeDiagnosticReport(deep, {
      occurrenceId,
      context: { runId: 'r'.repeat(4_000) },
      maxReportBytes: 1_200,
    });
    expect(bytes(report)).toBeLessThanOrEqual(1_200);
    expect(report.occurrence_id).toBe(occurrenceId);
    expect(report.fingerprint).toEqual(
      expect.stringMatching(/^fp1_[0-9a-f]{32}$/),
    );
    expect(report.v).toBe('corj/v0.15');
    expect(report.context_omitted).toBe('max_size');
  });

  test('rejects invalid top-level byte budgets with a coded error', () => {
    expect(() =>
      makeDiagnosticReport(new Error('failure'), {
        maxReportBytes: 100,
      }),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
    for (const maxReportBytes of [0, -1, 1.5, Number.NaN, '1024']) {
      expect(() =>
        makeDiagnosticReport('x', { maxReportBytes } as never),
      ).toThrow(code('APPEX_INVALID_OPTIONS'));
    }
    expect(
      makeDiagnosticReport('x', { maxReportBytes: null }).occurrence_id,
    ).toMatch(/^AE_/);
  });
});

describe('the budget drops optional parts before it trims content', () => {
  test('drops context alone when that is enough', () => {
    const caught = new Error('boom');
    const corjOnly = makeDiagnosticReport(caught);

    const bounded = makeDiagnosticReport(caught, {
      context: { text: 'x'.repeat(4_000) },
      maxReportBytes: bytes(corjOnly) * 2,
    });

    expect(bounded.context_omitted).toBe('max_size');
    expect(bounded).not.toHaveProperty('reporting_errors_omitted');
    // The error's own content was never trimmed: only the container went.
    expect(bounded.stack).toEqual(corjOnly.stack);
  });
});

describe('the report always identifies itself', () => {
  test('keeps v, the occurrence id and the fingerprint at the smallest budget', () => {
    const report = makeDiagnosticReport(new Error('e'.repeat(3_000)), {
      maxReportBytes: 512,
    });

    expect(report.v).toBe(DIAGNOSTIC_REPORT_VERSION);
    expect(report.occurrence_id).toMatch(/^AE_/);
    expect(report.fingerprint).toEqual(
      expect.stringMatching(/^fp1_[0-9a-f]{32}$/),
    );
    expect(report.truncated).toBe(true);
    expect(bytes(report)).toBeLessThanOrEqual(512);
  });
});
