import { createRedactionPolicy } from '../src/index';
import { makerFor } from '../src/corj-maker';

describe('makerFor', () => {
  test('one maker per bag identity and policy', () => {
    const bag = { maxDepth: 2 };
    const policy = createRedactionPolicy({ keys: ['password'] });
    expect(makerFor(bag, policy)).toBe(makerFor(bag, policy));
    expect(makerFor(bag, undefined)).toBe(makerFor(bag, undefined));
    expect(makerFor(bag, policy)).not.toBe(makerFor(bag, undefined));
    expect(makerFor({ maxDepth: 2 }, policy)).not.toBe(makerFor(bag, policy));
    expect(makerFor(undefined, undefined)).toBe(makerFor(undefined, undefined));
  });

  test('the bag is frozen on first sight, so a later mutation fails loudly', () => {
    const bag: { maxDepth: number } = { maxDepth: 2 };
    makerFor(bag, undefined);
    expect(Object.isFrozen(bag)).toBe(true);
    // Test files are modules, so this assignment runs in strict mode and throws.
    expect(() => {
      bag.maxDepth = 9;
    }).toThrow(TypeError);
  });

  test('corj options pass through, inspection included', () => {
    const maker = makerFor({ inspection: 'no-invoke', maxDepth: 1 }, undefined);
    expect(maker.options.inspection).toBe('no-invoke');
    expect(maker.options.maxDepth).toBe(1);
  });

  test('v is forced on; $schema follows the caller', () => {
    expect(makerFor({ metadata: false }, undefined).options.metadata).toEqual({
      v: true,
      $schema: false,
    });
    expect(makerFor({ metadata: true }, undefined).options.metadata).toEqual({
      v: true,
      $schema: true,
    });
    expect(
      makerFor({ metadata: { v: false, $schema: true } }, undefined).options
        .metadata,
    ).toEqual({
      v: true,
      $schema: true,
    });
    expect(makerFor({}, undefined).options.metadata).toEqual({
      v: true,
      $schema: false,
    });
  });

  test('errors are silent by default and the caller can take them', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      const hostile = new Error('x');
      Object.defineProperty(hostile, 'message', {
        get() {
          throw new Error('boom');
        },
      });
      makerFor({}, undefined).makeReportObject(hostile);
      // A bag built as `{ onError: config.onError }` with an absent field still
      // spreads the key: corj would read it as "no handler" and print.
      makerFor({ onError: undefined }, undefined).makeReportObject(hostile);
      expect(warn).not.toHaveBeenCalled();
      const seen: unknown[] = [];
      makerFor(
        { onError: (_c: unknown, record: unknown) => seen.push(record) },
        undefined,
      ).makeReportObject(hostile);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  test('corj.redact is rejected and names the top-level option', () => {
    expect(() => makerFor({ redact: { keys: ['a'] } }, undefined)).toThrow(
      /APPEX_INVALID_OPTIONS: corj\.redact is not accepted; pass the policy as the top-level redact option/,
    );
  });

  test.each([[5], [null], [[]], ['x']])(
    'a corj slot of %p is rejected',
    (corj) => {
      expect(() => makerFor(corj, undefined)).toThrow(
        /APPEX_INVALID_OPTIONS: corj must be an object/,
      );
    },
  );

  test('a redact that createRedactionPolicy did not mint is rejected', () => {
    expect(() => makerFor({}, { keys: ['a'] })).toThrow(
      /APPEX_INVALID_REDACTION_POLICY/,
    );
  });

  test('corj option errors propagate unwrapped', () => {
    expect(() => makerFor({ maxReportSize: 100 }, undefined)).toThrow(
      RangeError,
    );
    expect(() => makerFor({ nope: 1 } as never, undefined)).toThrow(TypeError);
    expect(() => makerFor({ onError: 5 } as never, undefined)).toThrow(
      TypeError,
    );
    // Forcing `v` on must not launder a metadata value corj rejects.
    expect(() => makerFor({ metadata: 'yes' } as never, undefined)).toThrow(
      TypeError,
    );
    expect(() => makerFor({ metadata: null } as never, undefined)).toThrow(
      TypeError,
    );
  });
});
