# Errors thrown by application-exception

Every error is a `TypeError` with an enumerable `code` and a message of the
form `<CODE>: <text>; see <this file>#<code>`. They signal a wrong call, not a
runtime failure of your application: fix the call site instead of catching them.
Errors from corj options (`maxDepth`, `maxChildren`, `maxReportSize`,
`stackFormat`) propagate unchanged as corj's `TypeError` or `RangeError`.

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

When: `defineException` receives an `idPrefix` that is not a nonempty string of at most 32 UTF-16 units.
Cause: an empty prefix or a very long one.
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
Cause: `null`, an array, a class instance with methods, a getter, a function-valued field, a non-enumerable field, more than 1,000 keys, more than 32 prototype levels, or a proxy that throws.
Fix: pass a plain object of data; convert instances with a projection first.

```ts
import { defineException } from 'application-exception';
const Failed = defineException({ tag: 'tools/Failed', message: ({ tool }: { tool: string }) => `${tool} failed` });
const instance = new Date(0);
new Failed({ details: { tool: `job-${instance.toISOString()}` } });
```

## APPEX_INVALID_CAUSES

When: a kind is constructed with both `cause` and `causes`, or with a `causes` that is not an array.
Cause: mixing the single and multiple forms.
Fix: pass one of them. Several causes become an `AggregateError`.

```ts
import { defineException } from 'application-exception';
const Failed = defineException({ tag: 'tools/Failed', message: 'failed' });
new Failed({ causes: [new Error('primary down'), new Error('fallback down')] });
```

## APPEX_INVALID_OPTIONS

When: `toDiagnosticReport` or `toPublicReport` receives options that are not a plain object, or that contain an unknown key. The message lists the known keys.
Cause: a typo such as `maxDepht`, or an option from an older version such as `redactKeys`, `limits`, or `includeStack`.
Fix: use only the listed keys.

```ts
import { toDiagnosticReport, toPublicReport } from 'application-exception';
toDiagnosticReport(new Error('x'), { context: { runId: 'r' }, maxDepth: 2 });
toPublicReport(new Error('x'), { code: 'X', message: 'x', details: { a: 1 } });
```

## APPEX_INVALID_REFERENCE

When: `options.reference` is not a nonempty string of at most 128 UTF-16 units.
Cause: passing an empty string or a non-string identifier.
Fix: omit `reference` (the occurrence id or a memoized `AE_` id is used) or pass a bounded string.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport('thrown text', { reference: 'trace-42' });
```

## APPEX_INVALID_PUBLIC_CODE

When: `toPublicReport` receives `options.code` that is not a nonempty string of at most 128 units.
Cause: an empty code or a number.
Fix: pass an upper-case identifier, or omit `code` to use the kind's policy.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport(new Error('x'), { code: 'SEARCH_UNAVAILABLE' });
```

## APPEX_INVALID_PUBLIC_MESSAGE

When: `toPublicReport` receives `options.message` that is not a string.
Cause: passing an Error or a function as the message.
Fix: pass display text, or omit `message` to use the kind's policy.

```ts
import { toPublicReport } from 'application-exception';
toPublicReport(new Error('x'), { message: 'Search is temporarily unavailable.' });
```
