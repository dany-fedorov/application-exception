# application-exception

Typed failures with two reports for TypeScript services and agent harnesses: a
[caught-object-report-json](https://www.npmjs.com/package/caught-object-report-json)
diagnostic report for operators and a selected public report for agents and
users, both carrying the same `occurrence_id`.

[Agent guide](AGENTS.md) · [API card](docs/agent/api-card.md) · [Recipes](docs/agent/recipes.md) · [Errors](docs/agent/errors.md) · [Changelog](CHANGELOG.md)

## Install

```sh
npm install application-exception
```

Node.js 18 or newer. CommonJS with TypeScript declarations. Runtime
dependencies: `caught-object-report-json` and `nanoid`.

## Quick start

Define a kind with typed details and a public policy. At the boundary, report
the caught value twice: once for the trusted sink, once for the response.

```ts
import { defineException, toDiagnosticReport, toPublicReport } from 'application-exception';

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The requested tool is temporarily unavailable.',
    details: ({ tool }) => ({ tool }),
  },
});

function runSearch(): never {
  throw new ToolUnavailable({
    details: { tool: 'search' },
    cause: new Error('connect ECONNREFUSED 10.0.0.7:5432'),
  });
}

try {
  runSearch();
} catch (caught: unknown) {
  const diagnostic = toDiagnosticReport(caught, { context: { runId: 'run-1' } });
  console.error(JSON.stringify(diagnostic)); // trusted sink only
  const response = toPublicReport(caught);
  console.log(JSON.stringify(response)); // safe for the agent
  console.log(response.occurrence_id === diagnostic.occurrence_id); // true
}
```

The response is:

```json
{
  "v": "appex/public/v3",
  "occurrence_id": "AE_01J8Z3C4V5X6Y7Z8A9B0C1D2E3",
  "code": "TOOL_UNAVAILABLE",
  "message": "The requested tool is temporarily unavailable.",
  "as_json": { "tool": "search" }
}
```

A caught value without a policy, including a plain `Error`, produces
`code: "INTERNAL_ERROR"` and `message: "Something went wrong"` with the same
`occurrence_id` as its diagnostic report. Nothing is disclosed by accident.

## Two reports, one occurrence id

| Report | Function | Audience | Content |
| --- | --- | --- | --- |
| Diagnostic | `toDiagnosticReport(caught, options?)` | operators, logs | a corj report: stacks, messages, `as_json` of every enumerable property, nested causes under `children`; plus `occurrence_id`, `context`, `reporting_errors` |
| Public | `toPublicReport(caught, options?)` | agents, users, HTTP clients | `code`, `message`, `as_json` from the kind's `public` policy; plus `occurrence_id` |
| Both | `toReports(caught, options?)` | one boundary | `{ occurrence_id, diagnostic, public }` derived from a single occurrence |

`occurrence_id` is the `occurrenceId` of a typed exception. Any other object
gets one generated id, remembered for the object, so both functions agree in
either order. A thrown primitive gets a fresh occurrence id on each call; pass
the same `options.occurrenceId` to both calls to correlate them, or call
`toReports`, which resolves the occurrence once for both:

```ts
import { toReports } from 'application-exception';

const caught: unknown = new Error('connection refused');
const reports = toReports(caught, { diagnostic: { context: { runId: 'run-1' } } });
console.error(JSON.stringify(reports.diagnostic));
console.log(reports.public.occurrence_id === reports.diagnostic.occurrence_id); // true
```

### Diagnostic report

The diagnostic report is a corj report object (`v: "corj/v0.12"`). corj
documents every field, omits fields that hold their expected value, and bounds
the whole report (100,000 bytes by default). This package adds:

| Field | Meaning |
| --- | --- |
| `occurrence_id` | the occurrence id, always present |
| `context` | optional, present only when `options.context` is given: that value normalized by corj's serializer with a 16,384-byte budget; `null` if it could not be serialized |
| `reporting_errors` | optional, present only when non-empty: up to 8 problems corj met while inspecting the value, each `{ stage, path, key?, prop?, error }` |

Options `maxReportSize`, `maxDepth`, `maxChildren`, and `stackFormat` pass
through to corj. Use `restoreExpectedValues(report)` to fill omitted fields.

```ts
import { restoreExpectedValues, toDiagnosticReport } from 'application-exception';

const report = toDiagnosticReport(new Error('outer', { cause: new Error('inner') }), {
  maxDepth: 2,
});
const full = restoreExpectedValues(report);
console.log(full.message, report.children?.[0]?.path); // 'outer' '$.cause'
```

corj runs `toString`, `toJSON`, and getters of the reported objects and records
failures instead of throwing. The report is for trusted sinks: it contains
messages, stacks, and `details`.

### Public report

The public report keeps corj's field names and meanings for `message`,
`as_json`, and `truncated`, and nothing else from the error. Limits: `message`
4,096 UTF-16 units, `as_json` 16,384 bytes; cuts set `truncated: true`.
Per-call `options` override the policy: `code`, `message`, `details`, and
`occurrenceId`. A policy without `message` yields the generic message, and
`details: null` suppresses the policy's selection, yielding `as_json: null`.

`decodePublicReport(value)` validates JSON received from another process and
returns `{ ok: true, report }` or `{ ok: false, reason, path }`:

```ts
import { decodePublicReport } from 'application-exception';

const decoded = decodePublicReport(JSON.parse('{"v":"appex/public/v3","occurrence_id":"AE_1","code":"TOOL_UNAVAILABLE","message":"Retry later."}'));
if (decoded.ok && decoded.report.code === 'TOOL_UNAVAILABLE') {
  console.log('retry', decoded.report.occurrence_id);
}
```

## Define and handle kinds

```ts
import { defineException, isTypedException } from 'application-exception';

const InvalidBudget = defineException({
  tag: 'tools/InvalidBudget',
  idPrefix: 'TOOL_',
  message: ({ attempts }: { attempts: number }) => `Attempt budget must be positive; received ${attempts}`,
});
const Unavailable = defineException({ tag: 'service/Unavailable', message: 'Service unavailable' });

type ToolFailure = InstanceType<typeof InvalidBudget> | InstanceType<typeof Unavailable>;

function explain(error: ToolFailure): string {
  switch (error._tag) {
    case 'tools/InvalidBudget':
      return `Choose a positive budget; received ${error.details.attempts}`;
    case 'service/Unavailable':
      return 'Try again later';
  }
}

const caught: unknown = new InvalidBudget({ details: { attempts: -1 } });
if (caught instanceof InvalidBudget) console.log(explain(caught));
console.log(isTypedException(caught), new Unavailable().occurrenceId.startsWith('AE_'));
```

Each occurrence is a native `Error` with `_tag`, `occurrenceId`, `timestamp`,
shallow-frozen `details` (nested objects stay shared), and an optional `cause`
(two or more `causes` become an ordered `AggregateError`; one is installed
directly; an empty list installs nothing). Details are copied once and must be
data only. A message renderer that throws yields
`<tag> [message rendering failed: …]`.

Errors thrown by this package carry an `APPEX_*` code and a link to
[docs/agent/errors.md](docs/agent/errors.md).

## Bound, redact, snapshot, share

Four opt-in controls, each off by default and each leaving 0.3.0 behaviour
unchanged when omitted.

**Bound the whole report.** `maxFinalReportSize` holds the final diagnostic
report to that many UTF-8 bytes of compact JSON — corj report, `occurrence_id`,
`context`, and `reporting_errors` together. It drops `context`, then
`reporting_errors`, naming both in `report_omitted`, then shrinks corj's own
budget. A budget too small for the required envelope throws rather than emitting
an over-budget or invalid report.

```ts
import { toDiagnosticReport } from 'application-exception';

const caught: unknown = new Error('connection refused');
toDiagnosticReport(caught, { context: { runId: 'run-1' }, maxFinalReportSize: 32_768 });
```

**Redact once, everywhere.** A policy built by `createRedactionPolicy` applies
to messages, stacks, `as_json`, `context`, `reporting_errors`, and nested
causes. On a public report it runs *after* the kind's `details` selector, so it
can only narrow what was selected — redaction never authorizes disclosure.
Identity and shape fields are never rewritten, so a redacted report still
validates against its schema.

```ts
import { createRedactionPolicy, toReports } from 'application-exception';

const caught: unknown = new Error('connection refused');
const redact = createRedactionPolicy({ keys: ['password', /token$/i], values: [/\bsk-[A-Za-z0-9]{8,}\b/] });
toReports(caught, { diagnostic: { redact }, public: { redact } });
```

**Snapshot the details.** By default `details` is shallow-frozen, so a caller
mutating a nested object changes what a later report describes. `snapshotDetails`
captures a deep frozen copy at construction instead, and rejects content it
cannot capture faithfully — cycles, functions, accessors, class instances —
rather than inventing it.

```ts
import { defineException } from 'application-exception';

const Failed = defineException({
  tag: 'jobs/Failed',
  message: ({ job }: { job: { name: string } }) => `${job.name} failed`,
  snapshotDetails: true,
});
const job = { name: 'nightly' };
const failure = new Failed({ details: { job } });
job.name = 'renamed';
console.log(failure.details.job.name); // 'nightly'
```

**Share trust between copies.** Two separately loaded copies of this package do
not recognize each other's occurrences, by design: a disclosure policy decides
what leaves the process, so a value that merely claims to be typed must not pick
its own public code. `createTrustRealm()` is the explicit opt-in. The realm
object reference *is* the capability — nothing is matched by `_tag`, by the
global brand, or by any value read off the caught object, so a forged tag or a
report revived from JSON acquires nothing. `isTrustedException(caught, realm)` is
the realm-aware recognizer; `isTypedException` keeps its one-argument shape.

```ts
import { createTrustRealm, defineException, toPublicReport } from 'application-exception';

const realm = createTrustRealm();
const Timeout = defineException({
  tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm,
});
console.log(toPublicReport(new Timeout(), { realm }).code); // 'DB_TIMEOUT' across copies
```

## Runtime support

Node >= 18 (CommonJS, the published artifact), Node ESM, Bun, and browsers via a
bundler. Each is exercised against the packed artifact in CI; the measured
contract and its limits are in
[docs/runtime-support.md](docs/runtime-support.md).

## Schemas

`application-exception/schemas/diagnostic-report-v3.json` embeds corj v0.12's
report definitions and adds the extension fields;
`application-exception/schemas/public-report-v3.json` is closed. Both are JSON
Schema 2020-12.

## Validate a change

```sh
npm ci
npm run test:all
```

`test:all` runs Jest with a 100% coverage gate, the type tests, the build, the
packed-package smoke test, and the documentation checks. Run
`npm run docs:generate` after editing JSDoc in `src/`.

[npm package](https://www.npmjs.com/package/application-exception) · [MIT](LICENSE)
