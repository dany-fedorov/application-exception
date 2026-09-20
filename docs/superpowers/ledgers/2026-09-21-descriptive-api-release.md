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
