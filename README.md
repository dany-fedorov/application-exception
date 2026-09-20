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
import { defineException, makeDiagnosticReport, makePublicReport } from 'application-exception';

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The requested tool is temporarily unavailable.',
    detailsSelector: ({ tool }) => ({ tool }),
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
  const diagnostic = makeDiagnosticReport(caught, { context: { runId: 'run-1' } });
  console.error(JSON.stringify(diagnostic)); // trusted sink only
  const response = makePublicReport(caught);
  console.log(JSON.stringify(response)); // safe for the agent
  console.log(response.occurrence_id === diagnostic.occurrence_id); // true
}
```

The response is:

```json
{
  "v": "appex/public/v4",
  "occurrence_id": "AE_01J8Z3C4V5X6Y7Z8A9B0C1D2E3",
  "fingerprint": "fp1_9f2a1c7d4e6b08315a2c9d7e4f60b183",
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
| Diagnostic | `makeDiagnosticReport(caught, options?)` | operators, logs | a corj report: stacks, messages, `as_json` of every enumerable property, nested causes under `children`; plus `occurrence_id`, `fingerprint`, `context`, `reporting_errors` |
| Public | `makePublicReport(caught, options?)` | agents, users, HTTP clients | `code`, `message`, `as_json` from the kind's `public` policy; plus `occurrence_id`, and `fingerprint` when the hash is backed by real stack frames |
| Both | `makeReportPair(caught, options?)` | one boundary | `{ occurrence_id, diagnostic, public }` derived from a single occurrence; each report is fingerprinted by its own bag, so the two agree when both bags carry the same `corj` and `redact` |

`occurrence_id` is the `occurrenceId` of a typed exception. Any other object
gets one generated id, remembered for the object, so both functions agree in
either order. A thrown primitive gets a fresh occurrence id on each call; pass
the same `options.occurrenceId` to both calls to correlate them, or call
`makeReportPair`, which resolves the occurrence once for both:

```ts
import { makeReportPair } from 'application-exception';

const caught: unknown = new Error('connection refused');
const reports = makeReportPair(caught, { diagnostic: { context: { runId: 'run-1' } } });
console.error(JSON.stringify(reports.diagnostic));
console.log(reports.public.occurrence_id === reports.diagnostic.occurrence_id); // true
```

### Diagnostic report

The diagnostic report is a corj report object (`v: "corj/v0.15"`). corj
documents every field, omits fields that hold their expected value, and bounds
the whole report (100,000 UTF-8 bytes by default). The root fields this package
relies on:

| Field | Meaning |
| --- | --- |
| `occurrence_id` | the occurrence id this package resolves, always present and never trimmed |
| `fingerprint` | corj's hash of the error graph's identifying parts — the constructor names and the stack text by default — equal for the same failure from the same place; `corj: { fingerprintParts: null }` turns it off. A public report carries it only when the hash is backed by real stack frames |
| `context` | present only when `options.context` is given: that value rendered as a JSON document of its own, rooted at `$context`, with a 16,384-byte cap inside the report budget; `null` if it could not be rendered |
| `reporting_errors` | present only when non-empty: up to 8 problems corj met while inspecting the value, each `{ stage, path, reportKey?, sourceProperty?, error }` |

Diagnostic CORJ options are reachable through one `corj` bag — including
`maxDepth`, `maxChildren`, `stackFormat`, `inspection`, `fingerprintParts`, and
`maxContextSize`. Whole-report size belongs to top-level `maxReportBytes`, its
unit is always UTF-8, and `redact` stays at the top level. Use
`Corj.restoreExpectedValues(report)` to fill omitted fields.

```ts
import { Corj, makeDiagnosticReport } from 'application-exception';

const report = makeDiagnosticReport(new Error('outer', { cause: new Error('inner') }), {
  corj: { maxDepth: 2 },
});
const full = Corj.restoreExpectedValues(report);
console.log(full.message, report.children?.[0]?.path); // 'outer' '$.cause'
```

By default corj runs `toString`, `toJSON`, and getters of the reported objects,
recording failures instead of throwing; `corj: { inspection: 'no-invoke' }`
reads property descriptors only and calls none of them. The report is for
trusted sinks either way: it contains messages, stacks, and `details`.

### Public report

The public report (`v: "appex/public/v4"`) keeps corj's field names and meanings
for `message`, `as_json`, and `truncated`. Nothing from the error is emitted
except the policy's outputs, `occurrence_id` and `fingerprint`, a hash. The
default recipe hashes the constructor names and the stack text of the error
graph, under this call's own `corj` options and `redact`, and
`corj: { fingerprintParts: null }` turns it off, after which nothing is read
from the error but the policy's inputs. **The public report carries a
fingerprint only when the hash is backed by real stack frames**: the recipe must
include `stack`, the root's stack must have been read, and after redaction and
the header cut it must still hold frames. A thrown string or number, a plain
object, an object with a `toString`, an `Error` whose stack is gone or is
frameless prose, and any recipe without `stack` — `['message']` included — get
**no** public fingerprint, because that hash would be over the value's own text
and a reader who can guess that text could confirm the guess. A stack-backed
hash still covers every other part of the recipe, so adding `message` to the
public bag's recipe puts the message into the hash next to the frames; frame
text is unguessable only to a reader who does not know the deployed source and
its paths.
Component limits are `message` 4,096 UTF-16 units and `as_json` 16,384 UTF-8
bytes. Top-level `maxReportBytes` can optionally cap the complete compact JSON
at 2,048 bytes or more; on overflow `as_json` is omitted whole before `message`
is shortened. Any cut sets `truncated: true`.

`occurrence_id` is a bounded printable-ASCII token, not trusted text: a branded
value that a caller never minted can choose its own, within
`/^[\x21-\x7e]{1,128}$/` (see
[docs/design/cross-copy-trust.md](docs/design/cross-copy-trust.md)). Treat it as
data — escape it when you render it, never interpolate it into markup, a shell
command, or an instruction to a model.

The `policyOverride` option overrides the kind's policy for this call, field by field:
`code`, `message` (a string or a function of the details) and `detailsSelector` (a
selector function, or `null` to disclose nothing — not even `as_json: null`). A
field left out keeps what the kind says, and a policy without `message` yields
the generic message.

```ts
import { defineException, makePublicReport } from 'application-exception';

const Unavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', detailsSelector: ({ tool }) => ({ tool }) },
});
const caught: unknown = new Unavailable({ details: { tool: 'search' } });
const report = makePublicReport(caught, {
  policyOverride: { message: 'Search is down.', detailsSelector: null },
});
console.log(report.code, report.message, 'as_json' in report); // 'TOOL_UNAVAILABLE' 'Search is down.' false
```

`decodePublicReport(value)` validates JSON received from another process and
returns `{ ok: true, report }` or `{ ok: false, reason, path }`. It accepts both
`appex/public/v4` and the `appex/public/v3` a 0.4 sender emits, and the decoded
report keeps the `v` it arrived with:

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

Four controls: report byte limits and three opt-in features that leave the default
behaviour unchanged when omitted.

**Bound the whole report.** Diagnostic `maxReportBytes` (a safe integer of at
least 512, or `null`) holds the diagnostic report to that many UTF-8 bytes of
compact JSON — the corj report, `context` and `reporting_errors` together. Over
budget, corj drops `context` whole, however small it is, and sets
`context_omitted: 'max_size'`; then drops `reporting_errors` and sets
`reporting_errors_omitted: 'max_size'`; only then does it trim error content.
`occurrence_id`, `fingerprint` and `v` are never trimmed, so a report always
identifies itself and correlates. Omitting it keeps CORJ's 100,000-byte default;
`null` explicitly disables only the total cap. Public `maxReportBytes` is
opt-in, has a 2,048-byte minimum, and also accepts `null`.

```ts
import { makeDiagnosticReport } from 'application-exception';

const caught: unknown = new Error('connection refused');
const report = makeDiagnosticReport(caught, {
  context: { runId: 'run-1' },
  maxReportBytes: 32_768,
});
console.log(new TextEncoder().encode(JSON.stringify(report)).byteLength <= 32_768); // true
```

**Redact once, everywhere.** A policy built by `makeRedactionPolicy` has two
kinds of rule. **Skip** rules (`keys`, `paths`) name properties that are never
read, so an excluded getter never runs. **Scrub** rules (`patterns`,
`transform`) rewrite text wherever it appears in either report. To remove a
secret's *text*, use `patterns`: skipping `message` still leaves it in `stack`.
`paths` address three documents — `$...` the caught value, `$context...` the
context, `$public...` the selected public details — so anchor a `RegExp` path
with `^\$\.` to keep it on the caught value. Redaction never discloses — on a
public report it runs on what the kind's `detailsSelector` returned. The
rule-by-rule table is in
[docs/agent/recipes.md](docs/agent/recipes.md#keep-secrets-out-of-both-reports);
the design is in [docs/design/redaction-policy.md](docs/design/redaction-policy.md).

```ts
import { makeRedactionPolicy, makeReportPair } from 'application-exception';

const caught: unknown = new Error('connection refused');
const redact = makeRedactionPolicy({ keys: ['password', /token$/i], patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g] });
makeReportPair(caught, { diagnostic: { redact }, public: { redact } });
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
its own public code. `makeTrustRealm()` is the explicit opt-in. The realm
object reference *is* the capability — nothing is matched by `_tag`, by the
global brand, or by any value read off the caught object, so a forged tag or a
report revived from JSON acquires nothing. `isTrustedException(caught, realm)` is
the realm-aware recognizer; `isTypedException` keeps its one-argument shape.

```ts
import { makeTrustRealm, defineException, makePublicReport } from 'application-exception';

const realm = makeTrustRealm();
const Timeout = defineException({
  tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm,
});
console.log(makePublicReport(new Timeout(), { realm }).code); // 'DB_TIMEOUT' across copies
```

## Runtime support

Node >= 18 (CommonJS, the published artifact), Node ESM, Bun, and browsers via a
bundler. Each is exercised against the packed artifact in CI; the measured
contract and its limits are in
[docs/runtime-support.md](docs/runtime-support.md).

## Schemas

`application-exception/schemas/diagnostic-report-v6.json` embeds corj v0.15's
report definitions and requires `v` and `occurrence_id`;
`application-exception/schemas/public-report-v4.json` is closed and carries the
optional `fingerprint`. Both are JSON Schema 2020-12. The earlier schemas stay
published unchanged for readers of older reports:
`diagnostic-report-v5.json` for 0.5.0 (`v: "corj/v0.14"`),
`diagnostic-report-v4.json` and `public-report-v3.json` for 0.4.0
(`v: "corj/v0.13"`, `appex/public/v3`), and `diagnostic-report-v3.json` for
0.3.0 (`v: "corj/v0.12"`).

## Validate a change

```sh
npm ci
npm run test:all
```

`test:all` runs Jest with a 100% coverage gate, the type tests, the build, the
packed-package smoke test, and the documentation checks. Run
`npm run docs:generate` after editing JSDoc in `src/`.

[npm package](https://www.npmjs.com/package/application-exception) · [MIT](LICENSE)
