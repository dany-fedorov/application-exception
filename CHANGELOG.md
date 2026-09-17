# Changelog

## 0.4.0 — 2026-09-17

Additive. Every 0.3.0 call keeps its behaviour; each feature is opt-in.

- `toReports(caught, { occurrenceId, diagnostic, public })` resolves one
  occurrence and returns both reports from it, so `diagnostic.occurrence_id ===
  public.occurrence_id` holds for every caught value, thrown primitives
  included. Option bags are validated before either report is built and a
  failure to build either one throws, so a half pair is never returned.
  ([#45](https://github.com/dany-fedorov/application-exception/issues/45))
- `toDiagnosticReport` accepts `maxFinalReportSize`: a UTF-8 byte budget over
  the whole final report, measured on compact JSON. It drops `context`, then
  `reporting_errors` — both named in the new `report_omitted` field — then halves
  corj's own budget, and throws `APPEX_REPORT_BUDGET_TOO_SMALL` rather than
  emitting an over-budget or invalid report. Default `null` keeps 0.3.0
  behaviour; `report_omitted` is additive to the v3 schema.
  ([#44](https://github.com/dany-fedorov/application-exception/issues/44))
- `createRedactionPolicy({ keys, paths, values, replacement, transform })`
  builds a reusable policy accepted as `redact` by all three report functions.
  It covers messages, stacks, `as_json`, `context`, `reporting_errors`, and
  nested causes. On a public report it runs after the kind's `details` selector,
  so it can only narrow what was selected; identity and shape fields are never
  rewritten, and a throwing `transform` drops the value and records the failure
  in `reporting_errors`. Applied as a transform over the produced report — see
  [docs/design/redaction-policy.md](docs/design/redaction-policy.md) for the
  assumption and what changes when corj ships its own mechanism.
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
