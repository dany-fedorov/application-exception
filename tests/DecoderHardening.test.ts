import { decodePublicReport } from '../src/reporting';

const base = {
  v: 'appex/public/v4',
  occurrence_id: 'AE_1',
  code: 'OK',
  message: '',
};
const decode = (as_json: unknown) => decodePublicReport({ ...base, as_json });

describe('decoder hardening', () => {
  test('detaches arrays without consulting map, constructor, or species', () => {
    const input = [{ nested: { value: 1 } }];
    Object.defineProperty(input, 'map', { value: () => input });
    const decoded = decode(input);
    expect(decoded).toEqual({
      ok: true,
      report: { ...base, as_json: [{ nested: { value: 1 } }] },
    });
    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.report.as_json).not.toBe(input);
    input[0]!.nested.value = 2;
    expect(decoded.report.as_json).toEqual([{ nested: { value: 1 } }]);
    for (const property of ['map', 'constructor']) {
      const hooked = [1];
      Object.defineProperty(hooked, property, {
        get() {
          throw new Error('hook invoked');
        },
      });
      expect(decode(hooked).ok).toBe(true);
    }
    class HostileArray extends Array<number> {
      static get [Symbol.species](): ArrayConstructor {
        throw new Error('species invoked');
      }
    }
    expect(decode(new HostileArray(1, 2)).ok).toBe(true);
  });

  test('rejects sparse arrays and preflights huge arrays before reading elements', () => {
    expect(decode(new Array(1)).ok).toBe(false);
    const huge = new Array(2 ** 32 - 1);
    Object.defineProperty(huge, 0, {
      get() {
        throw new Error('element read');
      },
    });
    expect(decode(huge)).toMatchObject({
      ok: false,
      reason: 'as_json exceeds 10,000 values',
    });
    const inherited = new Array(1);
    Object.setPrototypeOf(inherited, { 0: 1 });
    expect(decode(inherited).ok).toBe(false);
  });

  test.each([NaN, -1, 0.5, '1', undefined, null, Infinity])(
    'rejects invalid proxy array length %s without poisoning the byte budget',
    (length) => {
      const input = new Proxy([], {
        get(target, key, receiver) {
          return key === 'length' ? length : Reflect.get(target, key, receiver);
        },
      });
      expect(decode(input)).toMatchObject({
        ok: false,
        reason: 'Expected a nonnegative integer array length',
      });
    },
  );

  test('reads top-level fields and array elements once', () => {
    const input: Record<string, unknown> = {};
    const counts: Record<string, number> = {};
    const values = {
      ...base,
      as_json: [1],
      truncated: true,
      fingerprint: 'fp1_x',
    };
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(input, key, {
        enumerable: true,
        get() {
          counts[key] = (counts[key] ?? 0) + 1;
          if (counts[key]! > 1) throw new Error('read twice');
          return value;
        },
      });
    }
    Object.defineProperty(values.as_json, 0, {
      get() {
        counts['element'] = (counts['element'] ?? 0) + 1;
        if (counts['element']! > 1) throw new Error('element read twice');
        return { nested: 1 };
      },
    });
    expect(decodePublicReport(input).ok).toBe(true);
    expect(Object.values(counts).every((count) => count === 1)).toBe(true);
    let lengthReads = 0;
    const array = new Proxy([1], {
      get(target, key, receiver) {
        if (key === 'length') lengthReads++;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(decode(array).ok).toBe(true);
    expect(lengthReads).toBe(1);
  });

  test('counts text bounds in Unicode code points', () => {
    expect(
      decodePublicReport({
        ...base,
        message: '😀'.repeat(4096),
        code: '😀'.repeat(128),
      }).ok,
    ).toBe(true);
    expect(decodePublicReport({ ...base, message: '😀'.repeat(4097) }).ok).toBe(
      false,
    );
    expect(decodePublicReport({ ...base, code: '😀'.repeat(129) }).ok).toBe(
      false,
    );
    expect(
      decodePublicReport({
        ...base,
        v: 'appex/public/v3',
        occurrence_id: '😀'.repeat(128),
      }).ok,
    ).toBe(true);
    expect(
      decodePublicReport({
        ...base,
        v: 'appex/public/v3',
        occurrence_id: '😀'.repeat(129),
      }).ok,
    ).toBe(false);
  });

  test.each([
    ['x'.repeat(16382), true],
    ['x'.repeat(16383), false],
    ['é'.repeat(8191), true],
    ['é'.repeat(8192), false],
    ['😀'.repeat(4095) + 'xx', true],
    ['😀'.repeat(4096), false],
    ['\n'.repeat(8191), true],
    ['\n'.repeat(8192), false],
    ['\u0000'.repeat(2730) + 'xx', true],
    ['\u0000'.repeat(2731), false],
    ['\ud800'.repeat(2730) + 'xx', true],
    ['\ud800'.repeat(2731), false],
    [{ ['x'.repeat(16378)]: 1 }, true],
    [{ ['x'.repeat(16379)]: 1 }, false],
    [{ ['é'.repeat(8189)]: 1 }, true],
    [{ ['é'.repeat(8190)]: 1 }, false],
    [{ ['\n'.repeat(8189)]: 1 }, true],
    [{ ['\n'.repeat(8190)]: 1 }, false],
    [['x'.repeat(8188), 'x'.repeat(8189)], true],
    [['x'.repeat(8189), 'x'.repeat(8189)], false],
  ])('enforces exact compact JSON bytes (case %#)', (value, accepted) => {
    expect(Buffer.byteLength(JSON.stringify(value)) <= 16384).toBe(accepted);
    expect(decode(value).ok).toBe(accepted);
  });

  test('counts scalar and container punctuation cumulatively without toJSON', () => {
    expect(decode([null, true, false, -1.25, {}, []]).ok).toBe(true);
    const input = {
      toJSON() {
        throw new Error('toJSON invoked');
      },
    };
    expect(decode(input)).toMatchObject({
      ok: false,
      reason: 'Expected a JSON value',
    });
    const nonenumerable = { a: 1 };
    Object.defineProperty(nonenumerable, 'toJSON', {
      value: () => {
        throw new Error('toJSON invoked');
      },
    });
    expect(decode(nonenumerable).ok).toBe(true);
    expect(decode(Array.from({ length: 8192 }, () => 0)).ok).toBe(false);
  });

  test('enforces depth and value count including nested container values', () => {
    let deep: unknown = 1;
    for (let index = 0; index < 32; index++) deep = [deep];
    expect(decode(deep).ok).toBe(true);
    expect(decode([deep])).toMatchObject({
      ok: false,
      reason: 'as_json exceeds depth 32',
    });
    expect(decode(new Array(10000).fill(0))).toMatchObject({
      ok: false,
      reason: 'as_json exceeds 10,000 values',
    });
    expect(
      decode(
        Object.fromEntries(
          Array.from({ length: 10000 }, (_, index) => [index, 0]),
        ),
      ),
    ).toMatchObject({ ok: false, reason: 'as_json exceeds 10,000 values' });
    expect(
      decode([new Array(4999).fill(0), new Array(4999).fill(0)]),
    ).toMatchObject({ ok: false, reason: 'as_json exceeds 10,000 values' });
  });

  test.each(['a\nb', 'a"b', 'a\\b', '\u0000', 'a.b[c]', '😀'.repeat(33)])(
    'quotes dynamic key %j as a complete bounded segment',
    (key) => {
      const result = decode({ [key]: undefined });
      const prefix = key.startsWith('😀') ? '😀'.repeat(32) : key;
      expect(result).toMatchObject({
        ok: false,
        path: `$.as_json[${JSON.stringify(prefix)}]`,
      });
      expect(decodePublicReport({ ...base, [key]: 1 })).toMatchObject({
        ok: false,
        path: `$[${JSON.stringify(prefix)}]`,
      });
    },
  );

  test('omits oversized escaped segments completely and keeps the ellipsis', () => {
    expect(
      decode({ ['\u0000'.repeat(64)]: { child: undefined } }),
    ).toMatchObject({ ok: false, path: '$.as_json…' });
    const key = 'a'.repeat(63) + '😀';
    expect(decode({ [key]: undefined })).toMatchObject({
      ok: false,
      path: '$.as_json["' + 'a'.repeat(63) + '"]',
    });
  });

  test('checks oversized keys before reading their value or later getters', () => {
    const input = {};
    Object.defineProperty(input, 'x'.repeat(20000), {
      enumerable: true,
      get() {
        throw new Error('oversized key read');
      },
    });
    Object.defineProperty(input, 'later', {
      enumerable: true,
      get() {
        throw new Error('later value read');
      },
    });
    expect(decode(input)).toMatchObject({
      ok: false,
      reason: 'as_json exceeds 16,384 UTF-8 bytes',
    });
  });

  test('ends long paths at a complete segment with an ellipsis', () => {
    const key = 'k'.repeat(64);
    const nested = { [key]: { [key]: { [key]: { [key]: undefined } } } };
    expect(decode(nested)).toMatchObject({
      ok: false,
      path: '$.as_json' + `["${key}"]`.repeat(3) + '…',
    });
    let deep: unknown = undefined;
    for (let index = 0; index < 32; index++) deep = [deep];
    const result = decode({ [key]: { [key]: deep } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.path.length).toBeLessThanOrEqual(256);
    expect(result.path).toMatch(/(?:\]|…)$/u);
  });
});
