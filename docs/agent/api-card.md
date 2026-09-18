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
| Correlate the two reports | `report.occurrence_id`, equal on both for any object; pass `occurrenceId` for thrown primitives |
| Read a public report received as JSON | `decodePublicReport(value)` |
| Capture both reports as one occurrence | `toReports(caught, { diagnostic, public })` |
| Bound the whole diagnostic report | `toDiagnosticReport(caught, { maxFinalReportSize })` |
| Keep secrets out of either report | `createRedactionPolicy({ keys, paths, values })` passed as `redact` |
| Freeze details against later mutation | `defineException({ tag, message, snapshotDetails: true })` |
| Trust failures from another loaded copy | `createTrustRealm()` passed as `realm` to `defineException` and `toPublicReport` |
| Read omitted corj fields of a diagnostic report | `restoreExpectedValues(report)` |

## Runtime exports

### `defineException`

```ts signature
function defineException<Tag extends string>(definition: ExceptionDefinition<Tag>): TypedExceptionClass<Tag>;
function defineException<Tag extends string, Details extends object>(definition: { readonly tag: Tag; readonly message: (details: Details) => string; readonly idPrefix?: string; readonly public?: PublicPolicy<Details>; readonly snapshotDetails?: boolean; readonly realm?: TrustRealm; } & ([RecordDetails<Details>] extends [never] ? never : unknown)): TypedExceptionClass<Tag, Details>;
```

Define an error kind: a native `Error` subclass with a stable `_tag`, typed
`details`, an `occurrenceId`, and an optional `public` disclosure policy.

Annotate the message renderer's parameter to declare the details type. A
string message defines a kind without details. Details must be a data-only
record: no arrays, functions, accessors, or methods.

`snapshotDetails: true` captures a deep frozen copy at construction, so later
mutation of the caller's nested objects cannot change what the message and the
reports describe. A snapshot accepts primitives, plain objects, arrays, and
`Date`, and rejects cycles, functions, accessors, non-enumerable properties,
class instances, nesting past 32 levels, and more than 10,000 values. The
default stays the shallow freeze, which shares the caller's nested objects.

Throws: `APPEX_INVALID_TAG`, `APPEX_INVALID_MESSAGE`, `APPEX_INVALID_ID_PREFIX`, `APPEX_INVALID_PUBLIC_POLICY`, `APPEX_INVALID_DETAILS`

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
if (isTypedException(caught)) console.log(caught._tag, caught.occurrenceId);
if (caught instanceof Unavailable) console.log(caught.details);
```

### `isTrustedException`

```ts signature
function isTrustedException(value: unknown, realm: TrustRealm): value is TypedException;
```

Whether a value is an occurrence of this copy of the package, or of another
copy that joined the same realm. `isTypedException` keeps its one-argument
shape, so it still works as an array callback; this is the realm-aware form.

Throws: `APPEX_INVALID_TRUST_REALM`

```ts
import { createTrustRealm, defineException, isTrustedException } from 'application-exception';
const realm = createTrustRealm();
const Timeout = defineException({ tag: 'db/Timeout', message: 'Timed out', realm });
console.log(isTrustedException(new Timeout(), realm)); // true, in any copy sharing the realm
```

### `createTrustRealm`

```ts signature
function createTrustRealm(): TrustRealm;
```

Create an explicit trust boundary that cooperating copies of this package can
share. Pass the returned object as `realm` to `defineException` in each copy
that defines failures, and as `realm` to `isTrustedException`,
`toPublicReport`, or `toReports` in the copy that reports them.
`toDiagnosticReport` takes no realm: a diagnostic report consults no
disclosure policy, and occurrence ids already correlate across copies.

The realm object reference *is* the capability: holding it is the trust
decision. Nothing is matched by `_tag`, by the global brand, or by any value
read off the caught object, so a forged tag or a report deserialized from the
wire can never acquire a public policy. Without a realm every copy keeps
today's isolation and foreign values stay generic.

```ts
import { createTrustRealm, defineException, toPublicReport } from 'application-exception';
const realm = createTrustRealm();
const Timeout = defineException({ tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm });
console.log(toPublicReport(new Timeout(), { realm }).code); // 'DB_TIMEOUT'
```

### `createRedactionPolicy`

```ts signature
function createRedactionPolicy(options?: RedactionPolicyOptions): RedactionPolicy;
```

Build a reusable redaction policy for `toDiagnosticReport`, `toPublicReport`,
and `toReports`.

The policy rewrites values in the produced report: messages, stacks,
`as_json`, `context`, `reporting_errors`, and every nested cause. On a public
report it runs **after** the kind's `public.details` selector, so redaction
can only narrow what was selected — it never authorizes disclosure, and a
field the selector did not choose stays absent.

Identity and shape fields (`v`, `occurrence_id`, `code`, and corj's
structural keys) are walked but never replaced, so a redacted report still
validates against its schema.

Throws: `APPEX_INVALID_REDACTION_POLICY`

```ts
import { createRedactionPolicy, toDiagnosticReport } from 'application-exception';
const redact = createRedactionPolicy({ keys: ['password', /token$/i], values: [/\bsk-[A-Za-z0-9]{8,}\b/] });
const report = toDiagnosticReport(new Error('bad key sk-abcdefgh'), { redact });
console.log(report.message); // 'bad key [redacted]'
```

### `toDiagnosticReport`

```ts signature
function toDiagnosticReport(caught: unknown, options?: DiagnosticReportOptions): DiagnosticReport;
```

Report any caught value for operators: a corj report with `occurrence_id`,
optional `context`, and `reporting_errors`. Send it to a trusted sink; it
contains messages, stacks, and every enumerable property of the error graph.
With `maxFinalReportSize`, the whole report is bounded by that many UTF-8
bytes of compact JSON: `context` is dropped, then `reporting_errors` (both
named in `report_omitted`), then corj's own budget is halved until the
report fits; a budget too small for the envelope throws.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_REPORT_BUDGET_TOO_SMALL`; corj option errors propagate.

```ts
import { toDiagnosticReport } from 'application-exception';
const caught: unknown = new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
const report = toDiagnosticReport(caught, { context: { runId: 'run-1' } });
// { "v": "corj/v0.13", "occurrence_id": "AE_…", "stack": [...], "children": [{ "path": "$.cause", ... }],
//   "context": { "runId": "run-1" } }
console.error(JSON.stringify(report));
```

### `toPublicReport`

```ts signature
function toPublicReport(caught: unknown, options?: PublicReportOptions): PublicReport;
```

Report a failure to an agent or user: the kind's `public` policy rendered
into `code`, `message`, and `as_json`, with the same `occurrence_id` as the
diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
generic message. Nothing is read from the error except its policy inputs.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`

```ts
import { defineException, toPublicReport } from 'application-exception';
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});
const report = toPublicReport(new ToolUnavailable({ details: { tool: 'search' } }));
// { v: 'appex/public/v3', occurrence_id: 'AE_…', code: 'TOOL_UNAVAILABLE', message: 'Something went wrong',
//   as_json: { tool: 'search' } }
console.log(report.code, toPublicReport(new Error('secret')).code); // … 'INTERNAL_ERROR'
```

### `toReports`

```ts signature
function toReports(caught: unknown, options?: ToReportsOptions): CapturedReports;
```

Report one failure to both audiences at once: the occurrence id is resolved
once and shared, so `diagnostic.occurrence_id === public.occurrence_id`
holds for every caught value, primitives included. The per-report options
live in `options.diagnostic` and `options.public`; the occurrence id is
overridden for both at the top level. All option bags are validated before
either report is built, and a failure to build either one throws instead of
returning half a pair.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`, `APPEX_REPORT_BUDGET_TOO_SMALL`; corj option errors propagate.

```ts
import { toReports } from 'application-exception';
const { occurrence_id, diagnostic, public: disclosed } = toReports('socket closed', {
  diagnostic: { context: { runId: 'run-1' }, maxFinalReportSize: 4096 },
});
console.error(JSON.stringify(diagnostic)); // the operator copy
console.log(disclosed.code, occurrence_id); // 'INTERNAL_ERROR' 'AE_…'
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
const json = '{"v":"appex/public/v3","occurrence_id":"AE_1","code":"TOOL_UNAVAILABLE","message":"Down."}';
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
const DIAGNOSTIC_REPORT_VERSION: "corj/v0.13";
```

The `v` of every diagnostic report: corj's report version.

### `PUBLIC_REPORT_VERSION`

```ts signature
const PUBLIC_REPORT_VERSION: "appex/public/v3";
```

The `v` of every public report.

### `APPEX_ERROR_CODES`

```ts signature
const APPEX_ERROR_CODES: readonly ["APPEX_INVALID_TAG", "APPEX_INVALID_MESSAGE", "APPEX_INVALID_ID_PREFIX", "APPEX_INVALID_PUBLIC_POLICY", "APPEX_INVALID_DETAILS", "APPEX_INVALID_CAUSES", "APPEX_INVALID_OPTIONS", "APPEX_INVALID_OCCURRENCE_ID", "APPEX_INVALID_PUBLIC_CODE", "APPEX_INVALID_PUBLIC_MESSAGE", "APPEX_INVALID_TRUST_REALM", "APPEX_INVALID_REDACTION_POLICY", "APPEX_REPORT_BUDGET_TOO_SMALL"];
```

Every code an error thrown by this package can carry. Each has a section in docs/agent/errors.md.

## Types

### `AppexErrorCode`

```ts signature
export type AppexErrorCode = (typeof APPEX_ERROR_CODES)[number];
```

One of the codes in `APPEX_ERROR_CODES`.

### `AppexTypeError`

```ts signature
export type AppexTypeError = TypeError & { readonly code: AppexErrorCode };
```

A `TypeError` thrown by this package: `message` is `<code>: <text>; see <url>#<code>` and `code` is enumerable.

### `CapturedReports`

```ts signature
export interface CapturedReports {
  readonly occurrence_id: string;
  readonly diagnostic: DiagnosticReport;
  readonly public: PublicReport;
}
```

Both reports of one occurrence, produced together; the three `occurrence_id`s are the same string.

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
  readonly occurrence_id: string;
  readonly context?: CorjJsonValue | null;
  readonly reporting_errors?: readonly ReportingError[];
  readonly report_omitted?: readonly ('context' | 'reporting_errors')[];
};
```

A corj report object (see caught-object-report-json) with four extension
fields. `occurrence_id` is the occurrence id shared with the public
report. `context` is the normalized `options.context`. `reporting_errors`
lists inspection failures (at most 8). `report_omitted` names the optional
fields dropped to meet `maxFinalReportSize`.

### `DiagnosticReportOptions`

```ts signature
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly maxReportSize?: number | null;
  readonly maxFinalReportSize?: number | null;
  readonly maxDepth?: number;
  readonly maxChildren?: number;
  readonly stackFormat?: 'lines' | 'string';
  readonly redact?: RedactionPolicy;
}
```

Options of `toDiagnosticReport`. `maxReportSize`, `maxDepth`, `maxChildren`,
and `stackFormat` are corj options with corj's defaults (100,000 bytes, 5,
100, `'lines'`). `context` is normalized with a 16,384-byte budget outside
the report budget. `occurrenceId` overrides the occurrence id.
`maxFinalReportSize` bounds the UTF-8 bytes of `JSON.stringify(report)` for
the whole report, extension fields included; `null` (the default) disables
it and leaves `maxReportSize` alone.

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
  readonly snapshotDetails?: boolean;
  readonly realm?: TrustRealm;
};
```

Input of `defineException`. A string `message` defines a kind without details; `snapshotDetails` opts into a deep frozen copy of the details.

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
  readonly occurrence_id: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}
```

What an application discloses about one failure. `code` is the branching
protocol, `occurrence_id` correlates with the diagnostic report, `message`
is display text, `as_json` is the selected JSON. `truncated` marks a cut
message or `as_json`.

### `PublicReportOptions`

```ts signature
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
}
```

Per-call overrides of the kind's public policy; `details: null` suppresses the policy's selection.

### `RedactionContext`

```ts signature
export interface RedactionContext {
  readonly path: string;
  readonly key: string | undefined;
}
```

How a redaction policy rewrites one value it decided to redact, and what the
policy was asked about. `path` is a JSON path rooted at `$`.

### `RedactionPolicy`

```ts signature
export interface RedactionPolicy {
  readonly [REDACTION_POLICY]: CompiledRedactionPolicy;
}
```

An opaque, reusable redaction policy. Build it once and share it between reports.

### `RedactionPolicyOptions`

```ts signature
export interface RedactionPolicyOptions {
  /** Property names redacted wherever they appear, by exact match or pattern. */
  readonly keys?: readonly (string | RegExp)[];
  /** Exact JSON paths redacted, such as `$.as_json.token` or `$.children[0].as_json.password`. */
  readonly paths?: readonly string[];
  /** String values redacted wherever they appear, including in messages and stack lines. */
  readonly values?: readonly RegExp[];
  /** What a redacted value becomes. Defaults to `[redacted]`. */
  readonly replacement?: string;
  /** Last word on any value the rules above did not redact; return the value unchanged to keep it. */
  readonly transform?: (value: CorjJsonValue, context: RedactionContext) => unknown;
}
```

Input of `createRedactionPolicy`; every rule is optional and they compose.

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

### `ToReportsOptions`

```ts signature
export interface ToReportsOptions {
  readonly occurrenceId?: string;
  readonly diagnostic?: Omit<DiagnosticReportOptions, 'occurrenceId'>;
  readonly public?: Omit<PublicReportOptions, 'occurrenceId'>;
}
```

Options of `toReports`. `occurrenceId` overrides the occurrence id of both
reports. `diagnostic` and `public` are the per-report option bags, each
without its own `occurrenceId`, so that `message` and `context` stay
unambiguous.

### `TrustRealm`

```ts signature
export interface TrustRealm {
  readonly [TRUST_REALM_API]: TrustRealmApi;
}
```

An explicit trust boundary shared between cooperating copies of this package.

### `TypedException`

```ts signature
export interface TypedException<
  Tag extends string = string,
  Details extends object = object,
> extends Error {
  readonly _tag: Tag;
  readonly occurrenceId: string;
  readonly timestamp: string;
  readonly details: DetailsRecord<Details>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
}
```

One occurrence: a native `Error` with a stable `_tag`, an `occurrenceId` used as the report `occurrence_id`, and frozen `details`.

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
