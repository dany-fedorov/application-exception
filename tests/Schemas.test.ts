import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import {
  decodeDiagnosticReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src';

const loadSchema = (name: string): object =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'schemas', name), 'utf8'),
  ) as object;

describe('v2 report schemas', () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const diagnosticSchema = loadSchema('diagnostic-report-v2.json');
  const publicSchema = loadSchema('public-report-v2.json');
  const validateDiagnostic = ajv.compile(diagnosticSchema);
  const validatePublic = ajv.compile(publicSchema);

  test('accepts producer reports including non-BMP and marker-shaped data', () => {
    const diagnostic = toDiagnosticReport('failure 😀', {
      context: { glyph: '😀', applicationData: { $appex: 'custom-value' } },
    });
    const publicReport = toPublicReport(diagnostic.reference, {
      code: 'FAILURE',
      details: { glyph: '😀', applicationData: { $appex: 'custom-value' } },
    });

    expect(validateDiagnostic(diagnostic)).toBe(true);
    expect(validatePublic(publicReport)).toBe(true);
    expect(decodeDiagnosticReport(diagnostic)).toEqual({
      success: true,
      value: diagnostic,
    });
  });

  test.each([
    {
      v: 'appex/diagnostic/v1',
      reference: 'AE_old',
      name: 'Error',
      message: 'old',
    },
    {
      v: 'appex/diagnostic/v2',
      reference: 'AE_unknown',
      name: 'Error',
      message: 'failed',
      unknown: true,
    },
    {
      v: 'appex/diagnostic/v2',
      reference: 'AE_bad_truncation',
      name: 'Error',
      message: 'failed',
      truncation: { codeOmitted: 1 },
    },
    {
      v: 'appex/diagnostic/v2',
      reference: 'AE_empty_truncation',
      name: 'Error',
      message: 'failed',
      truncation: {},
    },
  ])('rejects malformed diagnostic envelope %#', (value) => {
    expect(validateDiagnostic(value)).toBe(false);
    expect(decodeDiagnosticReport(value).success).toBe(false);
  });

  test.each([
    {
      v: 'appex/public/v1',
      reference: 'AE_old',
      code: 'FAILURE',
      message: 'old',
    },
    {
      v: 'appex/public/v2',
      reference: 'AE_unknown',
      code: 'FAILURE',
      message: 'failed',
      unknown: true,
    },
    {
      v: 'appex/public/v2',
      reference: 'AE_bad_truncation',
      code: 'FAILURE',
      message: 'failed',
      truncation: { diagnosticsOmitted: true },
    },
    {
      v: 'appex/public/v2',
      reference: 'AE_empty_truncation',
      code: 'FAILURE',
      message: 'failed',
      truncation: {},
    },
  ])('rejects malformed public envelope %#', (value) => {
    expect(validatePublic(value)).toBe(false);
  });
});
