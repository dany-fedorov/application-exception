import Ajv2020 from 'ajv/dist/2020';
import { makeRedactionPolicy, defineException } from '../src/index';
import {
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from '../src/reporting';
import { REDACTION_POLICY } from '../src/redaction';
import type { RedactionPolicy } from '../src/redaction';

const code = (value: string) => expect.objectContaining({ code: value });

const ajv = new Ajv2020({ strict: true, allErrors: true });
const diagnosticSchema: object = require('../schemas/diagnostic-report-v6.json');
const publicSchema: object = require('../schemas/public-report-v4.json');
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
    detailsSelector: ({ user, password }) => ({ user, password }),
  },
});

const secretPolicy = () =>
  makeRedactionPolicy({
    keys: ['password', /token$/i],
    patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
  });

describe('makeRedactionPolicy', () => {
  describe('diagnostic reports', () => {
    test('redacts secret-bearing details by key', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = makeDiagnosticReport(failure, { redact: secretPolicy() });

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

      const report = makeDiagnosticReport(caught, {
        redact: makeRedactionPolicy({ keys: ['password'] }),
      });

      expect(reads).toBe(0);
      expect(report.as_json).toEqual({ password: '[redacted]', user: 'ada' });
    });

    test('redacts a secret value inside the message and the stack', () => {
      // corj folds `constructor_name: message` into the first stack line, so
      // this is where a message-borne secret actually lives in the report.
      const caught = new Error('rejected key sk-abcdefghij');

      const report = makeDiagnosticReport(caught, { redact: secretPolicy() });

      expect(report.stack?.[0]).toBe('Error: rejected key [redacted]');
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
    });

    test('redacts a message corj did emit as its own field', () => {
      const caught = { message: 'rejected key sk-abcdefghij' };

      const report = makeDiagnosticReport(caught, { redact: secretPolicy() });

      expect(report.message).toBe('rejected key [redacted]');
    });

    test('reaches into nested causes', () => {
      const caught = new Error('outer', {
        cause: new Error('inner', { cause: { apiToken: 'secret-value' } }),
      });

      const report = makeDiagnosticReport(caught, { redact: secretPolicy() });

      expect(JSON.stringify(report)).not.toContain('secret-value');
      expect(JSON.stringify(report)).toContain('[redacted]');
    });

    test('redacts the context', () => {
      const report = makeDiagnosticReport(new Error('boom'), {
        context: { runId: 'run-1', sessionToken: 'secret-value' },
        redact: secretPolicy(),
      });

      expect(report.context).toEqual({
        runId: 'run-1',
        sessionToken: '[redacted]',
      });
    });

    test('redacts reporting_errors although the onReportingError handler is this package’s own', () => {
      // corj scrubs the line only inside its default `onReportingError`; a custom handler
      // receives the caught object unchanged, so this package scrubs the text.
      const hostile = {
        get detail(): never {
          throw new Error('sk-abcdefghij leaked');
        },
      };

      const report = makeDiagnosticReport(hostile, { redact: secretPolicy() });

      expect(report.reporting_errors).toEqual([
        expect.objectContaining({ error: 'Error: [redacted] leaked' }),
      ]);
      expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
      expect(
        makeDiagnosticReport(hostile).reporting_errors?.[0]?.error,
      ).toContain('sk-abcdefghij');
    });

    test('never rewrites the stage of a reporting error', () => {
      const hostile = {
        get detail(): never {
          throw new Error('unreadable');
        },
      };

      const report = makeDiagnosticReport(hostile, {
        redact: makeRedactionPolicy({ patterns: [/[\s\S]+/g] }),
      });

      expect(report.reporting_errors?.[0]?.stage).toBe('as_json');
      expect(report.reporting_errors?.[0]?.error).toBe('[redacted]');
    });

    test('redacts an exact path into the caught value', () => {
      const report = makeDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        { redact: makeRedactionPolicy({ paths: ['$.user'] }) },
      );

      expect(report.as_json).toEqual({
        user: '[redacted]',
        password: 'hunter2',
      });
    });

    test('never rewrites identity or version fields', () => {
      const report = makeDiagnosticReport(new Error('boom'), {
        redact: makeRedactionPolicy({
          keys: [/.*/],
          patterns: [/[\s\S]*/g],
          replacement: 'X',
        }),
      });

      expect(report.v).toBe('corj/v0.15');
      expect(report.occurrence_id).toMatch(/^AE_/);
    });

    test('uses a custom replacement', () => {
      const report = makeDiagnosticReport(
        new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
        {
          redact: makeRedactionPolicy({
            keys: ['password'],
            replacement: '***',
          }),
        },
      );

      expect(report.as_json).toMatchObject({ details: { password: '***' } });
    });

    test('a redacted children source is reported as such and still validates', () => {
      const report = makeDiagnosticReport(
        new AggregateError([new Error('a'), new Error('b')], 'agg'),
        { redact: makeRedactionPolicy({ keys: ['errors'] }) },
      );

      expect(report.children_omitted).toBe('redacted');
      expect(report.children).toBeUndefined();
      expect(validateDiagnostic(report)).toBeNull();
    });
  });

  describe('D5: a `paths` rule names the document it addresses', () => {
    const caught = () => ({ user: 'ada', password: 'hunter2' });

    test('`$.` reaches the caught value, and nothing else', () => {
      const report = makeDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact: makeRedactionPolicy({ paths: ['$.password'] }),
      });
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });
      const disclosed = makePublicReport(failure, {
        redact: makeRedactionPolicy({ paths: ['$.password'] }),
      });

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(report.context).toEqual({ password: 'ctx-secret' });
      expect(disclosed.as_json).toEqual({ user: 'ada', password: 'hunter2' });
    });

    test('`$context.` reaches the context, and nothing else', () => {
      const report = makeDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact: makeRedactionPolicy({ paths: ['$context.password'] }),
      });

      expect(report.context).toEqual({ password: '[redacted]' });
      expect(report.as_json).toEqual({ user: 'ada', password: 'hunter2' });
    });

    test('`$public.` reaches the selected public details, and nothing else', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });
      const redact = makeRedactionPolicy({ paths: ['$public.password'] });

      const disclosed = makePublicReport(failure, { redact });
      const report = makeDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact,
      });

      expect(disclosed.as_json).toEqual({
        user: 'ada',
        password: '[redacted]',
      });
      expect(report.as_json).toEqual({ user: 'ada', password: 'hunter2' });
      expect(report.context).toEqual({ password: 'ctx-secret' });
    });

    test('a key rule redacts all three', () => {
      const redact = makeRedactionPolicy({ keys: ['password'] });
      const report = makeDiagnosticReport(caught(), {
        context: { password: 'ctx-secret' },
        redact,
      });
      const disclosed = makePublicReport(
        new Rejected({ details: { user: 'ada', password: 'hunter2' } }),
        { redact },
      );

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(report.context).toEqual({ password: '[redacted]' });
      expect(disclosed.as_json).toEqual({
        user: 'ada',
        password: '[redacted]',
      });
    });
  });

  describe('a replacement is literal', () => {
    const literal = () =>
      makeRedactionPolicy({
        keys: ['password'],
        patterns: [/sk-[a-z]+/g],
        replacement: '<$&>',
      });

    test('in the diagnostic report and in the context', () => {
      const report = makeDiagnosticReport(
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
          detailsSelector: ({ note }) => ({ note }),
        },
      });

      const report = makePublicReport(
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

      const report = makePublicReport(failure, { redact: secretPolicy() });

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
        makeRedactionPolicy({ transform: (value) => value }),
        makeRedactionPolicy({ keys: [/.*/] }),
      ]) {
        expect(
          makePublicReport(new Quiet(), { redact }).as_json,
        ).toBeUndefined();
      }
    });

    test('leaves an unknown failure generic', () => {
      const report = makePublicReport(new Error('sk-abcdefghij'), {
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

      const report = makePublicReport(failure, {
        redact: makeRedactionPolicy({
          keys: [/.*/],
          patterns: [/[\s\S]*/g],
        }),
      });

      expect(report.code).toBe('AUTH_REJECTED');
      expect(report.occurrence_id).toBe(failure.occurrenceId);
      expect(report.v).toBe('appex/public/v4');
    });

    test('scrubs the message as the `warning` text of `$public.message`', () => {
      // The redaction context of the public message is part of the contract: a
      // policy keyed on it must fire here exactly as it does inside corj.
      const report = makePublicReport(new Error('boom'), {
        policyOverride: { message: 'hello' },
        redact: makeRedactionPolicy({
          transform: (value, { stage, path, reportKey, sourceProperty }) =>
            stage === 'warning' &&
            path === '$public.message' &&
            reportKey === 'message' &&
            sourceProperty === undefined
              ? 'PINNED'
              : value,
        }),
      });

      expect(report.message).toBe('PINNED');
    });

    test('scrubs the message before the length bound is applied', () => {
      // The scrub runs first, so a replacement longer than the text it replaced
      // is bounded by the cut rather than escaping it.
      const report = makePublicReport(new Error('boom'), {
        policyOverride: { message: `sk-abcdefghij${'A'.repeat(4_090)}` },
        redact: makeRedactionPolicy({
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
      const selective = makeRedactionPolicy({
        transform: (value) => {
          if (value === 'hunter2') throw new Error('policy exploded');
          return value;
        },
      });

      const report = makeDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        { redact: selective },
      );

      expect(report.as_json).toEqual({ user: 'ada', password: '[redacted]' });
      expect(JSON.stringify(report)).not.toContain('hunter2');
      // A `stage: 'redact'` row describes the policy's own failure, so corj
      // does not consult that same policy to scrub the row: `path`, `prop` and
      // `error` all fail closed to the replacement.
      expect(report.reporting_errors).toEqual([
        {
          stage: 'redact',
          path: '[redacted]',
          reportKey: 'as_json',
          sourceProperty: '[redacted]',
          error: '[redacted]',
        },
      ]);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('a transform that always throws blanks the report without recursing', () => {
      const throwing = makeRedactionPolicy({
        transform: () => {
          throw new Error('policy exploded');
        },
      });

      const report = makeDiagnosticReport(new Error('boom'), {
        redact: throwing,
      });

      expect(JSON.stringify(report)).not.toContain('boom');
      // The policy is reported once per value, so a transform that always
      // throws produces several entries, not one.
      expect(report.reporting_errors?.length).toBeGreaterThan(1);
      for (const entry of report.reporting_errors ?? []) {
        expect(entry.stage).toBe('redact');
        // The policy's own message is withheld: it may quote what the policy
        // was protecting, and the only thing that knew how to protect it is
        // the policy that just failed.
        expect(entry.error).toBe('[redacted]');
      }
      expect(JSON.stringify(report)).not.toContain('policy exploded');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test("the text of the policy's own failure is never emitted", () => {
      const leaky = makeRedactionPolicy({
        patterns: [/sk-[a-z]+/g],
        transform: () => {
          throw new Error('failed on sk-abcdef');
        },
      });

      const report = makeDiagnosticReport(new Error('boom'), { redact: leaky });
      const entries = report.reporting_errors ?? [];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.stage).toBe('redact');
        expect(entry.error).toBe('[redacted]');
      }
      expect(JSON.stringify(report)).not.toContain('failed on');
      expect(JSON.stringify(report)).not.toContain('sk-abcdef');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('withholds a message that quotes the raw input a transform choked on', () => {
      // `transform` is the only protection this field has, and its own error
      // quotes the value it was given.
      const policy = makeRedactionPolicy({
        transform: (value, { sourceProperty }) =>
          sourceProperty === 'account' &&
          typeof value === 'string' &&
          value !== 'account'
            ? String(BigInt(value) % 10000n)
            : value,
      });

      const report = makeDiagnosticReport(
        { account: '4111-1111-1111-1111' },
        { redact: policy },
      );

      expect(JSON.stringify(report)).not.toContain('4111-1111-1111-1111');
      expect(JSON.stringify(report)).not.toContain('BigInt');
      expect(report.reporting_errors).toEqual([
        expect.objectContaining({ stage: 'redact', error: '[redacted]' }),
      ]);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test.each([
      ['a key rule', { keys: ['password'] }],
      ['a path rule', { paths: ['$.password'] }],
    ])(
      'withholds a message quoting a container %s excluded a member of',
      (_name, skip) => {
        // corj hands `transform` the whole container, excluded members still
        // inside, so the transform's own error can quote a skipped secret.
        const policy = makeRedactionPolicy({
          ...skip,
          transform: (value) => {
            if (typeof value === 'object' && value !== null)
              throw new Error('cannot handle ' + JSON.stringify(value));
            return value;
          },
        });

        const caught = makeDiagnosticReport(
          { user: 'ada', password: 'hunter2' },
          { redact: policy },
        );
        const inContext = makeDiagnosticReport(new Error('boom'), {
          context: { user: 'ada', password: 'hunter2' },
          redact: policy,
        });

        for (const report of [caught, inContext]) {
          expect(JSON.stringify(report)).not.toContain('hunter2');
          expect(JSON.stringify(report)).not.toContain('cannot handle');
          expect(report.reporting_errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ stage: 'redact', error: '[redacted]' }),
            ]),
          );
          expect(validateDiagnostic(report)).toBeNull();
        }
      },
    );

    test('a failure at any other stage is still scrubbed by the transform', () => {
      const caught = {
        get boom(): string {
          throw new Error('getter exploded');
        },
      };

      const report = makeDiagnosticReport(caught, {
        redact: makeRedactionPolicy({
          transform: (value) =>
            typeof value === 'string' && value.includes('getter exploded')
              ? '[gone]'
              : value,
        }),
      });
      const entries = report.reporting_errors ?? [];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.stage).not.toBe('redact');
        expect(entry.error).toBe('[gone]');
      }
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('keeps the public report safe and observable', () => {
      const failure = new Rejected({
        details: { user: 'ada', password: 'hunter2' },
      });

      const report = makePublicReport(failure, {
        redact: makeRedactionPolicy({
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
      const report = makeDiagnosticReport(
        { note: 'plain' },
        {
          redact: makeRedactionPolicy({
            transform: (value) =>
              value === 'plain' ? { narrowed: true } : value,
          }),
        },
      );

      expect(report.as_json).toEqual({ note: { narrowed: true } });
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('keeps a value the transform returned unchanged', () => {
      const report = makeDiagnosticReport(new Error('boom'), {
        redact: makeRedactionPolicy({ transform: (value) => value }),
      });

      expect(report.stack?.[0]).toBe('Error: boom');
    });

    test('dropping a field leaves it out of the report', () => {
      const report = makeDiagnosticReport(
        { user: 'ada', password: 'hunter2' },
        {
          redact: makeRedactionPolicy({
            transform: (value, { sourceProperty }) =>
              sourceProperty === 'password' ? undefined : value,
          }),
        },
      );

      expect(report.as_json).toEqual({ user: 'ada' });
      expect(JSON.stringify(report)).not.toContain('hunter2');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('may narrow a value it is asked about', () => {
      const report = makeDiagnosticReport(new Error('boom'), {
        redact: makeRedactionPolicy({
          transform: (value) =>
            typeof value === 'string' ? value.slice(0, 2) : value,
        }),
      });

      expect(report.stack?.[0]).toBe('Er');
    });
  });

  test('composes with makeReportPair, sharing one occurrence', () => {
    const failure = new Rejected({
      details: { user: 'ada', password: 'hunter2' },
    });

    const reports = makeReportPair(failure, {
      diagnostic: { redact: secretPolicy() },
      public: { redact: secretPolicy() },
    });

    expect(reports.diagnostic.occurrence_id).toBe(reports.public.occurrence_id);
    expect(JSON.stringify(reports)).not.toContain('hunter2');
  });

  test('composes with the final report byte budget', () => {
    // The budget forces corj to rebuild the report at a smaller size; the
    // secret is in content that survives the shrink, so the rebuilt report is
    // the one that has to stay redacted.
    const caught = Object.assign(
      new Error(`sk-abcdefghij ${'e'.repeat(50_000)}`),
      { note: 'sk-zyxwvutsrq' },
    );

    const report = makeDiagnosticReport(caught, {
      context: { sessionToken: 'x'.repeat(12_000) },
      redact: secretPolicy(),
      maxReportBytes: 1_024,
    });
    const json = JSON.stringify(report);

    expect(report.truncated).toBe(true);
    expect(json).not.toContain('sk-');
    expect(json).not.toContain('xxxx');
    expect(json).toContain('[redacted]');
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(
      1_024,
    );
    expect(validateDiagnostic(report)).toBeNull();
  });

  test('a report stays valid when the policy is bypassed, and the secret returns', () => {
    const failure = new Rejected({
      details: { user: 'ada', password: 'hunter2' },
    });

    expect(validateDiagnostic(makeDiagnosticReport(failure))).toBeNull();
    expect(validatePublic(makePublicReport(failure))).toBeNull();
    expect(JSON.stringify(makeDiagnosticReport(failure))).toContain('hunter2');
    expect(JSON.stringify(makePublicReport(failure))).toContain('hunter2');
  });

  describe('a policy can never break a report schema', () => {
    const everything = () =>
      makeRedactionPolicy({
        keys: [/.*/],
        patterns: [/[\s\S]*/g],
        paths: ['$'],
      });

    test.each([
      ['a plain error', () => new Error('boom'), {}],
      [
        'an aggregate with children omitted',
        () => new AggregateError([new Error('a'), new Error('b')], 'agg'),
        { corj: { maxDepth: 0 } },
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
      const report = makeDiagnosticReport(make(), {
        ...options,
        redact: everything(),
      });

      expect(validateDiagnostic(report)).toBeNull();
      expect(report.v).toBe('corj/v0.15');
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
      const policy = makeRedactionPolicy({ transform });

      expect(
        validateDiagnostic(makeDiagnosticReport(caught, { redact: policy })),
      ).toBeNull();
      expect(
        validatePublic(makePublicReport(caught, { redact: policy })),
      ).toBeNull();
    });

    test('survives redaction composed with a tight budget', () => {
      for (const budget of [512, 1_024, 4_096, 65_536]) {
        const report = makeDiagnosticReport(
          new Error('e'.repeat(50_000), { cause: new Error('inner') }),
          {
            context: { text: 'x'.repeat(20_000) },
            maxReportBytes: budget,
            redact: secretPolicy(),
          },
        );

        expect(validateDiagnostic(report)).toBeNull();
        expect(
          new TextEncoder().encode(JSON.stringify(report)).byteLength,
        ).toBeLessThanOrEqual(budget);
        expect(report.v).toBe('corj/v0.15');
      }
    });

    test('keeps a budgeted report identifiable at the smallest size it reaches', () => {
      const report = makeDiagnosticReport(new Error('e'.repeat(3_000)), {
        maxReportBytes: 512,
      });

      expect(report.v).toBe('corj/v0.15');
      expect(validateDiagnostic(report)).toBeNull();
      expect(report.truncated).toBe(true);
    });

    test('uses the budget it was given rather than half of it', () => {
      const report = makeDiagnosticReport(new Error('e'.repeat(200_000)), {
        maxReportBytes: 50_000,
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
      const report = makeDiagnosticReport(named(), {
        context: { id: 'sk-cid', code: 'sk-ccode', path: 'sk-cpath' },
        redact: makeRedactionPolicy({ patterns: [/sk-[a-z]+/g] }),
      });

      expect(JSON.stringify(report)).not.toMatch(/sk-[a-z]+/);
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('redacts them by key rule too', () => {
      const report = makeDiagnosticReport(named(), {
        redact: makeRedactionPolicy({
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
          detailsSelector: () => ({ code: 'sk-inner', truncated: 'sk-flag' }),
        },
      });

      const report = makePublicReport(new Named(), {
        redact: makeRedactionPolicy({ patterns: [/sk-[a-z]+/g] }),
      });

      expect(report.code).toBe('AUTH_NAMED');
      expect(report.as_json).toEqual({
        code: '[redacted]',
        truncated: '[redacted]',
      });
      expect(validatePublic(report)).toBeNull();
    });

    test('leaves the positions corj generates itself intact', () => {
      // `id`, `path` and `level` are corj's own structure: a default id is
      // never emitted through the policy, so even a policy that redacts every
      // digit keeps the cause tree linked.
      // The fixture values carry a `~`, which occurs neither in a hex
      // fingerprint nor in the id alphabet nor in a stack line, so the final
      // assertion can only be about the messages the application supplied.
      const report = makeDiagnosticReport(
        new Error('zq~secret-1', {
          cause: new Error('zq~secret-2', {
            cause: new Error('zq~secret-3'),
          }),
        }),
        { redact: makeRedactionPolicy({ patterns: [/\d/g] }) },
      );

      expect(report.children?.map((child) => child.id)).toEqual(['0', '1']);
      expect(report.children?.[0]?.child_ids).toEqual(['1']);
      expect(report.children?.[0]?.path).toBe('$.cause');
      expect(report.children?.[0]?.level).toBe(1);
      expect(JSON.stringify(report)).not.toMatch(/zq~secret-[123]/);
      expect(validateDiagnostic(report)).toBeNull();
    });
  });

  describe('scrubbing runs before the length bound', () => {
    test('a secret straddling character 256 of an inspection error leaves nothing', () => {
      // `describeValue` cuts at 256: cutting first would break the match and
      // emit the head of the secret.
      const caught = {
        get detail(): never {
          throw new Error(`${'A'.repeat(241)} sk-abcdefghijklmnop`);
        },
      };

      const report = makeDiagnosticReport(caught, {
        redact: makeRedactionPolicy({
          patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
        }),
      });
      const entries = report.reporting_errors ?? [];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.error).not.toContain('sk-');
        expect(entry.error.length).toBeLessThanOrEqual(256);
      }
      expect(JSON.stringify(report)).not.toContain('sk-');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('a secret straddling character 4,096 of the public message leaves nothing', () => {
      const report = makePublicReport(new Error('boom'), {
        policyOverride: {
          message: `${'A'.repeat(4_089)} sk-abcdefghijklmnop`,
        },
        redact: makeRedactionPolicy({
          patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
        }),
      });

      expect(report.message).toHaveLength(4_096);
      expect(report.message).not.toContain('sk-');
      expect(report.truncated).toBe(true);
      expect(validatePublic(report)).toBeNull();
    });

    test.each([
      ['the default replacement', {}],
      ['a 128-character replacement', { replacement: 'x'.repeat(128) }],
    ])(
      'keeps a grown reporting error within 256 characters: %s',
      (_n, extra) => {
        // A scrub can make text longer than it found it; the report schema
        // bounds this field at 256, so the cut has to come last.
        const caught = {
          get detail(): never {
            throw new Error('1'.repeat(300));
          },
        };

        const report = makeDiagnosticReport(caught, {
          redact: makeRedactionPolicy({ patterns: [/\d/g], ...extra }),
        });
        const entries = report.reporting_errors ?? [];

        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries)
          expect(entry.error.length).toBeLessThanOrEqual(256);
        expect(validateDiagnostic(report)).toBeNull();
      },
    );
  });

  describe('the path and the prop of a reporting error are scrubbed too', () => {
    /** A policy that throws on one value, so an entry naming the property exists. */
    const triggered = (extra: Parameters<typeof makeRedactionPolicy>[0]) =>
      makeRedactionPolicy({
        ...extra,
        transform: (value) => {
          if (value === 'trigger') throw new Error('policy exploded');
          return value;
        },
      });

    test('a name hidden only by patterns never appears', () => {
      const redact = triggered({ patterns: [/sk-[a-z0-9]+/g] });

      const caught = makeDiagnosticReport(
        { 'sk-abcdefghij': 'trigger' },
        { redact },
      );
      const inContext = makeDiagnosticReport(new Error('boom'), {
        context: { 'sk-abcdefghij': 'trigger' },
        redact,
      });

      const row = {
        stage: 'redact',
        path: '[redacted]',
        reportKey: 'as_json',
        sourceProperty: '[redacted]',
        error: '[redacted]',
      };
      expect(caught.reporting_errors).toEqual([row]);
      expect(inContext.reporting_errors).toEqual([row]);
      for (const report of [caught, inContext]) {
        expect(JSON.stringify(report)).not.toContain('sk-abcdefghij');
        expect(validateDiagnostic(report)).toBeNull();
      }
    });

    test('a name hidden only by a prop-keyed transform never appears', () => {
      // corj applies `transform` to property names too, `value` being the name
      // itself; the same policy has to decide about the name here.
      const redact = makeRedactionPolicy({
        transform: (value, { sourceProperty }) => {
          if (sourceProperty !== 'secretname') return value;
          if (value === 'secretname') return '***';
          throw new Error('policy exploded');
        },
      });

      const caught = makeDiagnosticReport(
        { secretname: 'trigger' },
        { redact },
      );
      const inContext = makeDiagnosticReport(new Error('boom'), {
        context: { secretname: 'trigger' },
        redact,
      });

      expect(caught.reporting_errors).toEqual([
        {
          stage: 'redact',
          path: '[redacted]',
          reportKey: 'as_json',
          sourceProperty: '[redacted]',
          error: '[redacted]',
        },
      ]);
      expect(inContext.reporting_errors?.[0]?.sourceProperty).toBe(
        '[redacted]',
      );
      for (const report of [caught, inContext]) {
        expect(JSON.stringify(report.reporting_errors)).not.toContain(
          'secretname',
        );
        expect(validateDiagnostic(report)).toBeNull();
      }
    });

    test('a policy that always throws leaves only the replacement, and corj’s own vocabulary', () => {
      const report = makeDiagnosticReport(
        {
          get boom(): never {
            throw new Error('getter exploded');
          },
        },
        {
          redact: makeRedactionPolicy({
            replacement: 'REDACTED_MARK',
            transform: () => {
              throw new Error('policy exploded');
            },
          }),
        },
      );
      const entries = report.reporting_errors ?? [];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.path).toBe('REDACTED_MARK');
        expect(entry.error).toBe('REDACTED_MARK');
        if (entry.sourceProperty !== undefined)
          expect(entry.sourceProperty).toBe('REDACTED_MARK');
        // `stage` and `reportKey` are corj's own names, never content.
        expect(entry.stage).toMatch(/^[a-z-]+$/);
        if (entry.reportKey !== undefined)
          expect(entry.reportKey).toMatch(/^[a-z_]+$/);
      }
      expect(entries.map((entry) => entry.reportKey)).toContain('as_json');
      expect(validateDiagnostic(report)).toBeNull();
    });

    test('a context value is offered to the policy at $context', () => {
      // The context is its own document: a path rule or a path-keyed transform
      // addresses it as `$context...`, never as a property of the caught value.
      const report = makeDiagnosticReport(new Error('boom'), {
        context: { secret: 'value' },
        redact: makeRedactionPolicy({
          transform: (value, { path, sourceProperty }) =>
            path === '$context.secret' &&
            sourceProperty === 'secret' &&
            value === 'value'
              ? 'HIT'
              : value,
        }),
      });

      expect(report.context).toEqual({ secret: 'HIT' });
    });
  });

  describe('validation', () => {
    const rejects = (options: unknown) =>
      expect(() =>
        makeRedactionPolicy(
          options as Parameters<typeof makeRedactionPolicy>[0],
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
        /redact\.replacement must be a string of at most 128 characters/,
      );
      rejects({ replacement: 'x'.repeat(129) }).toThrow(
        /redact\.replacement must be a string of at most 128 characters/,
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

    test('reports a corj complaint without the TypeError prefix', () => {
      let message = '';
      try {
        makeRedactionPolicy({ patterns: [/sk-[a-z]+/] });
      } catch (failure: unknown) {
        message = (failure as Error).message;
      }

      expect(message).toContain(
        'APPEX_INVALID_REDACTION_POLICY: redact.patterns must all be global',
      );
      expect(message).not.toContain('TypeError');
    });

    test('accepts an empty policy', () => {
      const report = makeDiagnosticReport(new Error('boom'), {
        redact: makeRedactionPolicy(),
      });

      expect(report.stack?.[0]).toBe('Error: boom');
    });

    test('rejects a redact option that is not a policy', () => {
      expect(() =>
        makeDiagnosticReport(new Error('boom'), {
          redact: {} as unknown as RedactionPolicy,
        }),
      ).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
      expect(() =>
        makePublicReport(new Error('boom'), {
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
        makeDiagnosticReport(new Error('boom'), {
          redact: hostile as unknown as RedactionPolicy,
        }),
      ).toThrow(code('APPEX_INVALID_REDACTION_POLICY'));
    });

    test('is unaffected by a matcher reused across calls', () => {
      // Several matching keys in one inspection: a stale `lastIndex` would let
      // the second and third escape.
      const policy = makeRedactionPolicy({
        keys: [/password/g],
        patterns: [/secret/g],
      });
      const make = () =>
        makeDiagnosticReport(
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
