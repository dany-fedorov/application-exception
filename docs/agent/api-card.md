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
| Bound the whole diagnostic report | `toDiagnosticReport(caught, { corj: { maxReportSize } })` |
| Reach any option of caught-object-report-json | `{ corj: { inspection, maxDepth, fingerprintParts, … } }` on any report call |
| Override what one call discloses | `toPublicReport(caught, { public: { code, message, details } })` |
| Tell two failures apart, or recognize a repeat | `report.fingerprint`, equal on both reports of one occurrence |
| Keep secrets out of either report | `createRedactionPolicy({ keys, paths, patterns })` passed as `redact` |
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

Build a reusable redaction policy, accepted as `redact` by
`toDiagnosticReport`, `toPublicReport`, and `toReports`.

**Skip** rules (`keys`, `paths`) name properties corj never reads, so an
excluded getter never runs. **Scrub** rules (`patterns`, `transform`) rewrite
text wherever it appears in either report: messages, stacks, `as_json`,
`context`, `reporting_errors`, nested causes.

- To remove a secret's *text*, use `patterns`: skipping a property does not
  remove its text elsewhere (`keys: ['message']` leaves it in `stack`), and
  hides the value, not the name.
- `keys` match a name everywhere. `paths` are JSON paths into three documents:
  `$...` the caught value, `$context...`, `$public...` the selected details;
  anchor a `RegExp` with `^\$\.` to keep it on the caught value.
- Every pattern needs the `g` flag; `replacement` is inserted literally.
- Redaction never discloses: on a public report the policy is given only what
  the kind's `public.details` selector returned.

A policy that throws fails closed: the value becomes the replacement. The
diagnostic report lists the failure in `reporting_errors` with
`stage: 'redact'`; the thrown message is withheld, because it may quote what
the policy was protecting.

Throws: `APPEX_INVALID_REDACTION_POLICY`

```ts
import { createRedactionPolicy, toDiagnosticReport } from 'application-exception';
const redact = createRedactionPolicy({
  keys: ['password', /token$/i],
  patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
});
const report = toDiagnosticReport(new Error('bad key sk-abcdefgh'), { redact });
console.log(report.stack?.[0]); // 'Error: bad key [redacted]'
```

### `toDiagnosticReport`

```ts signature
function toDiagnosticReport(caught: unknown, options?: DiagnosticReportOptions): DiagnosticReport;
```

Report any caught value for operators: a corj report with `occurrence_id`,
`fingerprint`, the optional `context`, and `reporting_errors`. Send it to a
trusted sink; it contains messages, stacks, and every enumerable property of
the error graph. Every option of caught-object-report-json is reachable
through `corj`, except `redact`, which both reports share at the top level.

`corj: { maxReportSize }` (at least 512) bounds the whole report in UTF-8
bytes of compact JSON: over budget, corj drops `context` whole, then
`reporting_errors` — leaving `context_omitted` and `reporting_errors_omitted`
at `'max_size'` — and only then trims error content. `occurrence_id`,
`fingerprint` and `v` are never trimmed.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_REDACTION_POLICY`; corj option errors propagate.

```ts
import { toDiagnosticReport } from 'application-exception';
const caught: unknown = new Error('connection refused', { cause: { code: 'ECONNREFUSED' } });
const report = toDiagnosticReport(caught, {
  context: { runId: 'run-1' },
  corj: { maxReportSize: 4096 },
});
// { "v": "corj/v0.14", "occurrence_id": "AE_…", "fingerprint": "fp1_…", "stack": [...],
//   "children": [{ "path": "$.cause", ... }], "context": { "runId": "run-1" } }
console.error(JSON.stringify(report));
```

### `toPublicReport`

```ts signature
function toPublicReport(caught: unknown, options?: PublicReportOptions): PublicReport;
```

Report a failure to an agent or user: the kind's `public` policy rendered
into `code`, `message`, and `as_json`, with the same `occurrence_id` as the
diagnostic report. Values without a policy get `INTERNAL_ERROR` and a
generic message. Nothing from the error is emitted except the policy's
outputs, `occurrence_id` and the fingerprint, a hash. The default recipe
hashes constructor names and stack text under this call's own `corj` and
`redact`; `corj: { fingerprintParts: null }` reads nothing. It is published
only when backed by real stack frames: a stackless value (a thrown string, a
plain object, an `Error` with no stack or a frameless one) and any recipe
without `stack` publish none, because that hash is over the value's own text.

The `public` option overrides that policy for this call, field by field:
`code`, `message` (a string or a function of the details) and `details` (a
selector function, or `null` to disclose nothing). A field left out keeps
what the kind says.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`; corj option errors propagate.

```ts
import { defineException, toPublicReport } from 'application-exception';
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: { code: 'TOOL_UNAVAILABLE', details: ({ tool }) => ({ tool }) },
});
const failure = new ToolUnavailable({ details: { tool: 'search' } });
const report = toPublicReport(failure, { public: { message: 'Search is down.' } });
// { v: 'appex/public/v4', occurrence_id: 'AE_…', fingerprint: 'fp1_…',
//   code: 'TOOL_UNAVAILABLE', message: 'Search is down.', as_json: { tool: 'search' } }
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
overridden for both at the top level. Every option bag is read once and
validated before either report is built, `realm` included, and a failure to
build either one throws instead of returning half a pair. Each report's
fingerprint comes from its own bag, so they agree when both bags carry the
same `corj` and `redact`.

Throws: `APPEX_INVALID_OPTIONS`, `APPEX_INVALID_OCCURRENCE_ID`, `APPEX_INVALID_PUBLIC_CODE`, `APPEX_INVALID_PUBLIC_MESSAGE`; corj option errors propagate.

```ts
import { toReports } from 'application-exception';
const { occurrence_id, diagnostic, public: disclosed } = toReports('socket closed', {
  diagnostic: { context: { runId: 'run-1' }, corj: { maxReportSize: 4096 } },
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
`ok`; escalate on `!ok` with `reason` and `path`. Both `appex/public/v3` and
`appex/public/v4` are accepted, and the decoded report keeps the `v` it
arrived with, so a v3 sender stays readable while services upgrade.

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
const DIAGNOSTIC_REPORT_VERSION: "corj/v0.14";
```

The `v` of every diagnostic report: corj's report version.

### `PUBLIC_REPORT_VERSION`

```ts signature
const PUBLIC_REPORT_VERSION: "appex/public/v4";
```

The `v` of every public report this version emits.

### `APPEX_ERROR_CODES`

```ts signature
const APPEX_ERROR_CODES: readonly ["APPEX_INVALID_TAG", "APPEX_INVALID_MESSAGE", "APPEX_INVALID_ID_PREFIX", "APPEX_INVALID_PUBLIC_POLICY", "APPEX_INVALID_DETAILS", "APPEX_INVALID_CAUSES", "APPEX_INVALID_OPTIONS", "APPEX_INVALID_OCCURRENCE_ID", "APPEX_INVALID_PUBLIC_CODE", "APPEX_INVALID_PUBLIC_MESSAGE", "APPEX_INVALID_TRUST_REALM", "APPEX_INVALID_REDACTION_POLICY"];
```

Every code an error thrown by this package can carry. Each has a section in docs/agent/errors.md.

## Types

### `AppexCorjOptions`

```ts signature
export type AppexCorjOptions = Omit<CorjOptionsInput, 'redact'>;
```

Options of caught-object-report-json, passed through as `corj`. Every corj
option is available except `redact`, which both reports share at the top level.
`metadata.v` is always on. `onError` defaults to a silent function: the same
records are in the report's `reporting_errors`.

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
export type DiagnosticReport = CorjReport & {
  readonly v: CorjVersion;
  readonly occurrence_id: string;
};
```

A corj report object (see caught-object-report-json) of one occurrence.
`occurrence_id` is the id shared with the public report, and `v` is always
present: corj never trims either. `context` is the JSON form of
`options.context`, `reporting_errors` lists inspection failures (at most 8),
and `context_omitted` / `reporting_errors_omitted` say when one of those two
was left out to meet `corj.maxReportSize`.

### `DiagnosticReportOptions`

```ts signature
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly redact?: RedactionPolicy;
  readonly corj?: AppexCorjOptions;
}
```

Options of `toDiagnosticReport`. `occurrenceId` overrides the occurrence id.
`context` is any caller data to report beside the caught value; corj bounds
it and drops it whole when the report is over budget. `redact` is the policy
both reports share. `corj` carries every option of
caught-object-report-json, `maxReportSize` and `inspection` included.

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

### `PublicOverride`

```ts signature
export type PublicOverride = {
  readonly code?: string;
  readonly message?: string | ((details: DetailsRecord<object>) => string);
  readonly details?: ((details: DetailsRecord<object>) => unknown) | null;
};
```

A per-call override of a kind's public policy, merged field by field: a
field the override leaves out keeps what the kind's policy says. `message`
and `details` are read exactly as a policy's are, so a function is given the
kind's details record, and `details: null` suppresses the kind's selector.

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
  readonly v: PublicReportVersion;
  readonly occurrence_id: string;
  readonly fingerprint?: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}
```

What an application discloses about one failure. `code` is the branching
protocol, `occurrence_id` correlates with the diagnostic report, `message`
is display text, `as_json` is the selected JSON. `truncated` marks a cut
message or `as_json`. `fingerprint` is equal for failures of the same kind
from the same place; a retry signal, not a lookup key. It is absent when
`corj: { fingerprintParts: null }` turned it off, and on a decoded report of
format `appex/public/v3`, which predates it.

### `PublicReportOptions`

```ts signature
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly public?: PublicOverride;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
  readonly corj?: AppexCorjOptions;
}
```

Options of `toPublicReport`. `occurrenceId` overrides the occurrence id.
`public` overrides the kind's public policy for this call. `redact` is the
policy both reports share, `realm` is the trust realm to read a foreign
value's policy from, and `corj` carries the options of
caught-object-report-json used to inspect the selected details.

### `PublicReportVersion`

```ts signature
export type PublicReportVersion = 'appex/public/v3' | 'appex/public/v4';
```

Every public report format `decodePublicReport` reads: the current one and the one before it.

### `RedactionContext`

```ts signature
export type RedactionContext = CorjContext;
```

What a `transform` is told about a value: `stage`, the report `key`, the
source `prop`, and a `path` whose root names the document: `$` the caught
value, `$context` the context, `$public` the public report.

### `RedactionPolicy`

```ts signature
export interface RedactionPolicy {
  readonly [REDACTION_POLICY]: CorjRedactPolicy;
}
```

An opaque, reusable redaction policy. Build it once, at startup, and share it between reports.

### `RedactionPolicyOptions`

```ts signature
export type RedactionPolicyOptions = CorjRedactPolicyInput;
```

Input of `createRedactionPolicy`: corj's policy input. `keys` and `paths` skip properties; `patterns` and `transform` scrub text. All optional.

### `ReportingError`

```ts signature
export type ReportingError = CorjReportingError;
```

A problem corj met while producing a report: `stage`, `path`, the report `key`, the source `prop`, and a scrubbed description.

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
without its own `occurrenceId`, so that the shared id stays unambiguous;
the public bag's own `public` key is the per-call policy override.

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

### `CorjOptionsInput`

Every option of caught-object-report-json; `corj` takes all of them but `redact`.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `CorjReport`

The corj report object a `DiagnosticReport` extends: the root node plus its flattened `children`.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `CorjReportChild`

One node of the flattened error tree in `children`, with its `id`, `path`, `level` and `child_ids`.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report

### `CorjReportingError`

One failure met while a report was produced, as `reporting_errors` lists it.

Re-exported from caught-object-report-json; field meanings: https://github.com/dany-fedorov/caught-object-report-json#the-report
