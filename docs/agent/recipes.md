# Recipes

Each recipe is complete: copy the block, keep the imports. Rules are in
[AGENTS.md](../../AGENTS.md); signatures in [api-card.md](api-card.md).

## Define a kind with a public policy

```ts
import { defineException } from 'application-exception';

export const RateLimited = defineException({
  tag: 'llm/RateLimited',
  message: ({ model, retryAfterSeconds }: { model: string; retryAfterSeconds: number }) =>
    `Model ${model} is rate limited for ${retryAfterSeconds}s`,
  public: {
    code: 'RATE_LIMITED',
    message: 'The model is rate limited. Retry later.',
    details: ({ retryAfterSeconds }) => ({ retryAfterSeconds }),
  },
});

const error = new RateLimited({ details: { model: 'gpt', retryAfterSeconds: 30 } });
console.log(error._tag, error.details.retryAfterSeconds, error.id);
```

The renderer's parameter type is the details type. `public.details` sees the
same type and returns the JSON that becomes `as_json`. Omit `public` for kinds
that must stay internal.

## Handle a failure at a tool boundary

```ts
import { defineException, toDiagnosticReport, toPublicReport } from 'application-exception';
import type { PublicReport } from 'application-exception';

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', message: 'Try again later.', details: ({ tool }) => ({ tool }) },
});

function search(query: string): string[] {
  throw new ToolUnavailable({ details: { tool: 'search' }, cause: new Error(`refused for ${query}`) });
}

export function handleSearch(runId: string, query: string): { ok: true; value: string[] } | { ok: false; response: PublicReport } {
  try {
    return { ok: true, value: search(query) };
  } catch (caught: unknown) {
    console.error(JSON.stringify(toDiagnosticReport(caught, { context: { runId, query } })));
    return { ok: false, response: toPublicReport(caught) };
  }
}
```

Both calls take the same `caught`; the reports share `reference`. For a thrown
primitive, pass the same `reference` option to both calls. Unknown failures
produce `INTERNAL_ERROR` with the same correlation.

## Translate a lower-level failure

```ts
import { defineException } from 'application-exception';

const UserAlreadyExists = defineException({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }: { email: string }) => `An account already exists for ${email}`,
  public: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'An account with this email already exists.' },
});

class UniqueViolation extends Error {}

export function createAccount(insert: (email: string) => void, email: string): void {
  try {
    insert(email);
  } catch (caught: unknown) {
    if (caught instanceof UniqueViolation) {
      throw new UserAlreadyExists({ details: { email }, cause: caught });
    }
    throw caught;
  }
}
```

Translate only failures you recognize; rethrow the rest. The original stays
reachable as `error.cause` and appears in the diagnostic report as
`children[0]` with `path: "$.cause"`.

## Add context to diagnostics

```ts
import { toDiagnosticReport } from 'application-exception';

export function record(caught: unknown, runId: string, attempt: number): string {
  const report = toDiagnosticReport(caught, {
    context: { runId, attempt, host: process.env['HOSTNAME'] ?? 'unknown' },
    maxReportSize: 32_768,
    maxDepth: 3,
  });
  return JSON.stringify(report);
}
```

`context` is normalized by corj's serializer with a fixed 16,384-byte budget
and appears as `report.context`; that budget is independent of `maxReportSize`,
which bounds the report as a whole. A value the serializer cannot handle
becomes `null` with an entry in `report.reporting_errors`. `maxReportSize`,
`maxDepth`, `maxChildren`, and `stackFormat` are corj options.

## Recover from a public report

```ts
import { decodePublicReport } from 'application-exception';

type Action = { action: 'retry'; remaining: number } | { action: 'escalate'; reference: string; reason: string };

export function decide(received: unknown, retryable: readonly string[], remaining: number): Action {
  const decoded = decodePublicReport(received);
  if (!decoded.ok) return { action: 'escalate', reference: 'unavailable', reason: `${decoded.reason} at ${decoded.path}` };
  const { code, reference } = decoded.report;
  if (!retryable.includes(code)) return { action: 'escalate', reference, reason: `unknown code ${code}` };
  if (remaining <= 0) return { action: 'escalate', reference, reason: 'retry budget exhausted' };
  return { action: 'retry', remaining: remaining - 1 };
}
```

`code` selects the action; `message` never does. Carry the decremented budget
into the next attempt. The host owns idempotency and backoff.

## Test a failure path

```ts
import { strict as assert } from 'node:assert';
import { defineException, restoreExpectedValues, toDiagnosticReport, toPublicReport } from 'application-exception';

const Timeout = defineException({
  tag: 'tools/Timeout',
  message: ({ ms }: { ms: number }) => `Timed out after ${ms}ms`,
  public: { code: 'TIMEOUT', details: ({ ms }) => ({ ms }) },
});

const error = new Timeout({ details: { ms: 500 }, cause: new Error('socket hang up') });
const diagnostic = toDiagnosticReport(error);
const response = toPublicReport(error);

assert.equal(response.code, 'TIMEOUT');
assert.deepEqual(response.as_json, { ms: 500 });
assert.equal(response.reference, diagnostic.reference);
assert.equal(restoreExpectedValues(diagnostic).message, 'Timed out after 500ms');
assert.equal(diagnostic.children?.[0]?.path, '$.cause');
assert.ok(!JSON.stringify(response).includes('socket hang up'));
```

Assert on `code`, `reference`, `as_json`, and `children`; do not assert on
stack lines. Use `restoreExpectedValues` when you need omitted corj fields.
