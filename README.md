# application-exception

[![npm](https://img.shields.io/npm/v/application-exception)](https://www.npmjs.com/package/application-exception)

A small utility for the error-handling chores in a TypeScript service: define
an error kind in one call, get typed details and a stable tag, serialize any
caught value to bounded JSON, and decide once what a client is allowed to see.

- **One call per error kind.** `defineException({ tag, message })` returns a
  native `Error` subclass. No class body, no `super`, no prototype fixing.
- **Typed details, inferred.** The message renderer's parameter type is the
  details type: `new Kind({ details })` is checked, `caught.details` is typed
  after `instanceof`, and `_tag` is a literal, so a `switch` over kinds is
  exhaustive and `Effect.catchTag` works.
- **Id, timestamp, and cause on every occurrence.** `occurrenceId` and
  `timestamp` are set at construction; `cause`, or `causes` as an ordered
  `AggregateError`, is wired in.
- **Any caught value to JSON.** `makeDiagnosticReport(caught)` turns an
  `Error`, a thrown string, `undefined`, or an object with throwing getters
  into one bounded JSON report: stacks, cause chain under `children`, every
  enumerable property. Byte budget, depth, and child caps included.
- **A client-facing code without a rewrite.** Give a kind
  `public: { code, message, detailsSelector }` and `makePublicReport(caught)`
  produces what the client sees. Anything without a policy is
  `INTERNAL_ERROR`. Both reports share an `occurrence_id`.
- **Redact once.** One `makeRedactionPolicy({ keys, paths, patterns })` serves
  both reports: skip properties before they are read, scrub text wherever it
  appears, stacks included.
- **Group repeats.** `fingerprint` is equal for the same failure from the
  same place.
- **Guards you would forget.** A renderer that throws yields
  `<tag> [message rendering failed: …]` instead of a second exception inside
  your `catch`; `snapshotDetails` freezes a deep copy against later mutation;
  `inspection: 'no-invoke'` reports a hostile value without running its
  getters; `decodePublicReport` validates a report received as JSON.
- **Nothing exotic.** CommonJS, Node 18+, Bun, browsers via a bundler. Two
  runtime dependencies. JSON Schemas for both reports ship in the package.

[npm](https://www.npmjs.com/package/application-exception) · [Agent guide](AGENTS.md) · [API card](docs/agent/api-card.md) · [Recipes](docs/agent/recipes.md) · [Errors](docs/agent/errors.md) · [Examples](https://github.com/dany-fedorov/application-exception/blob/main/examples) · [Changelog](CHANGELOG.md)

## Quick start

```sh
npm install application-exception
```

Define a kind with typed details and a public policy. At the boundary, call
`makeReportPair` once and send each report to its audience. The docs import
the package as a namespace, `import * as AppEx`; named imports of the same
functions and types work too.

```ts
import * as AppEx from 'application-exception';

const ToolUnavailable = AppEx.defineException({
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
  const reports = AppEx.makeReportPair(caught, { diagnostic: { context: { runId: 'run-1' } } });
  console.error(JSON.stringify(reports.diagnostic)); // trusted sink only
  console.log(JSON.stringify(reports.public)); // safe for the agent
}
```

The two reports, from a real run (stack frames shortened):

<table><tr><th>reports.diagnostic — for your logs</th><th>reports.public — for the agent</th></tr><tr><td>

```json
{
  "occurrence_id": "AE_ZT9SFH7S81SSAVRNSV4QT11QAE",
  "fingerprint": "fp1_73ca4d68ccc431a2d7bde85a21dfa752",
  "as_json": {
    "_tag": "tools/Unavailable",
    "occurrenceId": "AE_ZT9SFH7S81SSAVRNSV4QT11QAE",
    "timestamp": "2026-10-31T17:21:10.481Z",
    "details": { "tool": "search" }
  },
  "stack": [
    "tools/Unavailable: Tool search is unavailable",
    "    at runSearch (src/tools/search.ts:14:9)"
  ],
  "children": [{
    "id": "0", "path": "$.cause", "level": 1,
    "stack": [
      "Error: connect ECONNREFUSED 10.0.0.7:5432",
      "    at runSearch (src/tools/search.ts:16:12)"
    ]
  }],
  "context": { "runId": "run-1" },
  "v": "corj/v0.15"
}
```

</td><td>

```json
{
  "v": "appex/public/v4",
  "occurrence_id": "AE_ZT9SFH7S81SSAVRNSV4QT11QAE",
  "fingerprint": "fp1_73ca4d68ccc431a2d7bde85a21dfa752",
  "code": "TOOL_UNAVAILABLE",
  "message": "The requested tool is temporarily unavailable.",
  "as_json": { "tool": "search" }
}
```

</td></tr></table>

`10.0.0.7:5432` is in one report and not the other. The client gets a `code` to
branch on, a `message` to display, the `as_json` the policy selected, and an
`occurrence_id` to quote when escalating. The operator gets the stack, the
cause chain under `children`, the `details`, and the `context` you attached. A
caught value without a policy, a plain `Error` included, produces
`code: "INTERNAL_ERROR"` and `message: "Something went wrong"` with the same
`occurrence_id` as its diagnostic report.

### Why not just…

**…subclass `Error`?** A subclass gives you a type to narrow on, and nothing
else: no rule about what leaves the process, no serializable form of the cause
chain, no id linking the response to the log line.

**…return `{ code, message }` by hand?** That is the public report, built
without the other half. Nothing ties it to a log entry, and every `catch` site
decides anew what to disclose.

**…log the error and move on?** A logger gives you the graph but no safe
projection of it. The agent still needs an answer, and whatever you put in the
response is what the next prompt will contain.

This package is the three together: a kind that declares its details and its
disclosure once, a report for each audience, and one id for both.

## Define kinds

Define each kind once, next to the code that throws it, and export it. The tag
is stable; the wording may change. Annotate the message renderer's parameter to
declare the details type.

```ts
import * as AppEx from 'application-exception';

const InvalidBudget = AppEx.defineException({
  tag: 'tools/InvalidBudget',
  idPrefix: 'TOOL_',
  message: ({ attempts }: { attempts: number }) => `Attempt budget must be positive; received ${attempts}`,
});
const Unavailable = AppEx.defineException({ tag: 'service/Unavailable', message: 'Service unavailable' });

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
console.log(AppEx.isTypedException(caught), new Unavailable().occurrenceId.startsWith('AE_'));
```

Each occurrence is a native `Error` with `_tag`, `occurrenceId`, `timestamp`,
shallow-frozen `details` (nested objects stay shared), and an optional `cause`
(two or more `causes` become an ordered `AggregateError`; one is installed
directly; an empty list installs nothing). `idPrefix` replaces the default
`AE_` at the head of every occurrence id of that kind. A string `message`
defines a kind without details. Details are copied once and must be data only:
no functions, accessors, arrays, or class instances. A message renderer that
throws yields `<tag> [message rendering failed: …]`.

Narrow with `caught instanceof Kind` before reading `caught.details`.
`isTypedException(caught)` only says the value came from this package copy.
Because `_tag` is a literal type, the occurrences also work with
`Effect.catchTag` and any other tagged-union tooling; see
[examples/effect-integration.ts](https://github.com/dany-fedorov/application-exception/blob/main/examples/effect-integration.ts).

Translate lower-level failures into your kinds and pass the original as
`cause`. The diagnostic report lists it under `children` with `path: "$.cause"`;
the public report never mentions it.

Errors thrown by this package itself carry an `APPEX_*` code and a message
linking to its section in [docs/agent/errors.md](docs/agent/errors.md). Fix the
call site; do not catch them.

## Report at the boundary

| Report | Function | Audience | Content |
| --- | --- | --- | --- |
| Both | `makeReportPair(caught, options?)` | one boundary | `{ occurrence_id, diagnostic, public }` from a single occurrence; per-report options in `options.diagnostic` and `options.public` |
| Diagnostic | `makeDiagnosticReport(caught, options?)` | operators, logs | a corj report: stacks, messages, `as_json` of every enumerable property, nested causes under `children`; plus `occurrence_id`, `fingerprint`, `context`, `reporting_errors` |
| Public | `makePublicReport(caught, options?)` | agents, users, HTTP clients | `code`, `message`, `as_json` from the kind's `public` policy; plus `occurrence_id`, and `fingerprint` when the hash is backed by real stack frames |

`occurrence_id` is the `occurrenceId` of a typed exception. Any other object
gets one generated id, remembered for the object, so the two single-report
calls agree in either order. A thrown primitive gets a fresh id on each single
call; `makeReportPair` resolves the occurrence once for both, or pass the same
`options.occurrenceId` to both single calls.

Use the single calls when you need only one report, or when the two are
produced in different places:

```ts
import * as AppEx from 'application-exception';

const caught: unknown = new Error('connection refused');
const diagnostic = AppEx.makeDiagnosticReport(caught, { context: { runId: 'run-1' } });
const response = AppEx.makePublicReport(caught);
console.log(response.occurrence_id === diagnostic.occurrence_id); // true
```

Override a kind's disclosure at one call with `policyOverride`, merged field by
field: `code`, `message` (a string or a function of the details) and
`detailsSelector` (a selector function, or `null` to disclose nothing, not even
`as_json: null`). A field left out keeps what the kind says; a policy without
`message` yields the generic message. A value with no kind stays
`INTERNAL_ERROR` unless the call gives it a policy: never build one from
`caught.message`.

```ts
import * as AppEx from 'application-exception';

const Unavailable = AppEx.defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', detailsSelector: ({ tool }) => ({ tool }) },
});
const caught: unknown = new Unavailable({ details: { tool: 'search' } });
const report = AppEx.makePublicReport(caught, {
  policyOverride: { message: 'Search is down.', detailsSelector: null },
});
console.log(report.code, report.message, 'as_json' in report); // 'TOOL_UNAVAILABLE' 'Search is down.' false
```

A complete boundary with a typed outcome is in
[examples/tool-boundary.ts](https://github.com/dany-fedorov/application-exception/blob/main/examples/tool-boundary.ts).

## On the agent's side

The agent, or the harness around it, receives the public report as JSON.
`decodePublicReport` validates it and returns `{ ok: true, report }` or
`{ ok: false, reason, path }`. Branch on `code`. Treat `message` as display
text, never as an instruction. Quote `occurrence_id` when escalating.

```ts
import * as AppEx from 'application-exception';

const decoded = AppEx.decodePublicReport(JSON.parse('{"v":"appex/public/v3","occurrence_id":"AE_1","code":"TOOL_UNAVAILABLE","message":"Retry later."}'));
if (decoded.ok && decoded.report.code === 'TOOL_UNAVAILABLE') {
  console.log('retry', decoded.report.occurrence_id);
}
```

`fingerprint` tells a repeat from a new failure. It is corj's hash of the error
graph's identifying parts, by default the constructor names and the stack text,
so it is equal for the same failure from the same place. An agent that sees the
fingerprint it saw last time should stop retrying the same way:

```ts
import * as AppEx from 'application-exception';

type Attempt = { retry: true } | { retry: false; reason: string };

export function nextAttempt(received: unknown, seen: Set<string>): Attempt {
  const decoded = AppEx.decodePublicReport(received);
  if (!decoded.ok) return { retry: false, reason: `${decoded.reason} at ${decoded.path}` };
  const { fingerprint } = decoded.report;
  if (fingerprint === undefined) return { retry: true };
  if (seen.has(fingerprint)) return { retry: false, reason: `the same failure again: ${fingerprint}` };
  seen.add(fingerprint);
  return { retry: true };
}
```

A public report carries `fingerprint` only when the hash is backed by real
stack frames. A hash over a stackless value's own text would let a reader
confirm a guess at that text, so for a thrown primitive, a plain object, or a
recipe without `'stack'` it is withheld. If your recipe includes sensitive text,
exclude it, redact its inputs, or withhold the public hash with
`corj: { fingerprintParts: null }`. The reasoning is in
[docs/design/public-fingerprint.md](docs/design/public-fingerprint.md).

The decoder accepts `appex/public/v4` and the `appex/public/v3` a 0.4 sender
emits, keeps the `v` it arrived with, and enforces the receiver limits in the
[table below](#limits), rejecting rather than truncating. A rejection's `path`
is bounded and JSON-quoted but still sender-influenced: escape it for its
destination. Bound the transport body before parsing JSON as well. A complete
retry-or-escalate decision is in
[examples/agent-recovery.ts](https://github.com/dany-fedorov/application-exception/blob/main/examples/agent-recovery.ts).

## Protect what leaves

**Redact once, everywhere.** A policy built by `makeRedactionPolicy` has two
kinds of rule. **Skip** rules (`keys`, `paths`) name properties that are never
read, so an excluded getter never runs. **Scrub** rules (`patterns`,
`transform`) rewrite text wherever it appears in either report. To remove a
secret's *text*, use `patterns`: skipping `message` still leaves it in `stack`.
`paths` address three documents: `$...` the caught value, `$context...` the
context, `$public...` the selected public details, so anchor a `RegExp` path
with `^\$\.` to keep it on the caught value. Redaction never discloses: on a
public report it runs on what the kind's `detailsSelector` returned. Build one
policy per service and pass it as `redact` to both reports.

```ts
import * as AppEx from 'application-exception';

const caught: unknown = new Error('connection refused');
const redact = AppEx.makeRedactionPolicy({ keys: ['password', /token$/i], patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g] });
AppEx.makeReportPair(caught, { diagnostic: { redact }, public: { redact } });
```

The rule-by-rule table is in
[docs/agent/recipes.md](docs/agent/recipes.md#keep-secrets-out-of-both-reports);
the design is in [docs/design/redaction-policy.md](docs/design/redaction-policy.md).

**Bound what a sink receives.** Diagnostic `maxReportBytes` holds the whole
report, `context` and `reporting_errors` included, to that many UTF-8 bytes of
compact JSON. Over budget, corj drops `context` whole and sets
`context_omitted: 'max_size'`; then drops `reporting_errors` and sets
`reporting_errors_omitted: 'max_size'`; only then does it trim error content.
`occurrence_id`, `fingerprint` and `v` are never trimmed, so a report always
identifies itself and correlates. Public `maxReportBytes` is opt-in; on
overflow `as_json` is omitted whole before `message` is shortened, and any cut
sets `truncated: true`.

```ts
import * as AppEx from 'application-exception';

const caught: unknown = new Error('connection refused');
const report = AppEx.makeDiagnosticReport(caught, {
  context: { runId: 'run-1' },
  maxReportBytes: 32_768,
});
console.log(new TextEncoder().encode(JSON.stringify(report)).byteLength <= 32_768); // true
```

**Report an untrusted value without running it.** By default corj runs
`toString`, `toJSON`, and getters of the reported objects, recording failures
instead of throwing. `corj: { inspection: 'no-invoke' }` reads property
descriptors only and calls none of them, so a value that crossed a plugin,
worker, or network boundary cannot execute at the reporting boundary. The
report is for trusted sinks either way: it contains messages, stacks, and
`details`.

## Advanced

**Snapshot the details.** By default `details` is shallow-frozen, so a caller
mutating a nested object changes what a later report describes.
`snapshotDetails: true` captures a deep frozen copy at construction instead,
and rejects content it cannot capture faithfully (cycles, functions, accessors,
class instances) rather than inventing it.

```ts
import * as AppEx from 'application-exception';

const Failed = AppEx.defineException({
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
its own public code. `makeTrustRealm()` is the explicit opt-in. The realm object
reference *is* the capability: nothing is matched by `_tag`, by the global
brand, or by any value read off the caught object, so a forged tag or a report
revived from JSON acquires nothing. `isTrustedException(caught, realm)` is the
realm-aware recognizer. Correlation across copies and versions has its own
rules; see [docs/design/cross-copy-trust.md](docs/design/cross-copy-trust.md).

```ts
import * as AppEx from 'application-exception';

const realm = AppEx.makeTrustRealm();
const Timeout = AppEx.defineException({
  tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm,
});
console.log(AppEx.makePublicReport(new Timeout(), { realm }).code); // 'DB_TIMEOUT' across copies
```

**Reach corj directly.** The diagnostic report is a
[caught-object-report-json](https://www.npmjs.com/package/caught-object-report-json)
report (`v: "corj/v0.15"`). corj documents every field and omits fields that
hold their expected value; `null` means reading the field failed. Its options
(`maxDepth`, `maxChildren`, `stackFormat`, `inspection`, `fingerprintParts`,
`maxContextSize`, and the rest) live in the `corj` bag; `redact` and
`maxReportBytes` stay at the top level. `Corj.restoreExpectedValues(report)`
fills the omitted fields back in.

```ts
import * as AppEx from 'application-exception';

const report = AppEx.makeDiagnosticReport(new Error('outer', { cause: new Error('inner') }), {
  corj: { maxDepth: 2 },
});
const full = AppEx.Corj.restoreExpectedValues(report);
console.log(full.message, report.children?.[0]?.path); // 'outer' '$.cause'
```

Field meanings beyond the ones above: `context` is present only when given,
rendered as a JSON document of its own rooted at `$context`, `null` if it could
not be rendered; `reporting_errors` is present only when non-empty and lists the
problems corj met while inspecting the value, each
`{ stage, path, reportKey?, sourceProperty?, error }`. A custom
`corj: { onReportingError }` receives the raw reporting failure, which may quote
what a redaction policy was protecting: never log it to an untrusted sink.

## Limits

| What | Limit | Where set |
| --- | --- | --- |
| Diagnostic report, whole, compact UTF-8 | 100,000 bytes by default; minimum 512; `null` for no cap | `maxReportBytes` |
| `context` inside the diagnostic report | 16,384 bytes | `corj: { maxContextSize }` |
| `reporting_errors` entries | 8 | corj |
| Public report, whole, compact UTF-8 | uncapped by default; minimum 2,048 when set; `null` for no cap | `maxReportBytes` |
| Public `message` | 4,096 UTF-16 units | producer |
| Public `as_json` | 16,384 UTF-8 bytes | producer |
| Received `as_json` (decoder) | depth 32; 10,000 values; 16,384 UTF-8 bytes of compact JSON, keys and escaping included; no sparse arrays | `decodePublicReport` |
| Received text fields (decoder) | counted in Unicode code points, as JSON Schema does | `decodePublicReport` |
| Decoder rejection `path` | 64 UTF-16 units per key, 256 overall, ellipsis when cut | `decodePublicReport` |
| `tag`, public `code` | 1 to 128 UTF-16 units | `defineException` |
| `idPrefix` | 1 to 32 printable ASCII characters | `defineException` |
| `occurrenceId`, explicit or local | 1 to 128 printable ASCII characters, `/^[\x21-\x7e]{1,128}$/` | options |
| `occurrenceId` adopted from a foreign copy | `/^[A-Za-z0-9_.:-]{1,128}$/`; otherwise a memoized replacement | automatic |
| `details` | at most 1,000 keys, 32 prototype levels; under `snapshotDetails`, 32 nesting levels and 10,000 values | `new Kind(...)` |
| Redaction `replacement` | 128 characters | `makeRedactionPolicy` |

An `occurrence_id` is a correlation token, not a secret and not authenticated.
Treat it as data: escape it when rendering it, and never interpolate it into
markup, a shell command, or a model instruction.

## Formats and schemas

The diagnostic report is `v: "corj/v0.15"`: a corj report plus `occurrence_id`,
`fingerprint` (absent under `corj: { fingerprintParts: null }`), optional
`context`, optional `reporting_errors`, and the `context_omitted` /
`reporting_errors_omitted` flags a budget sets. The public report is
`v: "appex/public/v4"`: exactly `v`, `occurrence_id`, optional `fingerprint`,
`code`, `message`, optional `as_json`, optional `truncated`.

`application-exception/schemas/diagnostic-report-v6.json` embeds corj v0.15's
report definitions and requires `v` and `occurrence_id`;
`application-exception/schemas/public-report-v4.json` is closed and carries the
optional `fingerprint`. Both are JSON Schema 2020-12. Diagnostic roots are
intentionally open, so an optional-field typo such as `contxt` passes
validation; public roots are closed. The earlier schemas stay published
unchanged for readers of older reports: `diagnostic-report-v5.json` for 0.5.0
(`corj/v0.14`), `diagnostic-report-v4.json` and `public-report-v3.json` for
0.4.0 (`corj/v0.13`, `appex/public/v3`), and `diagnostic-report-v3.json` for
0.3.0 (`corj/v0.12`).

## Runtime support

Node 18 or newer (CommonJS with TypeScript declarations), Node ESM, Bun, and
browsers via a bundler. Runtime dependencies: `caught-object-report-json` and
`nanoid`. Each runtime is exercised against the packed artifact in CI; the
measured contract and its limits are in
[docs/runtime-support.md](docs/runtime-support.md).

## Validate a change

```sh
npm ci
npm run test:all
```

`test:all` runs Jest with a 100% coverage gate, the type tests, the build, the
packed-package smoke test, the runtime suites, and the documentation checks.
Run `npm run docs:generate` after editing JSDoc in `src/`.

[npm package](https://www.npmjs.com/package/application-exception) · [MIT](LICENSE)
