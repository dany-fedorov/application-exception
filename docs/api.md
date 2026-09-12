# API reference

Import runtime functions and public types from `application-exception`.
See the [quick start](../README.md#quick-start) for an application boundary.
For agent tool integrations, keep local error tags, public recovery codes, and
occurrence references distinct: tags identify kinds, codes select host-defined
handling, and references correlate individual failures.

## Error construction

`defineException({ tag, message, idPrefix? })` returns a native Error
constructor with a static `tag` property. A message renderer's annotated
parameter infers the required details record. A constant message selects the
no-details form.

- `tag`: nonempty string, at most 128 UTF-16 units.
- `idPrefix`: optional nonempty string, at most 32 UTF-16 units.
- Constructor input: `{ details, cause? }` or `{ details, causes? }`.
  No-details constructors also accept no argument.
- Details: enumerable data properties copied into a plain shallow-frozen record.
  Arrays, functions, function-valued fields, and accessors are rejected.
  Intermediate prototypes may own only `constructor`; inherited data properties
  and methods are rejected. At most 1,000 own keys and 32 prototype levels are
  accepted; oversized records throw rather than silently losing fields.
- `cause` and `causes` are mutually exclusive. One cause is installed directly;
  multiple causes become an ordered `AggregateError`.
- Each occurrence exposes `_tag`, `id`, ISO `timestamp`, `details`, native
  `message`, and optional `cause`. Details are shallow: nested payloads retain
  identity and may remain mutable.
- The message is rendered once. Renderer failure falls back to the tag; diagnostic
  reporting can include `messageRenderingError`.

Type exports: `ExceptionDefinition<Tag, Details>`, `ExceptionInput<Details>`,
`TypedException<Tag, Details>`, and `TypedExceptionClass<Tag, Details>`.
Omitting `Details` from the definition, input, or class type selects the
constant-message form.

`isTypedException(value)` recognizes local constructed instances. Narrow a
specific kind with its constructor before accessing catalog-specific details.
Reports from another package copy may retain diagnostic metadata without
establishing local instance identity.

## Diagnostic reports

`toDiagnosticReport(caught, options?)` accepts any thrown value.
`DiagnosticReportOptions` supports:

| Field | Purpose |
| --- | --- |
| `context?: object` | Facts about the observation, normalized alongside the failure |
| `includeStack?: boolean` | Opt into stack capture; default false |
| `limits?: Partial<DiagnosticLimits>` | Override the [diagnostic budgets](../README.md#diagnostic-limits) |
| `redactKeys?: readonly string[]` | Additional keys to redact |

The `DiagnosticReport` envelope always includes `v`, `reference`, `name`,
and `message`. Optional fields include `kind`, `timestamp`, `details`,
`context`, `cause`, `stack`, `thrown`, `messageRenderingError`, and
`truncation`. Provider `code` and `status` are bounded string/number
observations; arbitrary custom error properties are not copied.

Common credential keys are redacted. Redaction is key-based and cannot remove
secrets embedded in free-form messages. Keep diagnostics in an authorized sink.

`DiagnosticValue` contains JSON primitives, arrays, objects, and
`DiagnosticMarker` records. The `$appex` marker identifies bigint, cycles,
functions, invalid dates, non-finite numbers, redaction, symbols, truncation,
undefined, unreadable values, and unsupported objects. Application objects
resembling markers remain data; no marker is revived or executed.

Map/Set, weak collections, binary views/buffers, Promises, RegExp, and collection
iterators receive unsupported markers. Keys longer than 4,096 UTF-16 units are
omitted. Bigint conversion has a separate 4,096-digit magnitude ceiling.
Normalization avoids getters, custom coercion, Date overrides, and `toJSON`.
Entry limits bound selected descriptor reads, but key enumeration and proxy
traps do not have a hard execution-time bound.

## Public reports

`toPublicReport(reference, presentation?)` accepts a reference string and
`PublicPresentation`: optional `code`, `message`, and `details`.

The reference and explicit code must be nonempty strings of at most 128 UTF-16
units. Invalid identifiers throw rather than being truncated. Defaults are
`INTERNAL_ERROR` and `Something went wrong`. Selected details are normalized;
message/details omission is recorded in the envelope's `truncation` field.
Public messages are limited to 4,096 UTF-16 units. Details use the default
diagnostic normalization budgets, and the whole public report is limited to
65,536 serialized UTF-8 bytes. Diagnostic options do not configure these budgets.

`PublicReport` includes `v: 'appex/public/v2'`, `reference`, `code`,
`message`, optional `details`, and optional `truncation`. A report is an
application-selected disclosure. It does not copy or sanitize an error graph
automatically, select HTTP status, authorize a retry, or select a recovery tool.

## Decode diagnostic JSON

`decodeDiagnosticReport(value)` returns `DecodeDiagnosticReportResult`:

- `{ success: true, value: DiagnosticReport }`: a detached, validated snapshot.
- `{ success: false, error: { code, message, path? } }`: validation failure.
  Codes are `INVALID_REPORT` and `UNSUPPORTED_VERSION`.

Decoder work is capped at depth 64, 100,000 JSON values, 100,000 descriptor
inspections, 1 MiB, and 4,096-unit keys. Decode before consuming external
diagnostics, then validate any domain details separately.

`DIAGNOSTIC_REPORT_VERSION` is `appex/diagnostic/v2`;
`PUBLIC_REPORT_VERSION` is `appex/public/v2`.

The shipped [diagnostic](../schemas/diagnostic-report-v2.json) and
[public](../schemas/public-report-v2.json) JSON Schemas validate wire structure.
JSON Schema string lengths count Unicode code points; runtime lengths use UTF-16
units. Total bytes, depth, work budgets, and live-object descriptor checks are
procedural constraints. There is no public-report decoder function; use a JSON
Schema validator and application-specific validation, as shown in the
[agent recovery guide](agent-recovery.md).
