# Typed API and dependable reports

The user authorized fixing every finding in the September 10 review, including
breaking changes, tests, documentation, and a push without further questions.
This design records the choices made under that authorization.

## Decisions

- Ship a breaking `0.2.0` package on a feature branch. Do not push `main`, whose
  workflow publishes to npm. Keep the existing checkout and its review artifacts
  on `fix/reviewed-api-and-reporting`.
- Remove the legacy builder, its dependency graph, old constructor examples, and
  legacy-only tests. A separate legacy package would prolong two APIs; a root
  compatibility facade would keep the performance and learning costs. Historical
  documentation stays explicitly historical. Support one root import with
  explicit exports; remove the `/typed` alias from the package export map.
- Use `defineException({ tag, message, idPrefix? })` in one call. A typed renderer
  infers complete detail input; a constant string message defines a no-details
  error constructible with no arguments or optional cause options. Keep native
  `Error`, `_tag`, occurrence metadata, complete shallow-frozen details, and
  mutually exclusive `cause`/`causes`. Do not add callable constructor aliases.
- Snapshot definition fields. Reject invalid/oversized identifiers: tags at most
  128 characters, ID prefixes at most 32. Bound top-level detail copying to 1,000
  own keys and prototype traversal to 32 levels; reject excess rather than silently
  constructing incomplete details. These are constructor validation limits,
  separate from reporting's lossy diagnostic limits.
- Keep `isTypedException` as a local-instance guard. Use an internal descriptor
  view of branded foreign errors for diagnostics only; preserve their valid tag,
  ID, timestamp, and details without certifying a remote detail schema. Internal
  rendering-failure state records presence independently of a thrown value.
  For known local occurrences, unreadable metadata fields are handled independently:
  a bad tag/details accessor must not discard a still-valid occurrence reference.
- Preserve native lazy stack behavior; constructors must not read `.stack`.
  Diagnostic stacks are omitted by default and enabled with `includeStack: true`.
  Skip user-defined stack accessors. Recognize an engine-native stack getter where
  needed; explicit stack capture may run the runtime's `Error.prepareStackTrace`
  hook. Document that distinction, and test stack-enabled and stack-free paths.

## Reporting contract

`toDiagnosticReport(caught, { context?, includeStack?, limits?, redactKeys? })`
accepts ordinary interface-shaped object context. Reports remain detached plain
JSON. `toPublicReport(reference: string, presentation?)` never inspects diagnostics
or an error object. Raw caught values are normalized once and their returned
reference is explicitly reused. References must be nonempty strings of at most
128 characters. Public defaults remain `INTERNAL_ERROR` / `Something went wrong`.
An explicitly supplied public code must also be a nonempty string of at most 128
UTF-16 code units. Reject invalid codes instead of truncating machine identifiers;
message/details truncation remains explicit diagnostic presentation behavior.

Use new wire versions `appex/diagnostic/v2` and `appex/public/v2`. Decoders reject
older/unknown versions explicitly. Envelope identifiers and names are bounded;
provider `code` and `status` data fields are deliberately allowlisted and bounded.
Map/Set and other unsupported collection/binary values receive an explicit
`unsupported` marker rather than a misleading empty object. No automatic revival,
retry policy, transport policy, or schema engine is introduced.

Normalization defaults: depth 8, values 1,000, entries per container 50, string
length 4,096, serialized UTF-8 bytes 65,536. Configurable upper bounds: depth 32,
values 10,000, entries 1,000, string length 65,536, bytes 1,048,576. Non-byte limits
may be zero; bytes must be between 4,096 and 1,048,576. Keys longer than 4,096
characters are omitted. Count inspected/emitted slots including redactions and
unreadable markers; stop an exhausted container with one truncation marker.
Charge selected keys, strings, markers, and values against an incremental byte
budget before building a large intermediate report. A final exact JSON byte cap
includes the envelope and preserves its occurrence reference. A byte-cap fallback
must explicitly signal omitted diagnostics; it is a safeguard, not the first size
check after serializing an arbitrarily large normalized graph.

Array processing reads length and only selected indexes. Object processing avoids
full descriptor maps and caps descriptor reads; enumeration of all keys can still
cost O(input width), and JavaScript proxy traps cannot have a hard execution-time
guarantee. Do not claim otherwise. Selected redactions happen before value reads.
Date intrinsic methods and function-name data descriptors prevent custom getter,
method, and `toJSON` execution. Ordinary errors' arbitrary custom fields are not
copied automatically.
Before converting bigint values to decimal, compare their magnitude against a
fixed 4,096-digit ceiling. Larger values emit an explicit `truncated` marker with
reason `bigint-magnitude`; do not allocate a full decimal string to truncate it or
compute an exact omitted-digit count. Exhausted value/string budgets skip decimal
conversion. This procedural cap also applies when larger string limits are chosen.

The decoder bounds detachment (64 levels, 100,000 JSON values, 100,000 property
descriptor inspections, 1 MiB UTF-8, keys 4,096 UTF-16 code units) then validates
the detached result. Never validate one proxy
snapshot and return a different snapshot. Every report produced by supported
normalization settings must decode successfully. A plain JSON Schema describes
each wire envelope and diagnostic values; fixture/schema/runtime decoder checks
must agree. Schema validation does not certify domain-specific detail types.

## LLM-facing documentation and package

The README teaches one sequence: define, construct, narrow, report, present.
Document all breaks in the migration guide and changelog. Provide an application
agent example with stable machine fields, explicitly selected small details,
unknown-code handling, operation-owned retry decisions, and no diagnostic prose
treated as instructions. Package the guides and both schemas. Keep Effect optional
and demonstrate its existing structural integration.
The example's selected tool identifier is nonempty and at most 128 UTF-16 code
units. Validate local identifiers and omit invalid external identifiers without
truncating their identity; schema validation alone does not enforce this field
bound. Read the selected field once. Retry attempt budgets must be positive safe
integers before they can authorize a retry.

Build with ES2022/CommonJS for the declared Node 18 minimum. Test built exports,
constant and detail-bearing constructors, native inheritance, stack behavior,
report round trips, public correlation, schemas, and declaration resolution from
an installed tarball. Verify the root no longer loads legacy dependencies.
Use a committed lockfile for reproducible `npm ci` in CI.

## Acceptance

The resolution document maps F1–F12 and the renderer-`undefined` edge to code,
regressions, and limitations. Replace the review's defect-asserting probe with
current-behavior verification or label it historical and provide a replacement.
Run focused red/green regressions, complete runtime/type/build/package checks,
the supported Node matrix where available, and measured import/construction/
reporting comparisons. Commit only intended changes, push the feature branch,
verify its remote commit, and inspect the resulting CI run before completion.
