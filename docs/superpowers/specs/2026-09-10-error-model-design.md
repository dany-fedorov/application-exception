# Application Exception: useful errors at application boundaries

Date: 2026-09-10. Status: design proposal; the proposed APIs below are not
implemented. Baseline: commit `6d8aa7309fa356636e8a344b9304805b8cf8f719`, package
`0.0.25`.

## Recommendation

Make Application Exception a small library for constructing identifiable,
typed native errors and producing dependable reports from them. Its promise
should be: **an error carries enough information to handle it, investigate it,
and explain it appropriately to a user.**

The existing [motivation](../../../README.md#motivation) is sound: useful
metadata, convenient construction, multiple causes, consistent JSON, and
informative messages. Develop those ideas around explicit contracts. The next
step should make one complete service-to-log-to-response example excellent.

Effect is valuable precedent for explicit error kinds and typed failure values.
The opportunities specific to this library are native JavaScript ergonomics,
occurrence identity, and application reporting. The companion
[Effect research](../../research/effect-error-model.md) separates verified APIs
from design recommendations and distinguishes v3 from v4 prereleases.

Choose between these directions:

| Direction                                     | Benefit                                                                                                          | Cost                                                                                 | Decision                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Strengthen the existing mutable builder       | Smallest migration; immediately repairs current behavior                                                         | Partial construction and mutable identity remain poor foundations for typed handling | Maintain and repair it                                            |
| Add typed construction and explicit reporting | Works with ordinary `throw`, promises, and existing result/effect libraries; makes the original ideas dependable | A second construction API needs a clear migration story                              | Recommended product direction                                     |
| Become an Effect extension                    | Reuses Effect's typed computation and schema ecosystem                                                           | Requires consumers to adopt that ecosystem; much overlaps existing Effect facilities | Provide examples first; add an adapter only for demonstrated gaps |

Applications already using Effect should normally start with its own error
types. This library should earn its place through reporting and native-error
use cases, rather than require them to maintain two equivalent domain models.

## What the current implementation teaches us

These are observations about the checked-out source, not hypothetical reasons
to rewrite it. The relevant implementation is
[ApplicationException.ts](../../../src/ApplicationException.ts); the existing
tests are in [ApplicationException.test.ts](../../../tests/ApplicationException.test.ts).

| Current behavior                                                                                                          | Consequence                                                                    | Design requirement                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `getMessage()` caches its first rendering; setters never invalidate `_compiled`                                           | Reading a message before adding details changes later results                  | Complete construction for the new API; repair cache behavior in the builder |
| Native `.message` contains the template while `getMessage()` renders it                                                   | Generic error consumers and JSON consumers see different text                  | The new API's native `.message` is final, readable text                     |
| `details()` accepts partial input; typed details require overriding `setDetails`                                          | Required domain facts can be absent even when the declared shape requires them | Require the entire detail value at construction                             |
| `wrap<Class>()` can return an existing unrelated `ApplicationException` using a cast                                      | The advertised subtype need not exist at runtime                               | Preserve identity without inventing a subtype                               |
| `causedBy()` stores a private list without installing native `.cause`                                                     | Standard cause-aware consumers cannot follow it directly                       | Use native cause semantics, preserving every cause                          |
| The normalization class has no `causes` resolver                                                                          | `createDefaultInstance({ causes: [...] })` loses the supplied causes           | Constructor variants must share a tested contract                           |
| `ApplicationExceptionJson` declares `compiled_message`, but output uses `message`; it requires a stack that wrappers omit | The wire type misleads consumers                                               | Derive or check report types against actual output                          |
| `toJSON()` passes details through unchanged                                                                               | Cyclic details make `JSON.stringify(error)` throw                              | Normalize arbitrary diagnostics before claiming they are JSON values        |
| Several test cases have empty bodies; the main fixture omits a newly required option                                      | Existing badges cannot establish the present behavior                          | Restore executable tests and add assertions for public guarantees           |

Verification on 2026-09-10, using the locked dependencies and Node 24.20.0:

- `npm run build` passed.
- `npm test -- --runInBand` failed before executing tests: the fixture at line 5
  omits `addWrapperInstanceStackToJson` required by `AppExOptions`.
- Direct probes against the built package reproduced stale message and display
  message rendering, lost normalized causes, absent native cause, subtype
  mismatch in wrapping, the JSON field discrepancy, and cyclic-detail failure.

For example, the current code below prints `Hello Ada` twice, then the raw
template. This is a regression scenario for the repair release:

```ts
const error = AppEx.new('Hello {{name}}').details({ name: 'Ada' });
console.log(error.getMessage());
error.details({ name: 'Grace' });
console.log(error.getMessage());
console.log(error.message);
```

The README also says a native error's message cannot be changed. Native errors
have a writable message property; stack presentation is a separate,
runtime-dependent concern. Construction-time rendering is a design choice,
not a JavaScript restriction. See the specification's
[Error constructor](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-error-message)
and [non-enumerable property creation](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-createnonenumerabledatapropertyorthrow).

## 1. Separate kind, occurrence, and presentation

An error kind is the machine-readable discriminant, proposed as a readonly
literal `_tag`. An occurrence has an `id`, a creation timestamp, and diagnostic
details. Public codes, HTTP statuses, CLI exit codes, and user-facing messages
belong to the application's presentation policy. See the
[glossary](../../../CONTEXT.md).

Use an explicit tag such as `UserAlreadyExists`; never derive the handling
contract from a rendered message or `constructor.name`. Applications combining
independent error catalogs can namespace tags, for example
`accounts/UserAlreadyExists`. Renaming a tag is a contract change.

The tag remains the same across occurrences. IDs remain distinct. A request ID
or trace ID can accompany an error but is not a replacement for its occurrence
ID. The legacy `code()` stays available; the new API does not introduce another
mutable field that competes with `_tag` for domain identity.

This follows the useful part of Effect's tagged error approach: a literal
discriminant and typed fields enable selective handling. A tag alone does not
validate data or establish that a foreign object is a trusted exception. See
[Effect's v3 Data error types](https://effect.website/docs/v3/data-types/data/#taggederror).

## 2. Construct a complete native error

Proposed API sketch, not executable with the current release:

```ts
import { defineException } from 'application-exception/typed';

const UserAlreadyExists = defineException<{ email: string }>()({
  tag: 'UserAlreadyExists',
  message: ({ email }) => `An account already exists for ${email}`,
});

type UserAlreadyExists = InstanceType<typeof UserAlreadyExists>;

const error = new UserAlreadyExists({
  details: { email: 'ada@example.test' },
  cause: databaseError, // Supplied by the calling application.
});

error._tag; // Literal type: 'UserAlreadyExists'.
error.details.email; // string; required at construction.
error.message; // Rendered native Error message.
error.cause; // The original databaseError, by identity.
error.id; // This occurrence's reference.
```

The curried factory fixes the detail type while allowing the tag to be inferred
as a literal. It returns a constructor, so `instanceof UserAlreadyExists` works
locally and the instance type can be named with `InstanceType`. Plain class
inheritance remains useful when users need methods. No arbitrary constructor
subtype can be requested through a type parameter.

The new base extends native `Error` directly. It cannot cleanly extend the
current builder: a readonly `.details` property conflicts with its
`.details(...)` method. Share reporting utilities where useful; keep the new
construction contract independent of legacy mutation and default resolution.

Construction requirements:

- Require `details` in full, including every required field. Detail-free kinds
  may use an empty shape. Set the kind and native name consistently.
- Copy and shallow-freeze the details record and expose it as `Readonly<D>`.
  Nested objects and the original cause retain their identities; this is not
  deep immutability. Mutating a nested object can therefore change a later
  report without changing the construction-time message. Prefer scalar domain
  facts to mutable request objects; callers needing a historical snapshot must
  supply one.
- Render the diagnostic message once before handing it to native `Error`.
  The message, ID, tag, and ISO timestamp have no builder setters. Do not freeze
  the entire error: consumers may attach tracing information.
- If a user-provided renderer throws, retain the intended occurrence with the
  tag as its fallback message and capture the rendering problem as diagnostic
  metadata. Do not replace the original cause or recursively log the problem.
- Keep `_tag` and occurrence metadata out of user-controlled detail spreading.
  Details remain nested; they cannot overwrite `stack`, `cause`, or methods.
- Keep Handlebars available to existing consumers. Typed message functions
  cover the normal new use case without string paths or HTML escaping. A new
  `/typed` import must not load Handlebars or `pojo-constructor` transitively.

Readonly annotations do not make untrusted JSON valid. Data crossing a network
still needs a decoder. Native `throw` and `Promise<T>` still do not declare
their possible failures in TypeScript.

## 3. Preserve causes without building a computation runtime

Use native `Error.cause` as the interoperability point. When an API accepts a
list of causes, represent zero as no cause, one as that exact value, and several
as an `AggregateError` whose `errors` preserve order and identity. Never choose
only the first failure. An empty list and an explicitly supplied
`cause: undefined` are distinguishable using property presence.

A `causes` convenience input and a `cause` input should be mutually exclusive.
Diagnostic traversal should understand both native `.cause` and
`AggregateError.errors`; it should not turn a list into an invented chronology.
These are standard JavaScript facilities:
[Error cause installation](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-installerrorcause),
[AggregateError construction](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-aggregate-error-constructor).

Distinguish three operations:

| Operation                | Identity and kind                                                                          | Example                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Normalize a caught value | An existing library error can be returned unchanged; otherwise create a generic occurrence | Log a string thrown by a third-party SDK                           |
| Annotate an observation  | Keep the original occurrence; put operation/request context in its report                  | Record that `registerUser` observed an error                       |
| Translate a failure      | Create a new occurrence of an intentional domain kind, with the original as its cause      | Convert a known unique-constraint failure into `UserAlreadyExists` |

For compatibility, repair `AppEx.wrap`'s return typing without claiming the
receiver's subclass was instantiated when an existing base error is returned.
Do not make a new occurrence merely to add a request ID or operation label.
Pass observation context to the reporter; this avoids two concurrent observers
mutating a shared error.

Effect's `Cause` additionally describes failures arising from computation,
including defects and interruption. This library has no execution model that
could promise equivalent semantics. Preserve native causal structure and let
an Effect integration retain Effect's own cause value when necessary.
See [Effect v3 Cause](https://effect.website/docs/v3/data-types/cause/).

## 4. Treat reporting as a real contract

Provide explicit `toDiagnosticReport(error, options?)` and
`toPublicReport(error, presentation?)` operations. New typed instances may make
`toJSON()` delegate to the diagnostic operation; the legacy wire format remains
unchanged until an explicitly versioned migration.

### Diagnostic reports

A diagnostic report includes a wire-format version, occurrence metadata, tag
when known, message, optional stack, normalized details, observation context,
and normalized causes. Use one new version such as `appex/diagnostic/v1` rather
than modifying the meaning of `appex/v0.1`.

Serialization must return detached JSON data, not references into the live
details object. Specify behavior for cycles, repeated references, bigint,
non-finite numbers, undefined, functions, symbols, invalid dates, throwing
getters, and custom `toJSON`. Represent lossy values with explicitly tagged
diagnostic markers. These markers are display data, never revival commands.

Use ancestor tracking to distinguish a cycle from an object shared by two
independent branches. Preserve normal repeated values within the traversal
budget. Do not invoke arbitrary getters or custom `toJSON`; read properties
defensively and emit a marker when inspection fails. Guard proxy failures too.
Proxy traps can execute arbitrary synchronous code, so traversal limits cannot
promise termination for a deliberately non-returning trap.

Start with explicit conservative defaults: maximum depth 8, 1,000 visited
values, 50 entries per object or array, and 4,096 characters per string. Count
causes and observation context within the same budget. Mark truncation instead
of silently dropping information. These are proposed defaults to test against
real reports, not measured optimal limits or an exact byte budget.

Allow redaction at the reporting boundary, before traversing the selected
value. A field-name denylist can help with known secrets but cannot guarantee
that a free-form message is safe. Reports are diagnostic data with deliberate
access policy, even after redaction. Serializer failures must not print to the
console or hide the occurrence they were trying to describe.

### Public reports

A public report has a separate shape and version, for example
`{ v, reference, code, message, details? }`. By default it contains the
occurrence reference and generic code/message only. It never automatically
copies the internal message, tag, details, stack, causes, or raw templates.

The application explicitly supplies its presentation. This is where the
repo's display-message idea becomes an audience-aware contract:

```ts
// Proposed API; inside a route whose audience may see this information.
const body = toPublicReport(error, {
  code: 'ACCOUNT_ALREADY_EXISTS',
  message: 'An account with this email already exists.',
});
// { v: 'appex/public/v1', reference: error.id,
//   code: 'ACCOUNT_ALREADY_EXISTS', message: '...' }
```

The same error on an account-recovery endpoint might intentionally receive the
generic default to avoid revealing account existence. Public details, when
needed, must be explicitly selected JSON values. The presentation callback or
mapping is application-owned; a `displayMessage` label alone is not permission
to disclose it. HTTP status and CLI exit status are returned by the transport
adapter, separately from this body.

For a raw caught value, produce one diagnostic report first; pass that report
to the public projector so both outputs share its generated reference.
For a library error, both reporters reuse its existing ID. Repeated reporting
must not mutate the error or allocate replacement IDs for it.

### Decoding is a different operation

An initial report decoder, if needed, should validate the version and shape
into a plain report. It must not recreate exception prototypes from
`constructor_name`, trust a tag to infer details, or execute a remote template.
Unknown versions produce an explicit unsupported-version result, not a cast.

Schema-backed reconstruction of known domain errors is a later, separately
validated integration. Effect's schema error types show how a declared schema
can own encoding and decoding; they do not make arbitrary diagnostics suitable
for exposure. Avoid introducing a competing schema engine here. See
[Effect v3 schema classes](https://effect.website/docs/v3/schema/classes/) and the
version-specific research notes.

## 5. Make handling examples honest

Replace the unfinished “consider not using throw” guidance with two complete
examples: normal `try/catch` with selective translation, and an explicit error
channel using an existing result library or Effect. Returning `T | Error`
does not by itself produce the handling guarantees of a typed computation.

Inside a service, translate only errors the service understands. Re-throw
unexpected exceptions, or report them at the outer boundary. Treating every
caught `unknown` as a recoverable domain error hides defects. A failure may be
recoverable at one boundary and unexpected at another; avoid a universal
`isOperational` flag on every instance.

In native code, a switch over a known union of literal `_tag` values enables
exhaustiveness checking. A catch variable remains `unknown`: narrow local
instances with `instanceof`; validate remote data before handling it. A helper
that merely checks `_tag` must not claim that it validated the detail shape.

An Effect example should use `Effect.fail(error)` to introduce a native tagged
error into the typed channel, and `catchTag` to handle it. Extending `Error`
does not make this library's value directly yieldable like Effect's own error
types. Verify examples against a pinned Effect version. In v3,
`Effect<A, E, R>` describes success, typed failure, and requirements; defects
and interruption are represented separately in causes. See
[expected errors](https://effect.website/docs/v3/error-management/expected-errors/)
and [unexpected errors](https://effect.website/docs/v3/error-management/unexpected-errors/).

Keep retry decisions with the operation: an availability error is not proof
that repeating a payment is safe. Do not add a scheduler, retry DSL, dependency
container, or general-purpose Result API to make the examples work.

## Prove the design with real boundary scenarios

The first example application should register an account. Its storage adapter
recognizes the database's documented unique-constraint failure and translates
only that case into `UserAlreadyExists`, retaining the database error as its
cause. The service preserves that value. At the request boundary, the application
creates a diagnostic report with request context, then selects the audience's
public presentation and HTTP status separately. The public `reference` resolves
to the same occurrence in the diagnostic report.

| Scenario                                        | Handling                                                       | Reporting                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Existing account during authorized registration | Recognized domain failure; route can return 409                | Internal cause and details; explicitly chosen account-conflict message                    |
| Same kind during account recovery               | Follow the endpoint's disclosure policy                        | Generic public outcome; internal kind remains available                                   |
| Unexpected `TypeError` in the adapter           | Preserve as unexpected; do not convert to account conflict     | Outer boundary records the defect and returns a generic failure                           |
| Two independent import failures                 | Preserve both in an aggregate                                  | Both errors survive serialization, subject to explicit limits                             |
| One error observed by two concurrent callers    | Preserve occurrence identity; give each report its own context | No mutation races and no extra causal wrappers                                            |
| Request data contains a cycle or a secret       | Error handling still completes                                 | Cycle marker in diagnostics, selected values redacted, no automatic public detail copying |

Exercise both successful registration and these failure paths. A runnable
example earns its place by demonstrating correct handling and correlated
reports, not by showing every constructor alias.

## Delivery order and acceptance criteria

Each stage should be independently reviewable. The first implementation effort
should cover stages 0 and 1; reporting follows once construction is stable.

| Stage                 | Deliverable                                                                                                            | Evidence required                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Restore trust      | Correct the fixture and JSON types; preserve normalized causes; repair builder rendering; make wrapping types truthful | Build, full tests, and focused regressions for every reproduced issue pass; existing wire field names remain stable                                                     |
| 1. Typed construction | Small `/typed` API with explicit tags, complete details, rendered native messages, occurrence IDs, and standard causes | Runtime behavior plus compile-time tests for missing details, wrong fields, literal narrowing, and truthful subclass returns; packaged import works                     |
| 2. Reliable reporting | Shared bounded diagnostic normalization and explicit public projection                                                 | Cycles, bigint, bad getters, duplicates, truncation, and aggregate causes are covered; public reports never inherit diagnostics; report reference correlation is tested |
| 3. Useful adoption    | Complete service, HTTP/CLI, and pinned Effect examples; migration guide                                                | Examples type-check and run; Effect is optional; consumers can install a packed package and use the documented entry points                                             |
| Later, demand-driven  | Report schema, domain-error codecs, templating adapter, tracing integration                                            | A real consumer needs each feature; measured scope and dependency cost justify it                                                                                       |

For the mutable builder, invalidation must cover all supported setters that
affect rendering, including options and self-fields. Merely clearing the cache
in `setDetails` is insufficient. Because callers currently receive mutable
references through getters, the repair must also define whether legacy
rendering is recomputed on each read or whether external mutation is explicitly
unsupported. Prefer recomputing legacy renderings initially; optimize only
after measuring. The new construction API avoids this lifecycle entirely.

Before shipping a new wire version, add fixtures that are both checked by the
declared report type and asserted at runtime. Do not rely on broad snapshots
or casts through `Object.fromEntries` to establish the contract. Test the packed
artifact so declaration paths and `/typed` resolution match the published
package; a local source import cannot establish that.

Keep occurrence creation, native cause adaptation, and reporting in separate
small modules. Reporting can serve legacy and typed errors through an internal
read-only view. Do not expose the old defaults-resolution engine as the new
extension mechanism. Dependency and bundle claims require measurements from
the packed entry points, rather than source-file size estimates.

## Migration and scope limits

Maintain `AppEx.new`, fluent builders, subclass defaults, and Handlebars during
the transition. Add the typed entry point as opt-in. Document explicitly that
`.details(...)` becomes constructor input, `getCode()` becomes `_tag` for domain
handling, and `numCode()` becomes transport policy. There is no automatic
one-to-one conversion for arbitrary legacy defaults or instance methods.

Legacy `toJSON()` is diagnostic output and retains its established version.
New public projection is an explicit call. Changing automatic JSON behavior,
removing mutation, or replacing the legacy wire format requires a clearly
announced breaking release. Typing repairs may expose previously accepted
invalid code and need migration notes even when runtime behavior is preserved.

Success is one error flowing through a real application with a trustworthy
type, original cause, useful diagnostic report, and intentionally chosen public
message. That is the standard for adding the next feature.
