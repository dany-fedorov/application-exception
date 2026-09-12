# Changelog

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
