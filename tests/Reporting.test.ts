import {
  decodeDiagnosticReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src/reporting';
import { defineException } from '../src/typed';

describe('diagnostic reporting', () => {
  const ToolFailure = defineException({
    tag: 'agent/ToolFailure',
    message: ({ tool }: { tool: string; input: Record<string, unknown> }) =>
      `${tool} failed`,
  });

  test('reports a typed occurrence with detached details and context', () => {
    const error = new ToolFailure({
      details: { tool: 'search', input: { query: 'Ada' } },
      cause: new Error('connection refused'),
    });

    // Keep this v1 fixture's stack a data field while construction stays lazy.
    Object.defineProperty(error, 'stack', { value: error.stack });
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
    expect(report.stack).toEqual(expect.stringContaining('agent/ToolFailure'));
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

  test('bounds text carried by diagnostic markers', () => {
    const long = 'x'.repeat(100);
    const named = {
      [long]: function (): void {
        return undefined;
      },
    }[long];
    const error = new ToolFailure({
      details: {
        tool: 'serialize',
        input: {
          bigint: BigInt('9'.repeat(100)),
          fn: named,
          symbol: Symbol(long),
        },
      },
    });

    const report = toDiagnosticReport(error, {
      limits: { maxStringLength: 4 },
    });
    const input = (report.details as Record<string, any>)['input'];

    expect(input['bigint']).toEqual({
      $appex: 'bigint',
      value: '9999',
      omitted: 96,
    });
    expect(input['fn']).toEqual({
      $appex: 'function',
      value: 'xxxx',
      omitted: 96,
    });
    expect(input['symbol']).toEqual({
      $appex: 'symbol',
      value: 'xxxx',
      omitted: 96,
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
    expect(report.cause).toMatchObject({
      name: 'Error',
      message: 'hidden',
    });
    expect((report.cause as Record<string, unknown>)['stack']).toBeDefined();
  });

  test('contains unreadable metadata on nested typed causes', () => {
    const inner = new ToolFailure({
      details: { tool: 'inner', input: {} },
    });
    Object.defineProperty(inner, '_tag', {
      configurable: true,
      get() {
        throw new Error('tag unavailable');
      },
    });
    const outer = new ToolFailure({
      details: { tool: 'outer', input: {} },
      cause: inner,
    });

    expect(() => toDiagnosticReport(outer)).not.toThrow();
    expect(toDiagnosticReport(outer).cause).toMatchObject({
      reference: inner.id,
      details: { tool: 'inner', input: {} },
    });
  });

  test('preserves a typed occurrence when its stack is an accessor', () => {
    const error = new ToolFailure({
      details: { tool: 'inspect', input: {} },
    });
    Object.defineProperty(error, 'stack', {
      configurable: true,
      get() {
        throw new Error('stack unavailable');
      },
    });

    const report = toDiagnosticReport(error);

    expect(report.reference).toBe(error.id);
    expect(report.kind).toBe(error._tag);
    expect(report.stack).toEqual({
      $appex: 'unreadable',
      reason: 'accessor',
    });
  });

  test('preserves safe typed metadata when another field is unreadable', () => {
    const error = new ToolFailure({
      details: { tool: 'inspect', input: {} },
    });
    Object.defineProperty(error, 'message', {
      configurable: true,
      get() {
        throw new Error('message unavailable');
      },
    });

    const report = toDiagnosticReport(error);

    expect(report.reference).toBe(error.id);
    expect(report.kind).toBe(error._tag);
    expect(report.message).toBe(error._tag);
    expect(report.details).toEqual({ tool: 'inspect', input: {} });
  });

  test('contains proxy array length failures', () => {
    const array = new Proxy([], {
      get(target, property, receiver) {
        if (property === 'length') throw new Error('length unavailable');
        return Reflect.get(target, property, receiver);
      },
    });
    const error = new ToolFailure({
      details: { tool: 'inspect', input: { array } },
    });

    expect(() => toDiagnosticReport(error)).not.toThrow();
    expect(toDiagnosticReport(error).details).toMatchObject({
      input: { array: [] },
    });
  });

  test('contains non-string function names from hostile proxies', () => {
    const fn = new Proxy(() => undefined, {
      get(target, property, receiver) {
        if (property === 'name') return { hostile: true };
        return Reflect.get(target, property, receiver);
      },
    });
    const error = new ToolFailure({
      details: { tool: 'inspect', input: { fn } },
    });

    expect(() => toDiagnosticReport(error)).not.toThrow();
    expect(toDiagnosticReport(error).details).toMatchObject({
      input: { fn: { $appex: 'function', value: '' } },
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
    const LongMessage = defineException({
      tag: 'LongMessage',
      message: (_details: Record<string, never>) => 'abcdefgh',
    });

    const report = toDiagnosticReport(new LongMessage({ details: {} }), {
      limits: { maxStringLength: 4 },
    });

    expect(report.message).toBe('abcd');
    expect(report.truncation).toEqual({ messageOmitted: 4 });
  });

  test('bounds messages nested inside native causes', () => {
    const error = new ToolFailure({
      details: { tool: 'network', input: {} },
      cause: new Error('abcdefgh'),
    });

    const report = toDiagnosticReport(error, {
      limits: { maxStringLength: 4 },
    });

    expect((report.cause as Record<string, unknown>)['message']).toEqual({
      $appex: 'truncated',
      reason: 'string',
      value: 'abcd',
      omitted: 4,
    });
  });

  test('does not invoke custom string conversion on thrown objects', () => {
    let calls = 0;
    const thrown = {
      toString() {
        calls += 1;
        return 'private value';
      },
    };

    const report = toDiagnosticReport(thrown);

    expect(report.message).toBe('Non-Error value was thrown');
    expect(calls).toBe(0);
  });

  test('preserves __proto__ as diagnostic data without changing prototypes', () => {
    const input = JSON.parse('{"__proto__":{"admin":true}}') as Record<
      string,
      unknown
    >;
    const error = new ToolFailure({
      details: { tool: 'inspect', input },
    });

    const report = toDiagnosticReport(error);
    const normalizedInput = (report.details as Record<string, any>)['input'];

    expect(Object.getPrototypeOf(normalizedInput)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(normalizedInput, '__proto__'),
    ).toBe(true);
    expect(JSON.stringify(normalizedInput)).toBe(
      '{"__proto__":{"admin":true}}',
    );
  });

  test('does not copy unbounded attacker-controlled object keys', () => {
    const longKey = 'k'.repeat(5_000);
    const error = new ToolFailure({
      details: { tool: 'inspect', input: { [longKey]: true } },
    });

    const report = toDiagnosticReport(error);
    const normalizedInput = (report.details as Record<string, any>)['input'];

    expect(normalizedInput).toEqual({
      '$appex:truncated': {
        $appex: 'truncated',
        reason: 'key-length',
        omitted: 1,
      },
    });
    expect(JSON.stringify(normalizedInput).length).toBeLessThan(200);
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
    const Broken = defineException({
      tag: 'agent/BrokenMessage',
      message: (_details: Record<string, never>) => {
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
  const InternalFailure = defineException({
    tag: 'InternalFailure',
    message: ({ secret }: { secret: string }) => `Failed with ${secret}`,
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

  test('uses the detached decoded value for hostile report inputs', () => {
    const input = new Proxy(
      {
        v: 'appex/diagnostic/v1' as const,
        reference: 'AE_123',
        name: 'Error',
        message: 'failed',
      },
      {
        get(target, property, receiver) {
          if (property === 'reference') throw new Error('direct read denied');
          return Reflect.get(target, property, receiver);
        },
      },
    );

    expect(toPublicReport(input)).toEqual({
      v: 'appex/public/v1',
      reference: 'AE_123',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
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

  test('rejects malformed truncation metadata', () => {
    expect(
      decodeDiagnosticReport({
        v: 'appex/diagnostic/v1',
        reference: 'AE_123',
        name: 'Error',
        message: 'fail',
        truncation: { messageOmitted: -1 },
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Expected a non-negative integer',
        path: '$.truncation.messageOmitted',
      },
    });
  });

  test('requires report fields to be enumerable own data properties', () => {
    const input = {
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
    } as Record<string, unknown>;
    Object.defineProperty(input, 'message', {
      value: 'hidden',
      enumerable: false,
    });

    expect(decodeDiagnosticReport(input)).toEqual({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Expected an enumerable own data property',
        path: '$.message',
      },
    });
  });

  test('preserves __proto__ as decoded data without changing prototypes', () => {
    const input = JSON.parse(
      '{"v":"appex/diagnostic/v1","reference":"AE_123","name":"Error","message":"failed","details":{"__proto__":{"admin":true}}}',
    );

    const decoded = decodeDiagnosticReport(input);

    expect(decoded.success).toBe(true);
    if (!decoded.success) return;
    const details = decoded.value.details as Record<string, unknown>;
    expect(Object.getPrototypeOf(details)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(details, '__proto__')).toBe(
      true,
    );
    expect(JSON.stringify(details)).toBe('{"__proto__":{"admin":true}}');
  });

  test('bounds untrusted report depth before cloning', () => {
    const input: Record<string, unknown> = {
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
      message: 'failed',
    };
    let cursor = input;
    for (let index = 0; index < 70; index += 1) {
      const next: Record<string, unknown> = {};
      cursor['details'] = next;
      cursor = next;
    }

    const decoded = decodeDiagnosticReport(input);

    expect(decoded).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Report exceeds decode depth limit',
      },
    });
  });

  test('bounds untrusted report value count before cloning', () => {
    const decoded = decodeDiagnosticReport({
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
      message: 'failed',
      details: Array.from({ length: 10_001 }, () => null),
    });

    expect(decoded).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Report exceeds decode value limit',
      },
    });
  });

  test('rejects unbounded object keys without echoing them in the path', () => {
    const longKey = 'k'.repeat(5_000);
    const decoded = decodeDiagnosticReport({
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
      message: 'failed',
      details: { [longKey]: true },
    });

    expect(decoded).toEqual({
      success: false,
      error: {
        code: 'INVALID_REPORT',
        message: 'Report key exceeds decode length limit',
        path: '$.details',
      },
    });
  });

  test('contains hostile arrays and revoked top-level proxies while decoding', () => {
    const hostileArray = new Proxy([], {
      get(target, property, receiver) {
        if (property === 'length') throw new Error('length unavailable');
        return Reflect.get(target, property, receiver);
      },
    });
    const report = {
      v: 'appex/diagnostic/v1',
      reference: 'AE_123',
      name: 'Error',
      message: 'failed',
      details: hostileArray,
    };
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => decodeDiagnosticReport(report)).not.toThrow();
    expect(decodeDiagnosticReport(report)).toMatchObject({ success: true });
    expect(() => decodeDiagnosticReport(proxy)).not.toThrow();
    expect(decodeDiagnosticReport(proxy)).toMatchObject({
      success: false,
      error: { code: 'INVALID_REPORT' },
    });
  });
});
