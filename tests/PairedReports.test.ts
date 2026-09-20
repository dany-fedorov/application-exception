import {
  makeDiagnosticReport,
  makePublicReport,
  makeReportPair,
} from '../src/reporting';
import { makeRedactionPolicy } from '../src/redaction';
import { defineException } from '../src/typed';

const code = (value: string) => expect.objectContaining({ code: value });
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

class SecretNamedFailure extends Error {}

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool, secret }: { tool: string; secret: string }) =>
    `Tool ${tool} is unavailable (${secret})`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: ({ tool }) => `${tool} is temporarily unavailable.`,
    detailsSelector: ({ tool }) => ({ tool }),
  },
});

describe('makeReportPair', () => {
  test('gives both reports of one capture the same occurrence id', () => {
    const caught: readonly unknown[] = [
      'socket closed',
      42,
      null,
      undefined,
      10n,
      Symbol('boom'),
      new Error('plain'),
      new ToolUnavailable({ details: { tool: 'search', secret: 'hunter2' } }),
      { code: 'E_PLAIN' },
      function failed() {
        return undefined;
      },
    ];
    for (const value of caught) {
      const captured = makeReportPair(value);
      expect(captured.diagnostic.occurrence_id).toBe(
        captured.public.occurrence_id,
      );
      expect(captured.occurrence_id).toBe(captured.public.occurrence_id);
      expect(captured.occurrence_id.length).toBeGreaterThan(0);
      expect(captured.diagnostic.v).toBe('corj/v0.15');
      expect(captured.public.v).toBe('appex/public/v4');
    }
  });

  test('captures a primitive twice as two occurrences and an object once', () => {
    const first = makeReportPair('socket closed');
    const second = makeReportPair('socket closed');
    expect(first.occurrence_id).toMatch(/^AE_/);
    expect(second.occurrence_id).not.toBe(first.occurrence_id);

    const error = new Error('plain');
    expect(makeReportPair(error).occurrence_id).toBe(
      makeReportPair(error).occurrence_id,
    );
    expect(makeDiagnosticReport(error).occurrence_id).toBe(
      makeReportPair(error).occurrence_id,
    );
    expect(makePublicReport(error).occurrence_id).toBe(
      makeReportPair(error).occurrence_id,
    );
    const failure = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
    });
    expect(makeReportPair(failure).occurrence_id).toBe(failure.occurrenceId);
  });

  test('applies an explicit occurrence id to both reports', () => {
    const captured = makeReportPair('socket closed', {
      occurrenceId: 'trace-1',
    });
    expect(captured.occurrence_id).toBe('trace-1');
    expect(captured.diagnostic.occurrence_id).toBe('trace-1');
    expect(captured.public.occurrence_id).toBe('trace-1');
    for (const occurrenceId of ['', 'x'.repeat(129), 42, null]) {
      expect(() => makeReportPair('x', { occurrenceId } as never)).toThrow(
        code('APPEX_INVALID_OCCURRENCE_ID'),
      );
    }
  });

  test('keeps each report exactly what its single-call function produces', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
      cause: new Error('postgres://user:hunter2@db'),
    });
    const captured = makeReportPair(error, {
      diagnostic: {
        context: { runId: 'run-1' },
        maxReportBytes: 4_096,
      },
      public: { policyOverride: { message: 'Search is down.' } },
    });
    expect(captured.public).toEqual(
      makePublicReport(error, {
        policyOverride: { message: 'Search is down.' },
      }),
    );
    expect(captured.diagnostic).toEqual(
      makeDiagnosticReport(error, {
        context: { runId: 'run-1' },
        maxReportBytes: 4_096,
      }),
    );
    expect(captured.public.code).toBe('TOOL_UNAVAILABLE');
    expect(captured.public.as_json).toEqual({ tool: 'search' });
    expect(JSON.stringify(captured.public)).not.toContain('hunter2');
    expect(JSON.stringify(captured.diagnostic)).toContain('hunter2');

    const generic = makeReportPair(new Error('secret path'));
    expect(generic.public.code).toBe('INTERNAL_ERROR');
    expect(generic.public.message).toBe('Something went wrong');
  });

  test('accepts the per-report option bags', () => {
    const captured = makeReportPair('socket closed', {
      diagnostic: {
        context: { runId: 'run-1' },
        corj: {
          maxDepth: 1,
          maxChildren: 2,
          stackFormat: 'string',
        },
        maxReportBytes: 2_048,
      },
      public: {
        policyOverride: {
          code: 'SOCKET_CLOSED',
          message: 'Try again.',
          detailsSelector: () => ({ a: 1 }),
        },
      },
    });
    expect(captured.diagnostic.context).toEqual({ runId: 'run-1' });
    // A thrown string has no stack, so the public report carries no fingerprint.
    expect(captured.public).toEqual({
      v: 'appex/public/v4',
      occurrence_id: captured.occurrence_id,
      code: 'SOCKET_CLOSED',
      message: 'Try again.',
      as_json: { a: 1 },
    });
  });

  test('bounds the diagnostic report through the nested budget', () => {
    const captured = makeReportPair(new Error('failure'), {
      diagnostic: {
        maxReportBytes: 1024,
        context: { text: 'x'.repeat(12_000) },
      },
    });
    expect(bytes(captured.diagnostic)).toBeLessThanOrEqual(1024);
    expect(captured.diagnostic.context_omitted).toBe('max_size');
    expect(captured.diagnostic.occurrence_id).toBe(
      captured.public.occurrence_id,
    );
  });

  test('validates every option bag before building a report', () => {
    for (const options of [null, [], 'x', 42]) {
      expect(() => makeReportPair('x', options as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() => makeReportPair('x', { context: {} } as never)).toThrow(
      /unknown option "context"; known options: occurrenceId, diagnostic, public/,
    );
    for (const bag of [null, [], 'x', 42]) {
      expect(() => makeReportPair('x', { diagnostic: bag } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
      expect(() => makeReportPair('x', { public: bag } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() =>
      makeReportPair('x', { diagnostic: { occurrenceId: 'a' } } as never),
    ).toThrow(
      /unknown option "occurrenceId"; known options: context, redact, corj, maxReportBytes/,
    );
    expect(() =>
      makeReportPair('x', { public: { occurrenceId: 'a' } } as never),
    ).toThrow(
      /unknown option "occurrenceId"; known options: policyOverride, redact, realm, corj, maxReportBytes/,
    );
    expect(() =>
      makeReportPair('x', { publi: { message: 'a' } } as never),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
  });

  test('reads the public override once and builds both reports from it', () => {
    let reads = 0;
    const captured = makeReportPair(new Error('plain'), {
      public: {
        policyOverride: {
          get code(): string {
            return reads++ === 0 ? 'FIRST_READ' : ({ evil: 1 } as never);
          },
        },
      },
    });
    expect(reads).toBe(1);
    expect(captured.public.code).toBe('FIRST_READ');
    expect(captured.diagnostic.occurrence_id).toBe(
      captured.public.occurrence_id,
    );
  });

  test('throws instead of returning half a pair', () => {
    const error = new Error('plain');
    expect(() =>
      makeReportPair(error, {
        public: { policyOverride: { message: 42 } } as never,
      }),
    ).toThrow(code('APPEX_INVALID_PUBLIC_MESSAGE'));
    expect(() =>
      makeReportPair(error, { public: { policyOverride: { code: '' } } }),
    ).toThrow(code('APPEX_INVALID_PUBLIC_CODE'));
    expect(() =>
      makeReportPair(error, { diagnostic: { corj: { maxDepth: -1 } } }),
    ).toThrow(RangeError);
    expect(() =>
      makeReportPair(error, { diagnostic: { maxReportBytes: 100 } }),
    ).toThrow(code('APPEX_INVALID_OPTIONS'));
    expect(() =>
      makeReportPair(error, { public: { realm: {} as never } }),
    ).toThrow(code('APPEX_INVALID_TRUST_REALM'));
  });

  test('a bad bag is rejected before any report work, realm included', () => {
    let ran = 0;
    class Counting extends Error {
      override get name() {
        ran++;
        return 'Counting';
      }
    }
    const caught = new Counting('plain');
    const before = ran; // V8 may read `name` while constructing the error

    expect(() =>
      makeReportPair(caught, { public: { realm: {} as never } }),
    ).toThrow(code('APPEX_INVALID_TRUST_REALM'));

    // The diagnostic report reads `name`; nothing was built before the throw.
    expect(ran).toBe(before);
  });

  test('reads every option of every bag exactly once, before either report', () => {
    const reads: string[] = [];
    const diagnosticBag = {
      get corj() {
        reads.push('diagnostic.corj');
        return { maxDepth: 1 };
      },
      get redact() {
        reads.push('diagnostic.redact');
        return undefined;
      },
      get context() {
        reads.push('diagnostic.context');
        return { runId: 'run-1' };
      },
    };
    const publicBag = {
      get policyOverride() {
        reads.push('public.policyOverride');
        return { code: 'ONCE' };
      },
      get corj() {
        reads.push('public.corj');
        return {};
      },
      get redact() {
        reads.push('public.redact');
        return undefined;
      },
      get realm() {
        reads.push('public.realm');
        return undefined;
      },
    };

    const captured = makeReportPair(new Error('plain'), {
      get occurrenceId() {
        reads.push('occurrenceId');
        return 'trace-once';
      },
      get diagnostic() {
        reads.push('diagnostic');
        return diagnosticBag;
      },
      get public() {
        reads.push('public');
        return publicBag;
      },
    });

    // The order is the contract: both bags are read and validated up front, and
    // no report is built from a second read.
    expect(reads).toEqual([
      'diagnostic',
      'public',
      'public.policyOverride',
      'public.corj',
      'public.redact',
      'public.realm',
      'diagnostic.corj',
      'diagnostic.redact',
      'diagnostic.context',
      'occurrenceId',
    ]);
    expect(captured.occurrence_id).toBe('trace-once');
    expect(captured.public.code).toBe('ONCE');
    expect(captured.diagnostic.context).toEqual({ runId: 'run-1' });
  });
});

describe('makeReportPair fingerprints each report from its own bag', () => {
  test('the same corj and redact in both bags agree', () => {
    const corj = { maxDepth: 1 };
    const redact = makeRedactionPolicy({ patterns: [/sk-[a-z]{10}/g] });
    const { diagnostic, public: disclosed } = makeReportPair(
      new Error('key sk-abcdefghij', { cause: new Error('y') }),
      { diagnostic: { corj, redact }, public: { corj, redact } },
    );
    expect(disclosed.fingerprint).toBe(diagnostic.fingerprint);
    expect(disclosed.fingerprint).toMatch(/^fp1_/);
  });

  test('the public bag turns the published hash off on its own', () => {
    const { diagnostic, public: disclosed } = makeReportPair(new Error('x'), {
      public: { corj: { fingerprintParts: null } },
    });
    expect(diagnostic.fingerprint).toMatch(/^fp1_/);
    expect(disclosed).not.toHaveProperty('fingerprint');
  });

  test('off in the diagnostic bag alone leaves the public hash standing', () => {
    const { diagnostic, public: disclosed } = makeReportPair(new Error('x'), {
      diagnostic: { corj: { fingerprintParts: null } },
    });
    expect(diagnostic).not.toHaveProperty('fingerprint');
    expect(disclosed.fingerprint).toMatch(/^fp1_/);
  });

  test('a value with no stack gets a diagnostic hash and no public one', () => {
    const { diagnostic, public: disclosed } = makeReportPair('socket closed');
    expect(diagnostic.fingerprint).toMatch(/^fp1_/);
    expect(disclosed).not.toHaveProperty('fingerprint');
  });

  test('redact on the public bag alone hashes under that policy', () => {
    // The policy scrubs the constructor name, which the default recipe hashes;
    // the stack keeps its frames, so the public hash is still published.
    const caught = new SecretNamedFailure('boom');
    const redact = makeRedactionPolicy({ patterns: [/Secret/g] });
    const { diagnostic, public: disclosed } = makeReportPair(caught, {
      public: { redact },
    });
    expect(disclosed.fingerprint).toBe(
      makePublicReport(caught, { redact }).fingerprint,
    );
    expect(disclosed.fingerprint).not.toBe(diagnostic.fingerprint);
  });
});
