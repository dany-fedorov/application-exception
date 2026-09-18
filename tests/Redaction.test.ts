import Ajv2020 from 'ajv/dist/2020';
import { createRedactionPolicy, defineException } from '../src/index';
import {
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src/reporting';
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
  compiledDiagnostic(JSON.parse(JSON.stringify(report)))
    ? null
    : ajv.errorsText(compiledDiagnostic.errors);
const validatePublic = (report: unknown): unknown =>
  compiledPublic(JSON.parse(JSON.stringify(report)))
    ? null
    : ajv.errorsText(compiledPublic.errors);

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
    patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
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

    test('never reads a property the policy excluded', () => {
      let reads = 0;
      const caught = {
        get password(): string {
          reads++;
          return 'hunter2';
        },
        user: 'ada',
      };

      const report = toDiagnosticReport(caught, {
        redact: createRedactionPolicy({ keys: ['password'] }),
      });

      expect(reads).toBe(0);
      expect(report.as_json).toEqual({ password: '[redacted]', user: 'ada' });
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

    test('redacts reporting_errors although the onError handler is this package’s own', () => {
      // corj scrubs the line only inside its default `onError`; a custom handler
      // receives the caught object unchanged, so this package scrubs the text.
      const hostile = {
        get detail(): never {
          throw new Error('sk-abcdefghij leaked');
        },
      };

      const report = toDiagnosticReport(hostile, { redact: secretPolicy() });

      expect(report.reporting_errors).toEqual([
        expect.objectContaining({ error: 'Error: [redacted] leaked' }),
      ]);
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
      expect(
        toDiagnosticReport(hostile).reporting_errors?.[0]?.error,
      ).toContain('sk-abcdefghij');
    });

    test('never rewrites the stage of a reporting error', () => {
      const hostile = {
        get detail(): never {
          throw new Error('unreadable');
        },
      };

      const report = toDiagnosticReport(hostile, {
        redact: createRedactionPolicy({ patterns: [/[\s\S]+/g] }),
      });

      expect(report.reporting_errors?.[0]?.stage).toBe('as_json');
      expect(report.reporting_errors?.[0]?.error).toBe('[redacted]');
    });

    test('redacts an exact path into the caught value', () => {
      const report = toDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        { redact: createRedactionPolicy({ paths: ['$.user'] }) },
      );

      expect(report.as_json).toEqual({
        user: '[redacted]',
        password: 'hunter2',
      });
    });

    test('never rewrites identity or version fields', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({
          keys: [/.*/],
          patterns: [/[\s\S]*/g],
          replacement: 'X',
        }),
      });

      expect(report.v).toBe('corj/v0.13');
      expect(report.occurrence_id).toMatch(/^AE_/);
    });

    test('uses a custom replacement', () => {
      const report = toDiagnosticReport(
        new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
        {
          redact: createRedactionPolicy({
            keys: ['password'],
            replacement: '***',
          }),
        },
      );

      expect(report.as_json).toMatchObject({ details: { password: '***' } });
    });

    test('a redacted children source is reported as such and still validates', () => {
      const report = toDiagnosticReport(
        new AggregateError([new Error('a'), new Error('b')], 'agg'),
        { redact: createRedactionPolicy({ keys: ['errors'] }) },
      );

      expect(report.children_omitted).toBe('redacted');
      expect(report.children).toBeUndefined();
      expect(validateDiagnostic(report)).toBeNull();
    });
  });

  describe('D5: `paths` address the caught value only', () => {
    const caught = () => ({ user: 'ada', password: 'hunter2' });

    test('a path leaves an identically named context field alone', () => {
      const report = toDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact: createRedactionPolicy({ paths: ['$.password'] }),
      });

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(report.context).toEqual({ password: 'ctx-secret' });
    });

    test('a key rule redacts both', () => {
      const report = toDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact: createRedactionPolicy({ keys: ['password'] }),
      });

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(report.context).toEqual({ password: '[redacted]' });
    });

    test('a path never reaches selected public details', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toPublicReport(failure, {
        redact: createRedactionPolicy({ paths: ['$.password'] }),
      });

      expect(report.as_json).toEqual({ user: 'ada', password: 'hunter2' });
    });
  });

  describe('a replacement is literal', () => {
    const literal = () =>
      createRedactionPolicy({
        keys: ['password'],
        patterns: [/sk-[a-z]+/g],
        replacement: '<$&>',
      });

    test('in the diagnostic report and in the context', () => {
      const report = toDiagnosticReport(
        { password: 'hunter2', note: 'key sk-abcdefghij here' },
        { context: { note: 'key sk-abcdefghij here' }, redact: literal() },
      );

      expect(report.as_json).toEqual({
        password: '<$&>',
        note: 'key <$&> here',
      });
      expect(report.context).toEqual({ note: 'key <$&> here' });
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
    });

    test('in the public as_json and message', () => {
      const Leaky = defineException({
        tag: 'auth/Leaky',
        message: 'leaky',
        public: {
          code: 'LEAKY',
          message: ({ note }: { note: string }) => `rejected ${note}`,
          details: ({ note }) => ({ note }),
        },
      });

      const report = toPublicReport(
        new Leaky({ details: { note: 'sk-abcdefghij' } }),
        { redact: literal() },
      );

      expect(report.message).toBe('rejected <$&>');
      expect(report.as_json).toEqual({ note: '<$&>' });
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
      expect(validatePublic(report)).toBeNull();
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

    test('D8: does not authorize disclosure of a field the selector never chose', () => {
      const Quiet = defineException({
        tag: 'auth/Quiet',
        message: 'quiet',
        public: { code: 'QUIET' },
      });

      for (const redact of [
        secretPolicy(),
        createRedactionPolicy({ transform: (value) => value }),
        createRedactionPolicy({ keys: [/.*/] }),
      ]) {
        expect(toPublicReport(new Quiet(), { redact }).as_json).toBeUndefined();
      }
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
        redact: createRedactionPolicy({
          keys: [/.*/],
          patterns: [/[\s\S]*/g],
        }),
      });

      expect(report.code).toBe('AUTH_REJECTED');
      expect(report.occurrence_id).toBe(failure.occurrenceId);
      expect(report.v).toBe('appex/public/v3');
    });

    test('scrubs the message before the length bound is applied', () => {
      // The scrub runs first, so a replacement longer than the text it replaced
      // is bounded by the cut rather than escaping it.
      const report = toPublicReport(new Error('boom'), {
        message: `sk-abcdefghij${'A'.repeat(4_090)}`,
        redact: createRedactionPolicy({
          patterns: [/sk-[a-z]+/g],
          replacement: 'x'.repeat(128),
        }),
      });

      expect(report.message).toHaveLength(4_096);
      expect(report.message.startsWith('x'.repeat(128))).toBe(true);
      expect(report.truncated).toBe(true);
      expect(report.message).not.toContain('sk-abcdefghij');
      expect(validatePublic(report)).toBeNull();
    });
  });

  describe('a throwing transform', () => {
    test('fails closed and records the failure once for the value it was asked about', () => {
      const selective = createRedactionPolicy({
        transform: (value) => {
          if (value === 'hunter2') throw new Error('policy exploded');
          return value;
        },
      });

      const report = toDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        { redact: selective },
      );

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(JSON.stringify(report)).not.toContain('hunter2');
      expect(report.reporting_errors).toEqual([
        {
          stage: 'redact',
          path: '$.password',
          key: 'as_json',
          prop: 'password',
          error: 'Error: policy exploded',
        },
      ]);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('a transform that always throws blanks the report without recursing', () => {
      const throwing = createRedactionPolicy({
        transform: () => {
          throw new Error('policy exploded');
        },
      });

      const report = toDiagnosticReport(new Error('boom'), {
        redact: throwing,
      });

      expect(JSON.stringify(report)).not.toContain('boom');
      expect(report.reporting_errors?.length).toBeGreaterThan(0);
      for (const entry of report.reporting_errors ?? [])
        expect(entry.stage).toBe('redact');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('keeps the public report safe and observable', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = toPublicReport(failure, {
        redact: createRedactionPolicy({
          transform: () => {
            throw new Error('policy exploded');
          },
        }),
      });

      expect(JSON.stringify(report)).not.toContain('hunter2');
      expect(report.code).toBe('AUTH_REJECTED');
      expect(report.message).toBe('[redacted]');
    });
  });

  describe('what a transform may return', () => {
    test('a structure in place of a scalar is emitted, and the report stays valid', () => {
      const report = toDiagnosticReport(
        { note: 'plain' },
        {
          redact: createRedactionPolicy({
            transform: (value) =>
              value === 'plain' ? { narrowed: true } : value,
          }),
        },
      );

      expect(report.as_json).toEqual({ note: { narrowed: true } });
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('keeps a value the transform returned unchanged', () => {
      const report = toDiagnosticReport(new Error('boom'), {
        redact: createRedactionPolicy({ transform: (value) => value }),
      });

      expect(report.stack?.[0]).toBe('Error: boom');
    });

    test('dropping a field leaves it out of the report', () => {
      const report = toDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        {
          redact: createRedactionPolicy({
            transform: (value, { prop }) =>
              prop === 'password' ? undefined : value,
          }),
        },
      );

      expect(report.as_json).toEqual({ user: 'ada' });
      expect(JSON.stringify(report)).not.toContain('hunter2');
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
      createRedactionPolicy({
        keys: [/.*/],
        patterns: [/[\s\S]*/g],
        paths: ['$'],
      });

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
      [
        'a nested cause chain',
        () => new Error('a', { cause: new Error('b') }),
        {},
      ],
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
      expect(
        validatePublic(toPublicReport(caught, { redact: policy })),
      ).toBeNull();
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

  describe('application data is redacted whatever it is named', () => {
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
        redact: createRedactionPolicy({ patterns: [/sk-[a-z]+/g] }),
      });

      expect(JSON.stringify(report)).not.toMatch(/sk-[a-z]+/);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('redacts them by key rule too', () => {
      const report = toDiagnosticReport(named(), {
        redact: createRedactionPolicy({
          keys: ['id', 'code', 'path', 'stage', 'level', 'truncated'],
        }),
      });

      expect(report.as_json).toMatchObject({
        id: '[redacted]',
        code: '[redacted]',
        path: '[redacted]',
        stage: '[redacted]',
        level: '[redacted]',
        truncated: '[redacted]',
      });
      expect(validateDiagnostic(report)).toBeNull();
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
        redact: createRedactionPolicy({ patterns: [/sk-[a-z]+/g] }),
      });

      expect(report.code).toBe('AUTH_NAMED');
      expect(report.as_json).toEqual({
        code: '[redacted]',
        truncated: '[redacted]',
      });
      expect(validatePublic(report)).toBeNull();
    });

    test('leaves the positions corj generates itself intact', () => {
      // `path` and `level` are corj's own structure and are never emitted
      // through the policy; `id` is, because `makeReportId` may have built it
      // from the caught object. The report stays valid either way.
      const report = toDiagnosticReport(
        new Error('a', { cause: new Error('b') }),
        { redact: createRedactionPolicy({ patterns: [/[\s\S]*/g] }) },
      );

      expect(report.children?.[0]?.path).toBe('$.cause');
      expect(report.children?.[0]?.level).toBe(1);
      expect(report.children?.[0]?.id).toBe('[redacted][redacted]');
      expect(validateDiagnostic(report)).toBeNull();
    });
  });

  describe('validation', () => {
    const rejects = (options: unknown) =>
      expect(() =>
        createRedactionPolicy(
          options as Parameters<typeof createRedactionPolicy>[0],
        ),
      );

    test('rejects malformed options', () => {
      rejects('policy').toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      rejects(null).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      rejects([]).toThrow(/redaction policy options must be an object/);
      rejects({ keys: 'password' }).toThrow(
        /redact\.keys must be an array of strings or RegExps/,
      );
      rejects({ keys: [7] }).toThrow(/redact\.keys must be an array/);
      rejects({ paths: [7] }).toThrow(
        /redact\.paths must be an array of strings or RegExps/,
      );
      rejects({ patterns: ['x'] }).toThrow(
        /redact\.patterns must be an array of RegExps/,
      );
      rejects({ replacement: 7 }).toThrow(
        /replacement must be a string of at most 128 characters/,
      );
      rejects({ replacement: 'x'.repeat(129) }).toThrow(
        /replacement must be a string of at most 128 characters/,
      );
      rejects({ transform: 'x' }).toThrow(
        /redact\.transform must be a function/,
      );
      rejects({ unknown: true }).toThrow(/Unknown redact option "unknown"/);
    });

    test('rejects a pattern that is not global, and says why', () => {
      rejects({ patterns: [/sk-[a-z]+/] }).toThrow(
        code('APPEX_INVALID_REDACTION_POLICY'),
      );
      rejects({ patterns: [/sk-[a-z]+/] }).toThrow(
        /redact\.patterns must all be global; \/sk-\[a-z\]\+\/ would replace only its first match/,
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

    test('is unaffected by a matcher reused across calls', () => {
      // Several matching keys in one inspection: a stale `lastIndex` would let
      // the second and third escape.
      const policy = createRedactionPolicy({
        keys: [/password/g],
        patterns: [/secret/g],
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
