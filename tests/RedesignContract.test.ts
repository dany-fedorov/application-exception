import * as api from '../src';
import {
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from '../src/reporting';
import { makeRedactionPolicy } from '../src/redaction';
import { makeTrustRealm } from '../src/typed';

const code = (value: string) => expect.objectContaining({ code: value });

describe('descriptive API contract', () => {
  test('exports only the descriptive runtime names', () => {
    expect(api).toMatchObject({
      makeDiagnosticReport,
      makePublicReport,
      makeReportPair,
      makeRedactionPolicy,
      makeTrustRealm,
    });
    for (const legacy of [
      'toDiagnosticReport',
      'toPublicReport',
      'toReports',
      'createRedactionPolicy',
      'createTrustRealm',
    ]) {
      expect(api).not.toHaveProperty(legacy);
    }
  });

  test('caller CORJ options remain mutable and nested changes affect later calls', () => {
    const corj = { childrenSources: ['cause'] };
    const value = { inner: new Error('nested') };
    makeDiagnosticReport(value, { corj });
    corj.childrenSources.push('inner');
    expect(Object.isFrozen(corj)).toBe(false);
    expect(makeDiagnosticReport(value, { corj }).children).toHaveLength(1);
  });

  test('public total budgets measure compact UTF-8 JSON and drop details first', () => {
    const report = makePublicReport('x', {
      maxReportBytes: 2_048,
      policyOverride: {
        code: 'TEST',
        message: '€'.repeat(4_096),
        detailsSelector: () => ({ text: 'x'.repeat(16_000) }),
      },
    });
    expect(
      Buffer.byteLength(JSON.stringify(report), 'utf8'),
    ).toBeLessThanOrEqual(2_048);
    expect(report.as_json).toBeUndefined();
    expect(report.truncated).toBe(true);
    expect(report.message).not.toContain('\ud800');
  });

  test('public total budgets preserve reports that fit and omit details whole when enough', () => {
    const small = makePublicReport('x', {
      maxReportBytes: 2_048,
      policyOverride: { code: 'TEST', message: 'small' },
    });
    expect(small.truncated).toBeUndefined();

    const withDetails = makePublicReport('x', {
      maxReportBytes: 2_048,
      policyOverride: {
        code: 'TEST',
        message: 'small',
        detailsSelector: () => ({ text: 'x'.repeat(2_000) }),
      },
    });
    expect(withDetails).toMatchObject({ message: 'small', truncated: true });
    expect(withDetails.as_json).toBeUndefined();
  });

  test.each([
    ['x' + '😀'.repeat(2_100), false],
    ['😀'.repeat(2_100), false],
    ['x'.repeat(4_095) + '\ud800x', true],
    ['x'.repeat(4_095) + '\ud800\ud800x', true],
  ])(
    'component message trimming respects surrogate boundaries',
    (message, endsHigh) => {
      const report = makePublicReport('x', {
        policyOverride: { code: 'TEST', message },
      });
      expect(report.message.length).toBeLessThanOrEqual(4_096);
      expect(/[\ud800-\udbff]$/.test(report.message)).toBe(endsHigh);
    },
  );

  test('validates public byte budgets and lets null disable only the total cap', () => {
    for (const maxReportBytes of [0, 2_047, 2_048.5, Number.NaN, '2048']) {
      expect(() => makePublicReport('x', { maxReportBytes } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    const report = makePublicReport('x', {
      maxReportBytes: null,
      policyOverride: { code: 'TEST', message: 'x'.repeat(5_000) },
    });
    expect(report.message).toHaveLength(4_096);
    expect(report.truncated).toBe(true);
  });

  test('the largest fixed public envelope remains below the 2,048-byte floor', () => {
    const worstCase = {
      v: 'appex/public/v4',
      occurrence_id: '"\\'.repeat(64),
      fingerprint: '"\\'.repeat(32),
      code: '\ud800'.repeat(128),
      message: '',
      truncated: true,
    };
    expect(Buffer.byteLength(JSON.stringify(worstCase), 'utf8')).toBe(1_251);
  });

  test('rejects legacy and unknown policy keys', () => {
    expect(() =>
      makePublicReport('x', {
        policyOverride: { details: () => ({}) } as never,
      }),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
    expect(() =>
      makePublicReport('x', {
        policyOverride: { nope: true } as never,
      }),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
    expect(() =>
      makePublicReport('x', { public: { code: 'OLD' } } as never),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
  });

  test('rejects moved CORJ size options in both report bags', () => {
    for (const corj of [
      { maxReportSize: 2_048 },
      { reportSizeUnit: 'utf16-code-units' },
    ]) {
      expect(() => makeDiagnosticReport('x', { corj } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
      expect(() => makePublicReport('x', { corj } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
  });

  test('validates both pair bags before rendering either report', () => {
    let selected = 0;
    expect(() =>
      makeReportPair('x', {
        public: {
          policyOverride: {
            code: 'X',
            detailsSelector: () => {
              selected++;
              return {};
            },
          },
          corj: { maxDepth: -1 },
        },
      }),
    ).toThrow(RangeError);
    expect(selected).toBe(0);
  });
});
