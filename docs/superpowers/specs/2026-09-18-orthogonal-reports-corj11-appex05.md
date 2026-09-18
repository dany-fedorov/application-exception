# Orthogonal reports: corj 11 and application-exception 0.5

Date: 2026-09-18. Status: design agreed with the owner in conversation; this file is the
record. Two plans implement it:

- `docs/superpowers/plans/2026-09-18-corj-11-orthogonal-reports.md` (corj, first)
- `docs/superpowers/plans/2026-09-18-appex-05-on-corj-11.md` (application-exception, second)

Repos: corj is `/home/df/wd/personal/caught-object-report-json`
(`caught-object-report-json`, 10.0.0, report format `corj/v0.13`). appex is
`/home/df/wd/personal/application-exception` (`application-exception`, 0.4.0).

## Goal

Fewer first-order entities across the two libraries, with more combinations allowed by the
ones that remain. Today application-exception rebuilds three things corj almost provides:
error collection (`recorder`), a bounded JSON view (`jsonView`), and a size budget
(`maxFinalReportSize` with its shrink loop). This design moves each of them into corj as
one general mechanism, and leaves application-exception as the typed-failure and
disclosure layer on top.

Every decision below carries an **Agent benefit** line: what changes for a coding agent
that uses the library or reads its reports.

## Owner rulings

Made by the owner on 2026-09-18. Not open for re-discussion by an executor.

| # | Ruling |
| --- | --- |
| R1 | Reporting errors are report data **and** the `onError` handler stays, console default included. |
| R2 | One stage enum and one context type in corj. |
| R3 | corj exposes the bounded JSON view as a primitive, with named roots. |
| R4 | Caller data lives in one container field; corj budgets it. |
| R5 | application-exception passes corj options through one `corj` slot. |
| R6 | `createRedactionPolicy` stays as a thin validating wrapper (fail at startup). |
| R7 | One `public` option replaces the per-call `code` / `message` / `details`. |
| R8 | `occurrence_id` is a corj field. Option name: `occurrenceIdSources`. An ordered list; entries are `{ field }`, `{ path }`, a function, or `{ auto: 'random' }`. |
| R9 | `fingerprint` is a corj field, built from a list of parts, hashed from chosen fields, not from the report string. |
| R10 | `null` as well as `[]` turns either feature off. Both lists accept function entries. |
| R11 | Entries take a per-entry `inspection` override. |
| R12 | Path entries are in scope. |
| R13 | application-exception keeps corj's default `inspection`. It does not default to `no-invoke`. |
| R14 | The public report carries the fingerprint by default. |

## Assumptions made without asking

The owner's working agreement is "make assumptions, don't ask". These were mine. Each is
a small, local change to overturn; none is load-bearing for the rest.

| # | Assumption | Cheapest alternative |
| --- | --- | --- |
| A1 | The fingerprint option is named `fingerprintParts`. It mirrors `occurrenceIdSources` and cannot be confused with the call argument `fingerprint`. | Rename to `fingerprint`. |
| A2 | A path entry is an array of keys: `{ path: ['details', 'tool'] }`. corj has no JSONPath parser, keys with dots or dashes stay exact, and there is no `$` to clash with redact `paths`, where `$` always means the caught root. `{ field: 'x' }` is the one-segment case. | Accept a `'$.details.tool'` string and add a naive splitter. |
| A3 | The container field is named `context`. application-exception already emits that name, so its diagnostic format does not move. | `report_context`. |
| A4 | `public` takes no resolver function. A resolver runs caller code against untrusted caught values and makes `message: caught.message` a one-liner, which is the leak the library exists to prevent. | Add `public: (caught) => PublicOverride` later; additive. |
| A5 | A per-call `public` override merges field by field over the kind's policy. `details: null` suppresses the kind's selector. | Whole-policy replacement. |
| A6 | Ids and caller-supplied fingerprints are printable ASCII without spaces: `/^[\x21-\x7e]+$/`, at most 128 and 64 characters. They bypass redaction, so they are bounded tokens, and the bound keeps the size floor provable. | Allow any string; raise the floor. |
| A7 | `reporting_errors_omitted: 'max_size'` exists next to `context_omitted`. Without it a reader of a trimmed report would conclude inspection was clean. | Rely on root `truncated`. |
| A8 | `v` becomes a fixed field in corj's limiter when `metadata.v` is on. application-exception restores it by hand today, outside the budget. | Keep dropping it at tiny budgets. |
| A9 | The three aliases deprecated since corj 9 are removed in 11. The four type names this design merges stay as deprecated aliases for one major. | Keep all seven. |
| A10 | `decodePublicReport` accepts `appex/public/v3` and `appex/public/v4`. Services upgrade at different times and an agent harness receives both. | Accept v4 only. |

---

## Part 1: corj 11, report format `corj/v0.14`

### D1. One context type, one stage enum (R2)

```ts
export type CorjStage =
  | 'prop-access' | 'as_string' | 'as_json' | 'children'
  | 'limit' | 'redact' | 'warning' | 'other';
export type CorjReportKey = keyof CorjReport | keyof CorjReportChild;
export type CorjContext = {
  stage: CorjStage;
  /** JSONPath of the value. `$` is the caught root; `$context` and other named roots are separate documents. */
  path: string;
  key?: CorjReportKey | undefined;
  prop?: string | undefined;
};
```

`CorjRedactStage`, `CorjErrorStage`, `CorjRedactContext`, `CorjErrorContext` become
deprecated aliases of these two. Removed outright: `CaughtObjectReportJson`,
`CaughtObjectReportJsonChild`, `CorjMakerOptions` (deprecated since 9).

**Agent benefit:** one shape to learn for every callback. A `transform`, an `onError`
handler and a `reporting_errors` row all describe a location the same way, so code that
handles one handles all three.

### D2. Reporting errors are data, and the handler stays (R1)

```ts
export type CorjReportingError = CorjContext & { error: string };
export type CorjErrorHandler = (caught: unknown, record: CorjReportingError) => void;
```

- corj builds one record per failure and applies the four rules of corj issue #219:
  `path` and `prop` go through the policy; text is scrubbed **before** it is cut to 256
  characters; a `stage: 'redact'` record carries the policy's `replacement` as its `error`,
  never the thrown message; scrubbing shares the maker's redactor and its re-entrancy
  guard.
- The record goes to two places: the root field `reporting_errors` (at most 8 rows) and
  `onError(caught, record)`. The handler still receives the raw caught object, for sinks
  such as Sentry. The default handler prints the record with `console.warn`. The special
  case that hands the redactor only to the default handler is deleted.
- Records are collected per call, not per maker: a maker is shared, and a getter on the
  caught object may re-enter the same maker.
- Failures inside the finishing pass (`stage: 'limit'`, and `stage: 'other'` from
  omission) happen after the budget is spent. They reach the handler only.
- This closes corj #219 without adding a `redact` function to the context.

**Agent benefit:** a report explains its own gaps. An agent that sees `message: null`
finds the reason in the same JSON, without access to the process's stderr.

### D3. The JSON view is a primitive, with named roots (R3)

```ts
export type CorjJsonView = {
  value: CorjJsonValue | null;
  truncated: boolean;
  errors: CorjReportingError[];
};
maker.makeJson(value: unknown, options?: { root?: string; maxSize?: number | null }): CorjJsonView;
maker.scrubText(text: string, where?: { path?: string; key?: CorjReportKey; prop?: string }): string;
```

- `makeJson` is the `as_json` pipeline for any value: bounded, cycle-safe, redacted, and
  obedient to `inspection`. Unlike a report node's `as_json`, it does not hide
  `childrenSources` properties: a view has no children.
- `root` is `'$'` (default) or a named document root matching
  `/^\$[A-Za-z_][A-Za-z0-9_]*$/`, such as `$context` or `$public`. A property path always
  continues with `.` or `[`, so a named root cannot collide with a path into the caught
  value. Today application-exception reports a context failure at `$.context.x`, which is
  also the path of a `context` property on the caught value.
- `maxSize` defaults to the maker's `maxReportSize`; an integer >= 256, or `null`.
- `scrubText` applies the policy's scrub rules to one string that corj never sees, with
  `stage: 'warning'`. It returns the text unchanged when no policy is configured.
  It replaces the `CorjRedactor` export, which is removed. `resolveCorjRedactPolicy` stays,
  and marks resolved policies so re-validation is free.
- Consequence to document: `paths` rules now see `$context...` and named-root paths. An
  unanchored `RegExp` such as `/\.headers$/` starts matching there. It fails safe (more is
  redacted). The upgrade note says to anchor with `^\$\.` to keep a rule on the caught value.

**Agent benefit:** `paths: ['$context.user.email']` is now expressible; and a `transform`
can tell which document it is looking at from `path` alone.

### D4. Per-call input, and one budgeted container (R4)

```ts
export type CorjCallInput = {
  occurrenceId?: string;   // explicit id; wins over occurrenceIdSources
  fingerprint?: string;    // explicit fingerprint; wins over fingerprintParts
  context?: unknown;       // caller data: request id, run id, tool name
};
maker.makeReportObject(caught: unknown, call?: CorjCallInput): CorjReport;
maker.makeReportArray(caught: unknown, call?: CorjCallInput): CorjReportChild[];
makeCorj(caught, options?, call?); makeCorjArray(caught, options?, call?);
```

- Per-occurrence values are call arguments, never maker options, so one maker serves every
  call.
- `context` is rendered with the JSON view at root `$context`, capped by the new option
  `maxContextSize` (default `16_384`, `null` for no separate cap), and counted inside
  `maxReportSize`.
- Over budget, corj drops the container whole, however small it is, and sets `context_omitted: 'max_size'`;
  then drops `reporting_errors` and sets `reporting_errors_omitted: 'max_size'`; only then
  trims error content. That is application-exception's order today.
- Fixed root fields are counted and never trimmed: `occurrence_id`, `fingerprint`, and `v`
  when `metadata.v` is on. They are present in the minimal report.
- The size floor rises from 256 to **512**. A test proves the worst-case minimal report
  (128-character id, 64-character fingerprint, both omission flags, array form) fits.
- `replacement` is capped at 128 characters in corj's policy validation.

**Agent benefit:** one number bounds the whole report, and a caller never learns a second
budget. A trimmed report says exactly which optional part went.

### D5. `occurrence_id` and `occurrenceIdSources` (R8, R10, R11, R12)

```ts
export type CorjSourceEntry =
  | { field: string; inspection?: CorjInspection }
  | { path: readonly (string | number)[]; inspection?: CorjInspection };
export type CorjEntryFunction = (context: CorjReportIdContext) => unknown;
export type CorjOccurrenceIdSource = CorjSourceEntry | CorjEntryFunction | { auto: 'random' };
// option: occurrenceIdSources: readonly CorjOccurrenceIdSource[] | null
// default: [{ auto: 'random' }]
```

- Resolution: the call argument, then each source in order; the first valid id wins. A
  valid id matches `/^[\x21-\x7e]{1,128}$/`.
- `{ field }` and `{ path }` read the **root** caught value through corj's ordinary
  `access`, so skip rules apply and `inspection` decides whether a getter runs. An entry's
  own `inspection` overrides the maker's for that read. Loosening it under a global
  `no-invoke` runs caught code; the docs say so.
- A function receives `{ index: -1, level: 0, path: '$', caught }`. A throw is recorded
  (`stage: 'other'`, `key: 'occurrence_id'`) and resolution continues.
- `{ auto: 'random' }` yields `CORJ_` plus 26 Crockford base32 characters, from
  `globalThis.crypto.getRandomValues` when present and `Math.random` otherwise. It is
  memoized per object in a module-level `WeakMap`, so one error reported twice keeps one
  id. The id is a correlation handle, not a secret.
- Falling through is silent. An exhausted list, `[]` or `null` omits the field.
  An entry after `{ auto }` is dead and is rejected at construction.
- The id is never passed through the redaction policy: scrubbing would break correlation.
  That is why it is a bounded ASCII token.

**Agent benefit:** every corj report can be quoted back by id, and a caller maps its own
request id onto it with one line of config instead of a wrapper.

### D6. `fingerprint` and `fingerprintParts` (R9, R10, R11, R12)

```ts
export type CorjFingerprintPart =
  | 'constructor_name' | 'message' | 'stack' | 'as_string' | 'typeof'
  | CorjSourceEntry | CorjEntryFunction;
// option: fingerprintParts: readonly CorjFingerprintPart[] | null
// default: ['constructor_name', 'stack']
maker.makeFingerprint(caught: unknown): string | undefined;
```

- Every part contributes (the id list is first-wins; this list is all-of). Order in the
  config does not matter: named parts are sorted by label. Function parts keep their
  relative order after the named ones.
- Parts apply to **every node**, root and children, in discovery order. `{ field }` and
  `{ path }` are read relative to the node.
- The `stack` part excludes the node's own header, so `message` and `stack` do not overlap:
  if the stack starts with the node's `as_string`, that prefix is cut; otherwise, if the
  stack has a V8 frame line (`/\n {4}at /`), everything before the first one is cut;
  otherwise the stack is used whole (Firefox and Safari stacks have no header).
- Values are taken **after redaction and before omission and size limiting**, so neither
  the budget, `stackFormat`, `omitExpectedValues` nor the format version moves the
  fingerprint. `maxDepth`, `maxChildren`, `childrenSources` and the redaction policy do.
- Nested values (objects, arrays) go through a key-sorted JSON view with a fixed
  16,384-unit cap, so key order and the report budget cannot move the hash.
- Hash input: `JSON.stringify(['fp1', labels, rows])`, where `rows` is
  `[path, values]` per node and a missing value is `null`. A root without a string stack
  (a thrown primitive or plain object), or whose values are all `null` or `''`, appends
  `[typeof, as_string]`, so thrown primitives do not all share one fingerprint. A thrown
  string has `constructor_name: "String"`, so an "all empty" rule alone would not catch it.
- Output: `fp1_` plus the first 32 hex characters of SHA-256. SHA-256 is bundled as
  pure JavaScript: the web platform has no synchronous digest and corj has no dependencies.
  Measured cost: about 80 µs per 4 KB of input.
- `as_json` is not an allowed part: it carries timestamps and ids (a typed exception's
  `as_json` holds `occurrenceId` and `timestamp`). Name a stable property with `{ field }`.
- A whole-report hash was rejected for the same reason, and because every format bump
  would change every fingerprint.
- `makeFingerprint` computes it without building `as_json` or running the limiter.

**Agent benefit:** an agent in a retry loop compares two strings to learn "this is the
same failure again". No other report field says that as cheaply.

### D7. Release

Breaking: report format `corj/v0.14` (`-full` likewise), new default fields, floor 512,
handler signature, removed exports. Commits use `feat!:` with a `BREAKING CHANGE:` footer
so semantic-release computes `11.0.0`. The owner publishes; the plan ends with a green,
unmerged PR and a development tarball.

---

## Part 2: application-exception 0.5.0

### D8. `toDiagnosticReport` becomes a thin call into corj (R5, R13)

```ts
export type AppexCorjOptions = Omit<CorjOptionsInput, 'redact'>;
export interface DiagnosticReportOptions {
  readonly occurrenceId?: string;
  readonly context?: unknown;
  readonly redact?: RedactionPolicy;
  readonly corj?: AppexCorjOptions;
}
export type DiagnosticReport = CorjReport & {
  readonly v: CorjVersion;
  readonly occurrence_id: string;
};
```

- Removed options: `maxReportSize`, `maxFinalReportSize`, `maxDepth`, `maxChildren`,
  `stackFormat`. Removed field: `report_omitted`. Removed code:
  `APPEX_REPORT_BUDGET_TOO_SMALL`. Removed internals: `recorder`, `jsonView`,
  `assembleDiagnostic`, `shrinkToBudget`.
- `corj.redact` is rejected with `APPEX_INVALID_OPTIONS` naming the top-level `redact`:
  the public report needs the same policy. `metadata.v` is forced on. `onError` defaults
  to a silent function; the errors are in the report.
- application-exception always resolves the occurrence id itself (explicit, then the
  branded `occurrenceId`, then its per-object memo with the `AE_` prefix) and passes it as
  the call argument. `toPublicReport` needs the id without building a corj report, and two
  loaded copies of corj would hold separate memos.
- One `CorjMaker` is cached per (`corj` bag identity, redaction policy). The bag is
  shallow-frozen on first sight, so a later mutation fails loudly instead of being ignored.
- `inspection` stays corj's default (R13).

**Agent benefit:** every corj option, `inspection: 'no-invoke'` included, is reachable
from application-exception without waiting for a release that mirrors it.

### D9. Thin redaction wrapper (R6)

`createRedactionPolicy(options)` keeps validating at creation and keeps throwing
`APPEX_INVALID_REDACTION_POLICY`. It now holds **one** resolved corj policy. The
`forCaught` / `forViews` split is deleted: named roots do its job. `RedactionPolicyOptions`
becomes an alias of corj's `CorjRedactPolicyInput`; `RedactionContext` an alias of
`CorjContext`.

**Agent benefit:** a bad policy still fails at startup, not inside a catch block in
production, and `paths` can now reach `$context` and `$public`.

### D10. One `public` option (R7, A4, A5)

```ts
export type PublicOverride = {
  readonly code?: string;
  readonly message?: string | ((details: DetailsRecord<object>) => string);
  readonly details?: ((details: DetailsRecord<object>) => unknown) | null;
};
export interface PublicReportOptions {
  readonly occurrenceId?: string;
  readonly public?: PublicOverride;
  readonly redact?: RedactionPolicy;
  readonly realm?: TrustRealm;
  readonly corj?: AppexCorjOptions;
}
```

The old top-level `code`, `message` and `details` are removed and rejected as unknown
options. A value without a trusted kind policy gets `{}` as `details` input, as today.

**Agent benefit:** the policy shape learned at `defineException` is the shape used at the
call site; there is no second vocabulary with a `details` that means a value in one place
and a selector in the other.

### D11. Public report format `appex/public/v4` (R14, A10)

```ts
export interface PublicReport {
  readonly v: 'appex/public/v3' | 'appex/public/v4';
  readonly occurrence_id: string;
  readonly fingerprint?: string;
  readonly code: string;
  readonly message: string;
  readonly as_json?: CorjJsonValue | null;
  readonly truncated?: true;
}
```

- `toPublicReport` emits v4 and carries the fingerprint from `maker.makeFingerprint(caught)`.
  `corj: { fingerprintParts: null }` turns it off. `toReports` computes it once, from the
  diagnostic report, so the two always agree. A standalone `toPublicReport` agrees with a
  standalone `toDiagnosticReport` when both receive the same `corj` bag and `redact`.
- This changes one sentence of the contract. It used to be "nothing is read from the error
  except its policy inputs". It becomes "nothing from the error is **emitted** except its
  policy outputs and a hash". The fingerprint reads names, messages and stacks of the error
  graph, under the same `inspection` and `redact` as the diagnostic report.
- With the default parts the hash input contains stack text with absolute paths and line
  numbers, which a reader cannot reproduce. The docs warn that a recipe **without** `stack`
  lets a reader confirm guesses about the hashed values.
- Selected details go through `maker.makeJson(selected, { root: '$public', maxSize: 16_384 })`.
  The message goes through `maker.scrubText` and is then cut to 4,096 characters, as today.
- `decodePublicReport` accepts v3 and v4. A v3 report with a `fingerprint` field is rejected.
- New file `schemas/public-report-v4.json`; `schemas/diagnostic-report-v5.json` embeds
  corj v0.14. Every published schema stays byte-identical.

**Agent benefit:** the agent on the receiving side gets the retry signal too, not only
the operator.

### D12. Identifier rule

`occurrenceId` and `idPrefix` tighten to printable ASCII without spaces (A6). The default
ids already comply.

## Non-goals

- No change to `defineException`, `snapshotDetails`, trust realms, `causes`, or `toReports`
  beyond its option bags.
- No single report shape in corj, no pure-function replacements for `omitExpectedValues`,
  `stackFormat` or `metadata` (sweep items 7 and 8), no merged trust registries (item 10).
- No publishing. Both releases are published by the owner, by hand.
