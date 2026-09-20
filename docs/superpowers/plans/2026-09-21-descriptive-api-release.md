# Descriptive API Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement, verify, merge, and publish the approved breaking API redesign in corj and application-exception.

**Architecture:** corj supplies the renamed inspection, reporting, fingerprint, and redaction primitives under a new wire schema. application-exception consumes the new corj package, adopts descriptive names, fixes configuration ownership, and enforces UTF-8 report budgets. Both packages remove old API spellings outright.

**Tech Stack:** TypeScript, Node.js, Jest with 100% coverage, JSON Schema, npm, GitHub.

**Spec:** `docs/research/2026-09-20-api-redesign-decisions.md`.

## Global Constraints

- Use `gpt-5.6-sol` agents at medium effort; no nested delegation.
- Do not ask the user questions: assume, document a ruling, and continue.
- No compatibility aliases for renamed APIs/options; no old third corj argument.
- Preserve existing public-report v3/v4 decoding and unrelated wire keys.
- Rename corj reporting-error row fields and advance wire schema to `corj/v0.15` (and `-full`). Preserve historical schema files.
- Preserve `fp1_` canonical labels, including `field:`, while renaming the public source-entry field to `sourceProperty`.
- Keep realm protocol v1 and normalize public `detailsSelector` into the internal `details` representation.
- Whole public budgets are opt-in, integer UTF-8 byte limits at least 2,048; diagnostic budgets retain the 512 minimum and existing default.
- `maxReportBytes: null` disables the total budget (retaining independent component/context limits), preserving corj's existing unlimited diagnostic option; undefined keeps defaults.
- Omit public `as_json` whole before shortening `message`; set `truncated`; never trim `v`, `code`, `occurrence_id`, or an existing `fingerprint`.
- Prepare corj 12.0.0 and application-exception 0.6.0 unless registry evidence requires advancing. No credentials in source, docs, commits, or logs.
- Preserve existing 100% test gates; do not weaken checks to make changes pass.
- Worktrees: corj `/tmp/corj-api-redesign`; application-exception `/tmp/appex-api-redesign`.

### Task 1: corj breaking API and schema

**Files:** `src/index.ts`, `src/redaction.ts`, `src/tokens.ts`, `src/fingerprint.ts`, `src/version.ts`, `src/expected-values.ts`, related source modules; `tests/**/*.ts`, `tests/consumers/**`; new `schema-versions/corj/v0.15/**` and `v0.15-full/**`; README, package manifests, changelog. Do not mechanically rewrite historical changelog entries or old schemas.

**Interfaces:** Rename free `makeCorj`/`makeCorjArray` to `makeReport`/`makeReportArray`; methods `makeReportObject` -> `makeReport`, `makeJson` -> `makeJsonView`, `with` -> `withOptions`; `CorjReportChild` -> `CorjReportNode`; `onError` -> `onReportingError`; callback `key`/`prop` -> `reportKey`/`sourceProperty`; source entry `field` -> `sourceProperty`. Export a descriptive merged free-call input type. Free functions take caught plus one merged bag; maker methods still take only call input. Keep input/output types accurate and remove deprecated legacy type aliases when they refer to the renamed API rather than retained wire formats.

- [ ] Read the spec and establish the current baseline results from `/tmp/corj-baseline.log`.
- [ ] Add failing behavioral tests for merged context/configuration and rejection of legacy options/third argument. Pin a pre-change fingerprint value for a source-property recipe, and test renamed reporting-error rows against the new schema.

```ts
expect(makeReport(new Error('x'), { context: { runId: 'r' }, maxDepth: 1 }).context)
  .toEqual({ runId: 'r' });
expect(() => new CorjMaker({ onError: () => {} } as never)).toThrow();
expect(() => new CorjMaker({ occurrenceIdSources: [{ field: 'id' }] } as never)).toThrow();
```

- [ ] Implement names and merged-bag splitting. Validate known keys; do not turn a call-only bag into needless fresh maker construction. Preserve per-call failure handling and unknown-key rejection. Reject an extra positional argument at runtime as well as in types.
- [ ] Implement source/context renames consistently across redaction, reporting errors, callbacks, serializer bridges, and schemas. Keep fingerprint canonical label encoding unchanged.
- [ ] Update all live examples, tests, consumer fixtures, declarations/JSDoc, and release notes. Set version 12.0.0 and lockfile version consistently.
- [ ] Run `npm test -- --runInBand --coverage`, `npm run build`, and `npm run test-consumers` (network/runtime dependencies may need coordinator support); report exact commands/results and residual runtime gates. Build a publishable package with `npm run prepublish-me` and `npm pack ./npm-module-build --pack-destination /tmp` for Task 2.
- [ ] Write implementation report and commit all task files, excluding generated artifacts not normally tracked. A separate agent reviews the complete task diff for spec compliance and quality; fix findings before downstream integration.

### Task 2: application-exception redesign and byte budgets

**Files:** `src/index.ts`, `src/typed.ts`, `src/redaction.ts`, `src/report-types.ts`, `src/reporting.ts`, `src/corj-maker.ts`, error definitions; tests, runtime fixtures, examples; new diagnostic schema version; manifests, README, AGENTS.md, CONTEXT.md, live design docs, generated API card, docs tools, recipes, changelog.

**Interfaces:** Consume Task 1's packed corj 12 API. Rename all runtime/type exports exactly per spec: `makeDiagnosticReport`, `makePublicReport`, `makeReportPair`, `makeRedactionPolicy`, `makeTrustRealm`, `ReportPair`, `ReportPairOptions`, `PublicPolicyOverride`, policy `detailsSelector`, per-call `policyOverride`. Keep internal realm policy `details` only. Re-export `CorjReportNode`, remove obsolete re-exports. Diagnostic schema version advances to v6 for corj/v0.15; public format stays v4.

- [ ] Install the Task 1 tarball for development. Final manifest/lockfile must refer to the released registry version, not a file path.
- [ ] Add failing tests proving caller options stay mutable and later top-level/nested changes take effect, unknown policy keys reject, legacy API names/options reject, and public byte budgets enforce real serialized size.

```ts
const corj = { childrenSources: ['cause'] };
const value = { inner: new Error('nested') };
makeDiagnosticReport(value, { corj });
corj.childrenSources.push('inner');
expect(Object.isFrozen(corj)).toBe(false);
expect(makeDiagnosticReport(value, { corj }).children).toHaveLength(1);
const report = makePublicReport('x', {
  maxReportBytes: 2048,
  policyOverride: { code: 'TEST', message: '€'.repeat(4096), detailsSelector: () => ({ text: 'x'.repeat(16000) }) },
});
expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(2048);
expect(report.as_json).toBeUndefined();
expect(report.truncated).toBe(true);
```

- [ ] Implement descriptive naming and strict key validation at every public input boundary. Preserve cross-copy realm and public decoder semantics. Reject old names rather than quietly dropping them.
- [ ] Remove caller-bag identity caching/freezing. Keep default-options cache keyed by redaction policy if useful; read each caller bag once and preserve current accessor safety.
- [ ] Add validated `maxReportBytes`; force UTF-8 serialization. Public budget is optional and minimum 2048, diagnostic optional and minimum 512. Measure compact JSON including escaping and optional fields. Drop `as_json` first then shorten message without breaking Unicode; ensure the minimum handles worst-case identifiers/code. Keep component limits when the total budget is omitted.
- [ ] Reject nested maxReportSize/reportSizeUnit in both bags; expose only effective public corj options, determined by source usage across fingerprints and serialization. Retain diagnostic maxContextSize. Validate all paired bags before building either report.
- [ ] Update live docs/snippets, errors documentation, schemas/exports, runtime and package fixtures, and changelog. Preserve historical specs/reviews and old schemas. Regenerate the API card.
- [ ] Run `npm run test:all` including 100% coverage, types, package smoke, Node/Bun/browser, docs. Document any environment issue for coordinator resolution; do not mark skipped runtime checks passed.
- [ ] Write implementation report and commit. Separate reviewer checks entire task diff against the spec and tests before release.

### Task 3: integration, whole-branch review, merge and release

**Files:** release manifests/locks/changelogs, release ledger, generated docs if tracked. Source fixes go back to implementers and receive review.

- [ ] Confirm npm versions and GitHub branch state, permissions, and release automation. Avoid concurrent automated/manual publication of the same version.
- [ ] Verify both actual packed artifacts, exported names/no aliases, types, report schemas, fingerprint stability, paired/public byte budgets, and retained realm/public-decoder compatibility.
- [ ] Dispatch Sol medium whole-branch review with spec, implementation reports, and diff files. Resolve actionable findings and rerun affected checks.
- [ ] Publish corj first using ephemeral npm auth, then install the registry version into application-exception, ensure the committed lockfile has a registry URL/integrity, and run final dependency-sensitive gates.
- [ ] Push/merge reviewed commits without overwriting unrelated remote work; record commits/tags and release notes. Publish application-exception from the exact verified package. Coordinate existing CI release workflows to avoid unintended extra versions.
- [ ] Verify registry versions, dist-tags, integrity, clean-install usage and source/remote commit state. Remove ephemeral credentials. Report releases and evidence; mark goal complete only when both packages are released and merged.
