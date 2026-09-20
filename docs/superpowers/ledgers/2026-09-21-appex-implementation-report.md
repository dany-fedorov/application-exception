# Task 2 implementation report

## Result

Implemented the application-exception 0.6.0 breaking API redesign against the
published `caught-object-report-json@12.0.0` package.

- Replaced the reporting, redaction, and trust-realm runtime names with
  `makeDiagnosticReport`, `makePublicReport`, `makeReportPair`,
  `makeRedactionPolicy`, and `makeTrustRealm`; no runtime or type aliases remain.
- Replaced the paired/override types and fields with `ReportPair`,
  `ReportPairOptions`, `PublicPolicyOverride`, `detailsSelector`, and
  `policyOverride`.
- Split CORJ configuration into `DiagnosticReportCorjOptions` and the exact
  six-key `PublicReportCorjOptions` allowlist. Reserved, moved, and legacy CORJ
  keys reject even when inherited or non-enumerable, without reading their
  values.
- Removed caller-bag identity caching and freezing. Each recognized value is
  read once into a per-call snapshot, so later top-level and nested mutations
  affect later calls.
- Added top-level `maxReportBytes` with the ruled 512-byte diagnostic and
  2,048-byte public minima. `undefined` preserves defaults and `null` disables
  the total cap while component limits remain. Production measurement uses
  `TextEncoder`; the public limiter measures compact JSON, drops `as_json`
  whole, then trims the message at Unicode-safe boundaries.
- Preserved CORJ validation for invalid `metadata` primitives and explicit
  `onReportingError: null`; these inputs are not silently normalized.
- Added diagnostic schema v6 for `corj/v0.15`, retained the frozen v3-v5
  diagnostic schemas and public v3/v4 decoding, and re-exported
  `CorjReportNode`.
- Updated live documentation, examples, runtime fixtures, generated API card,
  package smoke coverage, manifests, and the 2026-09-20 changelog entry.

## Coordinator rulings applied

- Both report bags use `maxReportBytes?: number | null`; UTF-8 is forced even
  with no total cap.
- The public CORJ surface is exactly `inspection`, `maxDepth`, `maxChildren`,
  `childrenSources`, `fingerprintParts`, and `onReportingError`.
- Public sizing includes JSON escaping and `truncated`; the exact worst fixed
  envelope remains 1,251 bytes under the 2,048-byte floor.
- Selectors, renderers, getters, redaction, serialization, and fingerprint work
  run before the detached-report limiter and are not rerun by it.
- Internal trust realm protocol v1 continues to store its policy selector under
  the internal `details` field.
- The final manifest and lock use registry dependency
  `caught-object-report-json: ^12.0.0`; no local tarball path remains.

## Test-first evidence

- The initial descriptive contract test failed against the old export names,
  cached/frozen CORJ bags, legacy keys, and missing public byte budget before
  the redesign implementation.
- Regression tests for `metadata: null | 42 | 'x'` and
  `onReportingError: null` failed before the adapter preserved CORJ validation.
- Tests for hidden/inherited `redact`, `maxReportSize`, `reportSizeUnit`, and
  `onError` failed before the adapter added value-free presence checks.

## Verification

- `npm test -- --runInBand --coverage`: 16 suites and 339 tests passed; 100%
  statements, branches, functions, and lines.
- `npm run test:types`: passed.
- `npm run build`: passed.
- `npm run test:package`: packed package smoke passed with the registry CORJ 12
  dependency closure.
- `npm run test:runtimes`: Node ESM, Bun 1.4.2, and headless Chromium 153 passed
  against packed installs; all emitted `corj/v0.15` and `appex/public/v4`.
- `npm run docs:check`: 44 snippets type-checked; generated API card is 649
  lines within the 650-line budget.
- `npm run test:all`: passed as the final combined gate.

## Concerns

None. The release ledger and historical research/specification files were left
to the coordinator and were not edited as part of this task.
