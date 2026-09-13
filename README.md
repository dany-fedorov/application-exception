# application-exception

Typed failures with two reports for TypeScript services and agent harnesses: a
[caught-object-report-json](https://www.npmjs.com/package/caught-object-report-json)
diagnostic report for operators and a selected public report for agents and
users, both carrying the same `reference`.

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
  console.log(response.reference === diagnostic.reference); // true
}
```

The response is:

```json
{
  "v": "appex/public/v3",
  "reference": "AE_01J8Z3C4V5X6Y7Z8A9B0C1D2E3",
  "code": "TOOL_UNAVAILABLE",
  "message": "The requested tool is temporarily unavailable.",
  "as_json": { "tool": "search" }
}
```

A caught value without a policy, including a plain `Error`, produces
`code: "INTERNAL_ERROR"` and `message: "Something went wrong"` with the same
`reference` as its diagnostic report. Nothing is disclosed by accident.

## Two reports, one reference

| Report | Function | Audience | Content |
| --- | --- | --- | --- |
| Diagnostic | `toDiagnosticReport(caught, options?)` | operators, logs | a corj report: stacks, messages, `as_json` of every enumerable property, nested causes under `children`; plus `reference`, `context`, `reporting_errors` |
| Public | `toPublicReport(caught, options?)` | agents, users, HTTP clients | `code`, `message`, `as_json` from the kind's `public` policy; plus `reference` |

`reference` is the occurrence `id` of a typed exception. Any other object gets
one generated id, remembered for the object, so both functions agree in either
order. Pass `options.reference` to force one, for example for thrown strings.

### Diagnostic report

The diagnostic report is a corj report object (`v: "corj/v0.12"`). corj
documents every field, omits fields that hold their expected value, and bounds
the whole report (100,000 bytes by default). This package adds:

| Field | Meaning |
| --- | --- |
| `reference` | the occurrence reference, always present |
| `context` | `options.context` normalized by corj's serializer with a 16,384-byte budget; `null` if it could not be serialized |
| `reporting_errors` | up to 8 problems corj met while inspecting the value: `{ stage, path, key?, prop?, error }` |

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
`reference`.

`decodePublicReport(value)` validates JSON received from another process and
returns `{ ok: true, report }` or `{ ok: false, reason, path }`:

```ts
import { decodePublicReport } from 'application-exception';

const decoded = decodePublicReport(JSON.parse('{"v":"appex/public/v3","reference":"AE_1","code":"TOOL_UNAVAILABLE","message":"Retry later."}'));
if (decoded.ok && decoded.report.code === 'TOOL_UNAVAILABLE') {
  console.log('retry', decoded.report.reference);
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
console.log(isTypedException(caught), new Unavailable().id.startsWith('AE_'));
```

Each occurrence is a native `Error` with `_tag`, `id`, `timestamp`, frozen
`details`, and an optional `cause` (`causes` becomes an ordered
`AggregateError`). Details are copied once and must be data only. A message
renderer that throws yields `<tag> [message rendering failed: …]`.

Errors thrown by this package carry an `APPEX_*` code and a link to
[docs/agent/errors.md](docs/agent/errors.md).

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
