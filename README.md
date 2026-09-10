# Application Exception

Typed native errors and disclosure-safe diagnostic/public reports for TypeScript.
Version 0.2 requires Node.js 18 or newer and exposes one API from the package root.

```sh
npm install application-exception
```

## Define, construct, narrow, report, present

Define an error kind once. An annotated message renderer infers the complete
details type and preserves the tag as a string literal.

```ts
import {
  defineException,
  toDiagnosticReport,
  toPublicReport,
} from 'application-exception';

const UserAlreadyExists = defineException({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }: { email: string }) =>
    `An account already exists for ${email}`,
});

const failure = new UserAlreadyExists({
  details: { email: 'ada@example.test' },
  cause: databaseError,
});
```

`failure` is a native `Error`. Its `_tag` remains the literal
`'accounts/UserAlreadyExists'`; its `id` identifies this occurrence; and its
complete, shallow-frozen `details` record drives the message. Use either
`cause` or `causes`. Multiple causes become an ordered `AggregateError`.

A constant message defines a no-details error:

```ts
const Unavailable = defineException({
  tag: 'service/Unavailable',
  message: 'Service unavailable',
});

throw new Unavailable();
```

Narrow local catches with the actual constructor when you need its details:

```ts
try {
  await registerUser();
} catch (caught: unknown) {
  if (caught instanceof UserAlreadyExists) {
    console.log(caught.details.email);
  }
  throw caught;
}
```

For a known catalog union, branch exhaustively on `_tag`:

```ts
type AccountFailure =
  | InstanceType<typeof UserAlreadyExists>
  | InstanceType<typeof Unavailable>;

function handleFailure(error: AccountFailure): string {
  switch (error._tag) {
    case 'accounts/UserAlreadyExists':
      return error.details.email;
    case 'service/Unavailable':
      return 'try later';
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}
```

Create a diagnostic report for trusted operational handling, then select a
separate public presentation using the same reference:

```ts
const diagnostic = toDiagnosticReport(failure, {
  context: { requestId: 'req-123', operation: 'registerUser' },
});

const body = toPublicReport(diagnostic.reference, {
  code: 'ACCOUNT_ALREADY_EXISTS',
  message: 'An account with this email already exists.',
});
```

Public presentation never reads an error or diagnostic graph. It accepts a
nonempty occurrence reference and application-selected code/message/details.
The defaults are `INTERNAL_ERROR` and `Something went wrong`.

## Reporting contract

Diagnostic reports use `appex/diagnostic/v2`; public reports use
`appex/public/v2`. `decodeDiagnosticReport` detaches and validates an untrusted
diagnostic value, returns plain JSON, and rejects older or unknown versions. It
does not revive errors or validate a domain-specific details type.

Diagnostic stacks are omitted by default. Set `includeStack: true` only when a
trusted diagnostic destination needs one. The reporter skips user-defined stack
accessors. Explicit native stack formatting may run the runtime's
`Error.prepareStackTrace` hook; constructing an error and stack-free reporting
do not read `.stack`.

Normalization avoids getters, custom `toJSON`, Date overrides, and function-name
accessors. It redacts common credential keys and represents cycles, redactions,
unreadable values, non-JSON primitives, truncation, and unsupported collections
or binary objects with explicit `$appex` markers. Marker-shaped application
objects remain ordinary JSON data and are never revived or executed.

The default diagnostic limits are:

| Limit                        | Default | Supported range |
| ---------------------------- | ------: | --------------: |
| nesting depth                |       8 |            0–32 |
| normalized values            |   1,000 |        0–10,000 |
| entries per container        |      50 |         0–1,000 |
| string length (UTF-16 units) |   4,096 |        0–65,536 |
| serialized UTF-8 bytes       |  65,536 | 4,096–1,048,576 |

Keys longer than 4,096 UTF-16 units are omitted. Bigint decimal conversion has
a separate 4,096-digit magnitude ceiling. Decoder work is capped at depth 64,
100,000 JSON values, 100,000 descriptor inspections, 1 MiB, and 4,096-unit keys.
The reporter selects only bounded entries, but `Reflect.ownKeys` can still cost
time proportional to object width. Arbitrary proxy traps cannot have a hard
execution-time guarantee; project large live inputs into small owned summaries.

Only local instances created by the loaded module satisfy `isTypedException`.
Diagnostics can preserve bounded data metadata from another installed copy, but
that does not certify the foreign details shape. Use an application-owned decoder
or constructor check before treating details as a catalog type.

## Schemas and integrations

The package ships plain JSON Schemas for
[`appex/diagnostic/v2`](schemas/diagnostic-report-v2.json) and
[`appex/public/v2`](schemas/public-report-v2.json). They validate wire structure,
versions, allowed envelope fields, and truncation fields. Live-object traversal,
total work/byte limits, and JavaScript UTF-16 length rules are procedural checks;
JSON Schema `maxLength` counts Unicode code points. Schema validation therefore
does not replace `decodeDiagnosticReport` or establish a domain details type.

The [migration guide](docs/migration-to-typed-errors.md) lists every 0.2 break.
The [agent recovery guide](docs/agent-recovery.md) shows schema validation,
stable-code branching, selected public details, unknown-code escalation, and an
operation-owned retry budget. The repository has runnable examples for an
[application boundary](https://github.com/dany-fedorov/application-exception/blob/3c39993ed130d0c5fd7aca21e09a607c6772bd74/examples/account-registration-boundary.ts),
[agent recovery](https://github.com/dany-fedorov/application-exception/blob/3c39993ed130d0c5fd7aca21e09a607c6772bd74/examples/agent-recovery.ts),
and [Effect v3](https://github.com/dany-fedorov/application-exception/blob/3c39993ed130d0c5fd7aca21e09a607c6772bd74/examples/effect-integration.ts).
Effect remains optional and is not a production dependency.

## Development

```sh
npm ci
npm run test:all
npm run review:probe
npm run benchmark # optional, illustrative local measurements
```

See [CHANGELOG.md](CHANGELOG.md) for release notes and
[the resolved API/performance review](docs/reviews/2026-09-10-review-resolution.md)
for the evidence and known limits behind this release.
