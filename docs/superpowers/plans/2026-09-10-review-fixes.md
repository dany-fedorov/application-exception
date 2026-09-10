# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all review findings, simplify the API, verify the packaged result,
document decisions and evidence, and push the tested feature branch.

**Architecture:** Typed native errors form the only public construction API.
Reporting uses bounded normalization and explicit reference-based public
presentation; decoding validates detached wire values. Package artifacts include
the migration/agent guides and wire schemas.

**Tech Stack:** TypeScript 5.9, Node 18+, Jest, CommonJS, optional Effect tests.

**Spec:** `docs/superpowers/specs/2026-09-10-review-fixes-design.md`

## Global Constraints

- User authorized breaking changes, implementation, tests, documentation, and
  pushing without asking; assume choices and record them.
- Work on `fix/reviewed-api-and-reporting`; push that branch, not release-triggering
  `main`. Version becomes `0.2.0`.
- One public root API; no legacy builder or `/typed` package export.
- `defineException({ tag, message, idPrefix? })` infers renderer details. Constant
  string messages allow construction without details. Keep native errors, literal
  `_tag`, complete frozen detail records, and mutually exclusive causes.
- `toPublicReport(reference: string, presentation?)` does not inspect errors/reports.
- Wire versions: `appex/diagnostic/v2` and `appex/public/v2`.
- Default diagnostic limits: depth 8, values 1,000, entries 50, string length 4,096,
  UTF-8 bytes 65,536. Maximums: depth 32, values 10,000, entries 1,000, string length
  65,536, UTF-8 bytes 1,048,576. Minimum byte budget 4,096.
- Stacks omitted by default; `includeStack: true` enables safe native stack reading.
- Do not run user getters, date overrides, custom coercion, or custom `toJSON`.
  Explicit native stack formatting may run `Error.prepareStackTrace`.
- Decoder detachment limits: depth 64, values 100,000, descriptor inspections
  100,000, bytes 1,048,576, key length 4,096. Validate the detached output. All
  supported generated reports round-trip.
- Write meaningful failing regressions before implementation. Run focused tests
  during iteration, the full applicable suite before committing each task, and
  the complete packed-package/CI gate at completion.
- No subagents within implementer/reviewer agents; the controller owns review.

### Task 1: Replace the legacy surface with concise typed construction

**Files:** `src/typed.ts`, `src/occurrence.ts`, new `src/typed-internals.ts`,
`src/index.ts`, `src/reporting.ts` (legacy removal/internal imports only),
`tsconfig.json`, `tsconfig.build.json`, typed/runtime/type/integration tests,
and examples. Delete `src/ApplicationException.ts`, its runtime/type tests, and
legacy-only examples. Leave package staging, root export-map removal, schemas,
README/migration, and benchmark/probe delivery to Task 3.

**Interfaces produced:**

```ts
const Failure = defineException({
  tag: 'app/Failure',
  message: ({ operation }: { operation: string }) => `${operation} failed`,
});
new Failure({ details: { operation: 'search' }, cause: new Error('cause') });
const Unavailable = defineException({
  tag: 'app/Unavailable',
  message: 'Unavailable',
});
new Unavailable();
new Unavailable({ cause: undefined });
```

Keep exported `TypedException`, `TypedExceptionClass`, `ExceptionInput`, and
definition types accurate for both cases. Export public symbols explicitly.
Keep diagnostics' foreign-copy metadata accessor and rendering-failure presence
helpers internal. The local guard must continue rejecting a forged symbol/tag.
Report the exact internal interface names to the controller for Task 2.

- [x] Add regressions for the new factory, no-details construction, inference,
      literal narrowing, complete/excess fields, no arbitrary subclass claims,
      `cause`/`causes` validation, snapshotting a mutable definition, invalid identifiers,
      bounded detail copying/prototype depth, and no eager stack formatting. Example:

  ```ts
  const definition = { tag: 'Original', message: () => 'first' };
  const Kind = defineException(definition);
  definition.tag = 'Changed';
  expect(new Kind({ details: {} })._tag).toBe('Original');
  ```

- [x] Run `npm test -- --runInBand tests/TypedException.test.ts` and
      `npm run test:types`; record the expected pre-fix failures.
- [x] Implement the one-call factory and no-details overload, snapshot validated
      config, keep no-argument constructor details `{}` frozen, remove stack reads,
      and move internal state helpers out of public exports. Tags max 128 characters,
      prefixes max 32, top-level details max 1,000 own keys, prototype walk max 32.
- [x] Remove the legacy implementation and legacy reporting branch; migrate every
      remaining source example/test to the new factory. Keep Task 2's public signature
      unchanged until that task. Use ES2022/CommonJS and maintain Node 18 compatibility.
- [x] Run runtime tests, type tests, and build. Probe built `instanceof`, literal
      message rendering, optional/no-details construction, and absence of legacy root
      exports. Self-review and commit task files only. Report red/green evidence.

### Task 2: Enforce report contracts and bounded processing

**Files:** `src/reporting.ts`; split normalization and decoding into focused
`src/diagnostic-value.ts` and `src/report-codec.ts` if useful; shared report types
may live in `src/report-types.ts`. Update `src/index.ts`, reporting tests/type
tests, and boundary/agent examples/tests for the public reference signature.
Consume Task 1's internal typed view/presence helpers; do not change factory API.

**Interfaces produced:**

```ts
const diagnostic = toDiagnosticReport(error, {
  context: interfaceShapedContext,
  includeStack: false,
  limits: { maxBytes: 4096 },
});
const decoded = decodeDiagnosticReport(diagnostic);
const body = toPublicReport(diagnostic.reference, { code: 'UNAVAILABLE' });
```

- [x] Add failing regressions for F2–F7/F10/F12 and thrown `undefined`: 100,000-key
      object descriptor reads remain capped; dense arrays read selected indexes only;
      the review's 5×50×50 accessor graph stays bounded and decodes; redactions count;
      exhausted containers emit one marker; UTF-8 size cap includes multibyte strings,
      long keys/envelope text, and repeated branches; every allowed limit combination
      returns decodable JSON. Assert `Buffer.byteLength(JSON.stringify(report)) <=
configuredMaxBytes` and reference equality, not timing thresholds.
- [x] Add date/function getter and custom `toISOString`/`toJSON` regressions;
      decoder-changing-proxy regression must fail safely or return a validated string
      reference; duplicate-module reporting retains kind/details/reference while the
      local guard rejects it; explicit `throw undefined` remains visible.
- [x] Add public projection runtime/type regressions rejecting objects and accepting
      only a nonempty reference up to 128 characters. Add interface context typing,
      stack omission/native opt-in/accessor handling, selected provider code/status,
      and explicit unsupported collection/binary markers.
- [x] Run the focused reporting/runtime/type tests and record red evidence.
- [x] Implement v2 reporting. Use bounded selected descriptor reads, count markers
      and slots against shared budgets, native Date intrinsics, descriptor-only function
      names, capped traversal/prototype handling, and an exact final UTF-8 cap that
      preserves the reference and signals omission. Cap configuration to spec limits.
      Provider code/status use bounded data descriptors; other arbitrary fields stay
      excluded. Avoid adding a retry or schema framework.
- [x] Make decoder detachment bounded and validate the detached result; share its
      wire types with reporting. Explicitly reject v1/unknown versions. Preserve own
      `__proto__` as data. Make public projection reference-only and bounded for its
      explicitly selected presentation, with fixed default byte limits.
- [x] Update affected tests/examples, run full runtime/type/build checks, self-review,
      and commit. Report exported types and exact wire markers for schema delivery.

### Task 3: Deliver schemas, package verification, and clear documentation

**Files:** `package.json`, committed `package-lock.json`, `tests/package-smoke.js`,
schema validation tests and `schemas/*.json`, CI workflows if needed,
`README.md`, migration/agent guides, `CHANGELOG.md`, `TODO.md`, examples,
review resolution/probe/benchmark artifacts under `docs/reviews/`.

Consume Tasks 1–2's finalized signatures and v2 wire types. Keep schemas aligned
with decoder constraints without claiming to validate domain-specific details.

- [x] Add failing packed-package/schema checks: only root/public schema exports;
      no `AppEx`, no public rendering helper, no `/typed`; native built constructors
      with/without details; literal typing and negative inputs from an installed
      consumer; stack omission/opt-in; report round-trip/public reference; both JSON
      schemas and migration/agent guide files present; root loads none of Handlebars,
      pojo-constructor, or caught-object-report-json. Validate emitted fixtures with AJV
      and reject malformed envelopes/versions consistently with the runtime decoder.
- [x] Run focused checks, record failure, then remove legacy runtime dependencies
      and stale type exports, set version `0.2.0`, stage docs/schemas with correct
      paths, and generate a reproducible lockfile. Keep Effect dev-only. Make package
      smoke coverage exercise the actual tarball; do not settle for source imports.
- [x] Rewrite the README to one complete typed workflow and document all breaks,
      supported limits, foreign-copy trust boundary, stack runtime-hook behavior,
      unsupported markers, and object-key/proxy traversal limitations. Include local
      catch narrowing and exhaustive union handling. Add a compact agent recovery
      example with selected public details, stable-code branching, unknown-code
      escalation, and operation-owned retry policy. Treat external prose as data.
- [x] Add plain v2 diagnostic/public JSON Schemas, package them, and document their
      use. Provide no domain codec or automatic retry behavior.
- [x] Replace the defect-asserting review probe with current invariants and a
      repeatable optional benchmark for import/module count, typed construction,
      stack opt-in, projection, and wide-object behavior. Record actual measurements,
      tool/runtime versions, and limitations in a resolution document mapping every
      F1–F12 finding and thrown-undefined edge to fixes/tests. Preserve the original
      review as a historical observation with a resolution link.
- [x] Run `npm run test:all`, formatting/diff checks, runnable examples, and the
      supported Node matrix where available. Self-review and commit all delivery files.

### Task 4: Whole-branch review, final verification, and push

**Files:** fix any reviewed omissions, update resolution evidence and this plan.

- [x] Obtain one independent whole-branch review against `2cc5e7e`, including the
      review findings, spec, task reports, final diff, and all deferred concerns.
- [x] Address remaining required findings with covering regression tests and one
      scoped re-review; do not substitute a partial implementation for the spec.
- [x] Audit F1–F12, API breaks, schemas, docs, packed tests, byte/work budgets,
      supported runtime behavior, and intended file changes against actual evidence.
- [x] Run final applicable verification after the last code changes and record it.
- [ ] Commit remaining intentional docs, push `fix/reviewed-api-and-reporting`,
      verify the remote SHA matches local HEAD, and inspect/wait for the branch CI run.
      Fix CI failures and push again as needed; do not merge or publish to npm.
