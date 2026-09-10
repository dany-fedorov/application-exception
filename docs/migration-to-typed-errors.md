# Migrating to Application Exception 0.2

Version 0.2 replaces the legacy mutable builder with one typed native-error API.
It is a breaking release and requires Node.js 18 or newer.

## Breaking changes

- `ApplicationException`, `AppEx`, builder aliases, subclass defaults,
  Handlebars templates/helpers, legacy wrapper types, and `appex/v0.1` JSON were
  removed. There is no compatibility facade or automatic converter.
- Import all runtime values and public types from `application-exception`.
  The `application-exception/typed` subpath and wildcard `typesVersions` mapping
  were removed.
- Replace the curried `defineException<Details>()({...})` call with
  `defineException({...})`. Annotate the renderer parameter to infer details.
- A constant string message creates a no-details kind constructible with no
  argument. Detail-bearing kinds still require one complete `details` record.
- `toPublicReport` accepts an occurrence reference string. It no longer accepts,
  inspects, or decodes an error/diagnostic object.
- Wire versions changed to `appex/diagnostic/v2` and `appex/public/v2`.
  `decodeDiagnosticReport` explicitly rejects v1 and unknown versions.
- Diagnostic stacks are omitted unless `includeStack: true` is selected.
- Context accepts ordinary interface-shaped objects. Configurable diagnostic
  limits now include a serialized UTF-8 byte budget.
- Report normalization emits explicit `unsupported` and additional truncation
  markers. Provider `code` and `status` are bounded allowlisted observations;
  arbitrary error fields are not copied.
- Only local constructed instances pass `isTypedException`. Foreign package-copy
  metadata may be retained for diagnostics without trusting its details type.
- Production dependencies now contain only `nanoid`. Effect remains dev-only.

## Replace construction

Before:

```ts
import { AppEx } from 'application-exception';

throw AppEx.new('Account already exists: {{email}}')
  .code('ACCOUNT_ALREADY_EXISTS')
  .details({ email });
```

After:

```ts
import { defineException } from 'application-exception';

const UserAlreadyExists = defineException({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }: { email: string }) =>
    `An account already exists for ${email}`,
});

throw new UserAlreadyExists({ details: { email }, cause });
```

The definition is snapshotted. Tags are nonempty and at most 128 UTF-16 units;
optional ID prefixes are nonempty and at most 32. Details are copied completely
into a plain shallow-frozen record. Construction rejects more than 1,000 own keys
or more than 32 prototype levels instead of silently dropping data. Arrays,
functions, method-bearing shapes, and accessor-bearing prototypes are rejected.

Use either `cause` or `causes`; an explicit `cause: undefined` installs the native
property, while an empty causes list does not. Multiple causes become an ordered
`AggregateError`.

## Separate diagnosis from disclosure

Before 0.2, public projection accepted an error or diagnostic graph. Pass the
stable occurrence reference instead:

```ts
const diagnostic = toDiagnosticReport(caught, {
  context: { requestId, operation: 'registerUser' },
  limits: { maxBytes: 16_384 },
});

recordTrustedDiagnostic(diagnostic);

const response = toPublicReport(diagnostic.reference, {
  code: 'REGISTRATION_FAILED',
  message: 'Registration could not be completed.',
});
```

References and explicitly supplied public codes must be nonempty strings of at
most 128 UTF-16 units. Invalid identifiers throw; they are never truncated.
Message/details truncation is explicit in the envelope.

Diagnostic defaults are depth 8, 1,000 values, 50 entries per container, 4,096
UTF-16 units per string, and 65,536 serialized UTF-8 bytes. Supported maximums
are 32, 10,000, 1,000, 65,536, and 1,048,576 respectively; non-byte limits may
be zero and bytes must be at least 4,096. A 4,096-digit magnitude ceiling protects
bigint conversion independently of the configured string limit.

The decoder additionally caps detached input at depth 64, 100,000 values,
100,000 descriptor inspections, 1 MiB, and 4,096-unit keys. It validates the one
snapshot it returns. Decode remote diagnostic JSON before use, then validate
catalog-specific details with application code.

## Operational limits

Normalization uses own data descriptors and safe built-in intrinsics. It does
not invoke getters, custom coercion, instance Date methods, or `toJSON`.
Stack-free reporting does not inspect `.stack`; explicit stack capture may run
the engine's `Error.prepareStackTrace` hook. Unsupported Map/Set, weak collections,
binary views/buffers, Promise, RegExp, and collection iterators receive an
`unsupported` marker.

Entry and value budgets bound selected descriptor reads, but enumerating all keys
can remain proportional to input width. Proxy traps cannot be given a hard time
limit. Redaction covers selected keys, not secrets embedded in free-form prose.

The shipped schemas describe structural JSON constraints. JavaScript runtime
lengths use UTF-16 units while JSON Schema `maxLength` counts Unicode code points;
total byte/depth/work and live-object descriptor rules are procedural. See the
[README](../README.md), [agent guide](agent-recovery.md), and shipped
[diagnostic](../schemas/diagnostic-report-v2.json) and
[public](../schemas/public-report-v2.json) schemas.
