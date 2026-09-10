# Migrating to typed errors and reports

Application Exception now has two compatible surfaces:

- `ApplicationException` / `AppEx` preserves the existing mutable builder,
  subclass defaults, Handlebars templates, and `appex/v0.1` JSON.
- `defineException` constructs complete native errors with a stable kind,
  typed details, occurrence identity, and standard causes.

The new API requires Node.js 18 or newer. It does not add a Result type,
runtime schema system, retry policy, or Effect dependency to production.

## Define a kind once

```ts
import { defineException } from 'application-exception/typed';

const UserAlreadyExists = defineException<{ email: string }>()({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }) => `An account already exists for ${email}`,
});

type UserAlreadyExists = InstanceType<typeof UserAlreadyExists>;

const error = new UserAlreadyExists({
  details: { email: 'ada@example.test' },
  cause: databaseError,
});
```

The full detail object is required at construction and must be record-like.
Arrays, functions, and built-in non-record instances are rejected. The library
copies and shallow-freezes enumerable data; nested values keep their identity.
For a custom object, prototype methods are absent from the copy and its type.
The message is rendered once and supplied to native `Error`, so `.message`,
stacks, loggers, and generic error consumers agree. `_tag`, `id`, and
`timestamp` describe the kind and this particular occurrence.

Use a tag that remains meaningful when message wording and transports change.
Namespace tags when independent catalogs may meet, such as
`accounts/UserAlreadyExists`. Treat renaming a tag as a contract change.

## Translate legacy concepts

| Mutable builder concept                | Typed/reporting equivalent                             |
| -------------------------------------- | ------------------------------------------------------ |
| `AppEx.new(template).details(partial)` | `new Kind({ details: completeDetails })`               |
| `getCode()` / class-name code          | Readonly literal `_tag`                                |
| `numCode()`                            | HTTP status or CLI exit policy at the boundary         |
| `causedBy(one)`                        | Native `.cause`, preserving identity                   |
| `causedBy(many)`                       | Native `.cause` containing an ordered `AggregateError` |
| `displayMessage()`                     | An explicit `toPublicReport` presentation              |
| Legacy `toJSON()`                      | Retained `appex/v0.1` compatibility output             |
| Raw template plus compiled message     | Constructor-time message function                      |

There is no automatic conversion for custom legacy defaults, helpers, or
instance methods. Migrate one domain error at a time. Existing callers can keep
using the builder while new boundaries use typed errors and reports.

`wrap<Subclass>()` no longer claims that an existing unrelated
`ApplicationException` has the requested subtype. Code that supplied this
explicit generic may stop compiling. Remove the generic and narrow the returned
value from its actual constructor or error code; the runtime object is preserved
without a type cast that invents a subtype.

## Preserve causes deliberately

`cause` and `causes` are mutually exclusive inputs. A single cause is retained
by identity. Several causes become an `AggregateError`; their order is retained
without claiming they occurred sequentially. An empty `causes` list installs no
cause, while an explicit `cause: undefined` installs the native property.

Normalize a caught value when you need to report it. Translate a failure only
when the current layer understands it and has a more meaningful error kind.
Adding request or operation context does not require a new wrapper: pass context
to `toDiagnosticReport` so concurrent observers do not mutate the same error.

## Produce diagnostic and public reports separately

```ts
import { toDiagnosticReport, toPublicReport } from 'application-exception';

const diagnostic = toDiagnosticReport(error, {
  context: { requestId: 'req-123', operation: 'registerUser' },
});

const publicBody = toPublicReport(diagnostic, {
  code: 'ACCOUNT_ALREADY_EXISTS',
  message: 'An account with this email already exists.',
});
```

The diagnostic report uses `appex/diagnostic/v1` and may contain internal
messages, details, causes, stacks, and observation context. Treat it as
sensitive operational data. The public report uses `appex/public/v1` and, by
default, contains only the same occurrence reference plus
`INTERNAL_ERROR` / `Something went wrong`. Internal tags, messages, details,
causes, and stacks are never copied automatically.

An application's endpoint owns disclosure policy. The same
`accounts/UserAlreadyExists` occurrence can produce a conflict message during
authorized registration and a generic accepted response during account
recovery. HTTP and CLI statuses stay outside the report body.

### Diagnostic normalization

Default limits apply across details, context, causes, rendering failures, and
stacks. Structured details and context consume the budget before stack text.

| Limit                       | Default |
| --------------------------- | ------: |
| Nesting depth               |       8 |
| Visited values              |   1,000 |
| Entries per object or array |      50 |
| Characters per string       |   4,096 |

Configure them through `limits`. Field names matching `apiKey`, `api_key`,
`authorization`, `cookie`, `password`, `secret`, or `token` are redacted
case-insensitively; `redactKeys` adds application-specific names. Redaction is a
useful safeguard, not proof that free-form messages contain no secrets.

Object keys longer than 4,096 characters are omitted with a `key-length`
truncation marker so hostile property names cannot dominate the output size.

Normalization does not invoke getters or custom `toJSON`. It distinguishes
cycles from ordinary shared values and emits JSON markers:

| `$appex` marker                                                                  | Meaning                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `redacted`                                                                       | Policy removed the value before traversal                        |
| `truncated`                                                                      | A string, depth, entry, or total-value limit was reached         |
| `cycle`                                                                          | The value refers to an ancestor in its current path              |
| `unreadable`                                                                     | A getter, proxy, or special object could not be inspected safely |
| `undefined`, `bigint`, `non-finite-number`, `function`, `symbol`, `invalid-date` | JSON cannot faithfully represent the original value              |

Objects that exceed the entry limit receive a property whose value is a
`truncated` marker. Its key starts with `$appex:truncated`; if user data already
has that key, the reporter chooses a collision-free `$appex:`-prefixed key.
Markers are display data and must never be evaluated as revival instructions.

## Decode untrusted reports

```ts
const decoded = decodeDiagnosticReport(JSON.parse(input));
if (!decoded.success) {
  if (decoded.error.code === 'UNSUPPORTED_VERSION') {
    // Escalate or retain the raw payload; do not guess a newer schema.
  }
  return;
}
consumePlainReport(decoded.value);
```

The decoder validates the version and required envelope, recursively verifies
plain JSON data, rejects accessors, cycles, and class instances, and returns a
detached report. It never reconstructs exception prototypes or trusts a tag as
validation of its details. Decoding stops beyond 64 levels, 10,000 values, or a
4,096-character property name. Domain-error reconstruction needs an
application-owned decoder or schema adapter.

## Agent and tool consumers

Agents should branch on stable machine fields and treat messages as explanatory
text:

```ts
const decoded = decodeDiagnosticReport(toolOutput);
if (!decoded.success) {
  return escalateReportProtocol(decoded.error);
}

switch (decoded.value.kind) {
  case 'agent/ToolUnavailable':
    return askForAnotherTool(decoded.value.reference);
  case 'agent/InvalidInput':
    return repairInput(decoded.value.details);
  default:
    return escalateUnknownFailure(decoded.value.reference);
}
```

Agent integrations should:

- correlate actions with `reference`, never by comparing message prose;
- treat unknown kinds and versions as unknown rather than choosing a similar
  branch heuristically;
- preserve `$appex` markers and truncation metadata when summarizing reports;
- avoid retrying from an error kind alone—operation idempotency owns retry policy;
- keep diagnostic reports out of model prompts unless the task and data policy
  authorize their contents;
- use public reports for user-visible output, with an explicit presentation.

The `/typed` entry point does not load Handlebars or the legacy defaults engine,
which keeps tool workers that only construct errors lightweight. Reporting is
available from the root entry point.

## Effect v3

Typed exceptions are native errors with a structural literal `_tag`. Introduce
one into Effect's typed failure channel explicitly:

```ts
const program = Effect.catchTag(
  Effect.fail(error),
  'accounts/UserAlreadyExists',
  (failure) => Effect.succeed(failure.details.email),
);
```

They are not directly yieldable Effect errors and do not reproduce Effect's
failure/defect/interruption model. The pinned runnable example is
[effect-integration.ts](../examples/effect-integration.ts). Applications already
using schema-backed Effect errors should keep those as their domain model and
use this package only where its native reporting contract adds value.
