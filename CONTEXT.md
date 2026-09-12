# Application Exception

Application failures have a kind, an occurrence, and information selected for
diagnostic or public reporting.

## Language

**Error kind**:
A stable category of failure that callers can distinguish and handle. The kind
does not change when wording, diagnostic details, or a transport changes.
_Avoid_: Message, class name, status

**Error occurrence**:
One particular failure, with its own identity and creation time. Two occurrences
can have the same kind and details without being the same occurrence.

**Diagnostic details**:
Facts explaining an occurrence to developers and operators. Their presence on an
error does not authorize exposing them to an end user.
_Avoid_: Public payload

**Display message**:
Text intentionally written for an end user. Whether it is appropriate to reveal
still depends on the audience and operation.

**Diagnostic report**:
A bounded, serializable account of an occurrence and its causes for operational
use. It is a representation of a failure, not a live failure to execute or throw.

**Public report**:
The information an application chooses to disclose about a failure to a specific
audience, potentially including a reference to its diagnostic report.

**Context annotation**:
Information about where an existing occurrence was observed. Adding context does
not by itself establish that a different failure occurred.
_Avoid_: Root cause

**Failure translation**:
Expressing a lower-level failure as a different error kind meaningful to a caller.
The original failure remains a cause of the new occurrence.
_Avoid_: Mere wrapper
