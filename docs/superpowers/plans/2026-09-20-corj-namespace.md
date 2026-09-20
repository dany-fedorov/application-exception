# Corj Namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export CORJ utilities through one frozen `Corj` object and migrate application-exception without standalone utility aliases.

**Architecture:** Group the existing four utility functions in a readonly object, preserving their implementations and configured `CorjMaker`. Application-exception consumes/re-exports that object. Release the independently verified packages in dependency order.

**Tech Stack:** TypeScript, Jest, npm, TypeDoc, Node/Bun/Chromium packed consumers.

**Spec:** `docs/superpowers/specs/2026-09-20-corj-namespace-design.md`

## Global Constraints

- Corj namespace has exactly makeReport, makeReportArray, restoreExpectedValues, resolveRedactPolicy; no standalone utility exports or compatibility aliases.
- Preserve configured CorjMaker, constants/types, behavior, generic inference, extracted calls, and current report/schema versions.
- corj13.0.0; application-exception0.7.0 with final registry dependency^13.0.0.
- Sol medium workers/reviewers; no nested agents. No user questions: assume and document within authorized scope.
- All coverage, documentation and packed runtime gates stay intact. Historical docs/schemas remain unchanged.

### Task 1: CORJ namespace and complete consumer migration

**Files:** `src/index.ts`, `tests/exports-assertions.test.ts`, `tests/descriptive-api.test.ts`, all public-call tests and `tests/consumers/` fixtures, `README.md`, `CHANGELOG.md`, manifests/lock, generated `docs/`.

**Interfaces:** Produce readonly `Corj` with existing makeReport/makeReportArray signatures, generic restoreExpectedValues, and resolveRedactPolicy(input). Retain CorjMaker methods exactly.

- [ ] Add failing contract assertions for exact object keys, Object.isFrozen, absence of old root exports, extracted calls, and TypeScript failure to import/assign old entries.

```ts
import * as api from '../src';
expect(Object.keys(api.Corj).sort()).toEqual([
  'makeReport', 'makeReportArray', 'resolveRedactPolicy', 'restoreExpectedValues',
]);
expect(Object.isFrozen(api.Corj)).toBe(true);
for (const name of ['makeReport', 'makeReportArray', 'resolveCorjRedactPolicy', 'restoreExpectedValues']) {
  expect(name in api).toBe(false);
}
const { makeReport } = api.Corj;
expect(makeReport(new Error('x')).v).toBe('corj/v0.15');
```

- [ ] Keep implementation functions private to index; import restoration locally; remove utility re-exports. Export the object with JSDoc on its members:

```ts
export const Corj = Object.freeze({
  makeReport,
  makeReportArray,
  restoreExpectedValues,
  resolveRedactPolicy,
});
```

- [ ] Migrate public call sites to named Corj imports. Existing tests must exercise the new public surface, not test-only compatibility aliases. Internal helper tests may retain private imports for focused unit coverage.
- [ ] Preserve generic restoration inference, merged-bag validation and third-argument rejection. Add packed declaration/runtime assertions for namespace shape and removed exports.
- [ ] Update live docs and add migration examples from12; set version13.0.0 in both manifest and lock. Generate TypeDoc with `./node_modules/.bin/typedoc src/index.ts`.
- [ ] Run `npm test -- --runInBand --coverage`, `npm run build`, `PATH=/home/df/.bun/bin:$PATH npm run test-consumers`, and package build/pack. Record exact outputs and artifact path/hash in task report, commit changes. Independent task/branch review before release.

### Task 2: Application-exception namespace integration

**Files:** `src/index.ts`, `src/redaction.ts`, `tests/Index.test.ts`, `tests/DiagnosticReport.test.ts`, `tests/Schemas.test.ts`, `tests/Reporting.types.ts`, package/runtime fixtures, `tools/docs/api-card.cjs`, live docs/API card/recipes, README/changelog, manifest/lock.

**Interfaces:** Consume reviewed corj13 tarball during development; final registry^13.0.0. Export dependency Corj directly; remove standalone restoreExpectedValues; preserve own runtime APIs.

- [ ] Add failing export/typing/consumer assertions for Corj and absence of standalone restoration. Assert restoration still retains diagnostic occurrence/context fields and full version semantics.

```ts
import { Corj, makeDiagnosticReport } from '../src';
const report = makeDiagnosticReport(new Error('x'));
const full = Corj.restoreExpectedValues(report);
expect(full.occurrence_id).toBe(report.occurrence_id);
expect(full.v).toBe('corj/v0.15-full');
```

- [ ] Change redaction resolution to Corj.resolveRedactPolicy and re-export Corj from the package index. Remove old utility import/re-export everywhere in live code and docs.
- [ ] Update API-card generation to document the object and the restoration method's generic signature/recipe without growing beyond gates. Keep own API list distinct from dependency utility members.
- [ ] Update all package/runtime/type fixtures to exercise the new root exports. Add migration notes from0.6.0, version0.7.0, registry dependency^13.0.0 and exact registry lock.
- [ ] Run `PATH=/home/df/.bun/bin:$PATH npm run test:all`. Write report and commit. Independent task/whole-branch review, with any corrections returned to implementer.

### Task 3: Integrate, release, and verify

**Files:** release ledger and review records; source fixes owned by implementers.

- [ ] Check remote bases, tags, registry versions and release authentication without exposing credentials; run feature CI for each reviewed branch.
- [ ] Publish corj first after review and CI. Push a main-based no-ff merge with `[skip ci]` and annotated v13.0.0 tag atomically; check no racing release workflow; publish the verified tgz, verify registry bytes, create GitHub Release with migration examples.
- [ ] Finish application-exception on published corj13, confirm final CI Node18/20/24+Bun/browser, exact package export/type checks and no local dependency references. Integrate/tag/publish0.7.0 by the same controlled sequence.
- [ ] Verify both registry versions/latest/integrity and fresh installed usage. Record evidence and all assumptions. Safely synchronize original checkouts, remove temporary credentials and isolated worktrees. Final response links releases and migration notes.
