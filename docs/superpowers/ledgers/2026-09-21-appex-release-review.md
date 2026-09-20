# Task 2 review: application-exception descriptive API release

Reviewed implementation commit `2ccb79e3524a0749e71264f38b61cd5df3529d81`
and final review tree `df1266c3566e40616e2bf97779c82b991bbf8a0c`
against task base `a15ae3e42da905289e45dc52f89b2b7f1c139cdb`.
The broad branch review also covered the design and release ledger changes from
`53d57fce5f2ad8a7228ddfa7b893f59d2ac3fbd8`. The final commit only relocates
the implementation report into durable documentation; source is identical to
the reviewed implementation commit.

## Spec compliance

The implementation satisfies the runtime and type contract apart from the
documentation issue below.

- The public surface exports the approved descriptive names and audience-specific
  CORJ option types, removes the old runtime/type aliases, keeps instance
  `details`, kind `public`, pair `public`, and realm-v1's internal `details`
  distinct, and re-exports `CorjReportNode`.
- Public, diagnostic, pair, policy-override, and nested CORJ bags are validated
  before use. Reserved and legacy CORJ keys are rejected without reading hidden
  or inherited values. Recognized accessors are snapshotted once per call;
  caller bags remain mutable and later top-level and nested mutations are seen
  by later calls. `makeReportPair` resolves both audience bags before inspecting
  the caught value or running policy callbacks.
- Public policy selection remains fail closed. Cross-copy policies retain the
  realm-v1 internal `details` field. Public fingerprints still require real
  stack frames and each audience uses its own CORJ/redaction bag.
- `maxReportBytes` implements the approved `number | null` contract with the
  512/2,048-byte minima. Diagnostic sizing delegates to CORJ 12 with forced
  UTF-8. Public sizing measures the complete compact JSON with `TextEncoder`,
  includes `truncated`, removes `as_json` whole first, and trims `message` only
  at complete code-point boundaries. The existing independent 4,096 UTF-16
  message and 16,384 UTF-8 selected-details limits remain active when the total
  cap is omitted or `null`.
- Diagnostic schema v6 tracks `corj/v0.15`; prior diagnostic schemas remain
  exported unchanged, and public v3/v4 decoding remains supported. The manifest
  and lock resolve `caught-object-report-json@^12.0.0` from the registry with no
  local-file dependency.
- Live docs, examples, generated API card, package/runtime fixtures, and the
  0.6.0 changelog otherwise use the implemented contract. Historical research,
  specs, ledgers, and older changelog entries appropriately retain old names.

## Strengths

- `src/reporting.ts` separates validation/snapshotting, report construction,
  and final public limiting cleanly. The limiter works only on a detached plain
  report and cannot rerun renderers, selectors, getters, serialization hooks,
  fingerprint discovery, or reporting callbacks.
- `src/corj-maker.ts` keeps the public six-key allowlist and diagnostic exclusion
  list explicit and aligned with the exported derived types. Its value-free
  checks for hidden/inherited moved keys close a subtle silent-ignore path.
- Tests exercise the important adversarial behavior: one-read accessors,
  mutable caller bags, pair-wide prevalidation, null/omitted budgets, escaping,
  worst-case fixed envelope, astral and unpaired surrogate boundaries,
  whole-details removal, schema preservation, packed consumers, and cross-copy
  trust.
- The release evidence is strong: the implementer reports 339 tests at 100%
  coverage plus types, build, packed smoke, Node ESM, Bun 1.4.2, Chromium 153,
  and 44 documentation snippets. Coordinator evidence adds successful GitHub CI
  run `35532662744` on Node 18/20/24, Bun, and browser, plus an independently
  installed exact tarball (`c4a1edf3d43da26befd3d5ec03a32950ed194f1b6d2e382c10ba01c52b43b9a4`)
  that passed export/removal, correlation, UTF-8 budget, selector-once,
  mutable-bag, and schema probes.

## Issues

### Important

1. `AGENTS.md:57` misidentifies the raw first argument of `onReportingError`.

   The text says the callback receives "the RAW caught value." CORJ 12 passes
   the raw **reporting failure**: the value thrown by a getter, hook, redaction
   transform, or other operation while it is producing the report. It is not
   the original application value being reported. This distinction is part of
   the approved redesign and matters because the warning tells agents what
   sensitive value they are handling.

   Reproduction against the built reviewed tree:

   ```js
   const root = Object.defineProperty({}, 'secret', {
     enumerable: true,
     get() { throw 'getter-failure'; },
   });
   const seen = [];
   makeDiagnosticReport(root, {
     corj: { onReportingError(first) { seen.push(first); } },
   });
   // seen[0] === 'getter-failure'
   // seen[0] !== root
   ```

   Replace "RAW caught value" with "raw reporting failure" and state that it is
   the unsanitized value thrown during reporting, not the original caught
   application value. Keep the existing warning against sending it to an
   untrusted sink.

### Minor

None.

## Code quality and verdict

The implementation is cohesive, defensive, and well covered. I found no
runtime, type-surface, schema, packaging, dependency, or cross-package
integration defect in the reviewed scope. The CORJ 12 integration uses the
released declarations and semantics correctly.

**Verdict: fix the Important documentation error before merge/release, then
ready to merge without another full-suite rerun.** A focused docs check after
the one-line correction is sufficient because source and generated API output
do not need to change.

## Scoped re-review: fix round 1

Reviewed `df1266c3566e40616e2bf97779c82b991bbf8a0c..e072ddbfd264efa79c9d97e85422896af38cc6d8`
through `task-2-fix-1.diff` only.

The Important finding is addressed. `AGENTS.md:57-59` now states precisely
that `onReportingError` receives the raw, unsanitized value thrown while CORJ
produces the report and explicitly distinguishes it from the original caught
application value. The accompanying durable implementation-report entry
accurately records the finding, correction, and reported 44-snippet docs check.
The scoped diff contains no unrelated or behavior-changing edits.

**Round 1 verdict: approved. No open findings; ready to merge/release after the
coordinator rebuilds the shipped tarball.**
