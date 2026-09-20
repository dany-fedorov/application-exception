# Descriptive API release ledger

## Authorization and assumptions

The user approved the descriptive breaking redesign without compatibility
aliases, requested Sol medium agents, instructed us to resolve and document
questions, and authorized pushing, merging, and publishing both packages.

- Release targets: caught-object-report-json 12.0.0; application-exception 0.6.0.
- corj report schema advances to v0.15; application-exception diagnostic schema
  advances to v6. Public reports stay v4 and decoding keeps v3 support.
- Public whole-report cap is opt-in, at least 2,048 UTF-8 bytes; omit selected
  details whole before shortening the message. Diagnostic minimum stays 512.
- Preserve canonical fingerprint encoding and realm-v1 internal policy fields.
- No speculative reporter factory; remove caller-bag identity caching instead.
- `maxReportBytes: null` disables the total budget, retaining independent limits;
  undefined keeps existing defaults. This preserves the former diagnostic
  `maxReportSize: null` capability under its new name.
- Split `AppexCorjOptions` into descriptive `DiagnosticReportCorjOptions` and
  `PublicReportCorjOptions`, without an alias, to name the two different option
  contracts accurately.
- Credentials are held only in temporary protected storage, never in this repo.

## Baselines and external preflight

- corj source base: `78afaceb152978e6f0f73caee8fc9ffc4de5b79b`.
- application-exception source base: `53d57fce5f2ad8a7228ddfa7b893f59d2ac3fbd8`.
- Both remote main branches matched those bases during preflight.
- Baseline corj: 31 suites, 1,505 tests, 25 snapshots passed.
- Baseline application-exception: 15 suites, 323 tests passed.
- Registry latest versions: corj 11.0.1; application-exception 0.5.0.
- npm authentication validated against the official registry.
- GitHub API confirmed push/admin permission for both repositories.

## Implementation and release evidence

The evidence below records implementation, independent review, packed-artifact
checks, integration, and release verification.

- corj implementation commit: `b8f4d2efd9ef5872e6b80eec1e4bf93e69236a91`.
- corj implementation verification: 32 suites, 1,509 tests, 25 snapshots,
  100% statements/branches/functions/lines; build and packed Node CJS/ESM, Bun,
  declaration-resolution, encapsulation, and Vite/Chromium consumers passed.
- corj merged PR: https://github.com/dany-fedorov/caught-object-report-json/pull/225.
- Feature CI run `35530794841` passed all jobs (test and Node 20/24 consumers).
- Independent corj spec and quality review approved without findings.
- Release coordination ruling: run feature CI, then integrate the reviewed tree
  with a `[skip ci]` merge and annotated tag pushed atomically. This avoids
  concurrent automated/manual npm publication. Publish the exact checked tgz.
  Generate tracked corj Typedoc locally; merge schemas before npm publication
  because their URLs resolve from GitHub main. Manual publication does not claim
  GitHub Actions provenance.

- corj release merge: `db067389d76ae52545de342b58687978b2e18cb8`, tag
  `v12.0.0`; release tree matched reviewed implementation byte for byte. Fresh
  merged-tree coverage/build checks passed. Main and tag were pushed atomically;
  only Pages deployment ran, with no competing package release workflow.
- All six public v0.15/v0.15-full schema URLs returned HTTP 200 and valid JSON.
- npm published corj 12.0.0; registry version and latest tag verified.
  Registry integrity and downloaded bytes match the reviewed tarball. Artifact SHA256:
  `cbfd3740685b433e15e6a5a77ca2fa4f36f9305b3776cbb1467eda5ab2995048`.
- Original corj main checkout fast-forwarded cleanly to the release merge.

- Clean registry installation passed descriptive-export, removed-alias,
  merged-bag rejection and v0.15 report checks. Used an isolated fresh npm cache
  because the existing cache briefly retained pre-publication metadata.
- corj GitHub release:
  https://github.com/dany-fedorov/caught-object-report-json/releases/tag/v12.0.0.

## Application-exception 0.6.0

- Implementation: `2ccb79e3524a0749e71264f38b61cd5df3529d81`.
- Local full gate: 16 suites, 339 tests, 100% statements/branches/functions/lines;
  type tests, build, packed smoke, Node ESM, Bun 1.4.2, Chromium 153, and
  documentation checks (44 snippets; API card 649/650 lines) passed.
- Independent Sol medium task and whole-branch review found one live-doc
  callback-description error and no implementation/integration defects. Fix
  `e072ddbfd264efa79c9d97e85422896af38cc6d8` passed docs checks and scoped
  re-review; no findings remain. Full review evidence is retained beside this
  ledger in `2026-09-21-appex-release-review.md`.
- PR: https://github.com/dany-fedorov/application-exception/pull/52.
- CI runs `35532662744` and final `35532966553` passed Node 18/20/24, Bun,
  and browser jobs.
- Release merge: `4b77ec2392c793fffe94c75b2639e4673e7d3c1b`, annotated
  tag `v0.6.0`; merge tree exactly matches reviewed `e072ddb`. Main/tag pushed
  atomically, PR merged, no competing release workflow started. The merged v6
  schema URL returned HTTP 200 with valid JSON.
- Exact final tarball SHA256:
  `6c74f35a485bcc1ab449330485a0d510e1a211bb49874f3f8a3d542936821aec`.
  Declarations contain the new names and no obsolete aliases; manifest and lock
  use registry `^12.0.0`; new and historical schemas are present. A clean
  installation of the initial artifact with registry dependencies passed the
  independent release smoke. The final artifact differs only in the reviewed
  `AGENTS.md` wording correction; all other packaged bytes are identical.
- npm published 0.6.0; version, latest tag, registry integrity, and downloaded
  bytes all match the exact final tarball. A fresh registry installation passed
  the independent descriptive-API, alias-removal, correlation, UTF-8-budget,
  single-selector, mutable-options, and schema smoke checks.
- GitHub release:
  https://github.com/dany-fedorov/application-exception/releases/tag/v0.6.0.
- Temporary npm credential storage was removed after both releases verified.
- Original checkout fast-forwarded after preserving the session's identical
  untracked research files in a temporary backup; tracked documents now contain
  those same bytes. `npm ci` and build completed, with no tracked changes. Both
  original checkouts contain the released source and refreshed compiled output.

## Assumption consequences

- Sol medium workers and reviewers follow the user's model request; no model
  escalation was substituted. Isolated temporary worktrees kept ongoing user
  checkouts separate until integration, at the cost of extra disk space.
- Versions 12.0.0/0.6.0 and diagnostic schemas v0.15/v6 identify breaking
  source/wire changes. Consumers must migrate; no aliases conceal that change.
- Public limits are opt-in with a 2,048-byte floor; diagnostic limits retain a
  512-byte floor. Smaller budgets reject. `null` disables only the total cap,
  while omitted limits retain defaults and independent component caps remain.
- `DiagnosticReportCorjOptions` and six-key `PublicReportCorjOptions` replace
  the former shared type. Callers must move ineffective public settings to the
  diagnostic audience or remove them.
- Complete compact-JSON UTF-8 measurement uses browser-neutral production
  code. The public limiter removes details whole before shortening the message,
  so a tight budget can lose all selected details rather than a partial value.
- Canonical fingerprint encoding and realm-v1 internal selector fields remain
  stable. Internal historical labels are retained to avoid breaking correlation
  and cross-copy trust; they are not public compatibility aliases.
- The no-factory design removes caller-bag identity caching/freezing; a report
  resolves current options each time rather than reusing a cached maker.
- Manual publication of the exact tested artifacts coordinates with skipped
  main release automation. These releases do not claim GitHub Actions
  provenance; feature CI supplies the recorded platform checks.

## Final source state

The release tags point to the reviewed source and exact package contents. A
subsequent documentation-only commit records this completed evidence with
`[skip ci]`; it does not change the shipped source, package manifest, lockfile,
or release tags. Both releases are merged and published; no user decision or
review finding remains open.
