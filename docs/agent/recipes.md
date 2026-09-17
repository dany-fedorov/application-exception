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
console.log(error._tag, error.details.retryAfterSeconds, error.occurrenceId);
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

Both calls take the same `caught`; the reports share `occurrence_id`. For a
thrown primitive, pass the same `occurrenceId` option to both calls. Unknown
failures
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

type Action = { action: 'retry'; remaining: number } | { action: 'escalate'; occurrenceId: string; reason: string };

export function decide(received: unknown, retryable: readonly string[], remaining: number): Action {
  const decoded = decodePublicReport(received);
  if (!decoded.ok) return { action: 'escalate', occurrenceId: 'unavailable', reason: `${decoded.reason} at ${decoded.path}` };
  const { code, occurrence_id: occurrenceId } = decoded.report;
  if (!retryable.includes(code)) return { action: 'escalate', occurrenceId, reason: `unknown code ${code}` };
  if (remaining <= 0) return { action: 'escalate', occurrenceId, reason: 'retry budget exhausted' };
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
assert.equal(response.occurrence_id, diagnostic.occurrence_id);
assert.equal(restoreExpectedValues(diagnostic).message, 'Timed out after 500ms');
assert.equal(diagnostic.children?.[0]?.path, '$.cause');
assert.ok(!JSON.stringify(response).includes('socket hang up'));
```

Assert on `code`, `occurrence_id`, `as_json`, and `children`; do not assert on
stack lines. Use `restoreExpectedValues` when you need omitted corj fields.

## Capture both reports as one occurrence

```ts
import { toReports } from 'application-exception';
import type { PublicReport } from 'application-exception';

export function boundary(run: () => string, runId: string): { ok: true; value: string } | { ok: false; response: PublicReport } {
  try {
    return { ok: true, value: run() };
  } catch (caught: unknown) {
    const reports = toReports(caught, { diagnostic: { context: { runId } } });
    console.error(JSON.stringify(reports.diagnostic));
    return { ok: false, response: reports.public };
  }
}
```

One occurrence is resolved for both reports, so `occurrence_id` matches for any
caught value — a thrown string or `undefined` included, where two separate calls
would each mint their own. Per-report options live in `options.diagnostic` and
`options.public`; `options.occurrenceId` overrides the id for both. Every option
bag is validated before either report is built, so the call never returns half a
pair.

## Bound what a sink receives

```ts
import { toDiagnosticReport } from 'application-exception';

const caught: unknown = new Error('connection refused');
const report = toDiagnosticReport(caught, {
  context: { runId: 'run-1' },
  maxFinalReportSize: 16_384,
});
console.log(new TextEncoder().encode(JSON.stringify(report)).byteLength <= 16_384); // true
console.log(report.report_omitted); // e.g. ['context'] when it did not fit
```

`maxFinalReportSize` bounds the UTF-8 bytes of the whole compact report, not
just corj's part. It drops `context`, then `reporting_errors`, naming each in
`report_omitted`, then halves corj's own budget until the report fits. A budget
too small for the required envelope throws `APPEX_REPORT_BUDGET_TOO_SMALL`
rather than emitting an over-budget or invalid report. Omit the option to keep
the unbounded 0.3.0 behaviour.

## Keep secrets out of both reports

```ts
import { createRedactionPolicy, defineException, toReports } from 'application-exception';

const redact = createRedactionPolicy({
  keys: ['password', /token$/i],
  values: [/\bsk-[A-Za-z0-9]{8,}\b/],
});

const Rejected = defineException({
  tag: 'auth/Rejected',
  message: ({ user }: { user: string; password: string }) => `Rejected ${user}`,
  public: { code: 'AUTH_REJECTED', details: ({ user, password }) => ({ user, password }) },
});

const reports = toReports(new Rejected({ details: { user: 'ada', password: 'hunter2' } }), {
  diagnostic: { redact },
  public: { redact },
});
console.log(JSON.stringify(reports).includes('hunter2')); // false
```

Build the policy once and share it. It covers messages, stacks, `as_json`,
`context`, `reporting_errors`, and nested causes. On a public report it runs
after the kind's `details` selector, so it can only narrow what was already
selected — it is not a way to disclose a field the selector left out. Identity
and shape fields are never rewritten, so a redacted report still validates
against its schema. A `transform` that throws drops the value it was asked about
and records the failure in `reporting_errors`.

## Capture details that outlive the throw

```ts
import { defineException } from 'application-exception';

const JobFailed = defineException({
  tag: 'jobs/Failed',
  message: ({ job }: { job: { name: string } }) => `${job.name} failed`,
  snapshotDetails: true,
});

const job = { name: 'nightly' };
const failure = new JobFailed({ details: { job } });
job.name = 'renamed';
console.log(failure.details.job.name); // 'nightly'
```

Use this when reporting is deferred, when details cross an async boundary, or
when the caller keeps mutating the object it handed over. The snapshot accepts
primitives, plain objects, arrays, and `Date`, and rejects anything it cannot
capture faithfully — cycles, functions, accessors, non-enumerable properties,
class instances — as `APPEX_INVALID_DETAILS` naming the path, rather than
inventing details. The caller's own objects are never frozen. Without the option
the details stay shallow-frozen and share the caller's nested objects.

## Share typed failures between two loaded copies

```ts
import { createTrustRealm, defineException, isTrustedException, toPublicReport } from 'application-exception';

export const realm = createTrustRealm();

const Timeout = defineException({
  tag: 'db/Timeout',
  message: 'The database timed out',
  public: { code: 'DB_TIMEOUT', message: 'Try again shortly.' },
  realm,
});

const caught: unknown = new Timeout();
console.log(isTrustedException(caught, realm), toPublicReport(caught, { realm }).code);
```

A duplicate install or a separately bundled module loads its own copy of this
package, and copies do not recognize each other's occurrences by default: a
public policy decides what leaves the process, so a value that merely claims to
be typed must not pick its own code. Pass one realm to `defineException` in each
cooperating copy and to `isTrustedException`, `toPublicReport`, or `toReports`
in the copy that reports. `isTypedException` keeps its one-argument shape, so it
still works as an array callback; `isTrustedException` is the realm-aware form. Trust is keyed by object identity, so a forged `_tag` or
brand and a report revived from JSON acquire nothing. Deduplicating the install
is the simpler fix when you control it; it does not help across independently
bundled artifacts.
