# corj reports and agent-facing docs

Decisions from 2026-09-14 for `application-exception` 0.3.0. Four goals:
the diagnostic report is a `caught-object-report-json` (corj) report; the
public report is a corj-shaped disclosure without sensitive content; the
documentation meets a coding agent inside its normal loop; automated tests
cover 100% of `src`.

The organizing rule is borrowed from di-bag's agent-friendly loop spec: an agent
must meet the guidance in the file tree, in `node_modules`, in a type, or in a
thrown error, without knowing that a document exists. Every decision below is
framed by what it changes for an agent that uses the library.

## Decisions

### D1. The diagnostic report is a corj report

`toDiagnosticReport(caught, options?)` returns the object produced by
`new CorjMaker(options).makeReportObject(caught)` with three extension fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `reference` | `string` | The occurrence reference, see D3. Always present. |
| `context` | JSON value or `null` | Host facts passed in `options.context`, normalized by corj's serializer with a 16,384-byte budget. Present when the option was given. |
| `reporting_errors` | array | Up to 8 problems corj met while inspecting the caught value (`{ stage, path, key?, prop?, error }`). Present when non-empty. |

`v` is corj's version (`corj/v0.12`). Nothing else changes: expected-value
omission, `children`, `stack` as lines, `as_json` from enumerable properties,
and the size limiter behave as documented by corj. corj's `onError` is routed
into `reporting_errors` instead of `console.warn`.

Agent benefit: one report format for every failure the agent sees in logs,
whether it came from this library, an SDK, or a plain `throw`. corj's README
and JSON Schema explain the fields; this library only adds three. An agent
that already reads corj reports reads these.

Accepted trade-off: corj calls user code (`toString`, `toJSON`, getters,
`instanceof` hooks) and does not bound CPU time. The hardened v2 normalizer,
its `$appex` markers, `redactKeys`, and the `limits` budgets are removed.
Diagnostics remain for trusted sinks only; redaction is not offered because
key-based redaction never covered messages and stacks anyway.

Typed exceptions no longer own an enumerable `name` property; `name` is defined
on the prototype, so `as_json` shows `_tag`, `id`, `timestamp`, and `details`
once and nothing twice.

### D2. The public report is a corj-shaped selected disclosure

A public report cannot be derived from a corj report by removing fields:
`message`, `as_string`, `stack`, and `as_json` are all free text from the
error. The public report therefore keeps corj's field names and value types
for the fields it has and takes its content from an explicit selection:

```json
{
  "v": "appex/public/v3",
  "reference": "AE_01J8Z3C4V5X6Y7Z8A9B0C1D2E3",
  "code": "TOOL_UNAVAILABLE",
  "message": "The tool is temporarily unavailable.",
  "as_json": { "tool": "search" }
}
```

`message` and `as_json` mean what they mean in corj (display text, JSON
content); `truncated: true` appears when `message` or `as_json` was cut.
`code` is the application protocol an agent branches on; `reference`
correlates with the diagnostic report. Nothing else from corj appears.

The selection lives on the error kind. `defineException` accepts a `public`
policy:

```ts
const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The tool is temporarily unavailable.',
    details: ({ tool }) => ({ tool }),
  },
});
```

`toPublicReport(caught, options?)` uses the policy of a local typed occurrence
and falls back to `INTERNAL_ERROR` / `Something went wrong` for every other
value, including typed occurrences without a policy and occurrences from
another copy of the package. `options.code`, `options.message`, and
`options.details` override the policy per call. A policy `message` function
that throws or returns a non-string falls back to the generic message; a
`details` function that throws yields no `as_json`. `toPublicReport` never
throws for a valid options object.

Agent benefit: disclosure is decided once, next to the kind, where the
details type is known. The catch site becomes two calls on the same value.
An unknown failure discloses nothing by default, so forgetting a policy is
safe. The consuming agent gets the same two field names (`message`,
`as_json`) it already reads in diagnostics.

### D3. One reference per occurrence

The reference is, in order: `options.reference` when given; the `id` of a
typed occurrence (local, or from another package copy that carries the
brand); the reference memoized for this object by an earlier report call in
this process; otherwise a new `AE_` id, memoized when the caught value is an
object or function. Thrown primitives get a fresh reference on each call
unless `options.reference` is passed.

Agent benefit: `toDiagnosticReport(caught)` and `toPublicReport(caught)` agree
on `reference` without threading a value between them, in either order. The
old signature `toPublicReport(reference, presentation)` is removed; passing a
string now reports that string as a thrown value with a new reference.

### D4. Options are corj's, plus `context` and `reference`

`DiagnosticReportOptions` = `{ reference?, context?, maxReportSize?, maxDepth?,
maxChildren?, stackFormat? }`. The four corj options pass through with corj's
defaults, validation, and error messages. Unknown option keys throw
`APPEX_INVALID_OPTIONS` listing the known keys.

`PublicReportOptions` = `{ reference?, code?, message?, details? }`.

Agent benefit: option names an agent learned from corj keep their meaning;
a typo fails at the call with the list of valid names.

### D5. Library errors carry a code and a URL

Every `TypeError` thrown by this library has message
`<CODE>: <text>; see https://github.com/dany-fedorov/application-exception/blob/main/docs/agent/errors.md#<code-lowercased>` (GitHub heading anchors keep underscores, so `APPEX_INVALID_TAG` links to `#appex_invalid_tag`)
and an enumerable `code` property. Codes:

| Code | Thrown by | When |
| --- | --- | --- |
| `APPEX_INVALID_TAG` | `defineException` | tag is not a nonempty string of at most 128 UTF-16 units |
| `APPEX_INVALID_MESSAGE` | `defineException` | message is neither a string nor a function |
| `APPEX_INVALID_ID_PREFIX` | `defineException` | idPrefix is present and not a nonempty string of at most 32 units |
| `APPEX_INVALID_PUBLIC_POLICY` | `defineException` | `public` is not an object, its `code` is not a nonempty string of at most 128 units, its `message` is not a string or function, or its `details` is not a function |
| `APPEX_INVALID_DETAILS` | constructor | details is not a data-only record (array, function, accessor, method, inherited data, more than 1,000 keys, more than 32 prototype levels, or uninspectable) |
| `APPEX_INVALID_CAUSES` | constructor | both `cause` and `causes` given, or `causes` is not an array |
| `APPEX_INVALID_OPTIONS` | report functions | options is not a plain object or has an unknown key |
| `APPEX_INVALID_REFERENCE` | report functions | `options.reference` is not a nonempty string of at most 128 units |
| `APPEX_INVALID_PUBLIC_CODE` | `toPublicReport` | `options.code` is not a nonempty string of at most 128 units |
| `APPEX_INVALID_PUBLIC_MESSAGE` | `toPublicReport` | `options.message` is not a string |

corj's own option errors (`TypeError`, `RangeError`) propagate unchanged.

Agent benefit: a stack trace names the section that explains the fix. The
docs check asserts the set of codes in `src` equals the set of sections.

### D6. Message rendering never throws and never hides

When a message renderer throws or returns a non-string, the occurrence's
message becomes `<tag> [message rendering failed: <String(failure), at most
256 units>]`. The hidden rendering-failure record and the
`messageRenderingError` report field are removed.

Agent benefit: the failure is visible in `message`, `stack[0]`, and every
corj report without a special field.

### D7. Decode public reports; validate diagnostics with the schema

`decodePublicReport(value)` returns `{ ok: true, report }` with a detached copy
or `{ ok: false, reason, path }`. It checks the closed public shape: exactly
the fields `v`, `reference`, `code`, `message`, `as_json`, `truncated`; the
version; string lengths (reference and code 1–128, message at most 4,096);
`truncated` only `true`; `as_json` a JSON value of depth at most 32 and at most
10,000 values.

`decodeDiagnosticReport` is removed. Diagnostic reports are validated with the
shipped JSON Schema when needed.

Two schemas ship: `schemas/diagnostic-report-v3.json` embeds corj v0.12's
report-object definitions under `$defs` and adds the extension fields;
`schemas/public-report-v3.json` is closed. A test asserts the embedded corj
version equals `CORJ_VERSION` from the installed package, so a corj upgrade
that changes the format fails the build until the schema is refreshed.

Agent benefit: the recovery loop validates a public report with one call and
no schema library. The reasons are strings an agent can log or escalate on.

### D8. Documentation meets the agent in its loop

Shipped in the package: `README.md`, `CHANGELOG.md`, `LICENSE`, `AGENTS.md`,
`docs/agent/api-card.md`, `docs/agent/recipes.md`, `docs/agent/errors.md`,
`schemas/*.json`, and the build.

| Fact | Home | Everywhere else |
| --- | --- | --- |
| A rule the agent must follow | `AGENTS.md` (at most 150 lines) | JSDoc of the API it concerns states it in one sentence |
| What a public export does and one example | its JSDoc in `src/` | `docs/agent/api-card.md` is generated from it (at most 400 lines) |
| One way per task | the task table in the api card generator | `AGENTS.md` links to the card |
| A library error, its cause, and its fix | `docs/agent/errors.md`, one section per code | error messages carry the section URL |
| How to do one recipe task | `docs/agent/recipes.md` | `AGENTS.md` links by anchor |
| Report field meanings | corj's README and schema for corj fields; `README.md` for the extension and public fields | the schemas repeat them as descriptions |
| Vocabulary | `CONTEXT.md` | nothing restates it |

Recipes: define a kind with a public policy; handle a failure at a tool
boundary; translate a lower-level failure; add context; recover from a public
report; test a failure path.

Drift control in `npm run docs:check`: the api card is regenerated and
compared; every ```ts block in `README.md`, `AGENTS.md`, `docs/agent/*.md`,
and every `@example` in `src/` type-checks against `src` in one program (a
first line `// expect-error: <fragment>` requires a diagnostic containing the
fragment); size budgets; error-code section coverage; relative links resolve.
`test-ci` runs `docs:check`.

Removed: `docs/api.md`, `docs/agent-recovery.md`, `docs/reviews/`, the
`review:probe` and `benchmark` scripts.

Agent benefit: reading `node_modules/application-exception/AGENTS.md` is
enough to use the library correctly; the card shows exact signatures that
cannot drift from the code; every snippet an agent copies has compiled.

### D9. Coverage is a gate

`jest.config.js` sets `coverageThreshold` to 100% for branches, functions,
lines, and statements over `src/**/*.ts`. `test-ci` runs with `--coverage`.

Agent benefit: an agent editing the library learns from the failing threshold
which branch it left untested, before review.

### D10. Version and compatibility

Version 0.3.0. Breaking: report formats (`corj/v0.12` diagnostic,
`appex/public/v3` public), `toPublicReport` signature, `decodeDiagnosticReport`
removed, `redactKeys`/`limits`/`includeStack` removed (stacks are always
included, as in corj), `messageRenderingError` removed, error messages
changed. Runtime dependencies: `caught-object-report-json ^9.0.1`, `nanoid`.
Node 18 or newer.

## API

```ts
defineException(definition): TypedExceptionClass
  definition: { tag, message, idPrefix?, public? }
  public?: { code: string; message?: string | ((details) => string); details?: (details) => unknown }

isTypedException(value): value is TypedException

toDiagnosticReport(caught, options?): DiagnosticReport
  options?: { reference?, context?, maxReportSize?, maxDepth?, maxChildren?, stackFormat? }

toPublicReport(caught, options?): PublicReport
  options?: { reference?, code?, message?, details? }

decodePublicReport(value): { ok: true; report: PublicReport } | { ok: false; reason: string; path: string }

restoreExpectedValues(report)   // re-exported from caught-object-report-json

DIAGNOSTIC_REPORT_VERSION = 'corj/v0.12'
PUBLIC_REPORT_VERSION = 'appex/public/v3'
APPEX_ERROR_CODES: readonly AppexErrorCode[]
```

Types: `ExceptionDefinition`, `ExceptionInput`, `PublicPolicy`,
`TypedException`, `TypedExceptionClass`, `DiagnosticReport`,
`DiagnosticReportOptions`, `ReportingError`, `PublicReport`,
`PublicReportOptions`, `DecodePublicReportResult`, `AppexErrorCode`, and the
re-exported corj types `CorjReport`, `CorjReportChild`, `CorjJsonValue`.

## Public report limits

| Field | Limit | On overflow |
| --- | --- | --- |
| `reference`, `code` | 1–128 UTF-16 units | throws |
| `message` | 4,096 UTF-16 units | cut, `truncated: true` |
| `as_json` | 16,384 bytes of corj's compact JSON | cut by corj (`[truncated]` markers), `truncated: true` |

## Verification

```sh
npm ci
npm run test:all      # jest with 100% coverage gate, type tests, build, package smoke
npm run docs:check    # api card drift, snippet type-check, budgets, error sections, links
```
