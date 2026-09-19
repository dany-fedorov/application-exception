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
failures produce `INTERNAL_ERROR` with the same correlation. To say something
else at this one call, pass `public: { code, message, details }`: it is laid
over the kind's policy field by field, and `details: null` discloses nothing.

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
    corj: { maxReportSize: 32_768, maxDepth: 3 },
  });
  return JSON.stringify(report);
}
```

`context` is rendered by corj as a JSON document of its own, rooted at
`$context`, capped at 16,384 bytes by `corj: { maxContextSize }` and counted
inside `corj: { maxReportSize }`, which bounds the report as a whole. It appears
as `report.context`; a value corj cannot render becomes `null` with an entry in
`report.reporting_errors`. Every corj option — `maxReportSize`, `maxDepth`,
`maxChildren`, `stackFormat`, `inspection` and the rest — lives in the `corj`
bag; only `redact` stays at the top level, because both reports share it.

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

## Stop a retry loop on a repeated failure

```ts
import { decodePublicReport } from 'application-exception';

type Attempt = { retry: true } | { retry: false; reason: string };

export function nextAttempt(received: unknown, seen: Set<string>): Attempt {
  const decoded = decodePublicReport(received);
  if (!decoded.ok) return { retry: false, reason: `${decoded.reason} at ${decoded.path}` };
  const { fingerprint } = decoded.report;
  if (fingerprint === undefined) return { retry: true };
  if (seen.has(fingerprint)) return { retry: false, reason: `the same failure again: ${fingerprint}` };
  seen.add(fingerprint);
  return { retry: true };
}
```

`fingerprint` is a hash of the failure's identifying parts — by default the
constructor name and the stack text of every node of the error graph — so two
reports with the same value describe the same failure from the same place. Equal
means retrying the same way will fail the same way: change the call or escalate.
Unequal means a different failure, not progress. It is a retry signal, not a
lookup key: `occurrence_id` is what you quote when escalating. It is absent when
the sender turned it off with `corj: { fingerprintParts: null }`, on a report of
format `appex/public/v3`, which predates it, and whenever the hash is not backed
by real stack frames.

Publishing a fingerprint publishes a hash of values the reader may be able to
guess, so **a public report carries one only when the hash is backed by real
stack frames**: the recipe must include `'stack'`, the root's stack must have
been read, and after redaction and the header cut it must still hold frames. A
thrown string or number, a plain object, an object with a `toString`, an `Error`
whose stack is gone or is frameless prose, and any recipe without `'stack'` —
`corj: { fingerprintParts: ['message'] }` included — publish none, because such
a hash is over the value's own text and a reader who guesses the text confirms
it. A stack-backed hash still covers every other part of the recipe, so adding
`'message'` to the public bag's recipe puts the message into the hash next to
the frames; frame text is unguessable only to a reader who does not know the
deployed source and its paths.

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
bag is read and validated before either report is built, so the call never
returns half a pair. Each report's fingerprint is computed by its own bag, so
the two agree whenever both bags carry the same `corj` options and `redact`;
`public: { corj: { fingerprintParts: null } }` withholds the published hash on
its own, and so does a hash that is not backed by real stack frames.

## Bound what a sink receives

```ts
import { toDiagnosticReport } from 'application-exception';

const caught: unknown = new Error('connection refused');
const report = toDiagnosticReport(caught, {
  context: { runId: 'run-1' },
  corj: { maxReportSize: 16_384 },
});
console.log(new TextEncoder().encode(JSON.stringify(report)).byteLength <= 16_384); // true
console.log(report.context_omitted); // 'max_size' when the context did not fit
```

`corj: { maxReportSize }` bounds the UTF-8 bytes of the whole compact report,
`context` and `reporting_errors` included. Over budget, corj drops `context`
whole — however small it is — and sets `context_omitted: 'max_size'`; then drops
`reporting_errors` and sets `reporting_errors_omitted: 'max_size'`; only then
does it trim error content. `occurrence_id`, `fingerprint` and `v` are never
trimmed, so even the smallest report identifies itself and correlates. The
budget is a safe integer of at least 512, or `null` for no bound; corj's default
is 100,000 bytes.

## Report an untrusted failure without running it

```ts
import { toDiagnosticReport } from 'application-exception';

export function reportUntrusted(caught: unknown, runId: string): string {
  const report = toDiagnosticReport(caught, {
    context: { runId },
    corj: { inspection: 'no-invoke' },
  });
  return JSON.stringify(report);
}
```

Describing a caught value normally runs some of its code: reading `message`
calls a getter if one is defined, `as_string` calls `toString`, `as_json` calls
`toJSON`. `corj: { inspection: 'no-invoke' }` reads values off property
descriptors and calls none of those hooks, so a value that crossed a plugin, a
worker or a network boundary cannot execute at the reporting boundary. Content
that exists but was not read becomes `"[not-inspected]"` — distinct from an
absent field, which the value never had, and from `null`, which means producing
it threw — and a children source behind a getter yields
`children_omitted: 'not_inspected'`. `inspection` and `redact` compose: `redact`
decides what may be reported, `inspection` how much may run to report it.

## Keep secrets out of both reports

```ts
import { createRedactionPolicy, defineException, toReports } from 'application-exception';

const redact = createRedactionPolicy({
  keys: ['password', /token$/i],
  patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
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

Build the policy once and pass it to both reports. It has two kinds of rule.
**Skip** rules (`keys`, `paths`) name properties that are never read, so their
getters never run. **Scrub** rules (`patterns`, `transform`) rewrite text
wherever it appears in either report.

| To… | Use | Reach |
| --- | --- | --- |
| remove a secret's text wherever it shows up | `patterns: [/\bsk-\w+/g]` | strings and property names in both reports: message, stack, `as_json`, `context`, `reporting_errors`, nested causes |
| never read a property, wherever it appears | `keys: ['password', /token$/i]` | the name, in the caught value, `context`, and selected public details |
| never read one named property, in one document | `paths: ['$.cause.config.headers', '$context.user.email']` | three documents: `$...` the caught value, `$context...` the context, `$public...` the selected public details |
| decide value by value | `transform: (value, { prop }) => value` | runs after `patterns` on every value and property name; return `undefined` to drop the field |

Six things to remember:

1. **Skipping a property does not remove its text elsewhere.** An error's message
   is also in its `stack`, so `keys: ['message']` leaves it there. To remove
   text, use `patterns`.
2. **A skip rule hides the value, not the name.** `keys: [/^sk-/]` gives
   `{ "sk-live-abc": "[redacted]" }`. A secret *name* needs `patterns`.
3. **Every pattern needs the `g` flag**, and `replacement` (default `[redacted]`)
   is inserted literally: `$&` is not expanded.
4. **An unanchored `RegExp` path reaches all three documents.** `/\.headers$/`
   now also matches inside `$context` and `$public`. That direction fails safe —
   more is redacted, not less — but anchor it with `^\$\.` to keep the rule on
   the caught value.
5. **A 0.4 `transform` keyed on `path` or `stage` fails open on 0.5.** 0.4
   offered context values at `$.<key>` and the public message as
   `stage: 'as_string'`, `path: '$.message'`; 0.5 roots context values at
   `$context.<key>`, selected public details at `$public.<key>`, and delivers
   the public message as `stage: 'warning'` at `$public.message`. Keyed on the
   old values a rule stops matching and nothing is redacted, silently. Re-key it
   on `prop`, which did not change, or on the new roots and stage.
6. **Redaction never discloses.** On a public report the policy is given only
   what the kind's `details` selector returned. `code` is an identifier you
   choose and no rule rewrites it; `occurrence_id` is not rewritten either, and a
   branded value this process did not mint can choose its own within
   `/^[\x21-\x7e]{1,128}$/`. Treat it as data: escape it when you render it,
   never interpolate it into markup or into an instruction to a model.

A `transform` sees raw input — whole objects, including members a skip rule
excludes — so key it on `prop` and never quote its input in an error. If the
policy throws, the value becomes the replacement and the diagnostic report lists
the failure in `reporting_errors` with `stage: 'redact'`; the thrown message is
withheld, because it may quote what the policy was protecting. `toReports`
redacts each report with the policy in its own bag, so pass `redact` in both.

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
