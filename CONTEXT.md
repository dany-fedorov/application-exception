# Application Exception

Application failures have a kind, an occurrence, and two reports selected for
different audiences.

## Language

**Error kind**:
A stable category of failure that callers distinguish with `instanceof` or the
literal `_tag`. The kind does not change when wording, details, or a transport
changes. Defined once with `defineException`.
_Avoid_: Message, class name, status

**Error occurrence**:
One particular failure: an instance of a kind with its own `id` and
`timestamp`. Two occurrences can share a kind and details.

**Details**:
The data-only record a kind declares through its message renderer's parameter
type. Present on every occurrence, frozen, and included in the diagnostic
report's `as_json`. Their presence never authorizes disclosure.
_Avoid_: Public payload

**Occurrence reference**:
The string that correlates the diagnostic and public reports of one failure:
the occurrence `id` for typed exceptions, a generated `AE_` id remembered per
object otherwise. Appears as `reference` on both reports.

**Diagnostic report**:
A caught-object-report-json report of the occurrence and its causes, plus
`reference`, `context`, and `reporting_errors`. Bounded, serializable, meant for
trusted sinks. A representation of a failure, not a failure to throw.

**Public policy**:
The `public` part of a kind definition: the `code` an audience branches on, the
display `message`, and a `details` selector that returns the JSON to disclose.
Declared where the details type is known.

**Public report**:
What the application discloses about one occurrence: `code`, `message`,
`as_json`, `reference`, `truncated`. Rendered from the public policy or the
generic default; never read from the error graph.

**Context**:
Host facts about where an occurrence was observed (run id, tool, attempt),
passed to `toDiagnosticReport` and normalized into `report.context`. Adding
context does not create a different failure.
_Avoid_: Root cause

**Failure translation**:
Throwing a kind meaningful to the caller with the lower-level failure as its
`cause`. The original stays reachable and appears under `children` in the
diagnostic report.
_Avoid_: Mere wrapper
