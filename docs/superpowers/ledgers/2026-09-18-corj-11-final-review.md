# Final adversarial review: corj `feat/orthogonal-reports` (HEAD 43bc11e, merge base 5ad780e)

Reviewer: session model (Fable), whole branch, adversarial. Nothing in the repository was modified, staged or
committed (`git status` clean after the review). Probes live in the session scratchpad (`p1.ts` .. `p19.ts`) and were
run with `npx ts-node -T` against the repo's `src/`. The repo's own suite is green at HEAD: 31 suites, 1405 tests.

## Verdict

**Fix first.** Two Important findings are confirmed by running, both in the fingerprint, and both have to land before
11.0.0 because each changes what `fp1_` hashes. Once `fp1` ships, changing the recipe means `fp2`. One Important design
finding (runtime call ids throw) is the owner's call. No Critical finding: I could not get protected text into a report
field, a record, a view, the context, an id, or the `console.warn` line.

---

## Confirmed by running

### F1. Important. `paths` rules (and any path-aware `transform`) are not applied to fingerprint part values

`src/index.ts:1548-1554` and `src/index.ts:1566-1574` (`fingerprintValue`).

A `{ field }` / `{ path }` part's value is sent through the policy with `path: node.path` instead of the path of the
value, and a nested value is serialized with `basePath: node.path`. So for the part `{ field: 'details' }` the serializer
asks the policy about `$.token`, never `$.details.token`. A `paths` rule that redacts the value in `as_json` does not
redact it in the hash input. The code comment at 1564-1565 acknowledges it ("keyed from the node's own path, which `keys`
rules - the common case - do not depend on"), but it never reached the ledger as a ruling, and the Task 7 re-review's
security answer ("no un-rewritten value reaches the hash input") is false for `paths`.

Two harms: (a) disclosure: the published hash depends on a value the policy hides, which is the same "confirmation
oracle" class that Task 7 ruled Important for numbers; application-exception publishes this hash to untrusted readers
(R14) and `{ field: 'details' }` with `paths: ['$.details.token']` is exactly the recipe/policy pair D9 advertises.
(b) soundness: a per-occurrence token moves the fingerprint on every occurrence, so grouping silently stops working.
It also falsifies README lines 741-742 and 762-763 ("every value a `fingerprintParts` entry reads", "a fingerprint is a
hash of values the policy has already seen").

Reproduction (`p1.ts`): error with `details = { tool, token: SECRET, inner: { token2: SECRET } }`, two secrets `AAA`/`BBB`:

```
paths-string  | as_json: {"details":{"tool":"grep","token":"[redacted]","inner":{"token2":"[redacted]"}}}
              | fpA fp1_dd986647e70a366d28bb2d9fe9a68fba fpB fp1_0a88e5573ac515d5b51b985309a29587  DIFFER
paths-regex-anchored (/^\$\.details\.(token|inner)$/)                                              DIFFER
path-entry ({ path: ['details','inner'] }, rule '$.details.inner.token2')                           DIFFER
transform-by-path (nested)                                                                          DIFFER
string field, transform keyed on c.path === '$.secretField' | as_json {"[x]":"[x]"}                  DIFFER
keys: ['token','token2']                                                                            SAME (ok)
```

Smallest fix (validated on a scratch copy of `src/`; all seven cases become SAME): in `fingerprintValue`, compute the
value's own path from the entry's segments (`.seg` for strings, `[n]` for numbers, starting at `node.path`), pass it as
`path` to `redactor.apply` and as `basePath` to the sorted serializer. Add the seven cases above as tests, plus one for a
child node (`$.cause.details.token`).

### F2. Important. The fingerprint's hash input is unbounded: `makeCorj` throws on default options, and costs ~28 ms and ~15 bytes of heap per input byte below that

`src/sha256.ts:22-57` (`utf8()` builds a `number[]`), `src/index.ts:1508-1514` and `1559` (string part values uncapped),
`src/index.ts:1691` and `1895` (`computeFingerprint` is not inside any guard).

This is the ledger's deferred Task 7 Minor ("aggregate hash input is unbounded ... `utf8()` builds a `number[]`"; "a
string part value is uncapped while nested values are capped at 16 KiB"). It is not Minor: it breaks the never-throw
guarantee with **default options**, and README line 613 ("Nothing the caught object does can make `makeCorj` throw").

Reproduction (`p12.ts`, `p13.ts`, `p11.ts`):

```
400MB thrown string, fingerprintParts=null (v10 behaviour)   225 ms   -> report
400MB thrown string, fingerprintParts=default                THROW RangeError: Invalid array length
129MB thrown string, default                                 THROW RangeError: Invalid array length
110MB thrown string, default                                 3256 ms  (ok, RSS about +1.5 GB transient)
new Error('upstream said: ' + 140MB), parts ['constructor_name','message']
   makeReportObject THROW RangeError: Invalid array length;  makeFingerprint THROW (same)
32MB headerless stack, default parts: 920 ms (87 ms with fingerprint off); 8MB message in recipe: 285 ms (47 ms off)
```

The default recipe is reachable three ways: a thrown string (the root fallback hashes `as_string`), a stack that does not
start with `as_string` and has no V8 frame line (used whole), and any recipe naming `message`/`as_string`/a string field.
`maker.makeFingerprint` throws the same way, which is the call application-exception's `toPublicReport` makes. Below the
throw threshold the memory amplification (a JS number per byte) can OOM-abort a small container, which no `try` catches.
10.0.0 returned a bounded report for all of these in well under a second.

Smallest fix, all three parts, before release because (1) changes the `fp1` recipe:
1. Cap every string part value at the same fixed 16,384 units the nested view already uses (hash the prefix); that bounds
   the input at nodes x parts x 16 KiB.
2. Have `utf8()` fill a `Uint8Array` (worst case 3 bytes per code unit, or two passes) instead of `number[]`.
3. Wrap the `computeFingerprint` call in `build` and in `makeFingerprint` in a guard that records
   `{ stage: 'other', path: '$', key: 'fingerprint' }` and omits the field, so no future input can throw out of a report.
Tests: a 200 MB thrown string returns a report with a fingerprint in bounded time; two strings equal in the first 16 KiB
collide by design (document it next to the nested-value sentence, README 505-506).

### F3. Important (design; owner's call). A runtime call id that fails the token pattern throws inside the caller's catch block

`src/index.ts:571-585` (`resolveCall`). Planned, tested and documented (README 657), so this is not a defect against the
plan. It is a hazard against the library's purpose: `occurrenceId` is per-occurrence runtime data and the README's own
example is a request id (`'req-42'`, lines 168-171, 431). A client that sends `x-request-id: req 42` makes `makeCorj`
throw from inside the `catch` that was reporting a different error, and the original error is lost. Spec D5 reads the
other way: "the call argument, then each source in order; the first valid id wins."

```
makeCorj(caught, undefined, { occurrenceId: 'req 42' })
-> TypeError: occurrenceId must be 1 to 128 printable ASCII characters without spaces
```

Smallest fix: keep throwing for a call input of the wrong shape (non-object, unknown key, non-string), but treat a
string that fails the pattern like any other source that yields nothing usable: record
`{ stage: 'other', path: '$', key: 'occurrence_id' }` (and `key: 'fingerprint'`), fall through to `occurrenceIdSources`
/ `fingerprintParts`. If the ruling stands, at least move the README example off a request id and say "validate or
sanitize before passing".

### F4. Minor. An array index spelled as a string in a `{ path }` entry slips past a `paths` skip rule

`src/index.ts:876-878` (`readEntry`). The path the policy is asked about is `.seg` or `[n]` by the segment's JavaScript
type, while the serializer decides by `Array.isArray(host)`. `{ path: ['ids', '0'] }` asks about `$.ids.0`; the rule
`'$.ids[0]'`, which redacts that element in `as_json`, does not match; and an occurrence id bypasses scrub rules by
design, so the value is emitted raw.

```
["ids",0]   -> occurrence_id undefined     | as_json {"ids":["[redacted]","public-1"]}
["ids","0"] -> occurrence_id SECRET-ID-0   | as_json {"ids":["[redacted]","public-1"]}
```

Needs the caller to write both the rule and the odd spelling, hence Minor. Fix: in `readEntry` (and in the F1 path
computation) use `[n]` when the host is an array and the segment is a canonical index (guard `Array.isArray` with a
`try`: it throws on a revoked proxy). This also covers the deferred Task 6 Minor "deep-segment skip-rule cases untested".

### F5. Minor. Fingerprint value mapping: top-level `bigint` collapses to `null`, equivalent entries hash differently

`src/index.ts:1559-1562`, `src/fingerprint.ts:53-56`. Ran in `p9.ts`:
- `{ field: 'a' }` with `1n` vs `2n`: **same** fingerprint (top-level bigint -> `null`), while nested `{ v: 1n }` vs
  `{ v: 2n }` differ (the serializer converts). Same for `NaN` vs missing. Fix: `typeof raw === 'bigint'` -> `String(raw)`
  or `Number(raw)`, matching the nested rule. Recipe-affecting, so do it with F1/F2 or not at all in `fp1`.
- `{ field: 'a' }` vs `{ path: ['a'] }`, and `{ path: ['a','0'] }` vs `{ path: ['a',0] }`, read the same value and hash
  differently because the label differs. Spec A2 calls `{ field }` "the one-segment case". Either canonicalize the label
  (`path:["a"]` for both) now, or document that the two spellings are different recipes.

### F6. Minor (pre-existing, cheap). The `onError threw:` line is the one `console.warn` text that is not scrubbed

`src/index.ts:672-674`. Unchanged from 10.0.0, but every other line now goes through the policy. A handler that throws
`new Error('sink failed for ' + caught.message)` prints the message raw. One-line fix: run `describeValue(failure)`
through `ctx.redactor.text(..., { stage: 'warning', path: context.path })` when a redactor exists.

## Suspected by reading (not reproduced)

- S1. Minor. `src/index.ts:1785-1789`: if the *second* `omit` pass throws after the limiter has fitted the report,
  `markFullVersion` lengthens `v` by 5 characters after measurement. `omitExpectedValues` is pure over plain data, so I
  found no input that reaches it.
- S2. Minor. `src/index.ts:571` then `1627`/`1598`: `call.occurrenceId` and `call.fingerprint` are validated from one
  read and used from a second. Only a getter-backed call object (the caller's own) can exploit it. `context` is read once.
- S3. Minor. Source and part entries are validated but only the list is frozen (`index.ts:445`, `544`); a caller that
  mutates an entry object afterwards changes reads (not labels). Deferred in the ledger already; clone-and-freeze each
  entry is two lines.
- S4. Minor. A view's values reach `transform` with `key: 'as_json'` even at `$context` (`index.ts:1340`, `1259`);
  `CorjReportKey` has `'context'`. A transform gated on `key === 'context'` never fires. `path` does tell the documents
  apart, as D3 promises, so this is a documentation point.
- S5. Minor. A `context` with no JSON form (a function, a symbol) becomes `context: null` with no reporting error, which
  the field's doc describes as "producing it failed". Reader cannot tell the two apart.

## Attack surfaces that held

1. **Redaction leaks**: held except F1/F4. Tried (`p2`, `p3`, `p14`, `p16`): throwing getters with the secret straddling
   the 256 cut; thrown non-Errors with secret `toString`; secret property NAMES on the caught value and on the context;
   transforms that throw always / only at `warning` / `as_json` / `prop-access` / `as_string`, return objects, return
   `undefined`; `keys`, `paths` (`$context.user.email`), `patterns` on context objects, string contexts, `makeJson` at
   `$context` vs `$other`; handler records and the default `console.warn` line; ids from `{ field }` / `{ path }` under
   `keys` rules, with spaces, 129 chars, non-ASCII, trailing newline (all rejected); fingerprint inputs for strings,
   numbers, nested values and keys, function parts returning strings/numbers/nested/arrays, the thrown-primitive
   fallback, a throwing transform. Policy failures are fail-closed (`[redacted]` for `error`, `path`, `prop`).
2. **Never-throw**: held except F2 and the known #217. 22,272 runs (`p4`): 40 hostile values (all-traps-throw proxies over
   object/Error/function, revoked proxies, prototype getters for `constructor`/`name`/`message`/`stack`/`toString`/
   `toJSON`, `Symbol.toPrimitive`, non-string `toString`, null-prototype, frozen, cyclic, 20,000-deep, 200,000-wide,
   5,000-deep cause chain, lying `ownKeys`/descriptor proxies, a proxy that returns proxies) x both inspections x parts
   on/off x sources on/off x 4 policies x budgets 512/100000/null x object, array, context, nested context, `makeJson`,
   `makeFingerprint`. All 288 throws are #217 (`Array.isArray` at `index.ts:970`; note it also fires for a revoked proxy
   as `errors`, not only `cause`). Revoked proxies as `{ field }` values, function-part results, transform results and
   context members (`p5`): no throw.
3. **Size guarantee**: held. 6,000 fuzzed reports (`p6`): both shapes, both units, budgets 512..20000, 128-char id,
   64-char fingerprint, contexts to 30 KB with 2/3/4-byte characters, lone surrogates and control characters, 8 reporting
   errors whose 256-cut splits a surrogate pair, `metadata` all four ways, `omitExpectedValues` both, custom ids to 600
   emoji, 384-byte replacement, 30 children: 0 over budget, 0 lost fixed fields. Worst minimal report measured 487/512.
4. **`no-invoke`**: held. Instrumented getters, `toJSON`, `toString`, `Symbol.toPrimitive` and `get`/`has` traps on the
   caught value, the context, a nested context member, `makeJson` (bounded and `maxSize: null`), `makeFingerprint`, with
   ten parts and four sources: 0 invocations with and without a policy; 6 only with a per-entry `inspection: 'default'`.
5. **State across calls**: held (`p14`). A getter re-entering the same maker (report + view) leaves the outer list intact;
   the next call on the shared maker is clean; a handler that mutates its record does not change the report row; a
   handler re-entering during a policy failure gets `[redacted]`; the `failing` flag resets.
6. **Fingerprint soundness**: held except F1/F5. Differ as they should: value sliding between slots, `"1"`/`1`,
   `null`/`"null"`, `true`/`"true"`, `[1]`/`"[1]"`, thrown `"a"`/`"b"`, `1`/`"1"`, `null`/`"null"`. Match as they
   should: key order (nested), parts order, varying message under default parts (renamed class, multi-line message),
   and `makeFingerprint` == object report == array report across `maxReportSize` 512/null, `stackFormat`,
   `omitExpectedValues`, `metadata`, `reportSizeUnit`, `maxContextSize`, `inspection`. Bundled SHA-256 matches
   `node:crypto` on 1,200 Unicode strings across block boundaries and a 7 MB input.
7. **API and docs**: exports match the spec (`CorjRedactor`, `CaughtObjectReportJson`, `CaughtObjectReportJsonChild`,
   `CorjMakerOptions` gone; the four deprecated aliases present; all new types exported). README statements found false:
   lines 741-742 and 762-763 (F1), line 613 (F2); line 429 "the first valid one wins" sits oddly with 657 (F3).
   `makeJson` roots and `maxSize` validate as documented; numeric `maxSize` under `maxReportSize: null` works (300 -> 300).

## Deferred Minors: triage

Promote, fix before merge:
- Task 7 "aggregate hash input is unbounded; `utf8()` builds a `number[]`" and "a string part value is uncapped while
  nested values are capped at 16 KiB" -> this is F2.
- Task 6 "deep-segment skip-rule/inspection cases of `readEntry` untested" -> write them with the F1/F4 fix; F4 is what
  they would have caught.

Worth doing in the same pass because they are recipe- or policy-adjacent and one or two lines each: F5 (bigint, label
canonicalization), F6 (scrub the `onError threw` line), S3 (freeze entries).

Leave deferred (none is a release risk): type-level-only tests and the type-only import cycle (Task 1); self-referential
assertions (Task 2); test-name overclaim, `StringifyConfig` comment, `errors as` cast, view drops `format`, redact-stage
record path is the replacement (weighed: fail-closed is right, the property-name case is real), numeric `maxSize` pin
(Task 3); view-node literal, `reportSizeUnit` doc (Task 4); budgets list, hardcoded strings (Task 5); `{ auto, extra }`
message, vestigial `autoAt`, duplicated predicate (Task 6); labels ignore `inspection`, `index.ts` size,
stage-conditional transforms vs the prefix cut, named parts processed under their own key (Task 7); non-root rows not
asserted in the fuzz (Task 8); schema positive test, prettier on schemas, flag order, examples (Task 9).
