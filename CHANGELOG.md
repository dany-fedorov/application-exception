# Changelog

## 0.3.0 — 2026-09-14

Breaking.

- The diagnostic report is a `caught-object-report-json` report (`v: "corj/v0.12"`)
  with `reference`, `context`, and `reporting_errors`. The `appex/diagnostic/v2`
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
