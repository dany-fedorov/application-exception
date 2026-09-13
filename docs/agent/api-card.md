# API card

Generated from the JSDoc in `src/` by `npm run docs:generate`; `npm run docs:check` fails when this file drifts. Do not edit by hand.
Rules: [AGENTS.md](../../AGENTS.md). Tasks: [recipes.md](recipes.md). Error codes: [errors.md](errors.md).

## One way per task

| Task | Call |
| --- | --- |
| Define an error kind with typed details | `defineException({ tag, message })` |
| Decide what a kind discloses | `defineException({ tag, message, public: { code, message, details } })` |
| Create an occurrence | `new Kind({ details, cause })` |
| Narrow a caught value to one kind | `caught instanceof Kind` |
| Recognize any occurrence of this package copy | `isTypedException(caught)` |
| Record a failure for operators | `toDiagnosticReport(caught, { context })` |
| Answer an agent or user about a failure | `toPublicReport(caught)` |
| Correlate the two reports | `report.reference`, equal on both |
| Read a public report received as JSON | `decodePublicReport(value)` |
| Read omitted corj fields of a diagnostic report | `restoreExpectedValues(report)` |

## Runtime exports

### `defineException`

```ts signature
function defineException<Tag extends string>(definition: ExceptionDefinition<Tag>): TypedExceptionClass<Tag>;
function defineException<Tag extends string, Details extends object>(definition: { readonly tag: Tag; readonly message: (details: Details) => string; readonly idPrefix?: string; readonly public?: PublicPolicy<Details>; } & ([RecordDetails<Details>] extends [never] ? never : unknown)): TypedExceptionClass<Tag, Details>;
```

Define an error kind: a native `Error` subclass with a stable `_tag`, typed
`details`, an occurrence `id`, and an optional `public` disclosure policy.

Annotate the message renderer's parameter to declare the details type. A
string message defines a kind without details. Details must be a data-only
record: no arrays, functions, accessors, or methods.

Throws: `APPEX_INVALID_TAG`, `APPEX_INVALID_MESSAGE`, `APPEX_INVALID_ID_PREFIX`, `APPEX_INVALID_PUBLIC_POLICY`

```ts
import { defineException } from 'application-exception';
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', message: 'The tool is unavailable.', details: ({ tool }) => ({ tool }) },
});
const error = new ToolUnavailable({ details: { tool: 'search' }, cause: new Error('refused') });
console.log(error._tag, error.details.tool); // 'tools/Unavailable' 'search'
```

### `isTypedException`

```ts signature
function isTypedException(value: unknown): value is TypedException;
```

Whether a value is an occurrence created by this loaded copy of the package.
Narrow a specific kind with `instanceof` before reading its details.

```ts
import { defineException, isTypedException } from 'application-exception';
const Unavailable = defineException({ tag: 'app/Unavailable', message: 'Unavailable' });
const caught: unknown = new Unavailable();
if (isTypedException(caught)) console.log(caught._tag, caught.id);
if (caught instanceof Unavailable) console.log(caught.details);
```

### `toDiagnosticReport`

```ts signature
function toDiagnosticReport(caught: unknown, options?: DiagnosticReportOptions): DiagnosticReport;
```

Report any caught value for operators: a corj report with `reference`,
optional `context`, and `reporting_errors`. Send it to a trusted sink; it
contains messages, stacks, and every enumerable property of the error graph.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_REFERENCE`; corj option errors propagate.

```ts
import { toDiagnosticReport } from 'application-exception';
const caught: unknown = new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
const report = toDiagnosticReport(caught, { context: { runId: 'run-1' } });
// { "v": "corj/v0.12", "reference": "AE_…", "stack": [...], "children": [{ "path": "$.cause", ... }] }
console.error(JSON.stringify(report));
```

### `toPublicReport`

```ts signature
function toPublicReport(caught: unknown, options?: PublicReportOptions): PublicReport;
```

Report a failure to an agent or user: the kind's `public` policy rendered
into `code`, `message`, and `as_json`, with the same `reference` as the
diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
generic message. Nothing is read from the error except its policy inputs.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_REFERENCE`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`

```ts
import { defineException, toPublicReport } from 'application-exception';
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});
const report = toPublicReport(new ToolUnavailable({ details: { tool: 'search' } }));
// { v: 'appex/public/v3', reference: 'AE_…', code: 'TOOL_UNAVAILABLE', message: 'Something went wrong',
//   as_json: { tool: 'search' } }
console.log(report.code, toPublicReport(new Error('secret')).code); // … 'INTERNAL_ERROR'
```

### `decodePublicReport`

```ts signature
function decodePublicReport(value: unknown): DecodePublicReportResult;
```

Validate a public report received as JSON and return a detached copy, or
the first reason it is not a public report. Branch on `report.code` after
`ok`; escalate on `!ok` with `reason` and `path`.

```ts
import { decodePublicReport } from 'application-exception';
const json = '{"v":"appex/public/v3","reference":"AE_1","code":"TOOL_UNAVAILABLE","message":"Down."}';
const decoded = decodePublicReport(JSON.parse(json) as unknown);
if (decoded.ok) console.log(decoded.report.code); // 'TOOL_UNAVAILABLE'
else console.log(decoded.reason, decoded.path);
```

### `restoreExpectedValues`

```ts signature
function restoreExpectedValues<T extends Report>(report: T): T;
```

Fill in the fields a diagnostic report omitted as expected values, so every node carries them; `v` and `$schema` become the `-full` version.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `DIAGNOSTIC_REPORT_VERSION`

```ts signature
const DIAGNOSTIC_REPORT_VERSION: "corj/v0.12";
```

The `v` of every diagnostic report: corj's report version.

### `PUBLIC_REPORT_VERSION`

```ts signature
const PUBLIC_REPORT_VERSION: "appex/public/v3";
```

The `v` of every public report.

### `APPEX_ERROR_CODES`

```ts signature
const APPEX_ERROR_CODES: readonly ["APPEX_INVALID_TAG", "APPEX_INVALID_MESSAGE", "APPEX_INVALID_ID_PREFIX", "APPEX_INVALID_PUBLIC_POLICY", "APPEX_INVALID_DETAILS", "APPEX_INVALID_CAUSES", "APPEX_INVALID_OPTIONS", "APPEX_INVALID_REFERENCE", "APPEX_INVALID_PUBLIC_CODE", "APPEX_INVALID_PUBLIC_MESSAGE"];
```

Every code an error thrown by this package can carry. Each has a section in docs/agent/errors.md.

## Types

### `AppexErrorCode`

```ts signature
export type AppexErrorCode = (typeof APPEX_ERROR_CODES)[number];
```

One of {@link APPEX_ERROR_CODES}.

### `AppexTypeError`

```ts signature
export type AppexTypeError = TypeError & { readonly code: AppexErrorCode };
```

A `TypeError` thrown by this package: `message` is `<code>: <text>; see <url>#<code>` and `code` is enumerable.

### `DecodePublicReportResult`

```ts signature
export type DecodePublicReportResult =
  | { readonly ok: true; readonly report: PublicReport }
  | { readonly ok: false; readonly reason: string; readonly path: string };
```

Result of `decodePublicReport`: a detached report, or the first reason it was rejected and where.

### `DetailsRecord`

```ts signature
export type DetailsRecord<Details extends object> = [Details] extends [never]
  ? Readonly<Record<string, never>>
  : Readonly<RecordDetails<Details>>;
```

The frozen details record an occurrence exposes. `never` selects the empty record of a constant-message kind.

### `DiagnosticReport`

```ts signature
export type DiagnosticReport = Omit<CorjReport, 'v'> & {
  readonly v: CorjVersion;
  readonly reference: string;
  readonly context?: CorjJsonValue | null;
  readonly reporting_errors?: readonly ReportingError[];
};
```

A corj report object (see caught-object-report-json) with three extension
fields. `reference` is the occurrence reference shared with the public
report. `context` is the normalized `options.context`. `reporting_errors`
lists inspection failures (at most 8).

### `DiagnosticReportOptions`

```ts signature
export interface DiagnosticReportOptions {
  readonly reference?: string;
  readonly context?: unknown;
  readonly maxReportSize?: number | null;
  readonly maxDepth?: number;
  readonly maxChildren?: number;
  readonly stackFormat?: 'lines' | 'string';
}
```

Options of `toDiagnosticReport`. `maxReportSize`, `maxDepth`, `maxChildren`,
and `stackFormat` are corj options with corj's defaults (100,000 bytes, 5,
100, `'lines'`). `context` is normalized with a 16,384-byte budget outside
the report budget. `reference` overrides the occurrence reference.

### `ExceptionDefinition`

```ts signature
export type ExceptionDefinition<
  Tag extends string,
  Details extends object = never,
> = {
  readonly tag: Tag;
  readonly message: [Details] extends [never]
    ? string
    : (details: Readonly<RecordDetails<Details>>) => string;
  readonly idPrefix?: string;
  readonly public?: PublicPolicy<Details>;
};
```

Input of `defineException`. A string `message` defines a kind without details.

### `ExceptionInput`

```ts signature
export type ExceptionInput<Details extends object = never> = ([
  Details,
] extends [never]
  ? { readonly details?: Record<string, never> }
  : { readonly details: RecordDetails<Details> }) &
  (NoCause | SingleCause | MultipleCauses);
```

Constructor input. Omitting `Details` selects the constant-message form, whose input is optional.

### `PublicPolicy`

```ts signature
export type PublicPolicy<Details extends object = never> = {
  readonly code: string;
  readonly message?: string | ((details: DetailsRecord<Details>) => string);
  readonly details?: (details: DetailsRecord<Details>) => unknown;
};
```

What `toPublicReport` discloses for occurrences of a kind.

`code` is the value an agent branches on. `message` is display text, constant
or rendered from the details. `details` selects the JSON that becomes
`as_json`; return only what the audience may see.

### `PublicReport`

```ts signature
export interface PublicReport {
  readonly v: typeof PUBLIC_REPORT_VERSION;
  readonly reference: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}
```

What an application discloses about one failure. `code` is the branching
protocol, `reference` correlates with the diagnostic report, `message` is
display text, `as_json` is the selected JSON. `truncated` marks a cut
message or `as_json`.

### `PublicReportOptions`

```ts signature
export interface PublicReportOptions {
  readonly reference?: string;
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
}
```

Per-call overrides of the kind's public policy; `details: null` suppresses the policy's selection.

### `ReportingError`

```ts signature
export interface ReportingError {
  readonly stage: CorjErrorStage;
  readonly path: string;
  readonly key?: string;
  readonly prop?: string;
  readonly error: string;
}
```

A problem corj met while inspecting the caught value; `message: null` and friends mark where.

### `TypedException`

```ts signature
export interface TypedException<
  Tag extends string = string,
  Details extends object = object,
> extends Error {
  readonly _tag: Tag;
  readonly id: string;
  readonly timestamp: string;
  readonly details: DetailsRecord<Details>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
}
```

One occurrence: a native `Error` with a stable `_tag`, an `id` used as the report `reference`, and frozen `details`.

### `TypedExceptionClass`

```ts signature
export type TypedExceptionClass<
  Tag extends string,
  Details extends object = never,
> = {
  new (
    ...args: [Details] extends [never]
      ? [input?: ExceptionInput]
      : [input: ExceptionInput<Details>]
  ): TypedException<Tag, Details>;
  readonly tag: Tag;
};
```

The constructor `defineException` returns. `tag` is the kind's tag.

## Types re-exported from caught-object-report-json

### `CorjJsonValue`

Any value that survives `JSON.stringify`: a string, number, boolean, `null`, or an array or object of those.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `CorjReport`

The corj report object a `DiagnosticReport` extends: the root node plus its flattened `children`.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `CorjReportChild`

One node of the flattened error tree in `children`, with its `id`, `path`, `level` and `child_ids`.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report
