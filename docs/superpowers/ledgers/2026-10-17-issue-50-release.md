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
4. Publish the GitHub release after registry verification and record final
   commit, tag, CI, artifact, and publication evidence here.

No credentials or authentication secrets belong in this ledger. At preparation
time npm login is pending with the coordinator; no publication or merge success
is claimed yet.

## Versioned release verification

- The 0.8.0 manifest and lockfile change only their root package versions; dependency resolutions are unchanged.
- Fresh `npm run test:all` against 0.8.0 passed: 18 suites / 405 tests, 100% statements/branches/functions/lines, type tests, build, package smoke, Node ESM, Bun, browser, and documentation checks (45 snippets).
- npm browser sign-in succeeded using isolated temporary configuration; credentials are never included in source or release artifacts.
