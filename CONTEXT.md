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

**Occurrence id**:
The string that correlates the diagnostic and public reports of one failure:
the `occurrenceId` of a typed exception, a generated `AE_` id remembered per
object otherwise. Appears as `occurrence_id` on both reports.

**Fingerprint**:
The hash that groups occurrences of the same failure from the same place:
corj's `fp1_` digest of the error graph's identifying parts, equal on both
reports of one occurrence. A retry signal, not a lookup key — the occurrence id
is what identifies one failure.
_Avoid_: Error id, hash key

**Diagnostic report**:
A caught-object-report-json report of the occurrence and its causes, plus
`occurrence_id`, `fingerprint`, `context`, and `reporting_errors`. Bounded,
serializable, for trusted sinks. A representation of a failure, not a failure to
throw.

**Public policy**:
The `public` part of a kind definition: the `code` an audience branches on, the
display `message`, and a `details` selector that returns the JSON to disclose.
Declared where the details type is known.

**Public report**:
What the application discloses about one occurrence: `code`, `message`,
`as_json`, `occurrence_id`, `fingerprint`, `truncated`. Rendered from the public
policy or the generic default; nothing from the error graph is emitted except
the policy's outputs and the fingerprint, a hash computed by this report's own
option bag and published only when it is backed by real stack frames.

**Context**:
Host facts about where an occurrence was observed (run id, tool, attempt),
passed to `toDiagnosticReport` and rendered by corj into `report.context`, a
document of its own rooted at `$context`. Adding
context does not create a different failure.
_Avoid_: Root cause

**Failure translation**:
Throwing a kind meaningful to the caller with the lower-level failure as its
`cause`. The original stays reachable and appears under `children` in the
diagnostic report.
_Avoid_: Mere wrapper
