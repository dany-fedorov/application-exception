import {
  decodeDiagnosticReport,
  DIAGNOSTIC_REPORT_VERSION,
  toDiagnosticReport,
  toPublicReport,
} from '../src/reporting';
import { defineException, isTypedException } from '../src/typed';
import type { DiagnosticReportOptions } from '../src/reporting';

function roundTrip(value: unknown, options: DiagnosticReportOptions = {}) {
  const report = toDiagnosticReport(value, options);
  const json = JSON.stringify(report);
  expect(Buffer.byteLength(json)).toBeLessThanOrEqual(
    options.limits?.maxBytes ?? 65_536,
  );
  expect(decodeDiagnosticReport(JSON.parse(json))).toEqual({
    success: true,
    value: report,
  });
  return report;
}

test('wide objects inspect only bounded selected descriptors', () => {
  let reads = 0;
  const wide = Object.fromEntries(
    Array.from({ length: 100_000 }, (_, i) => [`k${i}`, i]),
  );
  const proxy = new Proxy(wide, {
    getOwnPropertyDescriptor(target, key) {
      reads++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const report = roundTrip(proxy, { limits: { maxEntries: 5 } });
  expect(reads).toBeLessThanOrEqual(10);
  expect(report.thrown).toMatchObject({
    k0: 0,
    k4: 4,
    '$appex:truncated': { $appex: 'truncated' },
  });
});

test('dense arrays read length and selected indexes without enumerating indexes', () => {
  const reads: PropertyKey[] = [];
  let enumerations = 0;
  const array = new Proxy(
    Array.from({ length: 100_000 }, (_, i) => i),
    {
      ownKeys(target) {
        enumerations++;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        reads.push(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  roundTrip(array, { limits: { maxEntries: 3 } });
  expect(enumerations).toBe(0);
  expect(reads.filter((key) => /^\d+$/.test(String(key)))).toEqual([
    '0',
    '1',
    '2',
  ]);
});

test.each(['accessor', 'redacted'] as const)(
  'shared %s graph stops at the shared slot budget',
  (kind) => {
    let reads = 0;
    const leaf = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`field${i}`, i]),
    );
    if (kind === 'accessor')
      for (const key of Object.keys(leaf))
        Object.defineProperty(leaf, key, {
          get() {
            throw Error('must not run');
          },
        });
    const observed = new Proxy(leaf, {
      getOwnPropertyDescriptor(target, key) {
        reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const branch = Array.from({ length: 50 }, () => observed);
    const graph = Array.from({ length: 5 }, () => branch);
    const report = roundTrip(graph, {
      redactKeys: kind === 'redacted' ? Object.keys(leaf) : [],
      limits: { maxValues: 100, maxBytes: 65_536 },
    });
    expect(reads).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(12_000);
  },
);

test('an exhausted container emits a single marker, including zero budget', () => {
  const report = roundTrip(Array(1000).fill(undefined), {
    limits: { maxValues: 2, maxEntries: 1000 },
  });
  expect(report.thrown).toEqual([
    { $appex: 'undefined' },
    { $appex: 'truncated', reason: 'values' },
  ]);
  expect(
    roundTrip(Array(1000).fill(1), { limits: { maxValues: 0 } }).thrown,
  ).toEqual({ $appex: 'truncated', reason: 'values' });
});

test.each(['😀', '\u0000', 'é'])(
  'UTF-8 caps include escaped text, long keys and the envelope (%s)',
  (text) => {
    const Failure = defineException({
      tag: 'Bounded',
      message: text.repeat(100_000),
    });
    const error = new Failure({
      cause: Array(50).fill({ ['k'.repeat(4096)]: text.repeat(20_000) }),
    });
    Object.defineProperty(error, 'name', { value: text.repeat(100_000) });
    const report = roundTrip(error, {
      context: { repeated: Array(50).fill(text.repeat(20_000)) },
      limits: { maxStringLength: 65_536, maxBytes: 4096 },
    });
    expect(report.reference).toBe(error.id);
    expect(report.truncation).toMatchObject({ diagnosticsOmitted: true });
  },
);

test('all supported edge limit combinations produce decoder-compatible JSON', () => {
  const shared = {
    password: 'secret',
    get accessor() {
      throw Error('must not run');
    },
    text: '😀'.repeat(100),
    array: [undefined, 1n, NaN],
  };
  for (const maxDepth of [0, 8, 32])
    for (const maxValues of [0, 1, 1000, 10_000])
      for (const maxEntries of [0, 50, 1000])
        for (const maxStringLength of [0, 4096, 65_536]) {
          roundTrip(Array(1000).fill(shared), {
            limits: {
              maxDepth,
              maxValues,
              maxEntries,
              maxStringLength,
              maxBytes: 1_048_576,
            },
          });
        }
});

test.each([
  { maxDepth: 33 },
  { maxValues: 10_001 },
  { maxEntries: 1001 },
  { maxStringLength: 65_537 },
  { maxBytes: 4095 },
  { maxBytes: 1_048_577 },
  { maxValues: -1 },
  { maxDepth: 0.5 },
])('rejects unsupported limits %j', (limits) => {
  expect(() => toDiagnosticReport(null, { limits })).toThrow(TypeError);
});

test('Date and function inspection bypasses overrides, getters and toJSON', () => {
  let calls = 0;
  const date = new Date('2020-01-01T00:00:00.000Z');
  Object.defineProperties(date, {
    getTime: {
      get() {
        calls++;
        throw Error();
      },
    },
    toISOString: {
      value() {
        calls++;
        return 'wrong';
      },
    },
    toJSON: {
      value() {
        calls++;
        return 'wrong';
      },
    },
  });
  const fn = () => undefined;
  Object.defineProperty(fn, 'name', {
    get() {
      calls++;
      return 'wrong';
    },
  });
  const report = roundTrip({ date, fn });
  expect(calls).toBe(0);
  expect(report.thrown).toEqual({
    date: '2020-01-01T00:00:00.000Z',
    fn: { $appex: 'unreadable', reason: 'accessor' },
  });
});

test('bounded prototype classification handles a self-returning hostile proxy', () => {
  let reads = 0;
  const proxy: object = new Proxy(
    {},
    {
      getPrototypeOf() {
        reads++;
        if (reads > 100) throw Error('unbounded walk');
        return proxy;
      },
    },
  );
  roundTrip(proxy);
  expect(reads).toBeLessThanOrEqual(64);
});

test('unsupported collections and binary values are explicit markers', () => {
  const values = [
    new Map(),
    new Set(),
    new WeakMap(),
    new WeakSet(),
    Buffer.alloc(100_000),
    new Uint8Array(100_000),
    new ArrayBuffer(100_000),
    new DataView(new ArrayBuffer(1)),
  ];
  for (const value of values)
    expect(roundTrip(value).thrown).toMatchObject({ $appex: 'unsupported' });
});

test('provider code/status data are bounded and allowlisted in errors and causes', () => {
  const provider = Object.assign(new Error('provider'), {
    code: 'ECONNRESET',
    status: 503,
    token: 'secret',
    response: { secret: true },
  });
  expect(roundTrip(provider)).toMatchObject({
    code: 'ECONNRESET',
    status: 503,
  });
  expect(roundTrip(new Error('outer', { cause: provider })).cause).toEqual({
    name: 'Error',
    message: 'provider',
    code: 'ECONNRESET',
    status: 503,
  });
  expect(JSON.stringify(roundTrip(provider))).not.toContain('secret');
  Object.defineProperty(provider, 'code', {
    get() {
      throw Error('accessor');
    },
  });
  expect(roundTrip(provider)).not.toHaveProperty('code');
});

test('default stack omission avoids native formatting and all stack descriptor reads', () => {
  let formatted = 0;
  let stackReads = 0;
  const prior = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () => {
      formatted++;
      return 'formatted';
    };
    const native = new Error('native');
    const proxy = new Proxy(native, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'stack') stackReads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(roundTrip(new Error('outer', { cause: native }))).not.toHaveProperty(
      'stack',
    );
    roundTrip(proxy);
    expect(formatted).toBe(0);
    expect(stackReads).toBe(0);
    expect(roundTrip(native, { includeStack: true }).stack).toBe('formatted');
    expect(formatted).toBeGreaterThan(0);
  } finally {
    Error.prepareStackTrace = prior;
  }
});

test('explicit stacks skip user accessors', () => {
  const error = new Error('custom');
  let calls = 0;
  Object.defineProperty(error, 'stack', {
    get() {
      calls++;
      return 'private';
    },
  });
  expect(roundTrip(error, { includeStack: true }).stack).toEqual({
    $appex: 'unreadable',
    reason: 'accessor',
  });
  expect(calls).toBe(0);
});

test('foreign module diagnostics retain metadata without strengthening the local guard', () => {
  let foreign: Error & { id: string; timestamp: string };
  jest.isolateModules(() => {
    const api = require('../src/typed') as typeof import('../src/typed');
    const Failure = api.defineException({
      tag: 'foreign/Failure',
      message: ({ detail }: { detail: number }) => String(detail),
    });
    foreign = new Failure({ details: { detail: 7 } });
  });
  expect(isTypedException(foreign!)).toBe(false);
  expect(roundTrip(foreign!)).toMatchObject({
    reference: foreign!.id,
    timestamp: foreign!.timestamp,
    kind: 'foreign/Failure',
    details: { detail: 7 },
  });
});

test('a renderer throwing undefined remains visible', () => {
  const Failure = defineException({
    tag: 'Undefined',
    message: (_: {}) => {
      throw undefined;
    },
  });
  expect(roundTrip(new Failure({ details: {} })).messageRenderingError).toEqual(
    { $appex: 'undefined' },
  );
});

test('decoder validates the same detached snapshot it returns', () => {
  let reads = 0;
  const input = new Proxy(
    {
      v: DIAGNOSTIC_REPORT_VERSION,
      reference: 'AE_valid',
      name: 'Error',
      message: '',
    },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'reference')
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: ++reads === 1 ? 'AE_valid' : 123,
          };
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  const result = decodeDiagnosticReport(input);
  if (result.success) expect(typeof result.value.reference).toBe('string');
  else expect(result.error.code).toBe('INVALID_REPORT');
});

test('decoder bounds descriptor reads, bytes and unsupported-version errors', () => {
  let reads = 0;
  const input = new Proxy(
    Object.fromEntries(Array.from({ length: 100_001 }, (_, i) => [`k${i}`, i])),
    {
      getOwnPropertyDescriptor(target, key) {
        reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  expect(decodeDiagnosticReport(input).success).toBe(false);
  expect(reads).toBeLessThanOrEqual(100_000);
  expect(
    decodeDiagnosticReport({
      v: DIAGNOSTIC_REPORT_VERSION,
      reference: 'valid',
      name: 'Error',
      message: '',
      details: '😀'.repeat(300_000),
    }).success,
  ).toBe(false);
  const unsupported = decodeDiagnosticReport({
    v: 'unknown'.repeat(100_000),
    reference: 'valid',
    name: '',
    message: '',
  });
  expect(JSON.stringify(unsupported).length).toBeLessThan(300);
});

test.each([{}, new Error(), '', 'x'.repeat(129), null, undefined])(
  'public projection rejects invalid reference %p',
  (value) => {
    expect(() => toPublicReport(value as string)).toThrow(TypeError);
  },
);

test('public presentation is bounded, explicitly selected, and preserves its reference', () => {
  const report = toPublicReport('x'.repeat(128), {
    code: 'c'.repeat(128),
    message: '😀'.repeat(100_000),
    details: Array(50).fill({ ['k'.repeat(4096)]: '😀'.repeat(100_000) }),
  });
  expect(report.reference).toBe('x'.repeat(128));
  expect(report.code.length).toBeLessThanOrEqual(128);
  expect(report.message.length).toBeLessThanOrEqual(4096);
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(65_536);
  expect(toPublicReport(' ')).toMatchObject({ reference: ' ' });
});

test('byte exhaustion stops reading repeated long-string branches before materializing them', () => {
  let reads = 0;
  const repeated = new Proxy(
    { text: 'x'.repeat(65_536) },
    {
      getOwnPropertyDescriptor(target, key) {
        reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  const report = roundTrip(Array(100).fill(repeated), {
    limits: {
      maxValues: 10_000,
      maxEntries: 1000,
      maxStringLength: 65_536,
      maxBytes: 4096,
    },
  });
  expect(reads).toBeLessThanOrEqual(2);
  expect(JSON.stringify(report)).toContain('"reason":"bytes"');
});

test.each(['v1', 'unknown'])('rejects version %s explicitly', (version) => {
  expect(
    decodeDiagnosticReport({
      v: `appex/diagnostic/${version}`,
      reference: 'ref',
      name: '',
      message: '',
    }),
  ).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_VERSION' } });
});

test.each([
  { unexpected: true },
  { reference: '' },
  { reference: 'r'.repeat(129) },
  { name: 'n'.repeat(129) },
  { message: 'm'.repeat(65_537) },
  { kind: 'k'.repeat(129) },
  { timestamp: 't'.repeat(129) },
  { code: 'c'.repeat(129) },
  { status: false },
  { truncation: {} },
  { truncation: { diagnosticsOmitted: false } },
  { truncation: { nameOmitted: -1 } },
  { truncation: { unexpected: true } },
])('rejects invalid v2 envelope fields %j', (fields) => {
  expect(
    decodeDiagnosticReport({
      v: DIAGNOSTIC_REPORT_VERSION,
      reference: 'ref',
      name: '',
      message: '',
      ...fields,
    }).success,
  ).toBe(false);
});

test('escaping-heavy foreign identifiers survive the minimum byte budget', () => {
  const foreign = Object.assign(new Error('\u0000'.repeat(65_536)), {
    [Symbol.for('application-exception/TypedException')]: true,
    _tag: '\u0000'.repeat(128),
    id: '\u0000'.repeat(128),
    timestamp: '2020-01-01',
    details: {},
  });
  Object.defineProperty(foreign, 'name', { value: '\u0000'.repeat(128) });
  const report = roundTrip(foreign, {
    limits: { maxBytes: 4096, maxStringLength: 65_536 },
  });
  expect(report.reference).toBe(foreign.id);
  expect(report.truncation).toMatchObject({ diagnosticsOmitted: true });
});

test.each(['_tag', 'details'])(
  'unreadable local %s preserves the occurrence without stack inspection',
  (key) => {
    const Failure = defineException({ tag: 'Local', message: 'failed' });
    const error = new Failure();
    let calls = 0;
    Object.defineProperty(error, key, {
      get() {
        calls++;
        throw Error('unreadable');
      },
    });
    Object.defineProperty(error, 'stack', {
      get() {
        calls++;
        throw Error('stack');
      },
    });
    const report = roundTrip(error);
    expect(report.reference).toBe(error.id);
    expect(report.timestamp).toBe(error.timestamp);
    if (key === 'details')
      expect(report.details).toEqual({
        $appex: 'unreadable',
        reason: 'accessor',
      });
    expect(calls).toBe(0);
  },
);

test('entry truncation markers consume the shared slot budget before later branches', () => {
  let secondReads = 0;
  const input = new Proxy(
    { first: [1, 2, 3], second: { hidden: true } },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'second') secondReads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  const report = roundTrip(input, { limits: { maxEntries: 2, maxValues: 5 } });
  expect(secondReads).toBe(0);
  expect(report.thrown).toEqual({
    first: [1, 2, { $appex: 'truncated', reason: 'entries', omitted: 1 }],
    '$appex:truncated': { $appex: 'truncated', reason: 'values' },
  });
});

test('native stack opt-in does not invoke custom name/message accessors during formatting', () => {
  for (const key of ['name', 'message']) {
    let calls = 0;
    const error = new Error('native');
    Object.defineProperty(error, key, {
      get() {
        calls++;
        return 'private';
      },
    });
    const report = roundTrip(error, { includeStack: true });
    expect(calls).toBe(0);
    expect(report.stack).toEqual({ $appex: 'unreadable', reason: 'accessor' });
  }
});

test('native stack opt-in does not coerce object-valued error metadata', () => {
  let calls = 0;
  const error = new Error('native');
  Object.defineProperty(error, 'name', {
    value: {
      toString() {
        calls++;
        return 'private';
      },
    },
  });
  const report = roundTrip(error, { includeStack: true });
  expect(calls).toBe(0);
  expect(report.stack).toEqual({
    $appex: 'unreadable',
    reason: 'stack-metadata',
  });
});

test('public machine codes reject empty or oversized identifiers without merging prefixes', () => {
  for (const code of ['', `${'c'.repeat(128)}A`, `${'c'.repeat(128)}B`]) {
    expect(() => toPublicReport('reference', { code })).toThrow(TypeError);
  }
  const code = 'c'.repeat(128);
  const report = toPublicReport('reference', {
    code,
    message: '\u0000'.repeat(4096),
    details: Array(50).fill('\u0000'.repeat(4096)),
  });
  expect(report.code).toBe(code);
  expect(report.truncation).toMatchObject({ detailsOmitted: true });
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(65_536);
});

test('decoder caps repeated non-enumerable descriptor inspection across branches', () => {
  let reads = 0;
  const value = Object.defineProperties(
    {},
    Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [
        `k${i}`,
        { value: i, configurable: true },
      ]),
    ),
  );
  const observed = new Proxy(value, {
    getOwnPropertyDescriptor(target, key) {
      reads++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const decoded = decodeDiagnosticReport({
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: 'ref',
    name: '',
    message: '',
    details: Array(101).fill(observed),
  });
  expect(reads).toBeLessThanOrEqual(100_000);
  expect(decoded.success).toBe(false);
});

test('oversized positive and negative bigints skip decimal conversion in all report paths', () => {
  const huge = BigInt(`1${'0'.repeat(100_000)}`);
  const negative = -huge;
  const nativeString = String;
  let conversions = 0;
  const stringSpy = jest
    .spyOn(globalThis, 'String')
    .mockImplementation((value) => {
      if (value === huge || value === negative) conversions++;
      return nativeString(value);
    });
  try {
    for (const value of [huge, negative]) {
      for (const limits of [
        undefined,
        { maxValues: 0, maxStringLength: 0, maxBytes: 4096 },
        {
          maxDepth: 32,
          maxValues: 10_000,
          maxEntries: 1000,
          maxStringLength: 65_536,
          maxBytes: 1_048_576,
        },
      ]) {
        const options = limits ? { limits } : {};
        const top = roundTrip(value, options);
        const nested = roundTrip({ value }, options);
        if (limits?.maxValues !== 0) {
          expect(top.thrown).toEqual({
            $appex: 'truncated',
            reason: 'bigint-magnitude',
          });
          expect(nested.thrown).toEqual({
            value: { $appex: 'truncated', reason: 'bigint-magnitude' },
          });
        }
      }
      const publicReport = toPublicReport('ref', { details: { value } });
      expect(publicReport.details).toEqual({
        value: { $appex: 'truncated', reason: 'bigint-magnitude' },
      });
      expect(
        Buffer.byteLength(JSON.stringify(publicReport)),
      ).toBeLessThanOrEqual(65_536);
    }
    expect(conversions).toBe(0);
  } finally {
    stringSpy.mockRestore();
  }
});

test('zero string/value and exhausted byte budgets skip even small bigint conversion', () => {
  const value = 123456789n;
  const nativeString = String;
  let conversions = 0;
  const stringSpy = jest
    .spyOn(globalThis, 'String')
    .mockImplementation((input) => {
      if (input === value) conversions++;
      return nativeString(input);
    });
  try {
    roundTrip(value, { limits: { maxValues: 0 } });
    roundTrip(value, { limits: { maxStringLength: 0 } });
    roundTrip({ value }, { limits: { maxStringLength: 0 } });
    roundTrip(['x'.repeat(65_536), value], {
      limits: { maxStringLength: 65_536, maxBytes: 4096 },
    });
    expect(conversions).toBe(0);
  } finally {
    stringSpy.mockRestore();
  }
});

test('bounded bigint conversion preserves signs and the exact 4096-digit threshold', () => {
  const bounded = BigInt('9'.repeat(4096));
  const oversized = BigInt(`1${'0'.repeat(4096)}`);
  expect(roundTrip(12n).thrown).toEqual({ $appex: 'bigint', value: '12' });
  expect(roundTrip(-12n).message).toBe('-12');
  expect(toPublicReport('ref', { details: -12n }).details).toEqual({
    $appex: 'bigint',
    value: '-12',
  });
  for (const value of [bounded, -bounded]) {
    const report = roundTrip(value, { limits: { maxStringLength: 65_536 } });
    expect(report.thrown).toEqual({ $appex: 'bigint', value: String(value) });
  }
  for (const value of [oversized, -oversized]) {
    expect(roundTrip(value).thrown).toEqual({
      $appex: 'truncated',
      reason: 'bigint-magnitude',
    });
  }
});

test('decoder rechecks descriptor credit after a recursive child before primitive siblings', () => {
  let reads = 0;
  const observe = (value: object) =>
    new Proxy(value, {
      getOwnPropertyDescriptor(target, key) {
        reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  const child = observe(
    Object.defineProperties(
      {},
      Object.fromEntries(
        Array.from({ length: 99_990 }, (_, i) => [
          `hidden${i}`,
          { value: 0, configurable: true },
        ]),
      ),
    ),
  );
  const details = observe({
    child,
    ...Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`sibling${i}`, i]),
    ),
  });
  const report = observe({
    v: DIAGNOSTIC_REPORT_VERSION,
    reference: 'ref',
    name: '',
    message: '',
    details,
  });
  const decoded = decodeDiagnosticReport(report);
  expect(reads).toBeLessThanOrEqual(100_000);
  expect(decoded).toMatchObject({
    success: false,
    error: {
      code: 'INVALID_REPORT',
      message: 'Report exceeds decode inspection limit',
    },
  });
});

test('public code defaults only for omitted or undefined values and rejects explicit null', () => {
  expect(toPublicReport('ref').code).toBe('INTERNAL_ERROR');
  expect(
    toPublicReport('ref', { code: undefined } as unknown as { code: string })
      .code,
  ).toBe('INTERNAL_ERROR');
  for (const code of [null, false, 0, {}, []]) {
    expect(() =>
      toPublicReport('ref', { code } as unknown as { code: string }),
    ).toThrow(TypeError);
  }
});
