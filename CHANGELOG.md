# Changelog

## 0.5.0 — 2026-09-19

corj 11 (report format `corj/v0.14`) absorbs the mechanisms this package used to
rebuild — error collection, a bounded JSON view, and a size budget — so 0.5.0 is
the disclosure layer on top of it. Every corj option now travels in one `corj`
slot, and both reports carry a `fingerprint`.

**Breaking.**

- Every corj option moved into one `corj` bag on `toDiagnosticReport`,
  `toPublicReport` and `toReports`. The top-level `maxReportSize`, `maxDepth`,
  `maxChildren` and `stackFormat` are gone, and an unknown key is
  `APPEX_INVALID_OPTIONS`. `corj.redact` is rejected by name: the policy stays a
  top-level `redact`, because both reports share it. `metadata.v` is forced on,
  and `onError` defaults to a silent function — the same records are in the
  report's `reporting_errors`.
- `maxFinalReportSize` is gone, with its `report_omitted` field and its
  `APPEX_REPORT_BUDGET_TOO_SMALL` code. `corj: { maxReportSize }` (a safe integer
  of at least 512, or `null`) bounds the whole report instead: over budget corj
  drops `context` whole, however small it is, and sets
  `context_omitted: 'max_size'`, then drops `reporting_errors` and sets
  `reporting_errors_omitted: 'max_size'`, and only then trims error content.
  `occurrence_id`, `fingerprint` and `v` are never trimmed.
- The per-call `code`, `message` and `details` of `toPublicReport` became one
  `public: { code, message, details }` bag, merged field by field over the kind's
  policy. `message` may be a string or a function of the details, and `details`
  is a selector function or `null`. **`details: null` now discloses no `as_json`
  at all**; 0.4.0 disclosed `as_json: null`.
- The public report format is `appex/public/v4`, with `fingerprint` right after
  `occurrence_id`. `decodePublicReport` reads v3 and v4 and keeps the `v` it was
  given; a v3 report that carries a `fingerprint` key is rejected. The new type
  `PublicReportVersion` is exported.
- The diagnostic report's `v` is `corj/v0.14`, and the schemas ship as
  `schemas/diagnostic-report-v5.json` and `schemas/public-report-v4.json`. The
  0.4.0 and 0.3.0 schemas stay published unchanged.
- `occurrenceId` and `idPrefix` must be printable ASCII without spaces —
  `/^[\x21-\x7e]{1,128}$/` and `/^[\x21-\x7e]{1,32}$/`. They bypass redaction
  and are never trimmed, so they are bounded tokens. The default `AE_` ids
  already comply.
- A redaction policy's `paths` now address three documents: `$...` the caught
  value, `$context...` the context, `$public...` the selected public details. An
  unanchored `RegExp` such as `/\.headers$/` starts matching in all three. That
  direction fails safe — more is redacted, not less — and `^\$\.` keeps a rule on
  the caught value. The `transform` direction below does **not** fail safe.
  `createRedactionPolicy` now holds one resolved policy;
  `RedactionPolicyOptions` is corj's policy input and `RedactionContext` is
  corj's `CorjContext`, the one shape every corj callback and every
  `reporting_errors` row now uses.
- **A 0.4 `transform` keyed on `path` or `stage` fails open on 0.5.** 0.4 offered
  context values at `$.<key>` and the public message as `stage: 'as_string'`,
  `path: '$.message'`. 0.5 roots context values at `$context.<key>`, selected
  public details at `$public.<key>`, and delivers the public message as
  `stage: 'warning'` at `$public.message`. A policy keyed on the old values
  stops matching and **nothing is redacted** — no error, no warning. Re-key it
  on `prop`, which did not change, or on the new roots and stage.
- The runtime dependency is `caught-object-report-json ^11.0.1`. 11.0.1 is the
  floor because it fixes `inspection: 'no-invoke'` on Node 18 and 20, where reading
  an error's `stack` descriptor ran an accessor `name` or `message`. Invalid corj
  options surface as corj's own `TypeError` or `RangeError`, unwrapped. In
  `toDiagnosticReport` and `toPublicReport` this package validates its own
  `occurrenceId` before it builds a maker, so that one stays
  `APPEX_INVALID_OCCURRENCE_ID`; `toReports` resolves both option bags first, so
  a bad corj option there is reported before a bad `occurrenceId`.

**Added.**

- `corj`: every option of caught-object-report-json, per call — `inspection:
  'no-invoke'` to report an untrusted value without running its getters,
  `occurrenceIdSources`, `fingerprintParts`, `maxContextSize`, `onError`, and the
  rest. One `CorjMaker` is cached per (`corj` bag identity, redaction policy),
  and the bag's own keys are frozen on first use, so a later mutation fails
  loudly instead of being ignored.
- `fingerprint` on both reports: corj's hash of the failure's identifying parts
  (`constructor_name` and `stack` by default), equal for the same failure from
  the same place. Each report is fingerprinted by its own option bag, so the two
  agree whenever both bags carry the same `corj` and `redact`. A public report
  publishes the hash only when it is backed by real stack frames: a thrown
  string or number, a plain object, an `Error` with no stack or a frameless one,
  and any recipe without `stack` publish none, because such a hash is over the
  value's own text and a reader who can guess that text could confirm it. Every
  part value goes through the redaction policy under its own path; string values
  are cut at 16,384 units and nested values at 16,384 bytes, so the hash is
  stable and bounded. `corj: { fingerprintParts: null }` turns it off, and then a
  public report reads nothing from the caught value but its policy inputs.
- `schemas/diagnostic-report-v5.json` (corj v0.14 embedded, `v` and
  `occurrence_id` required) and `schemas/public-report-v4.json` (closed, optional
  `fingerprint`), both exported from the package.
- `context` is rendered as a document of its own, rooted at `$context`, so a
  `paths` rule can finally address it — and `$public` addresses the disclosed
  details.

**Upgrading from 0.4.**

| 0.4 | 0.5 |
| --- | --- |
| `toDiagnosticReport(caught, { maxDepth: 2, maxChildren: 4, stackFormat: 'lines' })` | `toDiagnosticReport(caught, { corj: { maxDepth: 2, maxChildren: 4, stackFormat: 'lines' } })` |
| `toDiagnosticReport(caught, { maxReportSize: 4096 })` | `toDiagnosticReport(caught, { corj: { maxReportSize: 4096 } })` |
| `toDiagnosticReport(caught, { maxFinalReportSize: 16_384 })` | `toDiagnosticReport(caught, { corj: { maxReportSize: 16_384 } })` — one budget, at least 512 |
| `report.report_omitted?.includes('context')` | `report.context_omitted === 'max_size'`, and `report.reporting_errors_omitted` |
| `catch` `APPEX_REPORT_BUDGET_TOO_SMALL` | nothing to catch: a budget below 512 is corj's `RangeError` when the maker is built |
| `toPublicReport(caught, { code: 'X', message: 'Down.' })` | `toPublicReport(caught, { public: { code: 'X', message: 'Down.' } })` |
| `toPublicReport(caught, { details: { a: 1 } })` | `toPublicReport(caught, { public: { details: () => ({ a: 1 }) } })` — a selector, not a value |
| `toPublicReport(caught, { details: null })` → `as_json: null` | `toPublicReport(caught, { public: { details: null } })` → no `as_json` field at all |
| `createRedactionPolicy({ paths: [/\.headers$/] })` | `createRedactionPolicy({ paths: [/^\$\..*\.headers$/] })` to stay on the caught value; `'$context.user.email'` now addresses the context |
| `createRedactionPolicy({ transform: (v, { path, stage }) => path === '$.sessionToken' \|\| (stage === 'as_string' && path === '$.message') ? '[x]' : v })` | key on `prop` (`prop === 'sessionToken'`), or on the new roots: `$context.sessionToken`, and `stage === 'warning'` at `$public.message`. Left as it was, the rule matches nothing and redacts nothing |
| `toPublicReport(caught, { occurrenceId: 'trace 42' })` | `toPublicReport(caught, { occurrenceId: 'trace-42' })` — printable ASCII, no spaces |
| `schemas/diagnostic-report-v4.json`, `schemas/public-report-v3.json` | `schemas/diagnostic-report-v5.json`, `schemas/public-report-v4.json`; the old files stay published for stored reports |
| reading `report.v === 'appex/public/v3'` | `decodePublicReport` accepts v3 and v4 and keeps the input's `v`; new reports are `appex/public/v4` |

## 0.4.0 — 2026-09-17

Every new feature is opt-in, but the release is not purely additive: the
diagnostic report format changes.

- **Breaking.** The diagnostic report's `v` is now `corj/v0.13`, and its
  schema ships as `schemas/diagnostic-report-v4.json`.
  `schemas/diagnostic-report-v3.json` stays published unchanged for readers of
  0.3.0 reports. The runtime dependency is `caught-object-report-json ^10.0.0`.
  The TypeScript unions widen with it: `ReportingError['stage']` gains
  `'redact'`, corj's `children_omitted` gains `'not_inspected'` and `'redacted'`,
  and `as_string_format` gains `'derived'`. The re-exported
  `restoreExpectedValues` (now corj 10) no longer relabels a stored
  `corj/v0.12` report as `-full`.
- `toReports(caught, { occurrenceId, diagnostic, public })` resolves one
  occurrence and returns both reports from it, so `diagnostic.occurrence_id ===
  public.occurrence_id` holds for every caught value, thrown primitives
  included. Option bags are validated before either report is built and a
  failure to build either one throws, so a half pair is never returned.
  ([#45](https://github.com/dany-fedorov/application-exception/issues/45))
- `toDiagnosticReport` accepts `maxFinalReportSize`: a UTF-8 byte budget over
  the whole final report, measured on compact JSON. It drops `context`, then
  `reporting_errors` — both named in the new `report_omitted` field — then shrinks
  corj's own budget, and throws `APPEX_REPORT_BUDGET_TOO_SMALL` rather than
  emitting an over-budget or invalid report. Default `null` keeps 0.3.0
  behaviour; `report_omitted` is part of `schemas/diagnostic-report-v4.json`.
  ([#44](https://github.com/dany-fedorov/application-exception/issues/44))
- `createRedactionPolicy({ keys, paths, patterns, replacement, transform })`
  builds a reusable policy accepted as `redact` by all three report functions.
  **Skip** rules (`keys`, `paths`) name properties that are never read — corj
  applies them while it inspects, so an excluded getter never runs. **Scrub**
  rules (`patterns`, each with the `g` flag, and `transform`) rewrite strings and
  property names in both reports, including the public `message` and
  `reporting_errors`. `replacement` is inserted literally; `paths` address the
  caught value only. On a public report the policy is given only what the kind's
  `details` selector returned. A policy that throws fails closed: the value
  becomes the replacement, the diagnostic report lists the failure with
  `stage: 'redact'`, and the thrown message is withheld because it can quote
  what the policy was protecting. See
  [docs/design/redaction-policy.md](docs/design/redaction-policy.md).
  ([#43](https://github.com/dany-fedorov/application-exception/issues/43))
- `defineException({ snapshotDetails: true })` captures a deep frozen copy of
  the details at construction, so later mutation of the caller's nested objects
  cannot change what the message and the reports describe. It never freezes the
  caller's own objects, and rejects content it cannot capture faithfully —
  cycles, functions, accessors, non-enumerable properties, class instances,
  invalid dates, nesting past 32 levels, more than 10,000 values — as
  `APPEX_INVALID_DETAILS` naming the path. The shallow default is unchanged.
  ([#47](https://github.com/dany-fedorov/application-exception/issues/47))
- `createTrustRealm()` is an explicit, capability-based trust boundary between
  separately loaded copies of this package. Pass the realm as `realm` to
  `defineException` in each cooperating copy and to the new
  `isTrustedException(caught, realm)`, `toPublicReport`, or `toReports` in the
  copy that reports. `isTypedException` keeps its one-argument 0.3.0 shape, so it
  still works as an array callback. Trust is keyed by
  object identity only, so a forged `_tag` or brand and a wire-deserialized
  value acquire nothing; the local registry wins; a realm on a different
  protocol throws `APPEX_INVALID_TRUST_REALM` naming both sides. Without a realm
  every copy keeps its 0.3.0 isolation. See
  [docs/design/cross-copy-trust.md](docs/design/cross-copy-trust.md).
  ([#46](https://github.com/dany-fedorov/application-exception/issues/46))
- Packed-artifact runtime suites for Node ESM, Bun, and a Vite build run in
  headless Chromium, with the observed support contract and its limits in
  [docs/runtime-support.md](docs/runtime-support.md). ESM/browser export
  conditions were measured and deliberately not added — they changed no
  resolution. ([#48](https://github.com/dany-fedorov/application-exception/issues/48))
- New error codes: `APPEX_REPORT_BUDGET_TOO_SMALL`, `APPEX_INVALID_TRUST_REALM`,
  `APPEX_INVALID_REDACTION_POLICY`.
- A diagnostic report now always carries `v`. corj drops it when its own budget
  cannot hold the metadata, which `maxFinalReportSize` and a small
  `maxReportSize` can both reach; the version is restored so the report always
  validates and always identifies itself.

## 0.3.0 — 2026-09-14

Breaking.

- The diagnostic report is a `caught-object-report-json` report (`v: "corj/v0.12"`)
  with `occurrence_id`, `context`, and `reporting_errors`. The `appex/diagnostic/v2`
  envelope, its `$appex` markers, `redactKeys`, `limits`, `includeStack`, and
  `messageRenderingError` are gone; stacks are always included.
- `defineException` accepts a `public` policy (`code`, `message`, `details`).
  `toPublicReport(caught, options?)` renders it, or `INTERNAL_ERROR` for values
  without one; the old `toPublicReport(reference, presentation)` is removed.
  The public report is `appex/public/v3` with `as_json` instead of `details`.
- `decodeDiagnosticReport` is removed; `decodePublicReport` validates public JSON.
- Errors thrown by the package carry an `APPEX_*` `code` and link to
  `docs/agent/errors.md`. A message renderer that throws now yields
  `<tag> [message rendering failed: …]`.
- Typed exceptions define `name` on the prototype; `as_json` no longer repeats it.
- Ships `AGENTS.md`, `docs/agent/api-card.md` (generated), `docs/agent/recipes.md`,
  `docs/agent/errors.md`, and v3 JSON Schemas. Coverage is gated at 100%.
- Typed exceptions expose `occurrenceId` (was `id`); both reports carry
  `occurrence_id` (was `reference`); the option is `occurrenceId`;
  `APPEX_INVALID_REFERENCE` is now `APPEX_INVALID_OCCURRENCE_ID`.
- Runtime dependency added: `caught-object-report-json ^9.0.1`.

## 0.2.2 — 2026-09-12

- Refresh the npm README with a concise explanation of typed failures,
  bounded operator diagnostics, and selected reports for agentic LLM harnesses.
- Clarify the package's role at tool, service, HTTP, and CLI boundaries.
- No runtime or public API changes.

## 0.2.1

- Add complete agent tool failure examples and a current API reference.
- Document public report validation and operation-owned recovery budgets.
- Ship the API and agent recovery guides with the package.

## 0.2.0

- Add typed native errors through `defineException({ tag, message, idPrefix? })`.
- Support constant-message errors, validated details, occurrence IDs, causes,
  local instance narrowing, and lazy stacks.
- Add bounded v2 diagnostic and public reports, reference-based public
  presentation, explicit normalization markers, and detached decoding.
- Include diagnostic and public JSON Schemas.
