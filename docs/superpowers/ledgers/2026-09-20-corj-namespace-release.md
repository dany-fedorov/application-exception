# Corj namespace release record

The user approved a named `Corj` object and removal of function exports, with
both libraries updated. Prior authorization for Sol medium agents, autonomous
documented assumptions, pushes, merges and publication remains applicable.

## Decisions

- All four CORJ utilities move under the frozen object: `makeReport`,
  `makeReportArray`, `restoreExpectedValues`, `resolveRedactPolicy`. The resolver
  loses its redundant CORJ prefix. This requires import migrations for all
  utility consumers; there are no standalone compatibility aliases.
- `CorjMaker`, named constants and types remain available. Object methods are
  readonly, callable when extracted, and preserve existing contracts.
- Application-exception re-exports the exact upstream `Corj` object in place
  of standalone restoration. Its own typed-failure APIs keep their names.
- Release versions are corj 13.0.0 and application-exception 0.7.0. The latter
  depends on registry `^13.0.0`. No report/schema change accompanies the export
  change: corj v0.15/full, diagnostic schema v6, and public v4/v3 decoding stay.
- Private module exports are implementation structure, not public aliases.
  Published declarations must reject old imports even if an unexported helper
  declaration appears in their implementation of the object's type.
- Implementation and review use Sol medium in isolated worktrees. Existing
  coverage and consumer gates stay intact. Both release notes include concrete
  migration examples and checklists.
- Feature CI and independent review precede a main-based `[skip ci]` merge and
  annotated tag pushed atomically. Manual publication uses the exact verified
  tarball and does not claim GitHub Actions provenance. Publish the dependency
  first, then verify the downstream package against the registry release.

## Starting evidence

- corj base: `db067389d76ae52545de342b58687978b2e18cb8`; clean baseline:
  32 suites, 1,509 tests, 25 snapshots.
- application-exception base: `cdfa7e884f1f0465113219abe1c41ff2f10abd18`;
  clean baseline: 16 suites, 339 tests.
- Both remote main refs matched these bases during preflight. GitHub permissions
  and npm authentication were verified without exposing credential contents.
- Registry latest versions were 12.0.0 and 0.6.0; planned target versions were
  available. Credential storage is temporary and private, outside the repos.

Implementation, review, release and final verification evidence follows when
those steps are complete.
