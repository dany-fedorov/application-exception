# The public fingerprint — when it is published and why

Status: **implemented** in 0.5.0 and later; the public report format is
`appex/public/v4`.

## The rule in one minute

Both reports carry `fingerprint`: corj's `fp1_` hash of the error graph's
identifying parts, by default the constructor name and the stack text of every
node. Equal fingerprints mean the same failure from the same place. An agent
uses it as a retry signal: equal to the previous failure's means retrying the
same way will fail the same way. It is not a lookup key; `occurrence_id` is
what identifies one failure.

**A public report carries a fingerprint only when the hash is backed by real
stack frames.** Three conditions must hold:

1. the recipe (`corj: { fingerprintParts }`) includes `'stack'`;
2. the root's stack was read;
3. after redaction and the header cut, the stack still holds frames.

When any of them fails, the public report has no `fingerprint` and the
diagnostic report keeps its own. The usage recipe is in
[../agent/recipes.md](../agent/recipes.md#stop-a-retry-loop-on-a-repeated-failure);
the rest of this page is why the rule is shaped this way.

## What gets no public fingerprint

- A thrown string, number, or other primitive.
- A plain object, or an object with a `toString` but no stack.
- An `Error` whose `stack` was deleted, or whose stack is frameless prose.
- Any recipe without `'stack'`: `corj: { fingerprintParts: ['message'] }` included.
- Any call with `corj: { fingerprintParts: null }`, which turns hashing off for
  that report.

In every one of those cases the only material a hash could cover is the
value's own text. Publishing such a hash lets a reader who can guess the text
confirm the guess: hash the candidate, compare, done. Stack frames add input
the reader does not have, so a stack-backed hash cannot be reversed that way.

## What a stack-backed hash still reveals

A stack-backed hash covers every other part of the recipe too. Adding
`'message'` to the public bag's recipe puts the message text into the hash next
to the frames. Frame text does not prevent a **chosen-call comparison**: a
reader who can trigger the same failure site with candidate sensitive input can
compare the resulting hashes with the one they were given, and confirm a guess
without ever knowing the frames.

So the default recipe is not a safety guarantee on its own. If the recipe
includes sensitive text:

- exclude the sensitive parts from the recipe;
- redact their inputs with a `makeRedactionPolicy` passed as `redact` (every
  value a `fingerprintParts` entry reads goes through the policy first; see
  [redaction-policy.md](redaction-policy.md)); or
- withhold the public hash with `public: { corj: { fingerprintParts: null } }`
  on `makeReportPair`, or the same option on `makePublicReport`.

The default recipe hashes constructor names and stack text. Whether message
text is in it depends on the `fingerprintParts` configured for the public call,
so assess the parts and the redaction of that call, not the diagnostic one.

## Each report hashes with its own bag

`makeReportPair` computes each report's fingerprint from its own option bag.
The two agree whenever both bags carry the same `corj` options and the same
`redact`. They differ, on purpose, when the caller gives the public bag a
narrower recipe or a stricter policy: the operator keeps the full hash, and the
agent gets one computed only from what the public call was allowed to read.

## Why a `v3` report has none

`appex/public/v3`, emitted by 0.4.x, predates the field. `decodePublicReport`
accepts it and returns a report without `fingerprint`; the retry recipe treats
an absent fingerprint as "no signal", so it retries within its budget rather
than refusing.

## History

- 0.4.0 published the diagnostic fingerprint only.
- 0.5.0 added `fingerprint` to the public report, computed by the public bag
  and never from a value's own text (commit `61cbfc0`).
- 0.8.0 documented chosen-call comparisons against recipes that include
  sensitive text, and the three options above.
