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

Implementation, reviews, packed-artifact checks, and release results will be
recorded here as completed; the preflight above does not establish release
readiness.

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
