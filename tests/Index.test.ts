import * as api from '../src';

test('exposes exactly the documented runtime surface', () => {
  const surface = Object.keys(api).sort();
  expect(surface).toEqual([
    'APPEX_ERROR_CODES',
    'DIAGNOSTIC_REPORT_VERSION',
    'PUBLIC_REPORT_VERSION',
    'decodePublicReport',
    'defineException',
    'isTypedException',
    'restoreExpectedValues',
    'toDiagnosticReport',
    'toPublicReport',
  ]);
  for (const key of surface) {
    expect((api as Record<string, unknown>)[key]).toBeDefined();
  }
});
