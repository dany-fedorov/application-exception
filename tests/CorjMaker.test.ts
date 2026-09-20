import { diagnosticMakerFor, publicMakerFor } from '../src/corj-maker';
import { makeRedactionPolicy } from '../src/redaction';

describe('CORJ maker adapters', () => {
  test('snapshots each caller bag without freezing or caching it', () => {
    const bag = { maxDepth: 2 };
    const first = diagnosticMakerFor(bag, undefined, undefined);
    bag.maxDepth = 1;
    const second = diagnosticMakerFor(bag, undefined, undefined);

    expect(first).not.toBe(second);
    expect(first.options.maxDepth).toBe(2);
    expect(second.options.maxDepth).toBe(1);
    expect(Object.isFrozen(bag)).toBe(false);
  });

  test('forces UTF-8, the diagnostic limit, metadata v, and silent reporting', () => {
    const maker = diagnosticMakerFor(
      { metadata: { $schema: true }, inspection: 'no-invoke' },
      undefined,
      512,
    );
    expect(maker.options).toMatchObject({
      reportSizeUnit: 'utf8-bytes',
      maxReportSize: 512,
      metadata: { v: true, $schema: true },
      inspection: 'no-invoke',
    });

    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const hostile = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    maker.makeReport(hostile);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    expect(
      diagnosticMakerFor({ metadata: false }, undefined, undefined).options
        .metadata,
    ).toEqual({ v: true, $schema: false });
  });

  test('uses a custom reporting handler and compiled redaction policy', () => {
    const seen: unknown[] = [];
    const maker = diagnosticMakerFor(
      {
        onReportingError: (_failure, record) => seen.push(record),
      },
      makeRedactionPolicy({ keys: ['secret'] }),
      null,
    );
    const hostile = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const report = maker.makeReport(hostile);
    expect(seen).toEqual(report.reporting_errors);
    expect(maker.options.maxReportSize).toBeNull();
    expect(maker.makeJsonView({ secret: 'x' }).value).toEqual({
      secret: '[redacted]',
    });
  });

  test('public makers accept exactly the six effective CORJ keys', () => {
    const maker = publicMakerFor(
      {
        inspection: 'no-invoke',
        maxDepth: 1,
        maxChildren: 2,
        childrenSources: ['inner'],
        fingerprintParts: null,
        onReportingError: () => undefined,
      },
      undefined,
    );
    expect(maker.options).toMatchObject({
      inspection: 'no-invoke',
      maxDepth: 1,
      maxChildren: 2,
      childrenSources: ['inner'],
      fingerprintParts: null,
      reportSizeUnit: 'utf8-bytes',
    });
    expect(() =>
      publicMakerFor({ stackFormat: 'string' } as never, undefined),
    ).toThrow(/APPEX_INVALID_OPTIONS: unknown corj option "stackFormat"/);
  });

  test.each([5, null, [], 'x'])('rejects a CORJ slot of %p', (corj) => {
    expect(() => diagnosticMakerFor(corj, undefined, undefined)).toThrow(
      /APPEX_INVALID_OPTIONS: corj must be an object/,
    );
  });

  test('rejects unsupported keys and unminted policies', () => {
    for (const key of ['redact', 'maxReportSize', 'reportSizeUnit']) {
      expect(() =>
        diagnosticMakerFor({ [key]: 1 } as never, undefined, undefined),
      ).toThrow(/APPEX_INVALID_OPTIONS: unknown corj option/);
    }
    expect(() => diagnosticMakerFor({}, { keys: ['a'] }, undefined)).toThrow(
      /APPEX_INVALID_REDACTION_POLICY/,
    );
    expect(() =>
      diagnosticMakerFor({ maxDepth: -1 }, undefined, undefined),
    ).toThrow(RangeError);
    expect(() =>
      diagnosticMakerFor(
        { onReportingError: 5 } as never,
        undefined,
        undefined,
      ),
    ).toThrow(TypeError);
    for (const metadata of [null, 42, 'x']) {
      expect(() =>
        diagnosticMakerFor({ metadata } as never, undefined, undefined),
      ).toThrow(TypeError);
    }
    expect(() =>
      diagnosticMakerFor(
        { onReportingError: null } as never,
        undefined,
        undefined,
      ),
    ).toThrow(TypeError);
    expect(() =>
      publicMakerFor({ onReportingError: null } as never, undefined),
    ).toThrow(TypeError);
  });

  test.each(['redact', 'maxReportSize', 'reportSizeUnit', 'onError'])(
    'rejects a hidden or inherited legacy %s without reading it',
    (key) => {
      let reads = 0;
      const inherited = Object.create(
        Object.defineProperty({}, key, {
          get() {
            reads++;
            return true;
          },
        }),
      );
      const hidden = Object.defineProperty({}, key, {
        get() {
          reads++;
          return true;
        },
      });
      for (const bag of [inherited, hidden]) {
        expect(() => diagnosticMakerFor(bag, undefined, undefined)).toThrow(
          /APPEX_INVALID_OPTIONS: unknown corj option/,
        );
        expect(() => publicMakerFor(bag, undefined)).toThrow(
          /APPEX_INVALID_OPTIONS: unknown corj option/,
        );
      }
      expect(reads).toBe(0);
    },
  );
});
