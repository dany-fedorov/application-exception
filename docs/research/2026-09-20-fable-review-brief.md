# Independent API design review brief for Fable

Status: reviewed by `claude-fable-5-1` through Claude CLI with high effort.
See the [completed review and follow-up verification](2026-09-20-fable-api-review.md).

## Request

Independently review application-exception and caught-object-report-json (corj)
against the official [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/).
Adapt applicable principles to TypeScript rather than assuming a Swift port.

You have explicit latitude to make suggestions at the same depth as the initial
review: propose alternative names, signatures, option structures, behaviors,
and migration strategies. Challenge or reject the proposal below where useful.
Do not limit yourself to approving it or finding implementation bugs. Do not
implement changes.

## Evidence and scope

- application-exception 0.5.0 at `53d57fce5f2ad8a7228ddfa7b893f59d2ac3fbd8`.
- Installed corj 11.0.1; sibling source was clean at
  `78afaceb152978e6f0f73caee8fc9ffc4de5b79b`.
- Inspect `src/index.ts`, `src/typed.ts`, `src/report-types.ts`,
  `src/reporting.ts`, `src/corj-maker.ts`, `src/redaction.ts`, and
  `docs/agent/api-card.md`.
- Inspect corj's installed declarations, implementation, and README in
  `node_modules/caught-object-report-json`; use sibling source if available.
- Read repository `AGENTS.md` instructions.
- Prior evidence: [application-exception review](2026-09-20-swift-api-review.md)
  and [corj review](2026-09-20-corj-swift-api-review.md).

## Proposal to evaluate

All names below are proposals, not existing supported APIs.

### application-exception

| Current | Proposed |
| --- | --- |
| `toDiagnosticReport` | `makeDiagnosticReport` |
| `toPublicReport` | `makePublicReport` |
| `toReports` | `makeReports` |
| `createRedactionPolicy` | `makeRedactionPolicy` |
| `createTrustRealm` | `makeTrustRealm` |
| `ToReportsOptions` | `ReportsOptions` |
| `CapturedReports` | `Reports` |
| Public policy's `details` callback | `detailsSelector` |
| Reporting option `public` | `policyOverride` |
| `PublicOverride` | `PublicPolicyOverride` |

Keep `defineException`, instance `details`, kind definition `public`, and paired
report options' outer `public`. Keep override inheritance and use
`detailsSelector: null` to suppress disclosure.

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

const reports = makeReports(caught, {
  diagnostic: { context: { runId }, maxReportBytes: 32_768 },
  public: {
    maxReportBytes: 2_048,
    policyOverride: {
      message: 'Search is temporarily unavailable.',
      detailsSelector: null,
    },
  },
});
```

`maxReportBytes` would bound each complete compact-JSON report in UTF-8 bytes.
Remove competing size options from nested `corj`; narrow the public corj bag to
options it actually uses. Preserve required protocol fields and reject limits
below the supported minimum. Reporting would copy configuration instead of
freezing caller-owned options; cache semantics must not silently retain stale
settings.

### corj

| Current | Proposed |
| --- | --- |
| `makeCorj` / `maker.makeReportObject` | `makeReport` / `maker.makeReport` |
| `makeCorjArray` | `makeReportArray` |
| `maker.makeJson` | `maker.makeJsonView` |
| `CorjReportChild` | `CorjReportNode` |
| `maker.with` | `maker.withOptions` |
| `onError` | `onReportingError` |
| Handler parameter `caught` | `rawError` |
| Callback context `key` | `reportKey` |
| Callback context `prop` | `sourceProperty` |
| Token source `{ field: 'requestId' }` | `{ property: 'requestId' }` |

Combine configuration and per-call inputs in one free-function options bag:

```text
makeReport(caught, { context: { runId }, maxDepth: 3 });

const maker = new CorjMaker({ maxDepth: 3 });
maker.makeReport(caught, { context: { runId } });
```

The maker still stores reusable configuration and accepts per-call inputs on
its reporting methods. Document `onReportingError`'s raw first argument and
scrubbed second argument directly in editor-visible declarations.

Preserve `decodePublicReport`, `is…` predicates, `cause`/`causes`, and wire field
names. Introduce simple rename aliases where feasible; reserve option-shape and
semantic changes for an explicitly breaking release.

## Requested review output

1. An independent assessment of both current APIs and this proposal.
2. Prioritized findings with exact code references and relevant guideline links.
3. A keep/change/reject decision for proposed changes, with concise reasons.
4. Your own suggestions, including improvements the initial review missed.
5. A coherent preferred API shown at realistic call sites for both packages.
6. Compatibility costs, semantic risks, and a practical migration sequence.

Distinguish literal Swift naming preferences from improvements that benefit
TypeScript callers. In particular, examine whether factory renames justify
their cost, whether `detailsSelector` improves clarity, and whether proposed
size controls and configuration ownership preserve the libraries' contracts.
Verify assertions against source; label untested behavior and unresolved
design choices explicitly.
