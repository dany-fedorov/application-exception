# API review against Swift's design guidelines

Reviewed 2026-09-20: application-exception 0.5.0, checkout
`53d57fce5f2ad8a7228ddfa7b893f59d2ac3fbd8`, and installed corj 11.0.1.
This is a design review, not a proposed Swift port or a security audit.
No implementation changes were made.

The standard is the official [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/).
The applicable criteria are call-site clarity, distinct names for distinct roles,
names consistent with effects, useful defaults, and documented declarations.
Swift spelling and argument-label conventions need adaptation for TypeScript.
Recommendations below are reviewer judgments based on the cited implementation.

## Findings in application-exception

### 1. High: public report options accept a whole-report limit they do not enforce

`PublicReportOptions.corj` accepts `AppexCorjOptions`, which exposes every corj
option except `redact`. Consequently this is accepted:

```ts
toPublicReport(caught, { corj: { maxReportSize: 512 } });
```

The public serializer instead uses fixed limits of 16,384 bytes for selected
details and 4,096 string code units for its message. It does not apply the
maker's whole-report limiter. A runtime probe with a 1,000-character message
and 2,000-character selected string returned 3,123 UTF-8 bytes with the above
512 setting. The name and shared option type imply more uniform behavior
between the two report APIs than callers receive.

Either expose only the corj options that public reporting uses, with a separate
public size contract, or implement a public whole-report limit. Document
fingerprint inspection separately from selected-details serialization. This is
an API-contract problem; it does not demonstrate accidental secret disclosure.

Evidence: [public options](../../src/report-types.ts#L83),
[pass-through type](../../src/corj-maker.ts#L6),
[fixed limits](../../src/reporting.ts#L26),
[public serialization](../../src/reporting.ts#L369).

### 2. Medium: conversion freezes caller-owned configuration

The first reporting call freezes the supplied `corj` object. The public API
summaries do not explain this ownership transfer, and the option properties
remain assignable in TypeScript. Updating a previously reused configuration
can therefore throw in strict mode after a seemingly ordinary conversion.

A runtime probe confirmed `Object.isFrozen(corj)` changes from `false` to
`true`, and `Reflect.set` subsequently returns `false`. This is intentional
behavior covered by an existing test, but it remains surprising API behavior.

Prefer copying caller configuration into an explicitly constructed reusable
reporter, or otherwise avoid freezing the caller's object. Merely removing the
freeze is insufficient: the identity cache would then silently reuse stale
options. At minimum, document the freeze prominently at the public boundary.

Evidence: [cache and freeze](../../src/corj-maker.ts#L38),
[existing ownership test](../../tests/CorjMaker.test.ts#L15),
[conversion documentation](../../src/reporting.ts#L237).

### 3. Medium: `public` has two different roles in one call

```ts
toReports(caught, {
  public: { public: { message: 'Search is down.' } },
});
```

The outer property selects an audience's report options; the inner property
overrides disclosure policy. Both are locally plausible names, but together
they obscure the distinction. Preserve `public` for the audience and consider
`policyOverride` for the per-call policy. `PublicPolicyOverride` would also be
more precise than the exported `PublicOverride` type.

Proposed spelling, not a currently supported API:

```text
toReports(caught, {
  public: { policyOverride: { message: 'Search is down.' } },
});
```

Evidence: [option types](../../src/report-types.ts#L71),
[real call site](../../tests/PairedReports.test.ts#L96).

### 4. Low: `details` names both stored data and a selection operation

`new Kind({ details: data })` stores details, while a public policy's
`details: callback` selects what may be disclosed. A per-call override also
uses `details: null` to disable selection. These related but different roles
take explanation to distinguish.

Consider `selectDetails` for the policy callback, retaining `details` for the
error's data. This is a smaller improvement than findings 1–3; TypeScript's
callback checking already catches many mistakes. Keep the current null/omitted
distinction explicit in documentation regardless of spelling.

Evidence: [policy and constructor inputs](../../src/typed.ts#L50),
[override semantics](../../src/report-types.ts#L71).

## What already works

- `toDiagnosticReport`, `toPublicReport`, and `toReports` form a recognizable
  family, with audience-specific result types and inexpensive common call sites.
- `defineException` distinguishes defining a kind from constructing an occurrence
  with `new Kind(...)`.
- `cause` and `causes` communicate singular versus plural input and exclude each
  other in the type system.
- `isTypedException` and `isTrustedException` are readable predicates. Keeping
  the former unary also supports direct use as an array callback.
- Options objects label secondary arguments; defaults keep ordinary calls short.
- Runtime exports have summaries and concrete examples in the generated API card.

Evidence: [exports](../../src/index.ts), [definitions](../../src/typed.ts#L14),
[predicate documentation](../../src/typed.ts#L474),
[API card](../agent/api-card.md).

## Literal Swift differences that should not drive a TypeScript redesign

Swift's factory convention favors `make…`; `createRedactionPolicy` and
`createTrustRealm` could become `makeRedactionPolicy` and `makeTrustRealm` under
strict adoption. That alone is a weak reason for breaking established calls.
Likewise, `decodePublicReport` is familiar codec terminology in TypeScript.

Swift casing would use `occurrenceID` and `makeJSON`. Existing `occurrenceId`,
corj's `makeJson`, uppercase exported constants, and snake_case JSON fields are
ecosystem or wire-format choices. Preserve report schema compatibility; do not
rename wire keys solely for Swift appearance. The `_tag` spelling supports the
package's existing tagged-error integration.

Free reporting functions are reasonable here: inputs include arbitrary thrown
values and primitives, so there is no universally appropriate receiver.

## Verification and corj companion review

Inspected the public exports, signatures, generated API card, implementation,
and relevant tests. Executed focused runtime probes through
`node --import tsx` for findings 1 and 2. The full test suite was not run for
this review; no runtime code changed.

`npm run docs:check` passed, including 44 type-checked snippets. Independent corj
smoke checks confirmed the third-argument context, array-root level zero,
`makeJson` envelope, and `restoreExpectedValues` returning a different object.

The [corj companion review](2026-09-20-corj-swift-api-review.md) covers corj's
own public surface and records its exact installed version.
