# Inspection-time redaction via corj Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Intended executor: Opus at medium effort. Every decision below is already made — do not re-open one; if a step is impossible as written, stop and report why instead of redesigning.

**Goal:** Move redaction out of application-exception's post-production walk and into corj's inspection, so an excluded property is never read, the size budget is spent only on surviving content, and there is one implementation of the traversal. Ship the corj side that already exists uncommitted, then migrate application-exception onto it.

**Architecture:** corj (`caught-object-report-json`) owns the policy mechanism: `new CorjMaker({ redact })` consults `keys`/`paths` *before* reading a property and applies `patterns`/`transform` to every emitted value. application-exception keeps an opaque `createRedactionPolicy` wrapper, forwards it into its three `CorjMaker` call sites, and scrubs the two flat strings corj never sees (the public `message`, the `reporting_errors` text) with corj's own exported redactor. `src/redaction.ts` in application-exception shrinks from a tree walk to validation plus forwarding.

**Tech Stack:** TypeScript (strictest), Jest + ts-jest with a 100% coverage gate in **both** repos, `ajv` 2020 for schema tests, semantic-release in corj (commit messages drive the version), Node 18+.

**Repos:**
- corj: `/home/df/wd/personal/caught-object-report-json` (GitHub `dany-fedorov/caught-object-report-json`)
- appex: `/home/df/wd/personal/application-exception` (GitHub `dany-fedorov/application-exception`)

## Facts already established (verified 2026-09-18 — do not re-derive)

1. **corj#211, #212 and #213 are already implemented, uncommitted, in the corj working tree.** Another session wrote it and went idle. Untracked: `src/redaction.ts`, `tests/redaction.test.ts`, `tests/no-invoke-inspection.test.ts`, `tests/consumers/`, `schema-versions/corj/v0.13/`, `schema-versions/corj/v0.13-full/`, `.eslintignore`. Modified: `src/index.ts` (+514), `src/report-size.ts`, `src/safe-stable-stringify.js`, `src/version.ts`, `README.md`, both workflows, `package.json`, and eleven test files. `git status` shows `main...origin/main [ahead 1]`.
2. `npx jest` in that tree: **19 suites, 1189 tests, all passing.** The 100% coverage gate (`npm run test-ci`) and `npm run test-consumers` were *not* run — Task A1 runs them.
3. The corj policy shape, as implemented in `src/redaction.ts`:
   ```ts
   redact?: {
     keys?: readonly (string | RegExp)[];      // property names never read
     paths?: readonly (string | RegExp)[];     // JSONPaths never read, rooted at the caught value `$`
     patterns?: readonly RegExp[];             // MUST carry the `g` flag or the policy is rejected
     replacement?: string;                     // literal; `$&` and `$1` are NOT expanded
     transform?: ((value, { stage, path, key, prop }) => unknown) | null; // `undefined` drops the field
   } | null
   ```
   A throwing matcher or `transform` fails closed (value becomes the replacement) and is reported once through `onError` with `stage: 'redact'`, without re-consulting the policy.
4. The report format moves **`corj/v0.12` → `corj/v0.13`**. Schema delta: `children_omitted` enum gains `"not_inspected"` and `"redacted"`; `as_string_format` enum gains `"derived"`; the `v` enum becomes `corj/v0.13` / `corj/v0.13-full`; `CorjErrorStage` gains `'redact'`.
5. corj's public surface currently exports only `CORJ_REDACTED_MARKER` and the `CorjRedact*` types from the redaction module. `Redactor` and `resolveRedactPolicy` are internal.
6. appex builds `CorjMaker` in exactly three places, all in `src/reporting.ts`: `corjReportOf` (the diagnostic report) and `jsonView` called twice — once for `context`, once for the public `as_json`.
7. **appex `main` carries a live leak in its interim implementation:** `redactStringValues` passes `replacement` to `String.prototype.replace` as a string, so `replacement: '<$&>'` re-inserts the secret (`'key <sk-abcdefghij> here'`). 0.4.0 never published (see blocker below), so no user has it. This plan deletes that code path; do not patch it separately.
8. appex 0.4.0 is merged on `main` (`a2fd205`) but **unpublished** — the option shape of `createRedactionPolicy` is therefore free to change without breaking anyone.

## Handoff from the session that wrote the corj tree (2026-09-18)

The `caught-object-report-json-08` session stopped editing and handed over. It reports: two independent review passes ran and every blocker has a regression test; 1189 tests at 100% coverage; tsc, eslint, prettier and build clean; `npm run test-consumers` passes all five checks (node-cjs, node-esm, bun, types, Vite→Chromium) against the packed tarball. Task A1 verifies these claims independently — treat them as claims until it does.

What it deliberately left out, and what this plan does about each:

- **A custom `onError` gets no redaction help.** Warning-line scrubbing happens only inside `defaultOnError`; a custom handler receives the raw caught object. appex installs its own handler (`recorder` in `src/reporting.ts`), so without action its `reporting_errors[].error` text would be unredacted. **Covered by D2 + Task B5:** appex scrubs that text itself with the exported `CorjRedactor#text`. The alternative the session suggested — a bound `redact(text)` on `CorjErrorContext` — is not taken: it widens corj's callback contract for every consumer to save appex one constructor call.
- **`CorjRedactor#apply` returns the `CORJ_REDACT_DROP` symbol** to mean "drop the field"; callers must map it. appex only ever calls `#text`, which already maps DROP and any non-string to the replacement. Do not call `#apply` from appex. A private `failing` flag stops a throwing policy from being re-consulted while its own failure is reported; appex passes a no-op `onFailure`, so a throwing `transform` fails closed to the replacement.
- **`resolveRedactPolicy` accepts an already-resolved policy as input** (corj's `with()` relies on it). appex may therefore resolve once in `createRedactionPolicy` and hand the frozen result to every `CorjMaker`.
- **No `exports` map in corj.** Every internal module is deep-importable today (`caught-object-report-json/redaction` already exposes `Redactor`), and the README says a future major will close that. **Not in scope for 10.0.0 in this plan:** it changes the #213 consumer contract and the default-import matrix in `tests/consumers/run.mjs` would need re-checking. It is flagged to the owner as a separable decision to take before publishing. appex must import only from the package root regardless.
- **Inherent limits, documented and pinned by tests (not bugs):** under the default inspection `keys: ['message']` cannot stop the object's own `toString` or V8's stack formatting from reading `message`, so the text stays in `stack` — `patterns` removes content, `keys` + `no-invoke` gives zero reads. appex docs (Task B7) must say the same.
- **Not verified anywhere:** the CI edits (Node 20+24 matrix, Playwright cache keyed on `run.mjs`, Bun pinned to 1.4.2) have never run on GitHub.
- **Gotcha:** `npm run test-consumers` runs `prepublish-me`, which deletes `dist/`, and deletes `npm-module-build/` on exit. Never run it while another step needs either directory; in Task A4, pack the tarball *after* it, not before.

## Blocker on the critical path (owner action, not an agent task)

Both repos' release workflows are failing on npm credentials: appex's `npm publish` returns `E404` on `PUT` (token lacks publish rights or expired; the previous `main` run failed identically), and corj has open issue #208 "The automated release is failing". **appex cannot depend on a corj version that is not on npm.** All development below proceeds against a locally packed corj tarball; Task B1 swaps in the registry version once it exists. If the token is still unfixed when Task B8 is reached, stop after B7, leave the appex branch unmerged, and report.

## Decisions (made — state them in commit messages and docs, do not ask)

- **D1. Ship the corj tree as written.** Audit, do not rewrite. Fix only what the audit proves broken.
- **D2. corj exports its redactor.** Add two public exports so appex does not reimplement scrubbing: `resolveCorjRedactPolicy` (the existing `resolveRedactPolicy`) and `CorjRedactor` (the existing `Redactor` class). This is what "avoid duplicating corj's traversal" in appex#43 means in practice.
- **D3. corj releases as a major.** The format bump is breaking. Commit with `feat!:` and a `BREAKING CHANGE:` footer so semantic-release cuts `10.0.0`.
- **D4. appex adopts corj's option names.** `createRedactionPolicy` takes `{ keys, paths, patterns, replacement, transform }` — `values` is renamed `patterns`, the `g` flag becomes mandatory, `paths` accepts `RegExp`, and a `transform` returning `undefined` drops the field. appex validates by calling `resolveCorjRedactPolicy` and rewraps corj's `TypeError` as `APPEX_INVALID_REDACTION_POLICY`.
- **D5. `paths` address the caught value only.** Forward `keys`, `patterns`, `replacement`, `transform` to all three `CorjMaker` sites, but forward `paths` **only** to `corjReportOf`. A path such as `$.password` is documented as a path into the caught value; letting it also match inside `context` or the selected public details would be an accident, not a policy.
- **D6. New schema file, old one untouched.** Add `schemas/diagnostic-report-v4.json` embedding corj v0.13 definitions. Leave `diagnostic-report-v3.json` byte-identical — 0.3.0 published it. The public report stays `appex/public/v3`; nothing about it changes.
- **D7. `inspection: 'no-invoke'` (corj#212) is out of scope** for appex in this plan. Note it as a follow-up in the design doc; do not add the option.
- **D8. Selection and redaction stay distinct** (unchanged from 0.4.0): on a public report the policy runs over the output of the kind's `details` selector; it can never add a field the selector did not choose.

## Global Constraints

- 100% statements/branches/functions/lines in both repos. corj: `npm run test-ci`. appex: `npm run test:all` (jest gate, type tests, build, package smoke, Node ESM + Bun + headless Chromium suites, docs checks).
- appex: every error thrown by `src` comes from `invalid(code, text)`; every `APPEX_*` code has a `## CODE` section in `docs/agent/errors.md` (`tools/docs/check.cjs` enforces both directions).
- appex: every ```ts block in `README.md`, `AGENTS.md`, `docs/agent/*.md` must type-check standalone. `docs/agent/api-card.md` is generated — run `npm run docs:generate`, never hand-edit. Budgets: `AGENTS.md` ≤ 170 lines, api card ≤ 600.
- No behaviour change when `redact` is absent, in either repo. Both have tests asserting this; they must keep passing unmodified.
- Do not touch `src/typed.ts`, `src/typed-internals.ts`, or anything about `snapshotDetails` / `createTrustRealm` / `toReports` / `maxFinalReportSize` beyond what a task names.
- Work on branches: corj `feat/redaction-and-no-invoke`, appex `feat/corj-inspection-redaction`. Commit after each task. End commit messages with the attribution trailer the session provides.
- Never commit a `file:` or tarball dependency in appex's `package.json`.

---

## Phase A — corj: audit and ship the existing work

### Task A1: Audit the uncommitted tree (read-only)

**Files:** none modified.

- [ ] `cd /home/df/wd/personal/caught-object-report-json && git status && git diff --stat` — confirm it matches Fact 1. If the tree has changed materially (another session resumed), stop and report.
- [ ] `npm run test-ci` — record suites/tests/coverage. Must be 100% on all four metrics.
- [ ] `npm run build` and `npm run test-consumers` — record results.
- [ ] Check each acceptance criterion of `gh issue view 211`, `212`, `213` against a named test. Produce a table: criterion → test file → test name → pass/fail/**missing**.
- [ ] For #211 specifically, prove these two by temporarily breaking the source and restoring it: (a) removing the redaction path makes the negative tests fail; (b) a selected omitted accessor is not invoked (there must be a test with a counting getter).

**Done when:** the table exists and every gap is listed. Do not fix anything in this task.

### Task A2: Close the audit gaps and export the redactor

**Files:** `src/index.ts`, `src/redaction.ts`, `tests/exports-assertions.test.ts`, `tests/redaction.test.ts`, `README.md`.

- [ ] Fix each gap A1 found — and only those. Each fix gets a test that fails without it.
- [ ] In `src/index.ts`, add public exports (D2): `export { resolveRedactPolicy as resolveCorjRedactPolicy, Redactor as CorjRedactor } from './redaction';`
- [ ] Update the exported-names list in `tests/exports-assertions.test.ts` (it snapshot-asserts the surface; `CORJ_REDACTED_MARKER` is at about line 107).
- [ ] Add to `tests/redaction.test.ts`: `CorjRedactor#text` scrubs with a literal replacement (`replacement: '<$&>'` must yield `'<$&>'`, never the match); `resolveCorjRedactPolicy(null)` and `(undefined)` return `null`; a non-global pattern is rejected.
- [ ] Document both exports in the README's "Redacting what the report emits" section: one paragraph, one ```typescript example showing a consumer with a **custom `onError`** scrubbing its own text with the same policy — that is the gap the exports exist to close. State that `#apply` may return `CORJ_REDACT_DROP` and that `#text` never does.
- [ ] The README's "Report schema history" and "Upgrading from v8" sections were written as a 9.x change. This ships as **10.0.0**: rewrite those passages to name 10.0.0, and add an "Upgrading from v9" note (format `corj/v0.13`; a reader validating against the v0.12 schema URL must move to v0.13; new `children_omitted` / `as_string_format` values; `CorjErrorStage` gains `'redact'`).
- [ ] There is no lint script in `package.json`, but the tree is eslint- and prettier-clean and must stay so: run `npx eslint . --ext .ts` and `npx prettier --check .` (or whatever invocation the repo's config supports — discover it, do not add tooling) before finishing.
- [ ] `npm run test-ci` green at 100%.

**Interfaces produced (appex depends on these exact names):**
```ts
resolveCorjRedactPolicy(input: CorjRedactPolicyInput | null | undefined): CorjRedactPolicy | null  // throws TypeError
new CorjRedactor(policy: CorjRedactPolicy, onFailure: (caught: unknown, ctx: CorjRedactContext) => void)
  .text(value: string, ctx: CorjRedactContext): string
```

### Task A3: Commit in reviewable units on a branch

- [ ] `git checkout -b feat/redaction-and-no-invoke`
- [ ] Commit separately, in this order, each with `npm run test-ci` green: (1) `feat: opt-in inspection that never invokes the caught object` (#212); (2) `feat!: configurable field selection and redaction` (#211) with footer `BREAKING CHANGE: the report format is corj/v0.13; children_omitted gains "not_inspected" and "redacted", as_string_format gains "derived", and CorjErrorStage gains "redact".`; (3) `test: packed-artifact consumer suites for Node, Bun and the browser` (#213); (4) `docs:` for README-only hunks; (5) `ci:` for the workflow hunks. If hunks cannot be separated cleanly because #211 and #212 interleave in `src/index.ts`, make (1)+(2) one `feat!:` commit and say so in the body.
- [ ] `git push -u origin feat/redaction-and-no-invoke`; open a PR whose body lists `Closes #211`, `Closes #212`, `Closes #213`, the A1 criterion table, and the format delta.

### Task A4: Merge and produce an installable artifact

- [ ] Merge the PR to `main` (owner preference on record: merge without asking).
- [ ] If the release workflow publishes `10.0.0`, record the version and skip the rest of this task.
- [ ] If it fails on credentials (expected until corj#208 is fixed): `npm run prepublish-me && cd npm-module-build && npm pack`, note the tarball path for Phase B, and report the exact publish error. Do not attempt to work around the token.

---

## Phase B — appex: migrate onto corj's inspection-time redaction

### Task B1: Depend on the new corj

**Files:** `package.json`, `package-lock.json`.

- [ ] `git checkout feat/corj-inspection-redaction && git merge main` (the branch already exists; it holds this plan)
- [ ] If corj `10.x` is on npm: `npm install caught-object-report-json@^10.0.0`. Otherwise `npm install --no-save <tarball from A4>` for local development and leave `package.json` at `^9.0.1` until it is — add a line to the branch's PR description saying so.
- [ ] `npx tsc -p ./tsconfig.types.json --noEmit` — expect failures only from the format change; list them. They are Task B2's input.

### Task B2: Report format v0.13 and the v4 schema

**Files:** create `schemas/diagnostic-report-v4.json`; modify `package.json` (`exports`, `prepublish-me`), `tests/Schemas.test.ts`, `tests/package-smoke.js`, `tests/runtime/flow.mjs`, `README.md` (Schemas section), `AGENTS.md` (report-shape example `v`).

- [ ] Copy `diagnostic-report-v3.json` to `diagnostic-report-v4.json`. In the copy only: new `$id`/title; `v` enum → `corj/v0.13`, `corj/v0.13-full`; `children_omitted` enum += `not_inspected`, `redacted`; `as_string_format` enum += `derived`; `reporting_errors[].stage` enum += `redact`; update the `corj/v0.12` mentions in descriptions. **Leave v3 byte-identical** (`git diff --stat schemas/diagnostic-report-v3.json` must be empty).
- [ ] `package.json`: add `"./schemas/diagnostic-report-v4.json"` to `exports`; `prepublish-me` already copies `schemas/*.json`.
- [ ] Point every diagnostic-schema test at v4. `DIAGNOSTIC_REPORT_VERSION` follows `CORJ_VERSION` automatically — update literal `'corj/v0.12'` expectations in tests, `tests/runtime/flow.mjs`, README and AGENTS to `'corj/v0.13'`.
- [ ] `tests/package-smoke.js` asserts the exports map and packaged files — add v4.

**Done when:** `npm test` passes with the old redaction walk still in place.

### Task B3: Rewrite `src/redaction.ts` as validation plus forwarding

**Files:** `src/redaction.ts` (rewrite), `src/index.ts` (type exports only if names change).

Replace the whole file. It keeps: the module-private `REDACTION_POLICY` symbol, the opaque `RedactionPolicy` type, `createRedactionPolicy`, `compiledPolicy`. It loses: `applyRedaction`, `DIAGNOSTIC_PROTECTED`, `PUBLIC_PROTECTED`, `MAX_REDACTION_DEPTH`, `narrowTo`, `blankOf`, `redactStringValues`, `matchesKey`, `reTest`, `RedactionFailure`.

```ts
export interface RedactionPolicyOptions {           // D4: corj's names
  readonly keys?: readonly (string | RegExp)[];
  readonly paths?: readonly (string | RegExp)[];
  readonly patterns?: readonly RegExp[];            // each must be global
  readonly replacement?: string;
  readonly transform?: CorjRedactTransform;
}
export interface CompiledRedactionPolicy {
  /** Forwarded to the diagnostic CorjMaker. */
  readonly forCaught: CorjRedactPolicy;
  /** Forwarded to context and public as_json: the same policy without `paths` (D5). */
  readonly forViews: CorjRedactPolicy;
}
```

- [ ] `createRedactionPolicy(options = {})`: reject non-object/array/null with `APPEX_INVALID_REDACTION_POLICY`; call `resolveCorjRedactPolicy(options)` inside `try`, rethrowing any `TypeError` as `invalid('APPEX_INVALID_REDACTION_POLICY', <corj's message>)`; build `forViews` by resolving the same options with `paths` removed; freeze and return the opaque object.
- [ ] Keep the 128-character bound on `replacement` (corj has none; the public `message` bound depends on it).
- [ ] `compiledPolicy(policy)`: unchanged contract — `undefined` → `undefined`; anything not minted here → `APPEX_INVALID_REDACTION_POLICY`; a throwing accessor is caught.
- [ ] JSDoc on `createRedactionPolicy` rewritten: excluded properties are never read; `patterns` must be global; `replacement` is literal; selection/redaction stay distinct (D8). One `@example`. The api card is generated from this.

### Task B4: Forward the policy at the three `CorjMaker` sites; delete the walk

**Files:** `src/reporting.ts`.

- [ ] `corjReportOf`: add `redact: policy?.forCaught ?? null` to the `CorjMaker` options. corj's `stage: 'redact'` failures arrive through the existing `recorder` — no new plumbing.
- [ ] `jsonView(value, maxBytes, onError, redact)`: new fourth parameter, passed as `redact` to its `CorjMaker`. The `context` call passes `policy?.forViews ?? null`; the public `as_json` call passes the public report's `forViews`.
- [ ] Delete `redactDiagnostic` and `assembleRedacted`; every call site goes back to `assembleDiagnostic`. `shrinkToBudget` keeps its `policy` parameter only to hand to `corjReportOf` — every rebuild is redacted by construction, so the budget still measures what is emitted.
- [ ] Remove the imports of `applyRedaction`, `PUBLIC_PROTECTED`. `assembleDiagnostic`'s `v: report.v ?? DIAGNOSTIC_REPORT_VERSION` stays.
- [ ] The `APPEX_REPORT_BUDGET_TOO_SMALL` message keeps its "a redaction policy can enlarge but never shrink" suffix when a policy is set.

### Task B5: Scrub the two flat strings corj never sees

**Files:** `src/reporting.ts`.

- [ ] Public `message`: after rendering and **before** the 4,096-character cut, run it through `new CorjRedactor(forViews, () => undefined).text(message, { stage: 'as_string', path: '$.message', key: 'message' })`. Then cut. Delete the post-redaction re-cut block added in `b62ddbf` — order makes it unnecessary.
- [ ] `reporting_errors`: in `recorder`, scrub `error` with the same redactor (`{ stage: 'warning', path: <the entry's path> }`) before pushing. Do not scrub `stage`. A `stage: 'redact'` entry describes the policy's own failure: corj already guarantees it is not re-consulted; keep that — construct the redactor once per report and reuse it.
- [ ] No tree walk may remain in `src/`. `grep -n "applyRedaction\|walk(" src/` must return nothing.

### Task B6: Tests

**Files:** `tests/Redaction.test.ts` (rewrite), `tests/DiagnosticReport.test.ts`, `tests/Schemas.test.ts`, `tests/Reporting.types.ts`.

Keep every appex#43 acceptance test, re-expressed in the new option names: secret fixtures across details, nested causes, message/stack, `context`, inspection errors, public selection; unknown failures stay generic; both shapes validate against their schemas (diagnostic against **v4**) under a catch-all policy and under `transform` returning a number, a structure, a 20,000-character string, and throwing; composes with `maxFinalReportSize` at 400/512/1,024/4,096/65,536; the secret returns when the policy is bypassed; no-policy output is unchanged.

Add, because they are the point of this migration:
- [ ] **An excluded getter is never invoked** — a counting getter under `keys: ['password']` stays at 0 (it is 1 on `main` today).
- [ ] **`replacement: '<$&>'` stays literal** in a diagnostic report, in `context`, in public `as_json`, and in the public `message` (Fact 7's regression).
- [ ] A non-global pattern is rejected as `APPEX_INVALID_REDACTION_POLICY`.
- [ ] `paths: ['$.password']` redacts the caught value's `password` and leaves `context.password` alone (D5); `keys: ['password']` redacts both.
- [ ] A throwing `transform` fails closed and yields exactly **one** `reporting_errors` entry with `stage: 'redact'`.
- [ ] A redacted children source yields `children_omitted: 'redacted'` and the report validates against v4.
- [ ] Application data named `id`, `code`, `path`, `stage`, `level`, `truncated` is redacted (the by-name leak the 0.4.0 review found — keep it pinned).
- [ ] Delete tests that exist only for deleted code: the 3,000-level depth-guard test, the positional-protection internals, `narrowTo` type-substitution expectations. Replace the last with whatever corj's `transform` contract actually does; assert schema validity, not internals.

**Done when:** `npm test -- --runInBand --coverage` is 100% on all four metrics.

### Task B7: Docs

**Files:** `docs/design/redaction-policy.md` (rewrite), `README.md`, `AGENTS.md`, `docs/agent/recipes.md`, `docs/agent/errors.md`, `CHANGELOG.md`, then `npm run docs:generate`.

- [ ] `docs/design/redaction-policy.md` becomes the decision record for *this* design: corj owns the mechanism; what appex forwards where (D5); the two flat strings and why they use `CorjRedactor`; the properties gained (never-read, budget spent on survivors, one implementation); what a policy cannot do (it cannot discover an unknown secret; `keys`/`paths` select properties, not content — `message` text is duplicated into `stack`, so content removal needs `patterns`). State the history in two sentences: 0.4.0-unreleased used a post-production walk; it was replaced before publishing. Note D7 as a follow-up.
- [ ] Rename `values` → `patterns` and add the `g` flag in every snippet (README, recipes, errors.md, AGENTS rule 11). Snippets are type-checked — `npm run docs:check` finds any you miss.
- [ ] `CHANGELOG.md`, under the unreleased `0.4.0` entry: rewrite the #43 bullet for the new design; add **Breaking** line — diagnostic `v` is `corj/v0.13`, schema is `diagnostic-report-v4.json`, runtime dependency is `caught-object-report-json ^10.0.0`.
- [ ] `npm run docs:generate && npm run docs:check`.

### Task B8: Gate, review, merge

- [ ] `npm run test:all` — everything green, including the Node ESM, Bun and Chromium suites.
- [ ] `package.json` must name a **registry** corj version. If corj `10.x` is still unpublished, stop here and report (see Blocker).
- [ ] Adversarial review by a Fable subagent before merge, with this brief: hunt for (1) any path where a policy-excluded value reaches either report, including through `reporting_errors`, the default `onError` warning line, and `toReports`; (2) any input that makes a redacted or budgeted report fail `diagnostic-report-v4.json` or `public-report-v3.json`; (3) any 0.3.0 call whose output changed with `redact` absent, other than `v`; (4) tests that still pass with the forwarding removed from each of the three `CorjMaker` sites — break each one in turn and confirm a test fails; (5) docs that claim more than the tests establish. Verify by running code; report CONFIRMED vs SUSPECTED; fix nothing.
- [ ] Fix confirmed findings, each with a test. Re-run `npm run test:all`.
- [ ] Merge to `main` via a PR whose body has `Closes #43`, push. Comment on appex #44–#48 with the commits that implemented them (`38c7f7c`, `b62ddbf`, merged as `a2fd205`) and close them.
- [ ] Report: what merged, what published, and what is still waiting on the npm token.
