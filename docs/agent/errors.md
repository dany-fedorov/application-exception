# Errors thrown by application-exception

Every error is a `TypeError` with an enumerable `code` and a message of the
form `<CODE>: <text>; see <this file>#<code>`. They signal a wrong call, not a
runtime failure of your application: fix the call site instead of catching them.
Errors from the options in the `corj` bag (`maxDepth`, `maxChildren`,
`maxReportSize`, `stackFormat`, `metadata`, `fingerprintParts`, and every other
corj option) propagate unchanged as corj's `TypeError` or `RangeError`: corj
validates them when the maker is built, and its message names the option. This
package rejects only what is its own: an unknown key, `corj.redact`, and the
`occurrenceId`, `redact` and `public` options below.

## APPEX_INVALID_TAG

When: `defineException` receives a `tag` that is not a nonempty string of at most 128 UTF-16 units.
Cause: an empty or whitespace-only tag, a very long tag, or a non-string.
Fix: use a short, stable, path-like tag.

```ts
import { defineException } from 'application-exception';
defineException({ tag: 'tools/Unavailable', message: 'Unavailable' });
```

## APPEX_INVALID_MESSAGE

When: `defineException` receives a `message` that is neither a string nor a function.
Cause: a template object, `undefined`, or a number.
Fix: pass a constant string, or a function of the details that returns a string.

```ts
import { defineException } from 'application-exception';
defineException({ tag: 'tools/Failed', message: ({ tool }: { tool: string }) => `${tool} failed` });
```

## APPEX_INVALID_ID_PREFIX

When: `defineException` receives an `idPrefix` that is not 1 to 32 printable ASCII characters without spaces — `/^[\x21-\x7e]{1,32}$/`, so no space, no control character, nothing outside ASCII.
Cause: an empty prefix, a very long one, or one with a space or a non-ASCII character. The prefix is the head of every occurrence id, which must itself stay a printable ASCII token.
Fix: omit `idPrefix` (ids start with `AE_`) or pass a short one.

```ts
import { defineException } from 'application-exception';
defineException({ tag: 'tools/Failed', message: 'failed', idPrefix: 'TOOL_' });
```

## APPEX_INVALID_PUBLIC_POLICY

When: `defineException` receives a `public` policy that is not an object, whose `code` is not a nonempty string of at most 128 units, whose `message` is neither a string nor a function, or whose `details` is not a function.
Cause: a missing `code`, or `details` given as an object instead of a selector.
Fix: declare `code`, an optional `message`, and an optional `details` function.

```ts
import { defineException } from 'application-exception';
defineException({
  tag: 'tools/Failed',
  message: ({ tool }: { tool: string }) => `${tool} failed`,
  public: { code: 'TOOL_FAILED', message: 'The tool failed.', details: ({ tool }) => ({ tool }) },
});
```

## APPEX_INVALID_DETAILS

When: a kind is constructed with details that are not a data-only record.
Cause: `null`, an array, a class instance with methods, a getter, a function-valued field, a non-enumerable field, more than 1,000 keys, more than 32 prototype levels, or a proxy that throws. Under `snapshotDetails: true` it also covers nested content a snapshot cannot capture: a cycle, a function, an accessor, a non-enumerable property, a class instance or other exotic object, an invalid `Date`, an array with extra own properties, nesting past 32 levels, or more than 10,000 values. A non-boolean `snapshotDetails` is rejected when the kind is defined.
Fix: pass a plain object of data; convert instances with a projection first. The message names the offending path, such as `details.session.token`.

```ts
import { defineException } from 'application-exception';
const Failed = defineException({ tag: 'tools/Failed', message: ({ tool }: { tool: string }) => `${tool} failed` });
const instance = new Date(0);
new Failed({ details: { tool: `job-${instance.toISOString()}` } });
```

## APPEX_INVALID_CAUSES

When: a kind is constructed with both `cause` and `causes`, or with a `causes` that is not an array.
Cause: mixing the single and multiple forms.
Fix: pass one of them. Two or more causes become an `AggregateError`; a
single-element list is installed directly; an empty list installs nothing.

```ts
import { defineException } from 'application-exception';
const Failed = defineException({ tag: 'tools/Failed', message: 'failed' });
new Failed({ causes: [new Error('primary down'), new Error('fallback down')] });
```

## APPEX_INVALID_OPTIONS

When: `toDiagnosticReport`, `toPublicReport` or `toReports` receives options that are not an object (or an array), that contain an unknown key, that put `redact` inside `corj`, or whose `public.details` is neither a selector function nor `null`. The message lists the known keys.
Cause and fix, per case:

| Cause | Fix |
| --- | --- |
| a typo such as `contxt` | use only the listed keys |
| a corj option at the top level: `maxReportSize`, `maxFinalReportSize`, `maxDepth`, `maxChildren`, `stackFormat`, `includeStack` | move it into the `corj` bag: `{ corj: { maxDepth: 2 } }`. `maxFinalReportSize` is gone; `corj: { maxReportSize }` bounds the whole report |
| `corj: { redact }` | pass the policy as the top-level `redact`, which both reports share; one policy, one meaning, in both reports |
| the old per-call `code`, `message` or `details` of `toPublicReport` | move them into one `public` bag: `{ public: { code, message, details } }` |
| `public: { details: <object> }` | `details` is a selector function of the kind's details, or `null` to disclose nothing |

```ts
import { toDiagnosticReport, toPublicReport } from 'application-exception';
toDiagnosticReport(new Error('x'), { context: { runId: 'r' }, corj: { maxDepth: 2 } });
toPublicReport(new Error('x'), { public: { code: 'X', message: 'x', details: () => ({ a: 1 }) } });
```

## APPEX_INVALID_OCCURRENCE_ID

When: `options.occurrenceId` is not 1 to 128 printable ASCII characters without spaces — `/^[\x21-\x7e]{1,128}$/`, so no space, no control character, nothing outside ASCII.
Cause: passing an empty string, a non-string identifier, or text with a space or a non-ASCII character. The rule is what keeps the id a bounded correlation token: it bypasses redaction and is never trimmed, so it has to be small and printable.
Fix: omit `occurrenceId` (the occurrence id of the exception or a memoized `AE_` id is used) or pass a bounded ASCII string. This package validates its own option first, so you see this coded error rather than corj's plain `TypeError`.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport('thrown text', { occurrenceId: 'trace-42' });
```

## APPEX_INVALID_PUBLIC_CODE

When: `toPublicReport` or `toReports` receives `public.code` that is not a nonempty string of at most 128 units.
Cause: an empty code or a number.
Fix: pass an upper-case identifier, or omit `code` to use the kind's policy.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport(new Error('x'), { public: { code: 'SEARCH_UNAVAILABLE' } });
```

## APPEX_INVALID_PUBLIC_MESSAGE

When: `toPublicReport` or `toReports` receives a `public.message` that is neither a string nor a function of the details.
Cause: passing an Error, a number, or an object as the message.
Fix: pass display text, or a function of the kind's details that returns display text, or omit `message` to use the kind's policy.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport(new Error('x'), { public: { message: 'Search is temporarily unavailable.' } });
```

## APPEX_INVALID_TRUST_REALM

When: a `realm` passed to `defineException`, `isTypedException`, `toPublicReport`, or `toReports` is not a realm this copy can speak to.
Cause: a value that did not come from `createTrustRealm`, a realm built by a copy on a different realm protocol, or an object claiming the protocol without its methods. The message names both protocols.
Fix: create the realm once with `createTrustRealm()` and pass that same object to every cooperating copy; align the package versions when the protocols differ. Omit `realm` to keep each copy isolated.

```ts
import { createTrustRealm, defineException, toPublicReport } from 'application-exception';
const realm = createTrustRealm();
const Timeout = defineException({ tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm });
toPublicReport(new Timeout(), { realm });
```

## APPEX_INVALID_REDACTION_POLICY

When: `createRedactionPolicy` is given malformed options, or a `redact` option is not a policy it produced.
Cause: a `patterns` entry without the `g` flag (a non-global pattern would replace only its first match), `keys` or `paths` holding something other than strings and regular expressions, `patterns` holding a non-regular-expression, a `replacement` that is not a string of at most 128 characters, a `transform` that is not a function or `null`, an unknown option key, or a hand-built object passed as `redact`.
Fix: give every pattern the `g` flag, keep the options to `keys`, `paths`, `patterns`, `replacement` and `transform`, and build the policy once with `createRedactionPolicy` and share that object between reports.

```ts
import { createRedactionPolicy, toDiagnosticReport } from 'application-exception';
const redact = createRedactionPolicy({ keys: ['password', /token$/i], patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g] });
toDiagnosticReport(new Error('x'), { redact });
```
