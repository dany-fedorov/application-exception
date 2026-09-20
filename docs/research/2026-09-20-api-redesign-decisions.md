# Descriptive API redesign: current decisions

Status: design decisions recorded; no implementation changes made.

## User decisions

- Prefer descriptive names, including changes earlier withdrawn over compatibility
  cost or TypeScript precedent.
- Breaking API changes are acceptable.
- Do not provide compatibility aliases or a deprecation transition.

These decisions supersede the compatibility-first recommendations in the
[Fable review](2026-09-20-fable-api-review.md) and the preceding API proposal.
The reviews remain historical evidence, not the current naming specification.

## Concrete naming interpretation

Where the discussion offered competing names, choose the one that makes the
role explicit. The tables below record the assistant's concrete interpretation
of the user's direction, rather than claiming each spelling was individually
selected by the user.

### application-exception

| Current | Target |
| --- | --- |
| `toDiagnosticReport` | `makeDiagnosticReport` |
| `toPublicReport` | `makePublicReport` |
| `toReports` | `makeReportPair` |
| `createRedactionPolicy` | `makeRedactionPolicy` |
| `createTrustRealm` | `makeTrustRealm` |
| `CapturedReports` | `ReportPair` |
| `ToReportsOptions` | `ReportPairOptions` |
| Public policy callback `details` | `detailsSelector` |
| Single-report options' policy key `public` | `policyOverride` |
| `PublicOverride` | `PublicPolicyOverride` |

`makeReportPair` refines the earlier `makeReports` proposal to state exactly what
it produces and match `ReportPair`. Keep `defineException`, instance `details`,
kind-definition `public`, paired options' audience keys `diagnostic` and `public`,
`decodePublicReport`, predicates, and `cause`/`causes`.

### corj

| Current | Target |
| --- | --- |
| `makeCorj` | `makeReport` |
| `makeCorjArray` | `makeReportArray` |
| `CorjMaker.makeReportObject` | `CorjMaker.makeReport` |
| `CorjMaker.makeJson` | `CorjMaker.makeJsonView` |
| `CorjReportChild` | `CorjReportNode` |
| `CorjMaker.with` | `CorjMaker.withOptions` |
| `onError` | `onReportingError` |
| Handler parameter `caught` | `reportingFailure` |
| Callback context `key` | `reportKey` |
| Callback context `prop` | `sourceProperty` |
| Token-source entry `field` | `sourceProperty` |

`sourceProperty` uses one explicit term for both a source-entry property name
and that property's name in callback context. It replaces the earlier competing
`prop` and `property` proposals. `reportingFailure` is the unsanitized value
thrown during reporting; it need not be an `Error` or the original application
failure. Re-export `CorjReportNode` from application-exception.

Do not keep old entry points, option names, or the third positional corj call
argument. Use one free-function options bag containing configuration and
per-call inputs. Maker methods still take only per-call inputs.

## Behavioral changes retained

- Add `maxReportBytes` to each application-exception report's options; enforce
  UTF-8 bytes of the complete compact JSON report. Remove nested
  `corj.maxReportSize` and `corj.reportSizeUnit`; retain the diagnostic context
  sub-budget. corj itself retains its configurable-unit size options.
- Narrow public corj options to effective settings and reject unsupported keys.
  Verify the exact set against all inspection, serialization, and fingerprint
  paths during implementation planning.
- Stop freezing caller-owned configuration. Remove caller-bag identity caching
  so subsequent calls observe both top-level and nested changes. Reuse default
  configuration safely; do not add an explicit reporter factory without a
  demonstrated need.
- Reject unknown kind-policy keys, including obsolete names after the rename.
- Preserve per-field policy overrides: omitted fields inherit, and
  `detailsSelector: null` suppresses selected details in a per-call override.
- Improve declaration summaries and callback documentation, including raw versus
  scrubbed arguments and copy versus mutation semantics.

## Working defaults for previously open behavior

These follow the earlier recommendations; they were not individually selected
by the user:

- The new public whole-report limit is opt-in initially. Omitting it retains
  the existing component limits, measured in their documented units. The
  diagnostic report retains its existing default total budget.
- Use 2,048 bytes as the proposed public budget minimum, subject to verification
  against worst-case serialization of required fields. This does not change the
  diagnostic minimum of 512 bytes.
- On public overflow, omit selected `as_json` whole before shortening `message`.
  Mark the report `truncated: true`; preserve `code`, `occurrence_id`,
  `fingerprint` when present, and `v`.

## Protocol and release handling

Breaking API authorization removes the need for migration aliases, but changes
to serialized representations must still identify their formats correctly.

- Rename reporting-error row fields together with callback fields and advance
  the corj schema/version. Propagate that report version into application-exception.
- Keep fingerprint canonical source labels unchanged when only the input name
  changes. If fingerprint semantics or canonical encoding change, advance the
  fingerprint prefix/version instead of silently changing `fp1_` meaning.
- Normalize `detailsSelector` to the existing internal trust-realm `details`
  field where feasible. This is an internal representation, not a public API
  alias. If the cross-copy representation changes, advance the realm protocol
  and reject incompatible realms explicitly.
- Do not rename unrelated JSON fields or remove old public-report decoder
  support solely because API aliases are disallowed. Neither is a consequence
  of renaming TypeScript APIs.
- Update both packages' source, declarations, tests, schemas where affected,
  JSDoc, generated API card, recipes, AGENTS instructions, and release notes.
  Ship explicitly breaking package releases; exact release numbers remain a
  release-management choice.

## Representative target calls

These calls illustrate the proposed API and do not compile against the current
implementation.

```text
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The tool is unavailable.',
    detailsSelector: ({ tool }) => ({ tool }),
  },
});

const pair = makeReportPair(caught, {
  diagnostic: { context: { runId }, maxReportBytes: 32_768 },
  public: {
    maxReportBytes: 2_048,
    policyOverride: { detailsSelector: null },
  },
});

makeReport(caught, { context: { runId }, maxDepth: 3 });
const maker = new CorjMaker({
  occurrenceIdSources: [{ sourceProperty: 'requestId' }, { auto: 'random' }],
  onReportingError: (reportingFailure, record) => {
    trustedSink.capture(reportingFailure, record);
  },
});
maker.withOptions({ maxDepth: 1 }).makeReport(caught, { context: { runId } });
```
