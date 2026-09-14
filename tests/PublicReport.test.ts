import {
  decodePublicReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src/reporting';
import { PUBLIC_REPORT_VERSION } from '../src/report-types';
import { defineException } from '../src/typed';
import { registerTypedException } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool, secret }: { tool: string; secret: string }) =>
    `Tool ${tool} is unavailable (${secret})`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: ({ tool }) => `${tool} is temporarily unavailable.`,
    details: ({ tool }) => ({ tool }),
  },
});
const NoPolicy = defineException({
  tag: 'tools/NoPolicy',
  message: ({ tool }: { tool: string }) => `${tool} failed`,
});

describe('toPublicReport', () => {
  test('renders the kind policy and shares the occurrence reference', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
      cause: new Error('postgres://user:hunter2@db'),
    });
    const report = toPublicReport(error);
    expect(report).toEqual({
      v: 'appex/public/v3',
      reference: error.id,
      code: 'TOOL_UNAVAILABLE',
      message: 'search is temporarily unavailable.',
      as_json: { tool: 'search' },
    });
    expect(PUBLIC_REPORT_VERSION).toBe('appex/public/v3');
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(toDiagnosticReport(error).reference).toBe(report.reference);
  });

  test('discloses nothing for values without a policy', () => {
    const generic = {
      v: 'appex/public/v3',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
    expect(toPublicReport(new NoPolicy({ details: { tool: 'x' } }))).toEqual({
      ...generic,
      reference: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport(new Error('secret path'))).toEqual({
      ...generic,
      reference: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport(undefined)).toEqual({
      ...generic,
      reference: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport('AE_looks_like_a_reference')).toMatchObject({
      reference: expect.stringMatching(/^AE_[0-9A-Z]{26}$/),
    });
  });

  test('applies per-call overrides on top of the policy', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 's' },
    });
    expect(
      toPublicReport(error, {
        code: 'SEARCH_DOWN',
        message: 'Search is down.',
        details: { retryAfterSeconds: 30 },
        reference: 'trace-9',
      }),
    ).toEqual({
      v: 'appex/public/v3',
      reference: 'trace-9',
      code: 'SEARCH_DOWN',
      message: 'Search is down.',
      as_json: { retryAfterSeconds: 30 },
    });
    expect(toPublicReport(error, { details: null }).as_json).toBeNull();
    expect(
      toPublicReport(new NoPolicy({ details: { tool: 'x' } }), {
        code: 'TOOL_FAILED',
      }),
    ).toMatchObject({ code: 'TOOL_FAILED', message: 'Something went wrong' });
  });

  test('falls back to generic text when a policy renderer misbehaves', () => {
    const Throws = defineException({
      tag: 'Throws',
      message: 'throws',
      public: {
        code: 'THROWS',
        message: () => {
          throw new Error('render boom');
        },
        details: () => {
          throw new Error('select boom');
        },
      },
    });
    expect(toPublicReport(new Throws())).toEqual({
      v: 'appex/public/v3',
      reference: expect.stringMatching(/^AE_/),
      code: 'THROWS',
      message: 'Something went wrong',
    });
    const Numeric = defineException({
      tag: 'Numeric',
      message: 'numeric',
      public: { code: 'NUMERIC', message: () => 42 as unknown as string },
    });
    expect(toPublicReport(new Numeric()).message).toBe('Something went wrong');
    const Constant = defineException({
      tag: 'Constant',
      message: 'constant',
      public: { code: 'CONSTANT', message: 'Constant text.' },
    });
    expect(toPublicReport(new Constant()).message).toBe('Constant text.');
  });

  test('cuts long messages and large details and says so', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 's' },
    });
    const long = toPublicReport(error, { message: 'm'.repeat(5000) });
    expect(long.message).toHaveLength(4096);
    expect(long.truncated).toBe(true);
    const large = toPublicReport(error, {
      details: { blob: 'x'.repeat(40_000), note: 'keep' },
    });
    expect(large.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(17_000);
    expect(JSON.stringify(large.as_json)).toContain('[truncated]');
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(toPublicReport(error, { details: cyclic }).as_json).toEqual({
      a: 1,
      self: '[circular]',
    });
    expect(toPublicReport(error, { details: {} }).as_json).toEqual({});
  });

  test('discloses nothing and stays silent when details cannot be serialized', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 's' },
    });
    const report = toPublicReport(error, {
      details: {
        get secret() {
          throw new Error('getter boom');
        },
      },
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(report.as_json).toBeNull();
    expect(report).not.toHaveProperty('reporting_errors');
  });

  test('rejects invalid overrides with coded errors', () => {
    const error = new Error('x');
    for (const value of ['', 'x'.repeat(129), 42]) {
      expect(() => toPublicReport(error, { code: value } as never)).toThrow(
        code('APPEX_INVALID_PUBLIC_CODE'),
      );
    }
    expect(() => toPublicReport(error, { message: 42 } as never)).toThrow(
      code('APPEX_INVALID_PUBLIC_MESSAGE'),
    );
    expect(() => toPublicReport(error, { reference: '' })).toThrow(
      code('APPEX_INVALID_REFERENCE'),
    );
    expect(() => toPublicReport(error, { stack: true } as never)).toThrow(
      /APPEX_INVALID_OPTIONS: unknown option "stack"; known options: reference, code, message, details/,
    );
    expect(() => toPublicReport(error, null as never)).toThrow(
      code('APPEX_INVALID_OPTIONS'),
    );
  });
});

describe('decodePublicReport', () => {
  const valid = {
    v: 'appex/public/v3',
    reference: 'AE_1',
    code: 'TOOL_UNAVAILABLE',
    message: 'Down.',
    as_json: { tool: 'search', tags: ['a', 1, null, true], nested: { n: 1.5 } },
    truncated: true,
  };

  test('accepts a valid report and returns a detached copy', () => {
    const input = JSON.parse(JSON.stringify(valid)) as typeof valid;
    const result = decodePublicReport(input);
    expect(result).toEqual({ ok: true, report: valid });
    if (!result.ok) throw new Error('expected ok');
    input.as_json.tool = 'changed';
    expect((result.report.as_json as { tool: string }).tool).toBe('search');
    expect(
      decodePublicReport({
        v: 'appex/public/v3',
        reference: 'r',
        code: 'c',
        message: '',
      }),
    ).toEqual({
      ok: true,
      report: { v: 'appex/public/v3', reference: 'r', code: 'c', message: '' },
    });
    expect(decodePublicReport(toPublicReport(new Error('x')))).toMatchObject({
      ok: true,
    });
  });

  test('round-trips a null-prototype object and a __proto__ key safely', () => {
    const input = Object.assign(Object.create(null), valid, {
      as_json: JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'),
    });
    const result = decodePublicReport(input);
    if (!result.ok) throw new Error(result.reason);
    expect(Object.getPrototypeOf(result.report.as_json)).toBe(Object.prototype);
    expect(Object.keys(result.report.as_json as object).sort()).toEqual([
      '__proto__',
      'ok',
    ]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test.each([
    ['a primitive', 'x', 'Expected an object', '$'],
    ['an array', [], 'Expected an object', '$'],
    ['a class instance', new Date(), 'Expected an object', '$'],
    ['an unknown field', { ...valid, stack: [] }, 'Unexpected field', '$.stack'],
    [
      'another version',
      { ...valid, v: 'appex/public/v2' },
      'Expected version appex/public/v3',
      '$.v',
    ],
    [
      'a missing reference',
      { ...valid, reference: undefined },
      'Expected a string',
      '$.reference',
    ],
    [
      'an empty reference',
      { ...valid, reference: '' },
      'Expected 1 to 128 characters',
      '$.reference',
    ],
    [
      'a long code',
      { ...valid, code: 'x'.repeat(129) },
      'Expected 1 to 128 characters',
      '$.code',
    ],
    [
      'a long message',
      { ...valid, message: 'x'.repeat(4097) },
      'Expected 0 to 4096 characters',
      '$.message',
    ],
    ['a false truncated', { ...valid, truncated: false }, 'Expected true', '$.truncated'],
    [
      'a non-finite number',
      { ...valid, as_json: { n: Number.NaN } },
      'Expected a finite number',
      '$.as_json.n',
    ],
    [
      'an undefined value',
      { ...valid, as_json: { n: undefined } },
      'Expected a JSON value',
      '$.as_json.n',
    ],
    [
      'a function',
      { ...valid, as_json: [() => 1] },
      'Expected a JSON value',
      '$.as_json[0]',
    ],
    [
      'a class instance inside',
      { ...valid, as_json: { d: new Date() } },
      'Expected a JSON value',
      '$.as_json.d',
    ],
  ])('rejects %s', (_label, input, reason, path) => {
    expect(decodePublicReport(input)).toEqual({ ok: false, reason, path });
  });

  test('bounds depth and value count', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 33; i++) deep = [deep];
    expect(decodePublicReport({ ...valid, as_json: deep })).toMatchObject({
      ok: false,
      reason: 'as_json exceeds depth 32',
    });
    expect(
      decodePublicReport({ ...valid, as_json: new Array(10_001).fill(0) }),
    ).toMatchObject({ ok: false, reason: 'as_json exceeds 10,000 values' });
  });

  test('reports values it cannot inspect', () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('no prototype for you');
        },
      },
    );
    expect(decodePublicReport(hostile)).toEqual({
      ok: false,
      reason: 'Could not inspect value',
      path: '$',
    });
  });
});

describe('toPublicReport reads details defensively', () => {
  test('never throws when details is a throwing accessor', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
    });
    Object.defineProperty(error, 'details', {
      get() {
        throw new Error('boom');
      },
      configurable: true,
    });
    const report = toPublicReport(error);
    expect(report.code).toBe('TOOL_UNAVAILABLE');
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(JSON.stringify(report)).not.toContain('search');
  });

  test('falls back to an empty record for absent or non-object details', () => {
    const missing = { id: 'AE_missing' };
    registerTypedException(missing, { code: 'MISSING' });
    expect(toPublicReport(missing).code).toBe('MISSING');

    const primitive = { id: 'AE_primitive', details: 7 };
    registerTypedException(primitive, { code: 'PRIMITIVE' });
    expect(toPublicReport(primitive).code).toBe('PRIMITIVE');

    const empty = { id: 'AE_null', details: null };
    registerTypedException(empty, { code: 'NULL' });
    expect(toPublicReport(empty).code).toBe('NULL');
  });

  test('never throws when the value itself cannot be inspected', () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('no descriptors for you');
        },
      },
    );
    registerTypedException(hostile, {
      code: 'HOSTILE',
      message: () => 'Hostile.',
      details: () => ({ ok: true }),
    });
    const report = toPublicReport(hostile);
    expect(report.code).toBe('HOSTILE');
    expect(report.message).toBe('Hostile.');
    expect(report.as_json).toEqual({ ok: true });
  });
});
