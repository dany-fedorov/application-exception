import { defineException } from '../src/typed';
import { toPublicReport } from '../src/reporting';

const code = (value: string) => expect.objectContaining({ code: value });

const Probe = defineException({
  tag: 'Probe',
  message: ({ detail }: { detail: { text: string } }) => detail.text,
  snapshotDetails: true,
  public: { code: 'PROBE', details: ({ detail }) => ({ text: detail.text }) },
});

const Shallow = defineException({
  tag: 'Shallow',
  message: ({ detail }: { detail: { text: string } }) => detail.text,
});

const snapshot = <Value>(value: Value) => {
  const Kind = defineException({
    tag: 'Snapshot',
    message: (_: { value: Value }) => 'snapshot',
    snapshotDetails: true,
  });
  return new Kind({ details: { value } }).details.value;
};

const rejects = (value: unknown) => {
  const Kind = defineException({
    tag: 'Snapshot',
    message: (_: { value: unknown }) => 'snapshot',
    snapshotDetails: true,
  });
  return expect(() => new Kind({ details: { value } }));
};

describe('snapshotDetails', () => {
  test('detaches nested details from later mutation of the original', () => {
    const detail = { text: 'first' };
    const failure = new Probe({ details: { detail } });

    detail.text = 'changed';

    expect(failure.details.detail.text).toBe('first');
    expect(detail.text).toBe('changed');
  });

  test('the message and the public selector read the same captured details', () => {
    const detail = { text: 'first' };
    const failure = new Probe({ details: { detail } });

    detail.text = 'changed';

    expect(failure.message).toBe('first');
    expect(toPublicReport(failure).as_json).toEqual({ text: 'first' });
  });

  test('never freezes the caller record or its nested objects', () => {
    const detail = { text: 'first' };
    const details = { detail };
    new Probe({ details });

    expect(Object.isFrozen(details)).toBe(false);
    expect(Object.isFrozen(detail)).toBe(false);
  });

  test('freezes the captured copy at every level', () => {
    const failure = new Probe({ details: { detail: { text: 'first' } } });

    expect(Object.isFrozen(failure.details)).toBe(true);
    expect(Object.isFrozen(failure.details.detail)).toBe(true);
  });

  test('leaves the shallow default available and unchanged', () => {
    const detail = { text: 'first' };
    const failure = new Shallow({ details: { detail } });

    detail.text = 'changed';

    expect(failure.details.detail.text).toBe('changed');
    expect(failure.details.detail).toBe(detail);
  });

  describe('accepted content', () => {
    test('captures primitives by value', () => {
      expect(snapshot('text')).toBe('text');
      expect(snapshot(7)).toBe(7);
      expect(snapshot(true)).toBe(true);
      expect(snapshot(null)).toBeNull();
      expect(snapshot(undefined)).toBeUndefined();
      expect(snapshot(10n)).toBe(10n);
      const mark = Symbol('mark');
      expect(snapshot(mark)).toBe(mark);
    });

    test('copies a Date rather than sharing it', () => {
      const date = new Date('2020-01-01T00:00:00.000Z');
      const captured = snapshot(date) as Date;

      date.setFullYear(1999);

      expect(captured).toBeInstanceOf(Date);
      expect(captured).not.toBe(date);
      expect(captured.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    });

    test('rebuilds arrays and nested plain objects', () => {
      const source = [{ a: 1 }, [2, 3]];
      const captured = snapshot(source) as [{ a: number }, number[]];

      expect(captured).toEqual(source);
      expect(captured[0]).not.toBe(source[0]);
      expect(Object.isFrozen(captured)).toBe(true);
      expect(Object.isFrozen(captured[0])).toBe(true);
    });

    test('accepts a null-prototype record', () => {
      const source = Object.assign(Object.create(null) as object, { a: 1 });

      expect(snapshot(source)).toEqual({ a: 1 });
    });

    test('duplicates a shared reference that is not a cycle', () => {
      const shared = { a: 1 };
      const captured = snapshot({ left: shared, right: shared }) as {
        left: object;
        right: object;
      };

      expect(captured.left).toEqual({ a: 1 });
      expect(captured.left).not.toBe(captured.right);
    });

    test('captures the deepest allowed nesting', () => {
      let value: unknown = 'leaf';
      for (let level = 0; level < 30; level++) value = { value };

      expect(snapshot(value)).toEqual(value);
    });
  });

  describe('rejected content', () => {
    test('rejects a cycle', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic['self'] = cyclic;

      rejects(cyclic).toThrow(code('APPEX_INVALID_DETAILS'));
      rejects(cyclic).toThrow(/is a cycle/);
    });

    test('rejects a nested function', () => {
      rejects({ run: () => 1 }).toThrow(/is a function/);
    });

    test('rejects a class instance and other exotic objects', () => {
      class Session {
        readonly token = 'secret';
      }

      rejects(new Session()).toThrow(/is not a plain object/);
      rejects(new Map()).toThrow(/is not a plain object/);
      rejects(/pattern/).toThrow(/is not a plain object/);
      rejects(new Error('boom')).toThrow(/is not a plain object/);
    });

    test('rejects an invalid Date', () => {
      rejects(new Date(Number.NaN)).toThrow(/is an invalid Date/);
    });

    test('rejects a nested accessor', () => {
      const withAccessor = Object.defineProperty({}, 'token', {
        get: () => 'secret',
        enumerable: true,
        configurable: true,
      });

      rejects(withAccessor).toThrow(/is an accessor/);
    });

    test('rejects a nested non-enumerable property', () => {
      const hidden = Object.defineProperty({}, 'token', {
        value: 'secret',
        enumerable: false,
        configurable: true,
      });

      rejects(hidden).toThrow(/is not enumerable/);
    });

    test('rejects an array carrying extra own properties', () => {
      const array: unknown[] = [1];
      (array as unknown as Record<string, unknown>)['extra'] = 'secret';

      rejects(array).toThrow(/is an array with extra own properties/);
    });

    test('rejects an object with more than 1,000 own keys', () => {
      const wide: Record<string, number> = {};
      for (let key = 0; key <= 1_000; key++) wide[`k${key}`] = key;

      rejects({ wide }).toThrow(/more than 1,000 own keys/);
    });

    test('rejects nesting deeper than 32 levels', () => {
      let value: unknown = 'leaf';
      for (let level = 0; level < 40; level++) value = { value };

      rejects(value).toThrow(/exceeds snapshot depth 32/);
    });

    test('rejects more than 10,000 captured values', () => {
      const wide: Record<string, unknown> = {};
      for (let key = 0; key < 20; key++)
        wide[`k${key}`] = Array.from({ length: 600 }, (_, index) => index);

      rejects(wide).toThrow(/exceed 10,000 snapshotted values/);
    });
  });

  test('rejects a non-boolean snapshotDetails at definition time', () => {
    expect(() =>
      defineException({
        tag: 'Bad',
        message: 'bad',
        snapshotDetails: 'yes' as unknown as boolean,
      }),
    ).toThrow(code('APPEX_INVALID_DETAILS'));
  });

  test('treats an explicit false as the shallow default', () => {
    const Kind = defineException({
      tag: 'Off',
      message: ({ detail }: { detail: { text: string } }) => detail.text,
      snapshotDetails: false,
    });
    const detail = { text: 'first' };
    const failure = new Kind({ details: { detail } });

    detail.text = 'changed';

    expect(failure.details.detail.text).toBe('changed');
  });
});
