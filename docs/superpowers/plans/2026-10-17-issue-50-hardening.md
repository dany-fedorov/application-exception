# Issue 50 hardening implementation plan

> **For agentic workers:** Use subagent-driven-development with Sol medium workers. Work only in the assigned files; no commits, package installs, or nested agents. The coordinator owns integration and verification.

**Goal:** Resolve every outstanding finding in GitHub issue #50 and record the already-fixed items.

**Architecture:** Keep the runtime API and published report schemas stable. Harden decoder traversal, snapshot foreign policies, narrow automatic foreign-ID adoption, and document intentional validation limits. No corj release is needed: application-exception passes its resolved occurrence ID explicitly to corj.

**Tech Stack:** TypeScript, Jest with a 100% coverage gate, AJV 2020-12, Node/Bun/browser package fixtures.

**Spec:** The user-approved resolutions in this conversation, made precise by the contracts below; issue https://github.com/dany-fedorov/application-exception/issues/50.

## Global constraints

- Preserve exported signatures, report versions, and historical schemas.
- All currently open findings are in #50. Dependency PRs are outside this task.
- Decoder resource limits: depth 32, 10,000 values, and a new 16,384 UTF-8-byte limit on compact JSON for `as_json`, including keys, delimiters, escaping, and punctuation. Reject excess; never silently truncate received data.
- Decoder text lengths use Unicode code points, matching JSON Schema. Existing producer limits remain unchanged.
- Rejection paths retain at most 64 UTF-16 units of each dynamic key without splitting a valid surrogate pair, and at most 256 UTF-16 units overall. Dynamic keys use JSON-quoted bracket notation. If another complete segment does not fit, omit it and end the path with an ellipsis; never cut inside a JSON escape or quoted segment.
- Foreign branded IDs are adopted only if they match `/^[A-Za-z0-9_.:-]{1,128}$/`. Locally registered instances and explicit caller IDs retain the existing printable-ASCII rule. Invalid foreign IDs fall back to the existing memoized generated ID. Paired and standalone reports from this package copy must correlate.
- A narrow alphabet is not authentication or secrecy. Reports received from older senders still decode according to their published schema. Older or standalone corj reporters may preserve IDs this release replaces; document the explicit trusted-ID override for cross-version correlation.
- No public policy fields can be re-read after validation. No new accessor-free guarantee for arbitrary Proxy input is implied by the decoder changes, but top-level fields and array elements must not be read repeatedly.
- Add failing regressions before fixes. Retain all current passing behavior, including M4 UTF-8 enforcement and M8 surrogate-safe producer truncation.
- Do not change GitHub issue status or post comments. Source changes remain reviewable on local branch `fix/issue-50-hardening`.

### Task 1: Harden public-report decoding (M6, M7, R3)

**Owner files:** `src/reporting.ts`, `tests/PublicReport.test.ts`, new `tests/DecoderHardening.test.ts` if useful. Do not edit generated API docs; coordinator regenerates them.

**Interfaces:** Keep `decodePublicReport(value: unknown): DecodePublicReportResult`. Existing public-report producers in the same file must retain their behavior. Documentation worker consumes the limits in Global constraints.

- [x] Add regressions and run them failing with `npm test -- --runInBand --coverage=false tests/PublicReport.test.ts tests/DecoderHardening.test.ts`.

```ts
const base = { v: 'appex/public/v4', occurrence_id: 'AE_1', code: 'OK', message: '' };
const input = [{ nested: { value: 1 } }];
Object.defineProperty(input, 'map', { value: () => input });
const result = decodePublicReport({ ...base, as_json: input });
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.report.as_json).toEqual([{ nested: { value: 1 } }]);
  expect(result.report.as_json).not.toBe(input);
}
expect(decodePublicReport({ ...base, message: '😀'.repeat(4096) }).ok).toBe(true);
expect(decodePublicReport({ ...base, message: '😀'.repeat(4097) }).ok).toBe(false);
expect(decodePublicReport({ ...base, as_json: 'x'.repeat(16382) }).ok).toBe(true);
expect(decodePublicReport({ ...base, as_json: 'x'.repeat(16383) }).ok).toBe(false);
```

Add cases for throwing `map`/species hooks (neither invoked), sparse arrays (reject), deep detachment, one-read array elements/top-level fields, 128 astral code points in `code` and v3 IDs, excess code points, UTF-8 multibyte and JSON-escaped strings/keys, cumulative details budget, and depth/value limits. A sparse huge array must fail before allocation/traversal. The decoder must not call `toJSON` while measuring untrusted input.

Path regressions cover newlines, quotes, backslashes, control characters, embedded dots/brackets, astral boundaries, deep arrays/objects, and complete bounded segments. Known protocol fields may keep paths such as `$.code`; dynamic unknown fields and detail keys use bracket segments.

- [x] Replace `value.map` with fresh-array indexed traversal, capture length once, preflight length against remaining value budget, reject missing own elements, and snapshot each element before recursion. Snapshot top-level report fields before validating/using them.
- [x] Count compact JSON bytes incrementally during traversal. Check raw string length against remaining bytes before allocating its JSON encoding; count encoding only for bounded primitive strings and keys, never serialize untrusted containers. Count container brackets/braces, commas, colons, and scalar encodings. Keep errors bounded and descriptive.
- [x] Change `boundedText` to count code points without allocating an unbounded array (early reject after max). Keep producer `unicodeSafePrefix` semantics unchanged.
- [x] Add one helper for appending bounded paths; use JSON.stringify on a Unicode-safe bounded key prefix and append complete segments only. Retain stable known-field paths.
- [x] Update decoder JSDoc with resource limits, Unicode counting, quoted untrusted paths, and rejection rather than truncation. Run the focused suites and inspect branch coverage for new helpers. Report red/green evidence and remaining concerns.

### Task 2: Snapshot trust policies and validate IDs/options (M1, M3, M5)

**Owner files:** `src/typed-internals.ts`, `src/corj-maker.ts`, `tests/TrustRealm.test.ts`, `tests/TypedInternals.test.ts`, `tests/CorjMaker.test.ts`, new `tests/Issue50Identity.test.ts` if useful. Do not edit `src/reporting.ts`.

**Interfaces:** `trustedPublicPolicyOf` returns a detached frozen policy snapshot; `brandedOccurrenceId` returns undefined for foreign unsafe IDs, allowing unchanged `occurrenceIdFor` fallback. `diagnosticMakerFor` rejects invalid metadata before inspecting caught values.

- [x] Add failing tests and run `npm test -- --runInBand --coverage=false tests/TrustRealm.test.ts tests/TypedInternals.test.ts tests/CorjMaker.test.ts tests/Issue50Identity.test.ts`.

```ts
let reads = 0;
const policy = { get code() { if (++reads > 1) throw new Error('second read'); return 'OK'; } };
// Use existing withPolicy helper in TrustRealm.test.ts.
expect(makePublicReport(new Error('foreign'), { realm: withPolicy(policy) }).code).toBe('OK');
expect(reads).toBe(1);
expect(brandedOccurrenceId({
  [TYPED_EXCEPTION_BRAND]: true,
  occurrenceId: '<img/src/onerror=alert(1)>',
})).toBeUndefined();
expect(() => diagnosticMakerFor({ metadata: [] }, undefined, undefined)).toThrow(TypeError);
```

Also test changing `code`, `message`, and selector getters, first-read throws (fail closed), paired-report safety, ordinary frozen policies, all allowed ID punctuation, forbidden markup/quotes/slashes, length boundaries, local custom-prefix preservation, explicit punctuation-rich overrides, foreign rejected-ID memoization, and correlation of standalone/paired reports. Test `metadata: []` rejection before caught getters run and retain existing valid metadata behavior.

- [x] Return `Object.freeze({ code, message, details })` or an exact-optional-property-compatible equivalent from validated foreign policy data. Never return the caller policy by reference.
- [x] Introduce a separate foreign-ID regex. Keep `ID_PATTERN` unchanged for explicit IDs and decoder compatibility. In `brandedOccurrenceId`, require `ID_PATTERN` for local registry members and the narrow regex for all foreign branded objects; never read getters. Corj already receives the resolved ID as an explicit argument, so no dependency change is required.
- [x] Let invalid metadata arrays reach corj validation unchanged rather than spreading them into objects; confirm corj rejects them, or use this package's coded options error if necessary. Retain `v: true` normalization for valid objects and booleans.
- [x] Run focused suites and cover all new branches. Report red/green evidence and cross-version correlation limitations.

### Task 3: Document limits and disclosure; record schema openness (R1, schema follow-up)

**Owner files:** `README.md`, `AGENTS.md`, `docs/agent/errors.md`, `docs/agent/recipes.md`, `docs/design/cross-copy-trust.md`, `CHANGELOG.md`, `tests/Schemas.test.ts`. The coordinator extended ownership to AGENTS rule 13 and the error-reference metadata-array exception for consistency. Leave `CONTEXT.md`, generated docs, and schemas unchanged.

**Interfaces:** Describe the exact decoder, ID, and path contracts in Global constraints. Keep earlier published schemas unchanged; openness is intentional extension compatibility.

- [x] Add schema characterization tests: v5 and v6 accept unknown root fields such as `contxt`, accept valid `$schema` metadata, and still reject invalid known fields. Reuse valid version-specific fixtures and AJV setup.

```ts
expect(validateDiagnostic({ ...makeDiagnosticReport('x'), contxt: {} })).toBe(true);
expect(validateDiagnostic({ ...makeDiagnosticReport('x'), context_omitted: 'typo' })).toBe(false);
```

- [x] Explain in README and recipes that a public fingerprint recipe containing sensitive text can confirm guesses through chosen calls at the same failure site without knowing frames. Recommend excluding sensitive recipe parts, redacting their inputs, or withholding public fingerprints. Do not imply the default recipe necessarily hashes message text.
- [x] Document decoder depth/value/byte limits as receiver resource policy beyond the wire schema, Unicode code-point field lengths, byte budget including keys/escaping, sparse-array rejection, and that `path` remains sender-influenced data despite quoting. Transport byte limits remain necessary before JSON parsing.
- [x] Document automatic foreign-ID narrowing, local and explicit ID preservation, memoized fallback and correlation, old-copy/standalone-corj differences, and explicit trusted-ID override when needed. Keep the warning that IDs must be escaped and treated as data.
- [x] Document intentionally extensible diagnostic schema roots versus closed public roots. State optional-field typos are not caught; do not tighten historical schemas.
- [x] Add an Unreleased changelog section for the fixes and the new receive-size/foreign-ID compatibility changes. Mark M4, M8, and M5 callback-read portion as already fixed in the worker report rather than rewriting old history.
- [x] Run `npm test -- --runInBand --coverage=false tests/Schemas.test.ts`. Report changed documentation and any mismatch with actual worker implementations.

### Task 4: Integrate, review, and verify (coordinator)

**Owner files:** Plan/progress records, generated `docs/agent/api-card.md`, integration-only tests/docs if necessary after worker handoff.

- [x] Review each worker's patch against the task contracts and request fixes for gaps. Obtain independent Astra-high review for spec compliance and quality, then broad final review.
- [x] Regenerate the API card with `npm run docs:generate`; run `npm run test:all` sequentially because package fixtures share build staging directories.
- [x] Resolve all failures, including the 100% coverage gate, with meaningful regression cases. Use an isolated npm cache under `/tmp` and approved network access if package fixtures need it; do not change dependencies to hide environment failures.
- [x] Re-run affected checks after fixes, then verify `git diff --check` and inspect `git status --short`. Record exact results and any material remaining limitation.
- [x] Report every #50 item as fixed, documented intentional behavior, or already fixed. Do not claim GitHub issue closure, a release, or a merge.

## Completion record

Implemented with gpt-6.1-sol at medium reasoning effort; reviewed with gpt-6-astra at high reasoning effort.

- M1: validated foreign policy fields are snapshotted and frozen.
- M3: unsafe foreign branded IDs fall back to a memoized generated ID; local/explicit IDs retain their contract. Cross-version correlation limits are documented.
- M4: already fixed; UTF-8 enforcement retained and verified by existing tests.
- M5: metadata arrays now reject with APPEX_INVALID_OPTIONS; callback snapshotting was already fixed.
- M6: decoder Unicode length semantics align with schema, resource limits are documented, and selected details receive an exact compact-JSON byte cap.
- M7: arrays are detached through indexed traversal without invoking map/species hooks; fields are read once, sparse arrays and invalid proxy lengths reject.
- M8: already fixed; surrogate-safe producer trimming retained and verified by existing tests.
- R1: chosen-call fingerprint comparisons and mitigation are documented.
- R3: rejection paths quote sender-controlled keys and preserve complete bounded segments.
- Diagnostic schema openness: intentionally retained, documented, and covered for v5/v6 including valid metadata and invalid known fields.

Validation: `npm run test:all` passed: 18 suites, 405 tests, 100% statements/branches/functions/lines, type tests, build, packed-package smoke, Node ESM (24.20.0), Bun (1.4.2), browser (Chromium 153), and docs checks (45 snippets). API card regenerated within its 650-line budget. Independent Astra review passed 4,000 additional byte-accounting, detachment, and path probes and approved the integrated change with no outstanding findings. `git diff --check` passed.

At implementation completion, changes were uncommitted on `fix/issue-50-hardening` and no push, merge, or release had been performed. The user subsequently authorized merge, push, and release as 0.8.0; execution and verification are tracked in `docs/superpowers/ledgers/2026-10-17-issue-50-release.md`.
