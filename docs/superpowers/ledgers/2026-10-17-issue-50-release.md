# Issue 50 hardening release record

The user authorized merge, push, and release after implementation and independent
review. The target is application-exception 0.8.0, a pre-1.0 minor release because
decoder input acceptance and automatic foreign occurrence-ID adoption tighten.
Exported signatures, report versions, historical schemas, dependency resolutions,
and producer limits remain unchanged.

## Starting evidence

- Baseline: `5ce894d`; implementation branch: `fix/issue-50-hardening`.
- Implementation used gpt-6.1-sol at medium reasoning effort; independent review
  used gpt-6-astra at high reasoning effort.
- Before release metadata changes, `npm run test:all` passed: 18 suites, 405
  tests, 100% statements/branches/functions/lines, type tests, build,
  packed-package smoke, Node ESM 24.20.0, Bun 1.4.2, Chromium 153, and docs
  checks covering 45 snippets. The API card remained within its 650-line budget.
- Independent Astra review passed 4,000 additional byte-accounting, detachment,
  and path probes and approved the integrated change with no outstanding
  findings. The metadata-array error documentation was corrected during review.

These results describe the reviewed implementation before the release version
bump. Release artifact and CI evidence will be recorded after those steps run.

## Authorized release flow

1. Commit and push the prepared feature branch and verify its CI, including the
   complete release artifact checks. Preserve the exact tested tarball for
   publication.
2. Merge from current main with a `[skip ci]` merge commit and create the release
   tag. Push main and the tag atomically. This avoids invoking the broken
   competing main publication workflow; feature-branch CI supplies the checks.
3. Manually publish the exact tested 0.8.0 tarball after npm authentication is
   ready. Verify registry version, integrity, and downloaded artifact bytes.
4. Publish the GitHub release after npm accepts the artifact and record final
   commit, tag, CI, artifact, and publication evidence here.

No credentials or authentication secrets belong in this ledger. At preparation
time npm login is pending with the coordinator; no publication or merge success
is claimed yet.

## Versioned release verification

- The 0.8.0 manifest and lockfile change only their root package versions; dependency resolutions are unchanged.
- Fresh `npm run test:all` against 0.8.0 passed: 18 suites / 405 tests, 100% statements/branches/functions/lines, type tests, build, package smoke, Node ESM, Bun, browser, and documentation checks (45 snippets).
- npm browser sign-in succeeded using isolated temporary configuration; credentials are never included in source or release artifacts.

## Merge and artifact evidence

- Astra high approved the 0.8.0 release metadata with no findings.
- Implementation commit: `74fe8073ba63d5893e86de944b29e6bef3175583`.
- [Feature CI run 39031928228](https://github.com/dany-fedorov/application-exception/actions/runs/39031928228) passed all Node 18/20/24, Bun, and browser jobs.
- [PR #59](https://github.com/dany-fedorov/application-exception/pull/59) merged as `87a5ec1b1fec9c4940260c30712b14ef2e8f5c12`. Its tree exactly matches the tested feature commit. Main and annotated tag `v0.8.0` were pushed atomically; remote refs and merged PR state were verified.
- Final artifact: `application-exception-0.8.0.tgz`, 67,024 bytes, 35 files. Every file matches its staging input. SHA-256: `5a646e84f57a52014952dcf218a0d8e2df338ff16da25faa90856f149ffa27f3`.
- SHA-512 integrity: `sha512-8cHrFC9tf47d39GuHb3J2FpGHlY6SR0oDMOf0/mkFheLjoZRLN2N65wpnDmoFNKEXxOnn5r8+6zV4JtaDlro4A==`.
- A fresh install of that tarball passed independent regression smoke checks for array detachment, Unicode decoding, exact byte bounds, quoted paths, foreign-ID replacement/correlation, policy snapshots, metadata rejection, and unchanged report versions.

## Publication

- The first npm publishing authentication expired before approval. A retry used the same verified tarball and a fresh browser authentication; npm accepted `application-exception@0.8.0` with exit status 0 and reported that registry processing could take a few minutes.
- The [GitHub release](https://github.com/dany-fedorov/application-exception/releases/tag/v0.8.0) is published, not draft or prerelease, at 2026-10-17T12:41:25Z. Registry availability, latest-tag, and downloaded-artifact verification follow acceptance.

## Final verification

- npm registry metadata confirms version 0.8.0 and `latest: 0.8.0`. Downloaded registry bytes and SHA-512 integrity exactly match the tested artifact recorded above.
- A fresh registry install of `application-exception@0.8.0` passed the independent regression smoke checks; this verification used the published package, not the local staging directory.
- GitHub confirms PR #59 is merged and release v0.8.0 is public, neither draft nor prerelease.
- Temporary npm credential configuration and generated publication staging were removed. This documentation-only completion record does not change the released source, package files, or tag.

Merge, push, npm publication, GitHub release, and artifact verification are complete.
