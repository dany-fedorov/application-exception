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

## CORJ implementation and review

- Implementation `5c219c92b55b84419e9fc2d8299abb94bb17852c` migrates the
  namespace, consumers and TypeDoc. Independent Sol medium review approved the
  branch after two documentation corrections: source links now point to a
  revision containing `Corj`, and a stale live README function reference is
  qualified. Final reviewed head: `c2ba920b3896c806889444b231535d997d67034f`.
- 32 suites, 1,511 tests and 25 snapshots pass with 100% statements, branches,
  functions and lines. Build and six packed consumer targets pass (Node CJS/ESM,
  Bun, encapsulation, TypeScript, Vite/Chromium). GitHub CI run
  [35536727285](https://github.com/dany-fedorov/caught-object-report-json/actions/runs/35536727285)
  also passed the tests and consumer matrix on Node 20 and 24.
- The consumer harness now captures subprocess output through temporary files:
  nested Node 24 pipes in the local environment returned empty output. The
  reviewer reproduced the issue and verified exit status, stdout/stderr and
  cleanup. Removed-import probes require all four utility names to be rejected.
- The coordinator caught and corrected a stale README in an intermediate
  tarball. Final artifact: 80,794 bytes, SHA-256
  `d443b948a5aab862e2818e9713a2f58f1a98db165eecdec8d55e04a5c44b61ec`.
  Its README, manifest, JavaScript and declarations match the final inputs;
  an independent artifact smoke check passed.
- [PR #226](https://github.com/dany-fedorov/caught-object-report-json/pull/226)
  merged as `9d59e4ba9e0d47ad3423a9818132b0a3ae2f6b1e`, with a tree identical
  to the reviewed head. Main and annotated `v13.0.0` were pushed atomically.
  Only Pages ran on this skip-CI merge. npm accepted the exact tarball;
  registry propagation verification follows below.
- Registry verification succeeded: latest is 13.0.0, SHA-512 integrity and
  downloaded bytes match the reviewed tarball. A fresh registry install passed
  namespace, removed-export, extracted-call, report-version and redaction smoke
  checks. [GitHub release and migration notes](https://github.com/dany-fedorov/caught-object-report-json/releases/tag/v13.0.0)
  are published. Application-exception integration now uses the registry build.

## Application-exception implementation

- Implementation `b070107d0606f25e1e6f26968e3ba9c426bb7ca9` re-exports the
  exact upstream `Corj`, removes standalone restoration, and uses the namespace
  for redaction resolution. All own reporting APIs and schemas are unchanged.
- Full `test:all` passes: 16 suites, 340 tests, 100% coverage, type tests, build,
  packed CJS and named Node ESM consumers, Bun 1.4.2, Chromium 153, and 45 docs
  snippets. The dynamically generated API card remains exactly 650 lines.
- Version 0.7.0 uses registry dependency `^13.0.0`; lockfile integrity matches
  the published corj artifact. The downstream artifact's SHA-256 is
  `a3eb32128257362a37dcaf35603d969f0fd01851dbf78c272323489c9e53153f`.
  The coordinator independently matched its README, manifest, JavaScript and
  declarations to the final inputs. A fresh installation of the tarball with
  real registry dependencies passed namespace identity, removed exports,
  extracted calls, report-pair correlation, restoration and redaction checks.
- [PR #53](https://github.com/dany-fedorov/application-exception/pull/53)
  contains the integration. Independent review confirmed the runtime, declarations,
  schemas and cross-library contract; its sole source finding was corrected
  in `5f3ee47fbdf4db201b57c5274f366abcb78dc3a2`: the 0.7 changelog now links
  the upstream migration. The package was repacked because it includes that
  changelog; both tarball copies match, at 63,302 bytes. All 35 packed files
  match staging inputs byte for byte. The reviewer verified the corrected
  artifact. CI [35537320361](https://github.com/dany-fedorov/application-exception/actions/runs/35537320361)
  passed Node 18/20/24, Bun and browser on the implementation commit.
  Final approval/release results are recorded below.

## Final review and downstream release

- Final independent Sol medium review approved both libraries and the complete
  integration. No findings remain open. The only downstream corrections were
  the upstream migration link and repacking its included changelog; runtime
  code did not change after the full test gate.
- Final source/documentation CI
  [35537520146](https://github.com/dany-fedorov/application-exception/actions/runs/35537520146)
  passed all Node 18/20/24, Bun and browser jobs on `5f3ee47`. Subsequent
  pre-merge commits updated only this release record.
- PR #53 merged as `a1795f9db43d79a485b0b05ac714f9bc8a5be6be`, with a tree
  identical to the reviewed feature head. Main and annotated `v0.7.0` were
  pushed atomically; no competing publication workflow ran. npm accepted the
  exact final tarball. The [GitHub release](https://github.com/dany-fedorov/application-exception/releases/tag/v0.7.0)
  contains before/after examples, a migration checklist and upstream links.
- Both original checkouts were fast-forwarded to released main and rebuilt;
  application-exception's installed dependency was updated to registry corj13.
  Registry download verification and final cleanup follow below.
- Final registry verification succeeded: application-exception latest is
  0.7.0, SHA-512 integrity and downloaded bytes match the reviewed artifact.
  A fresh registry installation passed the independent integration smoke.
  Both GitHub releases are published (not draft/prerelease), and both PRs are
  merged. Temporary publication credentials are removed during final cleanup.
- Declaration removal checks distinguish absent exports from private helper
  declarations; TS2305/2459/2724 are accepted only when every removed name is
  rejected. No public compatibility alias was retained.

All implementation, review, release and verification tasks are complete.
