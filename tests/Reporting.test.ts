import { ApplicationException } from '../src/ApplicationException';
import {
  decodeDiagnosticReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src/reporting';
import { defineException } from '../src/typed';

describe('diagnostic reporting', () => {
  const ToolFailure = defineException<{
    tool: string;
    input: Record<string, unknown>;
  }>()({
    tag: 'agent/ToolFailure',
    message: ({ tool }) => `${tool} failed`,
  });

  test('reports a typed occurrence with detached details and context', () => {
    const error = new ToolFailure({
      details: { tool: 'search', input: { query: 'Ada' } },
      cause: new Error('connection refused'),
    });

    const report = toDiagnosticReport(error, {
      context: { requestId: 'req-123', attempt: 2 },
    });
    (error.details.input as { query: string }).query = 'changed';

    expect(report.v).toBe('appex/diagnostic/v1');
    expect(report.reference).toBe(error.id);
    expect(report.kind).toBe('agent/ToolFailure');
    expect(report.name).toBe('agent/ToolFailure');
    expect(report.message).toBe('search failed');
    expect(report.timestamp).toBe(error.timestamp);
    expect(report.details).toEqual({
      tool: 'search',
      input: { query: 'Ada' },
    });
    expect(report.context).toEqual({ requestId: 'req-123', attempt: 2 });
    expect(report.cause).toMatchObject({
      name: 'Error',
      message: 'connection refused',
    });
  });

  test('reports legacy errors using their established occurrence metadata', () => {
    const error = ApplicationException.new('Could not save {{id}}')
      .code('SAVE_FAILED')
      .details({ id: 42 });

    const report = toDiagnosticReport(error);

    expect(report.reference).toBe(error.getId());
    expect(report.kind).toBe('SAVE_FAILED');
    expect(report.message).toBe('Could not save 42');
    expect(report.details).toEqual({ id: 42 });
  });

  test('normalizes a raw thrown value into an identifiable report', () => {
    const report = toDiagnosticReport('socket closed');

    expect(report.reference).toMatch(/^AE_/);
    expect(report.name).toBe('NonErrorThrown');
    expect(report.message).toBe('socket closed');
    expect(report.thrown).toBe('socket closed');
  });

  test('preserves aggregate cause order', () => {
    const first = new Error('first');
    const second = new TypeError('second');
    const error = new ToolFailure({
      details: { tool: 'import', input: {} },
      causes: [first, second],
    });

    const report = toDiagnosticReport(error);
    const cause = report.cause as Record<string, unknown>;

    expect(cause['name']).toBe('AggregateError');
    expect(cause['errors']).toEqual([
      expect.objectContaining({ name: 'Error', message: 'first' }),
      expect.objectContaining({ name: 'TypeError', message: 'second' }),
    ]);
  });

  test('marks cycles while preserving values shared across branches', () => {
    const shared = { value: 7 };
    const details: Record<string, unknown> = {
      left: shared,
      right: shared,
    };
    details['self'] = details;
    const error = new ToolFailure({
      details: { tool: 'graph', input: details },
    });

    const report = toDiagnosticReport(error);

    expect(report.details).toEqual({
      tool: 'graph',
      input: {
        left: { value: 7 },
        right: { value: 7 },
        self: { $appex: 'cycle' },
      },
    });
  });

  test('uses explicit markers for values JSON cannot faithfully represent', () => {
    const details = {
      bigint: BigInt(12),
      nan: Number.NaN,
      infinity: Number.POSITIVE_INFINITY,
      missing: undefined,
      fn: () => 'ignored',
      symbol: Symbol('secret'),
      invalidDate: new Date(Number.NaN),
    };
    const error = new ToolFailure({
      details: { tool: 'serialize', input: details },
    });

    expect(toDiagnosticReport(error).details).toEqual({
      tool: 'serialize',
      input: {
        bigint: { $appex: 'bigint', value: '12' },
        nan: { $appex: 'non-finite-number', value: 'NaN' },
        infinity: { $appex: 'non-finite-number', value: 'Infinity' },
        missing: { $appex: 'undefined' },
        fn: { $appex: 'function', value: 'fn' },
        symbol: { $appex: 'symbol', value: 'secret' },
        invalidDate: { $appex: 'invalid-date' },
      },
    });
  });

  test('does not invoke getters or custom toJSON methods', () => {
    let getterCalls = 0;
    let toJsonCalls = 0;
    const hostile = {
      safe: 'value',
      toJSON() {
        toJsonCalls += 1;
        return { leaked: true };
      },
    } as Record<string, unknown>;
    Object.defineProperty(hostile, 'dangerous', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('do not invoke');
      },
    });
    const error = new ToolFailure({
      details: { tool: 'inspect', input: hostile },
    });

    const report = toDiagnosticReport(error);

    expect(report.details).toEqual({
      tool: 'inspect',
      input: {
        safe: 'value',
        toJSON: { $appex: 'function', value: 'toJSON' },
        dangerous: { $appex: 'unreadable', reason: 'accessor' },
      },
    });
    expect(getterCalls).toBe(0);
    expect(toJsonCalls).toBe(0);
  });

  test('contains proxy inspection failures without logging', () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('proxy refused inspection');
        },
      },
    );
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const error = new ToolFailure({
      details: { tool: 'inspect', input: { proxy } },
    });

    const report = toDiagnosticReport(error);

    expect(report.details).toEqual({
      tool: 'inspect',
      input: {
        proxy: { $appex: 'unreadable', reason: 'object-inspection' },
      },
    });
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  test('contains hostile Error proxies nested in causes', () => {
    const hostileError = new Proxy(new Error('hidden'), {
      get() {
        throw new Error('property access denied');
      },
    });
    const error = new ToolFailure({
      details: { tool: 'inspect', input: {} },
      cause: hostileError,
    });

    const report = toDiagnosticReport(error);

    expect(report.reference).toBe(error.id);
    expect(report.cause).toEqual({
      name: 'Error',
      message: 'hidden',
      stack: { $appex: 'unreadable', reason: 'accessor' },
    });
  });

  test('marks string, depth, entry, and total-value truncation', () => {
    const error = new ToolFailure({
      details: {
        tool: 'limits',
        input: {
          long: 'abcdefgh',
          deep: { one: { two: true } },
          many: { a: 1, b: 2, c: 3 },
        },
      },
    });

    const stringReport = toDiagnosticReport(error, {
      limits: { maxStringLength: 4 },
    });
    expect(
      (stringReport.details as Record<string, any>)['input']['long'],
    ).toEqual({
      $appex: 'truncated',
      reason: 'string',
      value: 'abcd',
      omitted: 4,
    });

    const depthReport = toDiagnosticReport(error, {
      limits: { maxDepth: 2 },
    });
    expect(
      (depthReport.details as Record<string, any>)['input']['deep'],
    ).toEqual({ $appex: 'truncated', reason: 'depth' });

    const entryReport = toDiagnosticReport(error, {
      limits: { maxEntries: 2 },
    });
    expect(
      (entryReport.details as Record<string, any>)['input']['$appex:truncated'],
    ).toEqual({ $appex: 'truncated', reason: 'entries', omitted: 1 });

    const valueReport = toDiagnosticReport(error, {
      limits: { maxValues: 2 },
    });
    expect(valueReport.details).toEqual({
      tool: 'limits',
      input: { $appex: 'truncated', reason: 'values' },
    });
  });

  test('bounds the required diagnostic message and records omitted characters', () => {
    const LongMessage = defineException<Record<string, never>>()({
      tag: 'LongMessage',
      message: () => 'abcdefgh',
    });

    const report = toDiagnosticReport(new LongMessage({ details: {} }), {
      limits: { maxStringLength: 4 },
    });

    expect(report.message).toBe('abcd');
    expect(report.truncation).toEqual({ messageOmitted: 4 });
  });

  test('redacts default and caller-provided sensitive keys before traversal', () => {
    const secret = { nested: 'must not traverse' };
    const error = new ToolFailure({
      details: {
        tool: 'auth',
        input: {
          password: secret,
          tenantKey: 'tenant-secret',
          visible: true,
        },
      },
    });

    const report = toDiagnosticReport(error, { redactKeys: ['tenantKey'] });

    expect(report.details).toEqual({
      tool: 'auth',
      input: {
        password: { $appex: 'redacted' },
        tenantKey: { $appex: 'redacted' },
        visible: true,
      },
    });
  });

  test('captures a message rendering failure as diagnostics', () => {
    const rendererError = new Error('renderer failed');
    const Broken = defineException<Record<string, never>>()({
      tag: 'agent/BrokenMessage',
      message: () => {
        throw rendererError;
      },
    });

    const report = toDiagnosticReport(new Broken({ details: {} }));

    expect(report.message).toBe('agent/BrokenMessage');
    expect(report.messageRenderingError).toMatchObject({
      name: 'Error',
      message: 'renderer failed',
    });
  });
});

describe('public reporting', () => {
  const InternalFailure = defineException<{ secret: string }>()({
    tag: 'InternalFailure',
    message: ({ secret }) => `Failed with ${secret}`,
  });

  test('uses a generic disclosure-safe default', () => {
    const error = new InternalFailure({ details: { secret: 'token-123' } });

    expect(toPublicReport(error)).toEqual({
      v: 'appex/public/v1',
      reference: error.id,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  });

  test('includes only explicitly selected presentation data', () => {
    const error = new InternalFailure({ details: { secret: 'token-123' } });
    const diagnostic = toDiagnosticReport(error);

    const report = toPublicReport(diagnostic, {
      code: 'ACCOUNT_EXISTS',
      message: 'An account already exists.',
      details: { field: 'email' },
    });

    expect(report).toEqual({
      v: 'appex/public/v1',
      reference: diagnostic.reference,
      code: 'ACCOUNT_EXISTS',
      message: 'An account already exists.',
      details: { field: 'email' },
    });
    expect(JSON.stringify(report)).not.toContain('token-123');
  });
});

describe('diagnostic report decoding', () => {
  test('validates and detaches a supported plain report', () => {
    const input = {
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
      message: 'failed',
      details: { retry: false },
    };

    const decoded = decodeDiagnosticReport(input);
    input.details.retry = true;

    expect(decoded).toEqual({
      success: true,
      value: {
        v: 'appex/diagnostic/v1',
        reference: 'AE_123',
        name: 'Error',
        message: 'failed',
        details: { retry: false },
      },
    });
  });

  test('rejects unknown versions explicitly', () => {
    expect(
      decodeDiagnosticReport({
        v: 'appex/diagnostic/v2',
        reference: 'AE_123',
        name: 'Error',
        message: 'failed',
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: 'Unsupported diagnostic report version: appex/diagnostic/v2',
      },
    });
  });

  test('returns a path for malformed reports instead of casting', () => {
    expect(
      decodeDiagnosticReport({
        v: 'appex/diagnostic/v1',
        reference: 123,
        name: 'Error',
        message: 'failed',
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Expected a string',
        path: '$.reference',
      },
    });
  });

  test('rejects class instances hidden inside an otherwise valid report', () => {
    expect(
      decodeDiagnosticReport({
        v: 'appex/diagnostic/v1',
        reference: 'AE_123',
        name: 'Error',
        message: 'failed',
        details: new Date('2026-09-10T00:00:00.000Z'),
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Expected a plain JSON object',
        path: '$.details',
      },
    });
  });
});
