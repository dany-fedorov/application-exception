# Errors thrown by application-exception

Every error is a `TypeError` with an enumerable `code` and a message of the
form `<CODE>: <text>; see <this file>#<code>`. They signal a wrong call, not a
runtime failure of your application: fix the call site instead of catching them.
Errors from accepted options in the `corj` bag (`maxDepth`, `maxChildren`,
`stackFormat`, `metadata`, `fingerprintParts`, and the other audience-specific
CORJ options) propagate unchanged as corj's `TypeError` or `RangeError`: corj
validates them when the maker is built, and its message names the option. This
package rejects only what is its own: an unknown key, a `corj` that is not an
object, unsupported nested keys, and the `occurrenceId`, `maxReportBytes`,
`redact`, and `policyOverride` options
below.

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

When: `defineException` receives a `public` policy that is not an object, has an unknown key, whose `code` is not a nonempty string of at most 128 units, whose `message` is neither a string nor a function, or whose `detailsSelector` is not a function.
Cause: a missing `code`, a legacy `details` key, or `detailsSelector` given as an object instead of a selector.
Fix: declare `code`, an optional `message`, and an optional `detailsSelector` function.

```ts
import { defineException } from 'application-exception';
defineException({
  tag: 'tools/Failed',
  message: ({ tool }: { tool: string }) => `${tool} failed`,
  public: { code: 'TOOL_FAILED', message: 'The tool failed.', detailsSelector: ({ tool }) => ({ tool }) },
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

When: `makeDiagnosticReport`, `makePublicReport` or `makeReportPair` receives options that are not an object (or an array), that contain an unknown key, that put a reserved size/redaction key inside `corj`, whose `maxReportBytes` is invalid, or whose `policyOverride.detailsSelector` is neither a selector function nor `null`. The message lists the known keys.
Cause and fix, per case:

| Cause | Fix |
| --- | --- |
| a typo such as `contxt` | use only the listed keys |
| `maxDepth`, `maxChildren`, `stackFormat`, or another accepted CORJ option at the top level | move it into the `corj` bag: `{ corj: { maxDepth: 2 } }` |
| `corj.maxReportSize` or `corj.reportSizeUnit` | move the total limit to top-level `maxReportBytes`; application-exception always counts UTF-8 bytes |
| `corj: { redact }` | pass the policy as the top-level `redact`, which both reports share; one policy, one meaning, in both reports |
| the old per-call `code`, `message`, `details`, or `public` bag of `makePublicReport` | move them into `policyOverride: { code, message, detailsSelector }` |
| `policyOverride: { detailsSelector: <object> }` | `detailsSelector` is a function of the kind's details, or `null` to disclose nothing |
| `maxReportBytes` below 512 (diagnostic) or 2,048 (public), non-integral, or unsafe | pass a safe integer at or above the audience minimum, omit it for the default, or pass `null` to disable the total cap |

```ts
import { makeDiagnosticReport, makePublicReport } from 'application-exception';
makeDiagnosticReport(new Error('x'), { context: { runId: 'r' }, corj: { maxDepth: 2 } });
makePublicReport(new Error('x'), { policyOverride: { code: 'X', message: 'x', detailsSelector: () => ({ a: 1 }) } });
```

## APPEX_INVALID_OCCURRENCE_ID

When: `options.occurrenceId` is not 1 to 128 printable ASCII characters without spaces — `/^[\x21-\x7e]{1,128}$/`, so no space, no control character, nothing outside ASCII.
Cause: passing an empty string, a non-string identifier, or text with a space or a non-ASCII character. The rule is what keeps the id a bounded correlation token: it bypasses redaction and is never trimmed, so it has to be small and printable.
Fix: omit `occurrenceId` (the occurrence id of the exception or a memoized `AE_` id is used) or pass a bounded ASCII string. `makeDiagnosticReport` and `makePublicReport` validate this option before they build a corj maker, so you see this coded error rather than corj's plain `TypeError`; `makeReportPair` resolves both option bags first, so an invalid corj option there is reported before an invalid `occurrenceId`.

```ts
import { makePublicReport } from 'application-exception';
makePublicReport('thrown text', { occurrenceId: 'trace-42' });
```

## APPEX_INVALID_PUBLIC_CODE

When: `makePublicReport` or `makeReportPair` receives `policyOverride.code` that is not a nonempty string of at most 128 units.
Cause: an empty code or a number.
Fix: pass an upper-case identifier, or omit `code` to use the kind's policy.

```ts
import { makePublicReport } from 'application-exception';
makePublicReport(new Error('x'), { policyOverride: { code: 'SEARCH_UNAVAILABLE' } });
```

## APPEX_INVALID_PUBLIC_MESSAGE

When: `makePublicReport` or `makeReportPair` receives a `policyOverride.message` that is neither a string nor a function of the details.
Cause: passing an Error, a number, or an object as the message.
Fix: pass display text, or a function of the kind's details that returns display text, or omit `message` to use the kind's policy.

```ts
import { makePublicReport } from 'application-exception';
makePublicReport(new Error('x'), { policyOverride: { message: 'Search is temporarily unavailable.' } });
```

## APPEX_INVALID_TRUST_REALM

When: a `realm` passed to `defineException`, `isTypedException`, `makePublicReport`, or `makeReportPair` is not a realm this copy can speak to.
Cause: a value that did not come from `makeTrustRealm`, a realm built by a copy on a different realm protocol, or an object claiming the protocol without its methods. The message names both protocols.
Fix: create the realm once with `makeTrustRealm()` and pass that same object to every cooperating copy; align the package versions when the protocols differ. Omit `realm` to keep each copy isolated.

```ts
import { makeTrustRealm, defineException, makePublicReport } from 'application-exception';
const realm = makeTrustRealm();
const Timeout = defineException({ tag: 'db/Timeout', message: 'Timed out', public: { code: 'DB_TIMEOUT' }, realm });
makePublicReport(new Timeout(), { realm });
```

## APPEX_INVALID_REDACTION_POLICY

When: `makeRedactionPolicy` is given malformed options, or a `redact` option is not a policy it produced.
Cause: a `patterns` entry without the `g` flag (a non-global pattern would replace only its first match), `keys` or `paths` holding something other than strings and regular expressions, `patterns` holding a non-regular-expression, a `replacement` that is not a string of at most 128 characters, a `transform` that is not a function or `null`, an unknown option key, or a hand-built object passed as `redact`.
Fix: give every pattern the `g` flag, keep the options to `keys`, `paths`, `patterns`, `replacement` and `transform`, and build the policy once with `makeRedactionPolicy` and share that object between reports.

```ts
import { makeRedactionPolicy, makeDiagnosticReport } from 'application-exception';
const redact = makeRedactionPolicy({ keys: ['password', /token$/i], patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g] });
makeDiagnosticReport(new Error('x'), { redact });
```
