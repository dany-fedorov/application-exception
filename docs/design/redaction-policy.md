# Redaction policy — decision record (issue #43)

Status: **implemented** as `createRedactionPolicy`, with one documented
assumption that should be revisited when corj ships its own mechanism.

## The assumption

[#43](https://github.com/dany-fedorov/application-exception/issues/43) says to
avoid duplicating corj's traversal implementation, and points at
[caught-object-report-json#211](https://github.com/dany-fedorov/caught-object-report-json/issues/211)
as the source of the underlying transformation. corj#211 is open, and the
installed `caught-object-report-json@9.0.1` exports `CorjMaker`, `makeCorj`,
`makeCorjArray`, `restoreExpectedValues`, the marker and schema-link constants,
and `CORJ_DEFAULT_OPTIONS` — nothing for field selection or redaction.

**Assumption taken:** redaction is applied as a transform over the *already
produced* report, which is a plain JSON tree, rather than during corj's
inspection of the caught value.

This is not the duplication the issue warns about. What corj owns — reading
properties without invoking accessors, flattening the cause graph into
`children`, depth and child limits, expected-value omission, the circular and
truncated markers, the `reporting_errors` stages — is still corj's, and is run
exactly once before redaction sees anything. `src/redaction.ts` walks a JSON
object; it does not inspect caught values.

**Cost of the assumption:** a secret is materialized in memory inside the corj
report for the moment between production and redaction. It never reaches a sink,
because both reporters redact before returning, but a policy that must never
materialize a secret at all needs corj#211. When corj#211 lands, the `keys` /
`paths` / `values` rules should be forwarded into `CorjMaker` and this walk kept
only for the fields corj does not produce (`context`, `reporting_errors`, and
the selected public `as_json`).

## What was built

`createRedactionPolicy({ keys, paths, values, replacement, transform })` returns
an opaque, reusable policy. It is accepted as `redact` by `toDiagnosticReport`,
`toPublicReport`, and `toReports`.

- `keys` — property names, exact or `RegExp`, redacted wherever they appear.
- `paths` — exact JSON paths such as `$.as_json.details.token`.
- `values` — `RegExp`s matched against string values, so a secret is caught in
  a message or a stack line as well as in structured details.
- `replacement` — what a redacted value becomes; `[redacted]` by default.
- `transform` — the last word on any value the rules above left alone.

It covers the whole diagnostic report: message, stack, `as_json`, every nested
cause under `children`, `context`, and `reporting_errors`.

## The rules that make it safe

**Selection and redaction stay distinct.** On a public report the policy runs
*after* the kind's `public.details` selector. It can only rewrite what the
selector already chose, so redacting a field is never a decision to disclose the
rest, and a kind with no selector still returns no `as_json` no matter what the
policy says. An unknown failure keeps the generic `INTERNAL_ERROR` shape.

**A transform may only substitute within the JSON type it was given.** A report
pins types positionally — stack lines are strings, `level` is a number — so a
transform that returns a different type, or a structure, collapses to an
information-free blank of the original's type. It cannot smuggle a structure
into a report or make one fail its schema. It *can* return a longer string than
it replaced: a replacement is never guaranteed to shrink the report, which is
why a policy can push a tight `maxFinalReportSize` over its limit. The budget
error says so when a policy is in play.

**A throwing transform is safe and observable.** The value it was asked about is
dropped and replaced, and the diagnostic report records the failure in
`reporting_errors` with stage `other`. Dropping is always safe because it can
only narrow disclosure — the reporting-failure outcome stays visible rather than
degrading into a silent leak.

**Identity and shape survive, positionally.** Protection is by *position*, never
by name: the report's own fields — `v`, `occurrence_id`, `report_omitted`, and
corj's `id`, `path`, `level`, `child_ids`, `typeof`, `instanceof_error`,
`truncated`, `as_json_format`, `as_string_format`, `children_omitted`, and the
`stage` of a `reporting_errors` entry — are walked but never replaced at the
positions the schema pins them to. A value the application happens to call `id`,
`code`, or `path` inside `as_json` or `context` is ordinary data and *is*
redacted; protecting such names globally would have silently leaked exactly the
fields most likely to hold a session id or a file path. Container arrays are
protected so one is never swapped for a string, while their items are still
walked. A policy of `{ keys: [/.*/], values: [/.*/], paths: ['$'] }` produces a
valid report; the test suite validates redacted reports against both schemas.

**Rules target values, not key names.** A secret that appears as a property
*name* (`{ 'sk-live-abc': 1 }`) is not rewritten by `values`; use `keys` or
`paths` to drop the whole entry, or avoid putting secrets in key positions.

**Redaction runs before the byte budget**, so `maxFinalReportSize` measures what
is actually emitted. On a public report it runs before the 4,096-character
message bound is re-applied, so a policy cannot push a message past the length
its own schema and decoder accept.

**The walk is depth-bounded.** corj bounds a report by bytes, not by nesting, so
a hostile caught value can produce an `as_json` thousands of levels deep. Past
512 levels the walk replaces the subtree instead of descending, which narrows
rather than leaks, and keeps a redacting reporter from turning a deep value into
a `RangeError`.

**No policy means no change.** Reports without `redact` behave exactly as they
did in 0.3.0; the test suite asserts the secret comes back when the policy is
bypassed.
