import {
  decodePublicReport,
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src/reporting';
import { PUBLIC_REPORT_VERSION } from '../src/report-types';
import { createRedactionPolicy } from '../src/redaction';
import { defineException } from '../src/typed';
import { registerTypedException } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });
const anyFingerprint = expect.stringMatching(/^fp1_[0-9a-f]{32}$/);

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
  test('renders the kind policy and shares the occurrence id', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
      cause: new Error('postgres://user:hunter2@db'),
    });
    const report = toPublicReport(error);
    expect(report).toEqual({
      v: 'appex/public/v4',
      occurrence_id: error.occurrenceId,
      fingerprint: anyFingerprint,
      code: 'TOOL_UNAVAILABLE',
      message: 'search is temporarily unavailable.',
      as_json: { tool: 'search' },
    });
    expect(PUBLIC_REPORT_VERSION).toBe('appex/public/v4');
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(toDiagnosticReport(error).occurrence_id).toBe(report.occurrence_id);
  });

  test('discloses nothing for values without a policy', () => {
    const generic = {
      v: 'appex/public/v4',
      fingerprint: anyFingerprint,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
    expect(toPublicReport(new NoPolicy({ details: { tool: 'x' } }))).toEqual({
      ...generic,
      occurrence_id: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport(new Error('secret path'))).toEqual({
      ...generic,
      occurrence_id: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport(undefined)).toEqual({
      ...generic,
      occurrence_id: expect.stringMatching(/^AE_/),
    });
    expect(toPublicReport('AE_looks_like_an_occurrence_id')).toMatchObject({
      occurrence_id: expect.stringMatching(/^AE_[0-9A-Z]{26}$/),
    });
  });

  test('applies per-call overrides on top of the policy', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 's' },
    });
    expect(
      toPublicReport(error, {
        public: {
          code: 'SEARCH_DOWN',
          message: 'Search is down.',
          details: () => ({ retryAfterSeconds: 30 }),
        },
        occurrenceId: 'trace-9',
      }),
    ).toEqual({
      v: 'appex/public/v4',
      occurrence_id: 'trace-9',
      fingerprint: anyFingerprint,
      code: 'SEARCH_DOWN',
      message: 'Search is down.',
      as_json: { retryAfterSeconds: 30 },
    });
    expect(
      toPublicReport(error, { public: { details: () => null } }).as_json,
    ).toBeNull();
    expect(
      toPublicReport(new NoPolicy({ details: { tool: 'x' } }), {
        public: { code: 'TOOL_FAILED' },
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
      v: 'appex/public/v4',
      occurrence_id: expect.stringMatching(/^AE_/),
      fingerprint: anyFingerprint,
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
    const long = toPublicReport(error, {
      public: { message: 'm'.repeat(5000) },
    });
    expect(long.message).toHaveLength(4096);
    expect(long.truncated).toBe(true);
    const large = toPublicReport(error, {
      public: { details: () => ({ blob: 'x'.repeat(40_000), note: 'keep' }) },
    });
    expect(large.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(17_000);
    expect(JSON.stringify(large.as_json)).toContain('[truncated]');
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(
      toPublicReport(error, { public: { details: () => cyclic } }).as_json,
    ).toEqual({
      a: 1,
      self: '[circular]',
    });
    expect(
      toPublicReport(error, { public: { details: () => ({}) } }).as_json,
    ).toEqual({});
  });

  test('discloses nothing and stays silent when details cannot be serialized', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 's' },
    });
    const report = toPublicReport(error, {
      public: {
        details: () => ({
          get secret() {
            throw new Error('getter boom');
          },
        }),
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
      expect(() =>
        toPublicReport(error, { public: { code: value } } as never),
      ).toThrow(code('APPEX_INVALID_PUBLIC_CODE'));
    }
    expect(() =>
      toPublicReport(error, { public: { message: 42 } } as never),
    ).toThrow(code('APPEX_INVALID_PUBLIC_MESSAGE'));
    expect(() => toPublicReport(error, { occurrenceId: '' })).toThrow(
      code('APPEX_INVALID_OCCURRENCE_ID'),
    );
    expect(() => toPublicReport(error, { stack: true } as never)).toThrow(
      /APPEX_INVALID_OPTIONS: unknown option "stack"; known options: occurrenceId, public, redact, realm, corj/,
    );
    expect(() => toPublicReport(error, null as never)).toThrow(
      code('APPEX_INVALID_OPTIONS'),
    );
    expect(() => toPublicReport(error, { public: 5 } as never)).toThrow(
      /APPEX_INVALID_OPTIONS: public must be an object/,
    );
  });
});

describe('decodePublicReport', () => {
  const valid = {
    v: 'appex/public/v3',
    occurrence_id: 'AE_1',
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
        occurrence_id: 'r',
        code: 'c',
        message: '',
      }),
    ).toEqual({
      ok: true,
      report: {
        v: 'appex/public/v3',
        occurrence_id: 'r',
        code: 'c',
        message: '',
      },
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
    [
      'an unknown field',
      { ...valid, stack: [] },
      'Unexpected field',
      '$.stack',
    ],
    [
      'another version',
      { ...valid, v: 'appex/public/v2' },
      'Expected version appex/public/v3 or appex/public/v4',
      '$.v',
    ],
    [
      'a missing occurrence id',
      { ...valid, occurrence_id: undefined },
      'Expected a string',
      '$.occurrence_id',
    ],
    [
      'an empty occurrence id',
      { ...valid, occurrence_id: '' },
      'Expected 1 to 128 characters',
      '$.occurrence_id',
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
    [
      'a false truncated',
      { ...valid, truncated: false },
      'Expected true',
      '$.truncated',
    ],
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
    const missing = { occurrenceId: 'AE_missing' };
    registerTypedException(missing, { code: 'MISSING' });
    expect(toPublicReport(missing).code).toBe('MISSING');

    const primitive = { occurrenceId: 'AE_primitive', details: 7 };
    registerTypedException(primitive, { code: 'PRIMITIVE' });
    expect(toPublicReport(primitive).code).toBe('PRIMITIVE');

    const empty = { occurrenceId: 'AE_null', details: null };
    registerTypedException(empty, { code: 'NULL' });
    expect(toPublicReport(empty).code).toBe('NULL');
  });

  test('keeps its disclosure policy when captured as a pair', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
    });
    const captured = toReports(error);
    expect(captured.public).toEqual(toPublicReport(error));
    expect(captured.public.code).toBe('TOOL_UNAVAILABLE');
    expect(captured.public.as_json).toEqual({ tool: 'search' });
    expect(JSON.stringify(captured.public)).not.toContain('hunter2');
    expect(toReports(new NoPolicy({ details: { tool: 'x' } })).public).toEqual({
      v: 'appex/public/v4',
      occurrence_id: expect.stringMatching(/^AE_/),
      fingerprint: anyFingerprint,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
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

describe('the public option', () => {
  const Kind = defineException({
    tag: 'tools/Unavailable',
    message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
    public: {
      code: 'TOOL_UNAVAILABLE',
      message: 'The tool is unavailable.',
      details: ({ tool }) => ({ tool }),
    },
  });
  const caught = new Kind({ details: { tool: 'search' } });

  test('each field overrides on its own; the rest comes from the kind', () => {
    expect(
      toPublicReport(caught, { public: { message: 'Try later.' } }),
    ).toMatchObject({
      code: 'TOOL_UNAVAILABLE',
      message: 'Try later.',
      as_json: { tool: 'search' },
    });
    expect(toPublicReport(caught, { public: { code: 'RETRY' } })).toMatchObject(
      {
        code: 'RETRY',
        message: 'The tool is unavailable.',
      },
    );
  });

  test("message and details may be functions of the kind's details", () => {
    const report = toPublicReport(caught, {
      public: {
        message: ({ tool }: { tool?: string }) => `No ${tool}.`,
        details: ({ tool }: { tool?: string }) => ({ name: tool }),
      },
    });
    expect(report).toMatchObject({
      message: 'No search.',
      as_json: { name: 'search' },
    });
  });

  test("details: null suppresses the kind's selector", () => {
    expect(
      toPublicReport(caught, { public: { details: null } }),
    ).not.toHaveProperty('as_json');
  });

  test('a value without a trusted policy can be given one at the call; its functions get {}', () => {
    const seen: unknown[] = [];
    const report = toPublicReport(new Error('internal secret'), {
      public: {
        code: 'UPSTREAM_DOWN',
        message: (details) => {
          seen.push(details);
          return 'Upstream is down.';
        },
      },
    });
    expect(report).toMatchObject({
      code: 'UPSTREAM_DOWN',
      message: 'Upstream is down.',
    });
    expect(seen).toEqual([{}]);
    expect(JSON.stringify(report)).not.toContain('internal secret');
  });

  test('an override function that throws or returns a non-string fails closed to the generic message', () => {
    const thrown = toPublicReport(caught, {
      public: {
        message: () => {
          throw new Error('bug');
        },
      },
    });
    expect(thrown.message).toBe('Something went wrong');
    expect(
      toPublicReport(caught, { public: { message: (() => 42) as never } })
        .message,
    ).toBe('Something went wrong');
  });

  test.each([
    [{ public: 5 }, 'APPEX_INVALID_OPTIONS'],
    [{ public: { nope: 1 } }, 'APPEX_INVALID_OPTIONS'],
    [{ public: { code: '' } }, 'APPEX_INVALID_PUBLIC_CODE'],
    [{ public: { message: 5 } }, 'APPEX_INVALID_PUBLIC_MESSAGE'],
    [{ public: { details: { tool: 'x' } } }, 'APPEX_INVALID_OPTIONS'],
    [{ code: 'OLD_STYLE' }, 'APPEX_INVALID_OPTIONS'],
    [{ message: 'old style' }, 'APPEX_INVALID_OPTIONS'],
    [{ details: {} }, 'APPEX_INVALID_OPTIONS'],
  ])('%j throws %s', (options, code) => {
    expect(() => toPublicReport(caught, options as never)).toThrow(code);
  });

  test('corj options reach the JSON of the selected details', () => {
    const details = () => ({
      get token() {
        return 'sk-live';
      },
    });
    expect(
      JSON.stringify(toPublicReport(caught, { public: { details } })),
    ).toContain('sk-live');
    expect(
      JSON.stringify(
        toPublicReport(caught, {
          public: { details },
          corj: { inspection: 'no-invoke' },
        }),
      ),
    ).not.toContain('sk-live');
  });

  test('each override field is read once, so a getter cannot smuggle a value past validation', () => {
    // The bag is the caller's object. Reading a field twice would let a getter
    // show the validator one value and the report another.
    let codeReads = 0;
    const codeBag = {
      get code(): string {
        return codeReads++ === 0 ? 'OK_CODE' : ({ evil: 1 } as never);
      },
    };
    expect(toPublicReport(caught, { public: codeBag }).code).toBe('OK_CODE');
    expect(codeReads).toBe(1);

    let messageReads = 0;
    const messageBag = {
      get message(): string {
        return messageReads++ === 0 ? 'First.' : (42 as never);
      },
    };
    expect(toPublicReport(caught, { public: messageBag }).message).toBe(
      'First.',
    );
    expect(messageReads).toBe(1);

    let detailsReads = 0;
    const detailsBag = {
      get details(): () => unknown {
        return detailsReads++ === 0
          ? () => ({ ok: true })
          : ({ evil: 1 } as never);
      },
    };
    expect(toPublicReport(caught, { public: detailsBag }).as_json).toEqual({
      ok: true,
    });
    expect(detailsReads).toBe(1);
  });

  test('a throwing getter on the bag propagates before any report is built', () => {
    expect(() =>
      toPublicReport(caught, {
        public: {
          get code(): string {
            throw new Error('bag boom');
          },
        },
      }),
    ).toThrow('bag boom');
  });

  test('public.details that is not a function says what to pass', () => {
    expect(() =>
      toPublicReport(caught, { public: { details: { tool: 'x' } } as never }),
    ).toThrow(
      /public\.details must be a function that selects the JSON to disclose, or null/,
    );
  });
});

describe('public report v4', () => {
  test('carries v4 and a fingerprint by default', () => {
    const report = toPublicReport(new Error('x'));
    expect(report.v).toBe('appex/public/v4');
    expect(report.fingerprint).toMatch(/^fp1_[0-9a-f]{32}$/);
    expect(Object.keys(report).slice(0, 3)).toEqual([
      'v',
      'occurrence_id',
      'fingerprint',
    ]);
  });

  test('standalone reports agree when they get the same corj bag and policy', () => {
    const corj = { maxDepth: 3 };
    const redact = createRedactionPolicy({ patterns: [/sk-[a-z]{10}/g] });
    const caught = new Error('key sk-abcdefghij', {
      cause: new Error('inner'),
    });
    expect(toPublicReport(caught, { corj, redact }).fingerprint).toBe(
      toDiagnosticReport(caught, { corj, redact }).fingerprint,
    );
  });

  test('fingerprintParts: null turns it off', () => {
    expect(
      toPublicReport(new Error('x'), { corj: { fingerprintParts: null } }),
    ).not.toHaveProperty('fingerprint');
  });

  test('the fingerprint discloses nothing readable', () => {
    const report = toPublicReport(
      new Error('internal secret at /srv/app/db.js'),
    );
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report)).not.toContain('/srv/app');
  });

  test('with fingerprintParts: null nothing is read from the error', () => {
    let ran = 0;
    class Counting extends Error {
      override get name() {
        ran++;
        return 'Counting';
      }
    }
    const caught = new Counting('x');
    const before = ran; // V8 may read `name` while constructing the error; only the report is under test
    toPublicReport(caught, { corj: { fingerprintParts: null } });
    expect(ran).toBe(before);
  });

  test('reads every option of the bag exactly once', () => {
    const reads: string[] = [];
    const report = toPublicReport(new Error('x'), {
      get occurrenceId() {
        reads.push('occurrenceId');
        return 'trace-once';
      },
      get public() {
        reads.push('public');
        return { code: 'ONCE' };
      },
      get corj() {
        reads.push('corj');
        return {};
      },
      get redact() {
        reads.push('redact');
        return undefined;
      },
      get realm() {
        reads.push('realm');
        return undefined;
      },
    });

    expect(reads).toEqual([
      'occurrenceId',
      'public',
      'corj',
      'redact',
      'realm',
    ]);
    expect(report).toMatchObject({
      occurrence_id: 'trace-once',
      code: 'ONCE',
    });
  });

  test('under no-invoke, computing it runs no getter', () => {
    let ran = 0;
    class Lazy extends Error {
      override get name() {
        ran++;
        return 'Lazy';
      }
    }
    const caught = new Lazy('x');
    const before = ran; // V8 may read `name` while constructing the error; only the report is under test
    toPublicReport(caught, { corj: { inspection: 'no-invoke' } });
    expect(ran).toBe(before);
  });
});

describe('decodePublicReport reads v3 and v4', () => {
  const v4 = {
    v: 'appex/public/v4',
    occurrence_id: 'AE_1',
    fingerprint: 'fp1_' + 'a'.repeat(32),
    code: 'X',
    message: 'm',
  };
  const v3 = {
    v: 'appex/public/v3',
    occurrence_id: 'AE_1',
    code: 'X',
    message: 'm',
  };

  test('both versions decode, each keeping its own v', () => {
    expect(decodePublicReport(v4)).toEqual({ ok: true, report: v4 });
    expect(decodePublicReport(v3)).toEqual({ ok: true, report: v3 });
  });

  test('a v3 report is rejected for carrying the key at all', () => {
    // Every other stray key is rejected whatever its value; so is this one.
    expect(decodePublicReport({ ...v3, fingerprint: undefined })).toEqual({
      ok: false,
      reason: 'Unexpected field',
      path: '$.fingerprint',
    });
    // On v4 the field is optional, and an explicit `undefined` reads as absent.
    expect(decodePublicReport({ ...v4, fingerprint: undefined })).toEqual({
      ok: true,
      report: {
        v: v4.v,
        occurrence_id: v4.occurrence_id,
        code: 'X',
        message: 'm',
      },
    });
  });

  test('the decoded report keeps the field order of a fresh one', () => {
    const decoded = decodePublicReport(v4);
    if (!decoded.ok) throw new Error(decoded.reason);
    expect(Object.keys(decoded.report).slice(0, 3)).toEqual([
      'v',
      'occurrence_id',
      'fingerprint',
    ]);
  });

  test('a round trip of a fresh report decodes', () => {
    const report = toPublicReport(new Error('x'));
    expect(decodePublicReport(JSON.parse(JSON.stringify(report)))).toEqual({
      ok: true,
      report,
    });
  });

  test.each([
    [{ ...v3, fingerprint: 'fp1_x' }, 'Unexpected field', '$.fingerprint'],
    [
      { ...v4, fingerprint: 'has space' },
      'Expected 1 to 64 printable ASCII characters without spaces',
      '$.fingerprint',
    ],
    [
      { ...v4, fingerprint: 'x'.repeat(65) },
      'Expected 1 to 64 printable ASCII characters without spaces',
      '$.fingerprint',
    ],
    [{ ...v4, fingerprint: 5 }, 'Expected a string', '$.fingerprint'],
    [
      { ...v4, v: 'appex/public/v5' },
      'Expected version appex/public/v3 or appex/public/v4',
      '$.v',
    ],
  ])('%j is rejected', (value, reason, path) => {
    expect(decodePublicReport(value)).toEqual({ ok: false, reason, path });
  });
});
