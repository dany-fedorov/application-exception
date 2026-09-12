# application-exception

Typed failures for agent tools. Bounded diagnostics for operators.
Explicit reports for recovery decisions.

`application-exception` turns a tool or application failure into a native
`Error` with a stable kind, typed details, an occurrence ID, and its original
cause. The host handles known failures by type, records bounded diagnostic JSON,
and sends the agent a separately selected report with a stable code and the same
reference.

Use it when tool failures need predictable handling, diagnostic correlation,
and a deliberate boundary between operational details and model-visible data.
It also works at ordinary service, HTTP, and CLI boundaries.

## Install

```sh
npm install application-exception
```

Requires Node.js 18 or newer. TypeScript declarations are included; CommonJS and
ESM imports are supported.

## Quick start

This example defines a tool error, handles it by constructor, and produces two
reports. The diagnostic contains the backend cause. The report returned to the
agent contains a selected code, message, and tool name, plus a reference for
support.

```ts
import {
  defineException,
  toDiagnosticReport,
  toPublicReport,
} from 'application-exception';

const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) =>
    `Tool ${tool} is unavailable`,
});

function runSearch(): never {
  const cause = new Error('Search backend connection refused');
  throw new ToolUnavailable({ details: { tool: 'search' }, cause });
}

try {
  runSearch();
} catch (caught: unknown) {
  const diagnostic = toDiagnosticReport(caught, {
    context: { runId: 'run-123', operation: 'search' },
  });
  // Send this JSON to your trusted diagnostic destination.
  console.error(JSON.stringify(diagnostic));

  const body = caught instanceof ToolUnavailable
    ? toPublicReport(diagnostic.reference, {
        code: 'TOOL_UNAVAILABLE',
        message: 'Search is temporarily unavailable.',
        details: { tool: caught.details.tool },
      })
    : toPublicReport(diagnostic.reference);

  console.log(JSON.stringify(body));
}
```

A default public report has code `INTERNAL_ERROR` and message
`Something went wrong`. Public presentation accepts a reference string and
explicitly selected fields; it never reads the error or its diagnostic graph.
The example deliberately throws to exercise the failure boundary. Replace
`runSearch` with your executor; the package does not execute tools.

## Agent integration contract

| Boundary | Contract |
| --- | --- |
| Local tool failure | Construct an error kind with complete typed details and its cause |
| Host catch | Narrow known kinds by constructor; give unexpected failures a generic public code |
| Operational logging | Send the diagnostic report to a trusted sink |
| Agent-visible response | Select the public code, message, and remediation fields explicitly |
| Recovery | Validate external JSON, branch on code, and apply host-owned retry policy |

Use `_tag` to distinguish local error kinds and `code` as the application
protocol for public handling. Use `reference` to correlate a response with
diagnostics. Free-form `message` text must not select tools, authorize actions,
or decide retry safety. A valid report is data, not an instruction.

The [agent recovery guide](docs/agent-recovery.md) includes an executable
validation and retry-budget example. Unknown codes and malformed reports
escalate; the host owns authorization, idempotency, and backoff.

## Define error kinds

Annotate the message renderer's details parameter to infer the constructor's
required details type. A string message defines a kind with no required details.

```ts
import { defineException } from 'application-exception';

const InvalidBudget = defineException({
  tag: 'tools/InvalidBudget',
  idPrefix: 'TOOL',
  message: ({ attempts }: { attempts: number }) =>
    `Attempt budget must be positive; received ${attempts}`,
});
const Unavailable = defineException({
  tag: 'service/Unavailable',
  message: 'Service unavailable',
});

const invalid = new InvalidBudget({ details: { attempts: -1 } });
const unavailable = new Unavailable();

console.log(invalid instanceof Error); // true
console.log(invalid._tag); // 'tools/InvalidBudget'
console.log(invalid.details.attempts); // -1
console.log(unavailable.message); // 'Service unavailable'
```

Each occurrence has a readonly `_tag`, `id`, `timestamp`, and `details`.
The definition is captured when `defineException` runs. Each occurrence's
details are copied and shallow-frozen at construction. Nested objects remain
shared. The message is rendered
once. If rendering throws, the tag becomes the message and diagnostics can
include the rendering failure.

Supply either `cause: unknown` or `causes: readonly unknown[]`. Multiple causes
become an ordered `AggregateError`. An explicit `cause: undefined` creates a
native cause property; an empty causes list does not.

## Handle known failures

Use `instanceof YourError` to narrow an unknown catch to that error's details.
For a known union, the literal `_tag` supports exhaustive handling:

```ts
import { defineException } from 'application-exception';

const InvalidBudget = defineException({
  tag: 'tools/InvalidBudget',
  message: ({ attempts }: { attempts: number }) => `Invalid budget: ${attempts}`,
});
const Unavailable = defineException({
  tag: 'service/Unavailable',
  message: 'Service unavailable',
});

type ToolFailure =
  | InstanceType<typeof InvalidBudget>
  | InstanceType<typeof Unavailable>;

function explain(error: ToolFailure): string {
  switch (error._tag) {
    case 'tools/InvalidBudget':
      return `Choose a positive attempt budget; received ${error.details.attempts}`;
    case 'service/Unavailable':
      return 'Try again later';
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

console.log(explain(new Unavailable())); // 'Try again later'
```

`isTypedException(value)` recognizes occurrences created by the loaded module.
It establishes the general error shape, not membership in a particular catalog.
A tag on an arbitrary object or another package copy does not prove its details
type; validate external domain data with an application decoder.

## Report and disclose

`toDiagnosticReport(caught, options?)` accepts native errors, typed occurrences,
and arbitrary thrown values. It returns JSON using `appex/diagnostic/v2`.
Options select context, stack inclusion, redacted keys, and traversal limits.

`toPublicReport(reference, presentation?)` returns `appex/public/v2` with
`reference`, `code`, `message`, and optional `details`. Select every public
field for its intended audience. Diagnostic messages, causes, and context may
contain secrets even after key-based redaction.

```ts
import {
  toDiagnosticReport,
  toPublicReport,
  decodeDiagnosticReport,
} from 'application-exception';

const diagnostic = toDiagnosticReport(new Error('Search backend unavailable'), {
  context: { operation: 'search', apiKey: 'private-key' },
  limits: { maxBytes: 16_384 },
});
const response = toPublicReport(diagnostic.reference, {
  code: 'SEARCH_UNAVAILABLE',
  message: 'Search is temporarily unavailable.',
  details: { retryAfterSeconds: 30 },
});

const incoming: unknown = JSON.parse(JSON.stringify(diagnostic));
const decoded = decodeDiagnosticReport(incoming);
if (decoded.success) {
  console.log(decoded.value.reference === response.reference); // true
} else {
  console.error(decoded.error.code, decoded.error.message);
}
```

The decoder validates and detaches a diagnostic value into plain JSON. It
rejects unsupported wire versions, returns a `success`-discriminated result,
and does not revive an error or validate domain-specific details.

Stacks are omitted by default. `includeStack: true` skips user-defined stack
accessors, but native stack formatting may run `Error.prepareStackTrace`.
Normalization avoids getters, custom `toJSON`, and custom coercion. It records
cycles, redactions, unreadable values, unsupported objects, and truncation with
explicit `$appex` markers.

### Diagnostic limits

| Option under `limits` | Default | Supported range |
| --- | ---: | ---: |
| `maxDepth` | 8 | 0–32 |
| `maxValues` | 1,000 | 0–10,000 |
| `maxEntries` | 50 | 0–1,000 |
| `maxStringLength` (UTF-16 units) | 4,096 | 0–65,536 |
| `maxBytes` (serialized UTF-8) | 65,536 | 4,096–1,048,576 |

Enumerating an object's keys can still cost time proportional to its width;
proxy traps have no hard execution-time bound. Project large live inputs into
small owned summaries. See the [API reference](docs/api.md) for construction,
decoding, redaction, and public presentation limits.

## Schemas and integrations

The package includes JSON Schemas for
[diagnostic reports](schemas/diagnostic-report-v2.json) and
[public reports](schemas/public-report-v2.json). Import them through
`application-exception/schemas/diagnostic-report-v2.json` and
`application-exception/schemas/public-report-v2.json`. Schemas validate wire
structure; procedural work limits and domain details require separate checks.

The [agent recovery guide](docs/agent-recovery.md) provides a complete example
that validates public JSON, branches on stable codes, and applies an
operation-owned retry budget.

Typed occurrences work with ordinary throw/catch, rejected Promises, and
libraries that dispatch on `_tag`, including Effect. No effect runtime or
dependency container is required. For capturing arbitrary caught values without
defining application error kinds, see
[caught-object-report-json](https://www.npmjs.com/package/caught-object-report-json).

## Validate a change

```sh
npm ci
npm run test:all
npm run review:probe
npm run benchmark
```

The benchmark prints local measurements. [Release notes](CHANGELOG.md) ·
[npm package](https://www.npmjs.com/package/application-exception)
