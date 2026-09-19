# SDD ledger — plan: /home/df/wd/personal/application-exception/docs/superpowers/plans/2026-09-18-appex-05-on-corj-11.md
Repo: /home/df/wd/personal/application-exception, branch feat/corj11-orthogonal-reports, merge base main f4c4665, plan commits up to 025b3fd
Owner directive: execute all with Opus medium, push and merge; "don't ask questions - assume and document".
corj development tarball: /home/df/wd/personal/application-exception/.superpowers/sdd/tarballs/corj-11-dev-45b73e5.tgz (corj branch feat/orthogonal-reports at 43bc11e, before corj's final review). Install with npm install --no-save; never npm ci afterwards.

## Pre-flight scan
| Tasks | Produces vs consumes | Finding |
| --- | --- | --- |
| 1 -> 2,3 | makerFor(corj, redact), AppexCorjOptions, thin RedactionPolicy -> publicReportOf uses makerFor(options.corj, options.redact) | consistent |
| 1 self | makerFor tests vs code (metadata forcing, freeze, cache keys, corj.redact rejection) | agree |
| 2 -> 3 | PublicOverride, effectivePolicy -> publicReportOf(caught, options, id, fingerprint) | consistent |
| 3 self | decode v3/v4 tests vs rules | agree |
| 1 -> 4 | Task 1 parks the v4-schema validation as test.todo; Task 4 restores it against v5 | consistent |
| 3 -> 4 | PublicReport v4 shape vs public-report-v4.json | consistent |
| 1..4 -> 5 | docs and runtime suites follow the final API | consistent |
| corj plan -> this plan | corj facts that differ from this plan's text: context is dropped whole however small; onError gets a copy; every fingerprint part value goes through the policy; redact-stage record path may be the replacement | carried into dispatch notes |

Task 0: complete (baseline on corj 10: 14 suites, 253 tests, 100%; corj 11 tarball installed, CORJ_VERSION corj/v0.14, build fails with 1 TS error as the plan expects)
Task 1: dispatched, BASE 025b3fd
Task 1: implemented 8bd3a8e (DONE_WITH_CONCERNS: schema validation parked as stub/todo until Task 4 -> carried into Task 4's brief; budget tests assert drop order at separated budgets). Review dispatched; Task 2 dispatched (BASE 8bd3a8e)
Task 1: review: spec ✅, quality approved with fixes. Important 1: corj: { onError: undefined } overwrites the silent default (spread order). Important 2: an invalid corj.metadata is normalized instead of letting corj throw. Both are defects in the plan's own code; fix queued behind Task 2's implementer.
Task 1: Ruling: Important 3 (the inert validateDiagnostic stub makes 24 assertions tautological until Task 4, one test.each block asserts nothing about the diagnostic report meanwhile) — plan-mandated deferral stands; Task 4's brief now requires restoring it and ends with `grep test.todo` printing nothing — the v5 schema does not exist before Task 4 — if wrong: three tasks run with one protection untested; the final review and Task 4 both gate the merge.
Task 1: minor (deferred): shallow freeze vs its JSDoc; validation ordering; ASCII regex duplicated in typed.ts; "onError receives the raw caught" undocumented; public as_json absent rather than {} on a dropped root, untested; a brittle RangeError expectation.
Task 2: implemented 1b6afb7 (concerns: details:null now omits as_json -> carried to Task 5 upgrade table; publicCodeOf kept instead of boundedIdentifier). Review dispatched. Task 1 fix round 1 dispatched.
Task 1: fix commit c86875c; re-review dispatched. Task 3 dispatched (BASE c86875c)
Task 1: fix round 1/5 (4 addressed, 0 open; commits 1b6afb7..c86875c)
Task 1: complete (commits 025b3fd..8bd3a8e + c86875c)
Task 2: review: spec ✅, quality needs fixes — Important: publicOverrideOf validates the bag and returns it by reference, effectivePolicy re-reads override.code, so a non-idempotent getter puts an unvalidated code into the report (regression from 0.4's single read). Fix queued behind Task 3's implementer.
Task 3: implemented 4bbeaaf (7 public-schema assertion sites parked as validatePublicDeferredToTask4; PublicReportVersion type not re-exported from index.ts -> Task 5 note). Review dispatched. Task 2 fix round 1 dispatched.
Task 2: fix commit c8efe45; re-review dispatched. Task 4 dispatched (BASE c8efe45)
Task 2: fix round 1/5 (1 addressed, 0 open; commits 4bbeaaf..c8efe45); re-review minor: toReports re-invokes the caller's corj/redact getters after the up-front validation -> folded into Task 3's fix
Task 2: complete (commits 8bd3a8e..1b6afb7 + c8efe45)
Task 3: review: spec ✅, quality needs fixes — Important 1: toReports' up-front validation omits `realm`, so an invalid realm throws after the diagnostic report was built and the JSDoc is false. Important 2 (plan-mandated): tests/Schemas.test.ts asserts nothing until Task 4 restores the validators (Task 4 is running; its brief requires it).
Task 3: Ruling: fix round 1 after Task 4's implementer: validate realm up front; toReports resolves override, realm api and both makers ONCE and passes them down (no second read of any caller bag); decoder rejects a v3 report with an own `fingerprint` key whatever its value; assert decoded field order; export PublicReportVersion from index — if wrong: a slightly larger internal signature for publicReportOf/diagnosticReportOf.
Task 4: implemented 7e264c9 (all parked assertions restored; none failed; no schema loosened). Review dispatched. Task 3 fix round 1 dispatched.
Task 3: fix commit 6c12441; re-review dispatched
corj tarball rebuilt from corj fea9095 (after corj's final-review fix wave) and reinstalled: appex gate 15 suites, 309 tests, 100%, types and build ok. corj behaviour changes that matter here: an invalid runtime occurrenceId/fingerprint VALUE is recorded, not thrown (appex still validates its own occurrenceId first); fingerprint string values are cut at 16,384 units; bigint and non-finite part values contribute.
Task 5: dispatched, BASE 6c12441
Task 3: fix round 1/5 (5 addressed, 0 open; commits 7e264c9..6c12441)
Task 3: complete (commits c86875c..4bbeaaf + 6c12441)
Task 4: review: spec ✅, quality approved, no Critical/Important
Task 4: minor (deferred): v5 root is open (a typo'd optional field validates; inherited from v4, needed for corj's $schema metadata), undocumented by a test; the occurrence_id $ref reaches through corj's properties map; one frozen-schema test asserts only typeof; a budget test depends on --stack-trace-limit=1000; the embedding is the lenient union of compact and full.
Task 4: complete (commits c8efe45..7e264c9, review clean)
Task 5: implemented 087f662 + c0000b5; review dispatched. Unverified by design: test:package and test:runtimes (need corj 11.0.0 on npm); package-lock.json still pins corj 10.
Final review (Fable, adversarial) dispatched at c0000b5, merge base f4c4665, in parallel with the Task 5 review
Task 5: review: spec ✅, quality needs fixes — Important: docs/design/redaction-policy.md:44-49 still says this package bounds `replacement` at 128 and corj has no bound (false both ways). Minors: AGENTS.md:50 omits the redact exception; tests/runtime/flow.mjs asserts fingerprint against itself; errors.md omits the non-object corj rejection; "occurrenceId validated first" is inverted in toReports (errors.md:112, CHANGELOG:47-49); README "names, messages and stacks" vs the default parts; root regex quoted without its optional group; upgrade-table row count.
Task 5: Ruling: Task 5's doc fixes (Important + all seven Minors, all one-line doc or test edits) ride in the single final-review fix wave instead of their own round — they touch the same files the final review is likely to touch — if wrong: Task 5's fix is verified by the final scoped re-review rather than its own.
Final review (Fable): FIX FIRST. No Critical. I1 Important: for a stackless caught value (thrown string, object with toString, Error without stack) the default fingerprint hashes [typeof, as_string], so the PUBLIC fingerprint confirms guesses of the text (reviewer brute-forced a PIN message in 10 ms); docs claimed the opposite. I2 Important: toReports ignores the public bag's `fingerprintParts: null` and the public bag's `redact`. I3 Important: decodePublicReport accepts v4 occurrence ids the v4 schema rejects (length-only check). I4 Important (docs): 0.4 transforms keyed on path/stage fail OPEN on 0.5 (roots moved to $context/$public; public message is stage 'warning' at $public.message); changelog only described the fail-safe direction.
Ruling I1+I2: the public report's fingerprint is ALWAYS computed by the PUBLIC bag's maker as `maker.makeFingerprint(caught, { requireStack: true })`: no fingerprint for a value without a string stack, the public bag's `fingerprintParts: null` and `redact` are honoured, and toReports no longer copies the diagnostic one. The two reports still agree whenever both bags carry the same corj options and redact (tested). Needs a small corj addition (`requireStack`), landed on the corj branch with its own review — a stackless value's only identity is its text, so any discriminating hash of it is an oracle; the public audience is untrusted — if wrong: thrown primitives get no public retry signal, and toReports walks the error graph twice (no as_json, cheap). This amends spec D11 ("toReports computes it once").
Ruling I3, I4: fix as proposed (ID_PATTERN for v4, v3 stays lenient; one Breaking bullet + upgrade row + lines in recipes.md and redaction-policy.md).
Ruling: promoted Minors: document that a custom corj.onError receives the RAW caught value; cap decodePublicReport's rejection `path` (64 chars per key segment, 256 total) because recipes hand it to an agent. Doc fix: README/recipes must say occurrence_id is a bounded printable-ASCII token that a forged branded value can choose, to be treated as data and escaped when rendered (pre-existing since 0.3; tightening the alphabet would change spec A6 in both libraries). Other new Minors stay deferred and go into a GitHub issue.
Final review: ONE fix wave dispatched (Opus), BASE f32b9f6, on corj tarball 45b73e5
Final review: fix wave landed f32b9f6..120cdf1 (4 commits; 323 tests, 100%, docs:check clean) on corj tarball 6f09b78. One scoped re-review dispatched to the same Fable reviewer. Left open by instruction: M1, M4-M9 and M3's code follow-up.
Final review: scoped re-review (Fable): READY TO MERGE at 120cdf1 on corj 6f09b78; I1-I4 and M2 ADDRESSED by rerunning the reproductions; 35 hostile values x 4 bags: public fingerprint absent or equal to the diagnostic one, never different; no regressions.
Ruling: the re-review's new Minors R1 (docs: a reader who can trigger the same call site with chosen text can compare hashes under a caller recipe) and R3 (the capped decoder path still carries ~246 chars of sender text with raw newlines; JSON-quote key segments) go to the follow-up issue. R2 (corj's frame heuristic accepts some frameless prose) is fixed in corj Task 11 rounds 2 and 3 before the corj merge.
Release constraint: corj 11.0.0 must be published from the corj branch head that contains `requireStack` (e2a7224 or later); an older corj 11 build ignores the option and would publish stackless hashes.
Task 5: fix round (Important + 7 Minors) landed inside the final fix wave, commit 120cdf1; verified by the final scoped re-review
Task 5: complete (commits 6c12441..c0000b5 + 120cdf1)
Task 6: final gate at 120cdf1 on corj 87025aa: 15 suites, 323 tests, 100%; types, build, docs:check pass; frozen schemas untouched; no tarball dependency. Entity count (main -> branch): runtime exports 13 -> 13; API-card entries 36 -> 41 (new types AppexCorjOptions, PublicOverride, PublicReportVersion, two corj re-exports); option fields of the two report calls 14 -> 9; error codes 13 -> 12; src/reporting.ts + redaction.ts 910 lines -> 740, plus the new 82-line corj-maker.ts.
Task 6: branch pushed; PR https://github.com/dany-fedorov/application-exception/pull/49 open. CI FAILS at install with ETARGET "No matching version found for caught-object-report-json@^11.0.0" — expected until corj 11.0.0 is published. Follow-up issue #50 filed. Merge not attempted: the corj merge was denied by the permission classifier, and this PR cannot go green before corj is published anyway.
Task 6: complete (PR open, merge is the owner's)
