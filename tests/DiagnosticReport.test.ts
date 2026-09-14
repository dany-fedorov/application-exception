import { restoreExpectedValues } from 'caught-object-report-json';
import { toDiagnosticReport, toPublicReport } from '../src/reporting';
import { DIAGNOSTIC_REPORT_VERSION } from '../src/report-types';
import { defineException } from '../src/typed';
import { TYPED_EXCEPTION_BRAND } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

describe('toDiagnosticReport', () => {
  const ToolFailure = defineException({
    tag: 'agent/ToolFailure',
    message: ({ tool }: { tool: string; input: Record<string, unknown> }) =>
      `${tool} failed`,
  });

  test('is a corj report of the occurrence plus a reference', () => {
    const cause = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });
    const error = new ToolFailure({
      details: { tool: 'search', input: { query: 'Ada' } },
      cause,
    });

    const report = toDiagnosticReport(error);

    expect(report.v).toBe('corj/v0.12');
    expect(DIAGNOSTIC_REPORT_VERSION).toBe('corj/v0.12');
    expect(report.reference).toBe(error.id);
    expect(report.as_json).toEqual({
      _tag: 'agent/ToolFailure',
      id: error.id,
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
    expect(Object.keys(report)[0]).toBe('reference');

    const full = restoreExpectedValues(report);
    expect(full.constructor_name).toBe('agent/ToolFailure');
    expect(full.message).toBe('search failed');
    expect(full.instanceof_error).toBe(true);
  });

  test('reports thrown primitives with a fresh reference per call', () => {
    const first = toDiagnosticReport('socket closed');
    const second = toDiagnosticReport('socket closed');
    expect(first.reference).toMatch(/^AE_/);
    expect(second.reference).not.toBe(first.reference);
    expect(first.as_json).toBe('socket closed');
    expect(first.typeof).toBe('string');
    expect(toDiagnosticReport(null).as_json).toBeNull();
  });

  test('keeps one reference per object across both report functions', () => {
    const error = new Error('plain');
    const diagnostic = toDiagnosticReport(error);
    expect(toDiagnosticReport(error).reference).toBe(diagnostic.reference);
    expect(toPublicReport(error).reference).toBe(diagnostic.reference);
    const thrownObject = { code: 'E_PLAIN' };
    expect(toPublicReport(thrownObject).reference).toBe(
      toDiagnosticReport(thrownObject).reference,
    );
  });

  test('uses the id of an occurrence from another copy of the package', () => {
    const foreign = Object.assign(new Error('foreign'), {
      [TYPED_EXCEPTION_BRAND]: true,
      id: 'AE_foreign',
    });
    expect(toDiagnosticReport(foreign).reference).toBe('AE_foreign');
    const forged = Object.assign(new Error('forged'), {
      [TYPED_EXCEPTION_BRAND]: true,
      id: 42,
    });
    expect(toDiagnosticReport(forged).reference).toMatch(/^AE_/);
  });

  test('honors and validates an explicit reference', () => {
    expect(toDiagnosticReport('x', { reference: 'trace-1' }).reference).toBe(
      'trace-1',
    );
    const error = new ToolFailure({ details: { tool: 'a', input: {} } });
    expect(toDiagnosticReport(error, { reference: 'override' }).reference).toBe(
      'override',
    );
    for (const reference of ['', 'x'.repeat(129), 42, null]) {
      expect(() => toDiagnosticReport('x', { reference } as never)).toThrow(
        code('APPEX_INVALID_REFERENCE'),
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
      /APPEX_INVALID_OPTIONS: unknown option "maxDepht"; known options: reference, context, maxReportSize, maxDepth, maxChildren, stackFormat/,
    );
  });
});
