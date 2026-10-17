import {
  defineException,
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from '../src/index';
import { TYPED_EXCEPTION_BRAND } from '../src/typed-internals';

describe('foreign occurrence identity hardening', () => {
  test('memoizes a replacement for an unsafe foreign ID across standalone and paired reports', () => {
    const foreign = {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: '<img/src/onerror=alert(1)>',
    };
    const diagnostic = makeDiagnosticReport(foreign);
    const publicReport = makePublicReport(foreign);
    const pair = makeReportPair(foreign);
    expect(diagnostic.occurrence_id).toMatch(/^AE_[0-9A-Z]{26}$/);
    expect(publicReport.occurrence_id).toBe(diagnostic.occurrence_id);
    expect(pair.diagnostic.occurrence_id).toBe(diagnostic.occurrence_id);
    expect(pair.public.occurrence_id).toBe(diagnostic.occurrence_id);
  });

  test('preserves a local punctuation-rich custom prefix', () => {
    const Kind = defineException({
      tag: 'local/Punctuation',
      message: 'local',
      idPrefix: '<local/"',
    });
    const caught = new Kind();
    expect(makeDiagnosticReport(caught).occurrence_id).toBe(
      caught.occurrenceId,
    );
    expect(makePublicReport(caught).occurrence_id).toBe(caught.occurrenceId);
    expect(makeReportPair(caught).public.occurrence_id).toBe(
      caught.occurrenceId,
    );
  });

  test('preserves explicit printable ASCII overrides for foreign values', () => {
    const caught = {
      [TYPED_EXCEPTION_BRAND]: true,
      occurrenceId: 'AE_foreign',
    };
    const occurrenceId = '<trusted/"id">';
    expect(makeDiagnosticReport(caught, { occurrenceId }).occurrence_id).toBe(
      occurrenceId,
    );
    expect(makePublicReport(caught, { occurrenceId }).occurrence_id).toBe(
      occurrenceId,
    );
    const pair = makeReportPair(caught, { occurrenceId });
    expect(pair.diagnostic.occurrence_id).toBe(occurrenceId);
    expect(pair.public.occurrence_id).toBe(occurrenceId);
  });
});
