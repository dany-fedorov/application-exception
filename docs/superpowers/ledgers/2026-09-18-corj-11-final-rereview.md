# Scoped re-review of the final-review fix wave: corj `feat/orthogonal-reports` at fea9095

Range 43bc11e..fea9095 (seven commits). Same rules as the first pass: probes only from the session scratchpad
(`p*.ts` reruns, new `r1.ts` .. `r5.ts`), run with `npx ts-node -T` against the repo's `src/`; nothing in the
repository was modified (`git status` clean, HEAD fea9095). The repo's own suite at HEAD: 31 suites, 1426 tests, green.

## Verdict

**Ready to merge.** F1, F2, F3, F5 and F6 are ADDRESSED. F4 is ADDRESSED for the case I reported and leaves its mirror
image open (N1, Minor, one line). No new Critical or Important breakage; every surface that held before still holds.

## Per finding, my own reproduction rerun against HEAD

| # | Verdict | Real output at fea9095 |
| --- | --- | --- |
| F1 | ADDRESSED | `p1.ts`: all seven cases `SAME` (paths-string `fp1_5d69b280...` for both secrets; paths-regex, path-entry, nested path-keyed transform, string-field path-keyed transform likewise). |
| F2 | ADDRESSED | `p12.ts`: 400 MB thrown string, default parts: `37 ms fp1_177e2d3f...` (was `RangeError: Invalid array length`). `p13.ts`: `new Error(140MB)` with `['constructor_name','message']`: report and `makeFingerprint` both `fp1_812d4e29...`. `p11.ts`: 100 MB message in the recipe 97 ms (was 2747), 100 MB headerless stack 102 ms (was 2514), 100 MB thrown string 31 ms (was 2518); no RSS spike. |
| F3 | ADDRESSED | `p19.ts`: no throw; the default handler prints `stage=other path=$ field=occurrence_id: occurrenceId must be 1 to 128 printable ASCII characters without spaces`. |
| F4 | ADDRESSED (mirror case open, see N1) | `p18.ts`: `["ids",0] -> occurrence_id undefined`, `["ids","0"] -> occurrence_id undefined`, `as_json {"ids":["[redacted]","public-1"]}`. |
| F5 | ADDRESSED | `p9.ts`: `bigint 1n vs 2n` differ, `NaN vs missing` differ, `field a vs path [a]` same. `{ path: ['a','0'] }` vs `{ path: ['a',0] }` still hash differently; see N3. |
| F6 | ADDRESSED | `r3.ts`: with `patterns`, `onError threw: Error: sink failed for Error: trap [redacted]`; with a throwing transform or a non-string transform, `onError threw: [redacted]`; no throw, no recursion (16 lines at most, terminates). |

## Attacks on the fixes

**(1) F1.** The entry's full path is used for both the `apply` context and the serializer base path (`index.ts`
`readEntry` returns it; `readFingerprintValue` passes it to both). Ran in `r1.ts`, all `same`, secret not visible in the
report: an array-index segment inside a path entry with rule `$.list[1].token`, the same with the index spelled `'1'`,
a rule on an array element inside a nested value (`$.details.items[0]`), a child node under `$.cause` with a two-segment
entry, an `errors[1]` child with an anchored RegExp, a path-aware transform on the exact leaf path of a three-segment
entry (string leaf and number leaf). Two ways a rule can still be dodged, both Minor: N1 and N2 below.

**(2) F2.** The cut is after scrubbing everywhere a string enters the hash (named parts, entry values, function
results, markers, and the root fallback's `as_string`). A secret straddling position 16,384 with a `patterns` rule:
`same` for `message`, a `{ field }`, a function part, the thrown-string fallback, and for the nested 16 KiB cap; two
strings that differ before the cut still differ. A cut can split a replacement (`[redac`), which carries nothing. The
guard in `computeFingerprint` wraps only value reading and hashing; configuration is validated in the constructor and
still throws there, and a throwing function part is still recorded individually before the guard sees anything. What
the guard can newly swallow is a part entry mutated after validation (first review S3), which is the caller breaking
its own frozen-list contract; recording that is the right outcome. `utf8()`: 4,000 random strings over the code units
`0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd, 0xffff, 0` plus eight special
cases (lone high, lone low, reversed pair, 64 lone highs, a high surrogate as the last unit at the 55/56 padding
boundary, a pair across it, a 12 M-unit astral string): 4,008 of 4,008 match `node:crypto`. Count pass and fill pass
share one iterator, so they cannot disagree. Throw or seconds: see (5); one slow input found, N4.

**(3) F3.** The record text is one of two constants; for a secret-bearing string, a number, a `string[]`, an object
with a secret `toString`, `null`, `''`, 129 characters, a symbol, a function, non-ASCII and an embedded newline, nothing
from the value appears in the report, the handler's records, the handler's first argument or the `console.warn` lines
(`quoted: false` for all eleven). Ordering: the call-value records are first, `occurrence_id` then `fingerprint`, ahead
of a throwing function source. An invalid value never "wins": the id came from `{ field: 'rid' }` and the fingerprint
from the parts every time; with both features off there is simply no field and both records are present. A valid value
still wins (`req-42`, `fp-x`). Wrong shapes still throw (`null`, `[]`, a string, a number, an unknown key). Re-entrancy:
a getter re-entering the same maker with its own invalid id leaves the outer list at its own two rows and the inner at
its own two. A policy whose transform throws turns the record into `[redacted]` and does not throw. Size with invalid
values plus a context at the 512 floor, full metadata: 511 (object) and 510 (array). Both arguments are now read once
(first review S2 closed for them).

**(4) F5.** Labels, from `resolveFingerprintParts` directly: `{field:'a'}` + `{path:['a']}` rejected as a repeat (also
when their `inspection` differs); `{field:'0'}` + `{path:['0']}` rejected; `{path:[0]}` is `path:[0]` and distinct;
`{path:['a',0]}` is `path:["a",0]`, `{path:['a','0']}` is `path:["a","0"]`; a field literally named `path:["a"]` is
`field:path:["a"]` and one named `path:["a","b"]` is `field:path:["a","b"]`, neither colliding with the real
`path:["a","b"]`; `field:fn:0` vs `fn:0` and `field:message` vs `message` stay distinct. No collision by construction.
Values: `1n` equals the literal string `"1n"` and `NaN` the string `"NaN"` (trivial, inherent to the ruling); `-0`
equals `0`; a transform that returns a bigint is handled.

**(5) Regressions.** None. Never-throw battery (`p4.ts`, 22,272 runs): 288 throws, all the known #217 signature, 0
others, no new slow case. Size fuzzer (`p6.ts`, 6,000 reports): 0 over budget, 0 lost fixed fields. `p5` (revoked
proxies in new paths): no throw. `p8`: 0 invocations under `no-invoke`. `p14`: shared-maker state and re-entrancy
unchanged, no secret anywhere. `p16`: 12 of 12 scrub-rule cases `same`. `p2`: 0 leaks. `p9`: `makeFingerprint` equals
the object and array reports across all eight option variations. New hostile inputs (`r5.ts`): revoked proxies and
all-traps-throw array proxies as hosts of index segments, and revoked proxies, throwing-`toString` objects and symbols
as call values: no throw.

## New findings (all Minor; none blocks the merge)

- **N1. Minor. The mirror of F4: a number segment on a plain object.** `src/index.ts` `segmentPath`: a `number` segment
  is always spelled `[n]`, while the serializer spells a plain object's numeric key `.0`. Ran:
  `{ path: ['map', 0] }` with rule `'$.map.0'` on `{ map: { 0: 'SECRET-ID' } }` gives
  `occurrence_id SECRET-ID | as_json {"map":{"0":"[redacted]"}}`, and the matching fingerprint pair `differ`. Same class
  and likelihood as F4 (the caller wrote both the rule and the odd spelling). Fix: start from `let isArray = false` and
  let `Array.isArray(host)` decide for both segment types. Path spelling is not hashed, so this is safe after release.
- **N2. Minor, documentation.** A function part's result is offered to the policy under the node's path, so
  `(c) => c.caught.details` with rule `$.details.token` still hashes the token (ran: `differ`). corj cannot know where a
  function's value came from; README's new "each value is offered under its own path" sentence should say it covers
  `{ field }` / `{ path }` entries and that a function part should return already-safe values or use an entry instead.
- **N3. Minor, documentation.** `{ path: ['a','0'] }` and `{ path: ['a',0] }` now read the same array element under the
  same policy path but keep different labels, so they are different recipes. Fine, but say so next to the
  one-segment rule.
- **N4. Minor.** `String(bigint)` is superlinear: a caught value carrying a 4,000,000-hex-digit bigint under a
  `{ field }` part costs 1,692 ms (1 ms with the part off; 306 ms at 1,000,000 digits). Absurd input and needs a recipe
  that names the field. If wanted, `raw.toString(16)` is linear, but it changes the `fp1` value mapping, so decide
  before release or leave it.
- **N5. Minor.** `{ occurrenceId: null }` is recorded as an invalid value on every call (ran). Elsewhere in this API
  `null` means "off"; treating `null` like `undefined` for the two call tokens would spare a reporting error and a
  `console.warn` line per report for callers that pass `req.id ?? null`.
