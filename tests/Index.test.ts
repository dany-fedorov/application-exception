import * as api from '../src';
import { Corj as dependencyCorj } from 'caught-object-report-json';

test('exposes exactly the documented runtime surface', () => {
  const surface = Object.keys(api).sort();
  expect(surface).toEqual([
    'APPEX_ERROR_CODES',
    'Corj',
    'DIAGNOSTIC_REPORT_VERSION',
    'PUBLIC_REPORT_VERSION',
    'decodePublicReport',
    'defineException',
    'isTrustedException',
    'isTypedException',
    'makeDiagnosticReport',
    'makePublicReport',
    'makeRedactionPolicy',
    'makeReportPair',
    'makeTrustRealm',
  ]);
  for (const key of surface) {
    expect((api as Record<string, unknown>)[key]).toBeDefined();
  }
});

test('re-exports the immutable dependency Corj namespace', () => {
  expect(api.Corj).toBe(dependencyCorj);
  expect(Object.isFrozen(api.Corj)).toBe(true);
  expect('restoreExpectedValues' in api).toBe(false);

  const restore = api.Corj.restoreExpectedValues;
  const report = api.makeDiagnosticReport(new Error('x'));
  expect(restore(report).v).toBe('corj/v0.15-full');
});
