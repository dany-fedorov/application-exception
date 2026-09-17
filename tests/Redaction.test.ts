import { createRedactionPolicy, defineException } from '../src/index';
import { toDiagnosticReport, toPublicReport, toReports } from '../src/reporting';
import { REDACTION_POLICY } from '../src/redaction';
import type { RedactionPolicy } from '../src/redaction';

const code = (value: string) => expect.objectContaining({ code: value });

const Rejected = defineException({
  tag: 'auth/Rejected',
  message: ({ user }: { user: string; password: string }) =>
    `Credentials rejected for ${user}`,
  public: {
    code: 'AUTH_REJECTED',
    message: 'Credentials were rejected.',
    details: ({ user, password }) => ({ user, password }),
  },
});

const secretPolicy = () =>
  createRedactionPolicy({
    keys: ['password', /token$/i],
    values: [/\bsk-[A-Za-z0-9]{8,}\b/],
  });

describe('createRedactionPolicy', () => {
  describe('diagnostic reports', () => {
    test('redacts secret-bearing details by key', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toDiagnosticReport(failure, { redact: secretPolicy() });

      expect(JSON.stringify(report)).not.toContain('hunter2');
      expect(report.as_json).toMatchObject({
        details: { user: 'ada', password: '[redacted]' },
      });
    });

    test('redacts a secret value inside the message and the stack', () => {
      // corj folds `constructor_name: message` into the first stack line, so
      // this is where a message-borne secret actually lives in the report.
      const caught = new Error('rejected key sk-abcdefghij');

      const report = toDiagnosticReport(caught, { redact: secretPolicy() });

      expect(report.stack?.[0]).toBe('Error: rejected key [redacted]');
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
    });

    test('redacts a message corj did emit as its own field', () => {
      const caught = { message: 'rejected key sk-abcdefghij' };

      const report = toDiagnosticReport(caught, { redact: secretPolicy() });

      expect(report.message).toBe('rejected key [redacted]');
    });

    test('reaches into nested causes', () => {
      const caught = new Error('outer', {
        cause: new Error('inner', { cause: { apiToken: 'secret-value' } }),
      });

      const report = toDiagnosticReport(caught, { redact: secretPolicy() });

      expect(JSON.stringify(report)).not.toContain('secret-value');
      expect(JSON.stringify(report)).toContain('[redacted]');
    });

    test('redacts the context', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        context: { runId: 'run-1', sessionToken: 'secret-value' },
        redact: secretPolicy(),
      });

      expect(report.context).toEqual({
        runId: 'run-1',
        sessionToken: '[redacted]',
      });
    });

    test('redacts reporting_errors', () => {
      const hostile = {
        get password(): never {
          throw new Error('sk-abcdefghij leaked');
        },
      };

      const report = toDiagnosticReport(hostile, { redact: secretPolicy() });

      expect(report.reporting_errors).toBeDefined();
      expect(JSON.stringify(report.reporting_errors)).not.toContain(
        'sk-abcdefghij',
      );
    });

    test('redacts an exact path', () => {
      const report = toDiagnosticReport(
        new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
        {
          redact: createRedactionPolicy({
            paths: ['$.as_json.details.user'],
          }),
        },
      );

      expect(report.as_json).toMatchObject({
        details: { user: '[redacted]', password: 'hunter2' },
      });
    });

    test('never rewrites identity or version fields', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({
          keys: [/.*/],
          values: [/.*/],
          replacement: 'X',
        }),
      });

      expect(report.v).toBe('corj/v0.12');
      expect(report.occurrence_id).toMatch(/^AE_/);
    });

    test('uses a custom replacement', () => {
      const report = toDiagnosticReport(
        new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
        { redact: createRedactionPolicy({ keys: ['password'], replacement: '***' }) },
      );

      expect(report.as_json).toMatchObject({ details: { password: '***' } });
    });
  });

  describe('public reports', () => {
    test('redacts a selected field the application meant to suppress', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toPublicReport(failure, { redact: secretPolicy() });

      expect(report.code).toBe('AUTH_REJECTED');
      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
    });

    test('does not authorize disclosure of a field the selector never chose', () => {
      const Quiet = defineException({
        tag: 'auth/Quiet',
        message: 'quiet',
        public: { code: 'QUIET' },
      });

      const report = toPublicReport(new Quiet(), { redact: secretPolicy() });

      expect(report.as_json).toBeUndefined();
    });

    test('leaves an unknown failure generic', () => {
      const report = toPublicReport(new Error('sk-abcdefghij'), {
        redact: secretPolicy(),
      });

      expect(report.code).toBe('INTERNAL_ERROR');
      expect(report.message).toBe('Something went wrong');
      expect(report.as_json).toBeUndefined();
    });

    test('never rewrites the code or the occurrence id', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toPublicReport(failure, {
        redact: createRedactionPolicy({ keys: [/.*/], values: [/.*/] }),
      });

      expect(report.code).toBe('AUTH_REJECTED');
      expect(report.occurrence_id).toBe(failure.occurrenceId);
      expect(report.v).toBe('appex/public/v3');
    });
  });

  describe('a throwing transform', () => {
    const throwing = createRedactionPolicy({
      transform: () => {
        throw new Error('policy exploded');
      },
    });

    test('drops the value and records the failure in the diagnostic report', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: throwing,
      });

      expect(JSON.stringify(report)).not.toContain('boom');
      expect(report.reporting_errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: 'other',
            error: expect.stringContaining('policy exploded'),
          }),
        ]),
      );
    });

    test('keeps the public report safe and observable', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toPublicReport(failure, { redact: throwing });

      expect(JSON.stringify(report)).not.toContain('hunter2');
      expect(report.code).toBe('AUTH_REJECTED');
    });
  });

  describe('a transform that tries to widen', () => {
    test('cannot return a structure in place of a scalar', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({
          transform: () => ({ leaked: 'everything' }),
        }),
      });

      expect(JSON.stringify(report)).not.toContain('leaked');
    });

    test('keeps a value the transform returned unchanged', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({ transform: (value) => value }),
      });

      expect(report.stack?.[0]).toBe('Error: boom');
    });

    test('accepts a finite number and replaces anything else', () => {
      const report = toDiagnosticReport(
        { count: 1, flag: true, nothing: null, bad: 2 },
        {
          redact: createRedactionPolicy({
            transform: (value) => (value === 2 ? Number.POSITIVE_INFINITY : 9),
          }),
        },
      );

      expect(report.as_json).toMatchObject({
        count: 9,
        flag: 9,
        nothing: 9,
        bad: '[redacted]',
      });
    });

    test('may narrow a value it is asked about', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({
          transform: (value) =>
            typeof value === 'string' ? value.slice(0, 2) : value,
        }),
      });

      expect(report.stack?.[0]).toBe('Er');
    });
  });

  test('composes with toReports, sharing one occurrence', () => {
    const failure = new Rejected({
      details: { user: 'ada', password: 'hunter2' },
    });

    const reports = toReports(failure, {
      diagnostic: { redact: secretPolicy() },
      public: { redact: secretPolicy() },
    });

    expect(reports.diagnostic.occurrence_id).toBe(reports.public.occurrence_id);
    expect(JSON.stringify(reports)).not.toContain('hunter2');
  });

  test('composes with the final report byte budget', () => {
    const report = toDiagnosticReport(new Error('boom'), {
      context: { sessionToken: 'x'.repeat(12_000) },
      redact: secretPolicy(),
      maxFinalReportSize: 4_096,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(report)).byteLength;

    expect(bytes).toBeLessThanOrEqual(4_096);
    expect(JSON.stringify(report)).not.toContain('xxxx');
  });

  test('a report stays valid when the policy is bypassed, and the secret returns', () => {
    const failure = new Rejected({
      details: { user: 'ada', password: 'hunter2' },
    });

    expect(JSON.stringify(toDiagnosticReport(failure))).toContain('hunter2');
    expect(JSON.stringify(toPublicReport(failure))).toContain('hunter2');
  });

  describe('validation', () => {
    const rejects = (options: unknown) =>
      expect(() =>
        createRedactionPolicy(options as Parameters<typeof createRedactionPolicy>[0]),
      );

    test('rejects malformed options', () => {
      rejects('policy').toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      rejects(null).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      rejects([]).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      rejects({ keys: 'password' }).toThrow(/keys must be an array/);
      rejects({ keys: [7] }).toThrow(
        /keys must contain only strings and regular expressions/,
      );
      rejects({ paths: [7] }).toThrow(/paths must contain only strings/);
      rejects({ values: ['x'] }).toThrow(
        /values must contain only regular expressions/,
      );
      rejects({ replacement: 7 }).toThrow(/replacement must be a string/);
      rejects({ replacement: 'x'.repeat(129) }).toThrow(
        /replacement must be a string/,
      );
      rejects({ transform: 'x' }).toThrow(/transform must be a function/);
    });

    test('accepts an empty policy', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy(),
      });

      expect(report.stack?.[0]).toBe('Error: boom');
    });

    test('rejects a redact option that is not a policy', () => {
      expect(() =>
        toDiagnosticReport(new Error('boom'), {
          redact: {} as unknown as RedactionPolicy,
        }),
      ).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      expect(() =>
        toPublicReport(new Error('boom'), {
          redact: 'policy' as unknown as RedactionPolicy,
        }),
      ).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
    });

    test('rejects a policy-shaped object whose accessor throws', () => {
      const hostile = Object.defineProperty({}, REDACTION_POLICY, {
        get: () => {
          throw new Error('hostile');
        },
      });

      expect(() =>
        toDiagnosticReport(new Error('boom'), {
          redact: hostile as unknown as RedactionPolicy,
        }),
      ).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
    });

    test('is unaffected by a global regex flag reused across calls', () => {
      const policy = createRedactionPolicy({
        keys: [/^password$/g],
        values: [/hunter2/g],
      });
      const make = () =>
        toDiagnosticReport(
          new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
          { redact: policy },
        );

      expect(JSON.stringify(make())).not.toContain('hunter2');
      expect(JSON.stringify(make())).not.toContain('hunter2');
    });
  });
});
