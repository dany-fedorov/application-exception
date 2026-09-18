import Ajv2020 from 'ajv/dist/2020';
import { createRedactionPolicy, defineException } from '../src/index';
import { toDiagnosticReport, toPublicReport, toReports } from '../src/reporting';
import { REDACTION_POLICY } from '../src/redaction';
import type { RedactionPolicy } from '../src/redaction';

const code = (value: string) => expect.objectContaining({ code: value });

const ajv = new Ajv2020({ strict: true, allErrors: true });
const diagnosticSchema: object = require('../schemas/diagnostic-report-v4.json');
const publicSchema: object = require('../schemas/public-report-v3.json');
const compiledDiagnostic = ajv.compile(diagnosticSchema);
const compiledPublic = ajv.compile(publicSchema);

/** `null` when the report validates, otherwise the ajv errors, so a failure names what broke. */
const validateDiagnostic = (report: unknown): unknown =>
  compiledDiagnostic(JSON.parse(JSON.stringify(report))) ? null : ajv.errorsText(compiledDiagnostic.errors);
const validatePublic = (report: unknown): unknown =>
  compiledPublic(JSON.parse(JSON.stringify(report))) ? null : ajv.errorsText(compiledPublic.errors);

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

      expect(report.v).toBe('corj/v0.13');
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

    test('substitutes only within the JSON type it was given', () => {
      // A report pins types positionally, so a transform may narrow a number to
      // another number but never turn one into a string.
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
        flag: false,
        nothing: null,
        bad: 0,
      });
      expect(validateDiagnostic(report)).toBeNull();
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

    expect(validateDiagnostic(toDiagnosticReport(failure))).toBeNull();
    expect(validatePublic(toPublicReport(failure))).toBeNull();
    expect(JSON.stringify(toDiagnosticReport(failure))).toContain('hunter2');
    expect(JSON.stringify(toPublicReport(failure))).toContain('hunter2');
  });

  describe('a policy can never break a report schema', () => {
    const everything = () =>
      createRedactionPolicy({ keys: [/.*/], values: [/.*/], paths: ['$'] });

    test.each([
      ['a plain error', () => new Error('boom'), {}],
      [
        'an aggregate with children omitted',
        () => new AggregateError([new Error('a'), new Error('b')], 'agg'),
        { maxDepth: 0 },
      ],
      [
        'a value whose inspection fails',
        () => ({
          get password(): never {
            throw new Error('unreadable');
          },
        }),
        {},
      ],
      ['a nested cause chain', () => new Error('a', { cause: new Error('b') }), {}],
    ])('survives %s', (_name, make, options) => {
      const report = toDiagnosticReport(make(), {
        ...options,
        redact: everything(),
      });

      expect(validateDiagnostic(report)).toBeNull();
      expect(report.v).toBe('corj/v0.13');
      expect(report.occurrence_id).toMatch(/^AE_/);
    });

    test.each([
      ['a transform returning a number', () => 9],
      ['a transform returning a structure', () => ({ leaked: true })],
      ['a transform returning an over-long string', () => 'x'.repeat(20_000)],
      [
        'a transform that throws',
        () => {
          throw new Error('policy exploded');
        },
      ],
    ])('survives %s', (_name, transform) => {
      const caught = new Error('boom', { cause: { level: 1, flag: true } });
      const policy = createRedactionPolicy({ transform });

      expect(
        validateDiagnostic(toDiagnosticReport(caught, { redact: policy })),
      ).toBeNull();
      expect(validatePublic(toPublicReport(caught, { redact: policy }))).toBeNull();
    });

    test('survives redaction composed with a tight budget', () => {
      for (const budget of [400, 512, 1_024, 4_096, 65_536]) {
        const report = toDiagnosticReport(
          new Error('e'.repeat(50_000), { cause: new Error('inner') }),
          {
            context: { text: 'x'.repeat(20_000) },
            maxFinalReportSize: budget,
            redact: secretPolicy(),
          },
        );

        expect(validateDiagnostic(report)).toBeNull();
        expect(
          new TextEncoder().encode(JSON.stringify(report)).byteLength,
        ).toBeLessThanOrEqual(budget);
        expect(report.v).toBe('corj/v0.13');
      }
    });

    test('keeps a budgeted report identifiable at the smallest size it reaches', () => {
      const report = toDiagnosticReport(new Error('e'.repeat(3_000)), {
        maxFinalReportSize: 400,
      });

      expect(report.v).toBe('corj/v0.13');
      expect(validateDiagnostic(report)).toBeNull();
      expect(report.truncated).toBe(true);
    });

    test('uses the budget it was given rather than half of it', () => {
      const report = toDiagnosticReport(new Error('e'.repeat(200_000)), {
        maxFinalReportSize: 50_000,
      });
      const bytes = new TextEncoder().encode(JSON.stringify(report)).byteLength;

      expect(bytes).toBeLessThanOrEqual(50_000);
      expect(bytes).toBeGreaterThan(45_000);
    });
  });

  describe('protection is positional, not by name', () => {
    const named = () => {
      const caught = new Error('boom');
      return Object.assign(caught, {
        id: 'sk-id',
        code: 'sk-code',
        path: 'sk-path',
        stage: 'sk-stage',
        level: 'sk-level',
        truncated: 'sk-truncated',
      });
    };

    test('redacts report-shaped names carrying application data', () => {
      const report = toDiagnosticReport(named(), {
        context: { id: 'sk-cid', code: 'sk-ccode', path: 'sk-cpath' },
        redact: createRedactionPolicy({ values: [/sk-[a-z]+/] }),
      });

      expect(JSON.stringify(report)).not.toMatch(/sk-[a-z]+/);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('redacts them by key rule too', () => {
      const report = toDiagnosticReport(named(), {
        redact: createRedactionPolicy({ keys: ['id', 'code', 'path'] }),
      });

      expect(report.as_json).toMatchObject({
        id: '[redacted]',
        code: '[redacted]',
        path: '[redacted]',
      });
    });

    test('redacts a public field the selector called code', () => {
      const Named = defineException({
        tag: 'auth/Named',
        message: 'named',
        public: {
          code: 'AUTH_NAMED',
          details: () => ({ code: 'sk-inner', truncated: 'sk-flag' }),
        },
      });

      const report = toPublicReport(new Named(), {
        redact: createRedactionPolicy({ values: [/sk-[a-z]+/] }),
      });

      expect(report.code).toBe('AUTH_NAMED');
      expect(report.as_json).toEqual({
        code: '[redacted]',
        truncated: '[redacted]',
      });
      expect(validatePublic(report)).toBeNull();
    });

    test('leaves the report\'s own link graph intact', () => {
      const report = toDiagnosticReport(
        new Error('a', { cause: new Error('b') }),
        { redact: createRedactionPolicy({ values: [/.*/] }) },
      );

      expect(report.children?.[0]?.id).toBe('0');
      expect(report.children?.[0]?.path).toBe('$.cause');
      expect(validateDiagnostic(report)).toBeNull();
    });
  });

  test('replaces a subtree nested past the walk depth instead of overflowing', () => {
    let deep: unknown = 'leaf';
    for (let level = 0; level < 3_000; level++) deep = [deep];

    const report = toDiagnosticReport({ deep }, { redact: secretPolicy() });

    expect(validateDiagnostic(report)).toBeNull();
    expect(JSON.stringify(report)).toContain('[redacted]');
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
      rejects({ values: [/sk-[a-z]/y] }).toThrow(
        /values must not use the sticky flag/,
      );
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
      // Several matching keys in one walk: a stale lastIndex would let the
      // second and third escape.
      const policy = createRedactionPolicy({
        keys: [/password/g],
        values: [/secret/g],
      });
      const make = () =>
        toDiagnosticReport(
          {
            password: 'one',
            passwordConfirm: 'two',
            password2: 'three',
            note: 'secret secret secret',
          },
          { redact: policy },
        );

      for (const report of [make(), make()]) {
        expect(report.as_json).toEqual({
          password: '[redacted]',
          passwordConfirm: '[redacted]',
          password2: '[redacted]',
          note: '[redacted] [redacted] [redacted]',
        });
      }
    });
  });
});
