import {
  toDiagnosticReport,
  toPublicReport,
  toReports,
} from '../src/reporting';
import { defineException } from '../src/typed';

const code = (value: string) => expect.objectContaining({ code: value });
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool, secret }: { tool: string; secret: string }) =>
    `Tool ${tool} is unavailable (${secret})`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: ({ tool }) => `${tool} is temporarily unavailable.`,
    details: ({ tool }) => ({ tool }),
  },
});

describe('toReports', () => {
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
      const captured = toReports(value);
      expect(captured.diagnostic.occurrence_id).toBe(
        captured.public.occurrence_id,
      );
      expect(captured.occurrence_id).toBe(captured.public.occurrence_id);
      expect(captured.occurrence_id.length).toBeGreaterThan(0);
      expect(captured.diagnostic.v).toBe('corj/v0.14');
      expect(captured.public.v).toBe('appex/public/v4');
    }
  });

  test('captures a primitive twice as two occurrences and an object once', () => {
    const first = toReports('socket closed');
    const second = toReports('socket closed');
    expect(first.occurrence_id).toMatch(/^AE_/);
    expect(second.occurrence_id).not.toBe(first.occurrence_id);

    const error = new Error('plain');
    expect(toReports(error).occurrence_id).toBe(toReports(error).occurrence_id);
    expect(toDiagnosticReport(error).occurrence_id).toBe(
      toReports(error).occurrence_id,
    );
    expect(toPublicReport(error).occurrence_id).toBe(
      toReports(error).occurrence_id,
    );
    const failure = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
    });
    expect(toReports(failure).occurrence_id).toBe(failure.occurrenceId);
  });

  test('applies an explicit occurrence id to both reports', () => {
    const captured = toReports('socket closed', { occurrenceId: 'trace-1' });
    expect(captured.occurrence_id).toBe('trace-1');
    expect(captured.diagnostic.occurrence_id).toBe('trace-1');
    expect(captured.public.occurrence_id).toBe('trace-1');
    for (const occurrenceId of ['', 'x'.repeat(129), 42, null]) {
      expect(() => toReports('x', { occurrenceId } as never)).toThrow(
        code('APPEX_INVALID_OCCURRENCE_ID'),
      );
    }
  });

  test('keeps each report exactly what its single-call function produces', () => {
    const error = new ToolUnavailable({
      details: { tool: 'search', secret: 'hunter2' },
      cause: new Error('postgres://user:hunter2@db'),
    });
    const captured = toReports(error, {
      diagnostic: {
        context: { runId: 'run-1' },
        corj: { maxReportSize: 4_096 },
      },
      public: { public: { message: 'Search is down.' } },
    });
    expect(captured.public).toEqual(
      toPublicReport(error, { public: { message: 'Search is down.' } }),
    );
    expect(captured.diagnostic).toEqual(
      toDiagnosticReport(error, {
        context: { runId: 'run-1' },
        corj: { maxReportSize: 4_096 },
      }),
    );
    expect(captured.public.code).toBe('TOOL_UNAVAILABLE');
    expect(captured.public.as_json).toEqual({ tool: 'search' });
    expect(JSON.stringify(captured.public)).not.toContain('hunter2');
    expect(JSON.stringify(captured.diagnostic)).toContain('hunter2');

    const generic = toReports(new Error('secret path'));
    expect(generic.public.code).toBe('INTERNAL_ERROR');
    expect(generic.public.message).toBe('Something went wrong');
  });

  test('accepts the per-report option bags', () => {
    const captured = toReports('socket closed', {
      diagnostic: {
        context: { runId: 'run-1' },
        corj: {
          maxDepth: 1,
          maxChildren: 2,
          maxReportSize: 2_048,
          stackFormat: 'string',
        },
      },
      public: {
        public: {
          code: 'SOCKET_CLOSED',
          message: 'Try again.',
          details: () => ({ a: 1 }),
        },
      },
    });
    expect(captured.diagnostic.context).toEqual({ runId: 'run-1' });
    expect(captured.public).toEqual({
      v: 'appex/public/v4',
      occurrence_id: captured.occurrence_id,
      fingerprint: expect.stringMatching(/^fp1_[0-9a-f]{32}$/),
      code: 'SOCKET_CLOSED',
      message: 'Try again.',
      as_json: { a: 1 },
    });
  });

  test('bounds the diagnostic report through the nested budget', () => {
    const captured = toReports(new Error('failure'), {
      diagnostic: {
        corj: { maxReportSize: 1024 },
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
      expect(() => toReports('x', options as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() => toReports('x', { context: {} } as never)).toThrow(
      /unknown option "context"; known options: occurrenceId, diagnostic, public/,
    );
    for (const bag of [null, [], 'x', 42]) {
      expect(() => toReports('x', { diagnostic: bag } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
      expect(() => toReports('x', { public: bag } as never)).toThrow(
        code('APPEX_INVALID_OPTIONS'),
      );
    }
    expect(() =>
      toReports('x', { diagnostic: { occurrenceId: 'a' } } as never),
    ).toThrow(
      /unknown option "occurrenceId"; known options: context, redact, corj/,
    );
    expect(() =>
      toReports('x', { public: { occurrenceId: 'a' } } as never),
    ).toThrow(
      /unknown option "occurrenceId"; known options: public, redact, realm, corj/,
    );
    expect(() => toReports('x', { publi: { message: 'a' } } as never)).toThrow(
      code('APPEX_INVALID_OPTIONS'),
    );
  });

  test('throws instead of returning half a pair', () => {
    const error = new Error('plain');
    expect(() =>
      toReports(error, { public: { public: { message: 42 } } as never }),
    ).toThrow(code('APPEX_INVALID_PUBLIC_MESSAGE'));
    expect(() =>
      toReports(error, { public: { public: { code: '' } } }),
    ).toThrow(code('APPEX_INVALID_PUBLIC_CODE'));
    expect(() =>
      toReports(error, { diagnostic: { corj: { maxDepth: -1 } } }),
    ).toThrow(RangeError);
    expect(() =>
      toReports(error, { diagnostic: { corj: { maxReportSize: 100 } } }),
    ).toThrow(RangeError);
  });
});

describe('toReports shares one fingerprint', () => {
  test('the public report copies the diagnostic one', () => {
    const { diagnostic, public: disclosed } = toReports(
      new Error('x', { cause: new Error('y') }),
      { diagnostic: { corj: { maxDepth: 1 } } },
    );
    expect(disclosed.fingerprint).toBe(diagnostic.fingerprint);
    expect(disclosed.fingerprint).toMatch(/^fp1_/);
  });

  test('off in the diagnostic report means off in both', () => {
    const { diagnostic, public: disclosed } = toReports(new Error('x'), {
      diagnostic: { corj: { fingerprintParts: null } },
    });
    expect(diagnostic).not.toHaveProperty('fingerprint');
    expect(disclosed).not.toHaveProperty('fingerprint');
  });
});
