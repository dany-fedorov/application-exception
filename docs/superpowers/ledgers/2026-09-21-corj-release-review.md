# Task 1 review: corj breaking API and schema

## Verdict

Approved. I found no blocking or non-blocking correctness findings in commit
`b8f4d2efd9ef5872e6b80eec1e4bf93e69236a91` against base `78aface`.

## Findings

None.

## Review evidence

- The exported/runtime surface uses the specified names: free
  `makeReport`/`makeReportArray`, maker `makeReport`/`makeJsonView`/`withOptions`,
  `CorjReportNode`, `onReportingError`, `reportKey`, `sourceProperty`, and the
  merged `CorjReportInput`. The removed names are absent from live source,
  consumer fixtures, declarations, and generated API pages. Historical upgrade
  prose and historical schemas retain their period-appropriate names.
- Free functions accept exactly two positional arguments and reject a third at
  runtime (`src/index.ts:2263-2283`). The splitter rejects arrays, non-objects,
  and unknown keys, partitions each recognized own property with one value
  read, and passes call-only bags through the cached default maker
  (`src/index.ts:2220-2260`). A package-level probe with stateful `maxDepth` and
  `context` getters observed one read each and the first values controlled the
  resulting report.
- Maker methods continue to accept only `CorjCallInput`; call input validation
  remains separate from maker configuration (`src/index.ts:602-633`,
  `src/index.ts:2103-2119`). Caller arrays that form resolved options are copied
  and frozen by the existing resolution path.
- Reporting failures use the same renamed record shape in the stored row and
  callback copy. Redaction failure routing, property access, serializer
  bridges, fingerprint reads, and `scrubText` all propagate `reportKey` and
  `sourceProperty` consistently (`src/index.ts:707-766`,
  `src/index.ts:901-941`, `src/index.ts:1390-1437`,
  `src/index.ts:1680-1777`, `src/index.ts:2074-2083`; `src/redaction.ts:34-46`).
  The callback still receives the raw failure as its first argument while the
  stored/copied record is scrubbed and bounded.
- `{ sourceProperty }` is the only accepted property-source spelling. The
  fingerprint recipe deliberately retains the canonical `field:` label, and
  the pinned value remains `fp1_0aebaa5066f3e0de64d37b94135b3287`
  (`src/tokens.ts:56-102`, `src/fingerprint.ts:46-74`).
- `corj/v0.15` and `corj/v0.15-full` are exact derivatives of their v0.14
  counterparts apart from version URLs/values, the reporting handler name, and
  `key`/`prop` becoming `reportKey`/`sourceProperty`. The v0.14 directories have
  no diff from the base. Both new schemas make reporting rows closed objects
  and retain the compact/full field requirements.
- Whole-report limiting still drops context first and reporting errors second,
  leaving the corresponding omission flags before trimming error content
  (`src/report-size.ts:179-199`). A focused package probe produced a renamed,
  redacted reporting-error path under a 512-byte budget and measured 375 UTF-8
  bytes. Existing matrix/schema coverage recorded in the implementation report
  exercises compact/full object and array reports, omission flags, and the
  minimum budget.
- Package and lockfile root versions are `12.0.0`; version constants and schema
  links use `corj/v0.15` and `corj/v0.15-full`. The reported tarball exists and
  exposes the renamed declarations without legacy aliases.

## Verification assessment

I did not repeat the unchanged full test, build, consumer, documentation, and
packaging gates, per the review instruction. The implementation report records
1,509 passing tests with all four coverage dimensions at 100%, plus successful
build, consumer, prepublish, pack, and diff checks. I independently inspected
the source/full diffs, compared old/new schemas, checked the packaged
declarations, ran `git diff --check`, and ran the focused stateful-getter,
redaction-row, and 512-byte-budget probe described above. The four documented
TypeDoc warnings remain non-fatal and do not indicate a missing public export.
