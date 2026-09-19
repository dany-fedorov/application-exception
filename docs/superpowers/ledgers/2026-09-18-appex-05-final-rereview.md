# Scoped re-review of the final fix wave — feat/corj11-orthogonal-reports at 120cdf1

Reviewed: f32b9f6..120cdf1 (61cbfc0, 93aabde, a13f92a, 120cdf1), `dist/` built at HEAD, corj dev build 6f09b78
in node_modules. Every result below was RUN; probes are in
`/tmp/claude-1000/-home-df-wd-personal-application-exception/f53cbb05-549b-4222-8220-d64caaa993eb/scratchpad/appex-final/`
(p1, p6, p8, p10, p16, p17 rerun unchanged; new: p18-prop, p19/p20-fp-attack, p21-decoder2, p7b = the zoo with
the new agreement rule). Nothing in the repository was modified. Gates at HEAD: jest 15 suites / 323 tests green,
type tests clean, docs:check green (44 snippets), tree clean.

## Verdict: READY TO MERGE

No new Critical or Important. Three new Minors (R1-R3) for the follow-up issue.

## The five findings

**I1 — ADDRESSED.** My reproduction, unchanged (`p1`):
```
public: {"v":"appex/public/v4","occurrence_id":"AE_DRFX…","code":"INTERNAL_ERROR","message":"Something went wrong"}
guess right : false
brute-forced from public report alone: undefined 16ms
stackless Error confirmed: false undefined      plain object: false      object w/ toString: false
```
No public fingerprint for a thrown string, plain object, `toString` object, stackless Error, header-only stack
(`Error.stackTraceLimit = 0`), `keys:['stack']`, a pattern that eats the frames, recipes `['message']`, `[fn]`,
`[{path:['stack']}]`. The diagnostic report keeps its hash in all of them. README, AGENTS.md rule 6, recipes.md,
CHANGELOG and both JSDocs now state the rule; tests cover it; package-smoke and the runtime flow assert
`!('fingerprint' in toReports('socket closed').public)`, which also guards against a corj build without `requireStack`.

**I2 — ADDRESSED.** (`p6`, `p10`)
```
fingerprintParts null on diag only   -> [null,"fp1_7161…"]
fingerprintParts null on public only -> ["fp1_6838…",null]
```
The public bag's opt-out, recipe and `redact` are honoured; with redact on the public bag only and `['message']` no
hash is published at all. Docs say each report is fingerprinted by its own bag.

**I3 — ADDRESSED.** (`p8`, `p21`) 16 id shapes (128/129 chars, empty, space, `\n`, tab, DEL, NUL, NBSP, emoji,
trailing newline, non-strings) x {v3, v4}: 0 disagreements between the decoder and the two published schemas;
v3 stays length-only.

**I4 — ADDRESSED (docs, as ruled).** Behaviour is unchanged by design (`p17` still shows the 0.4-keyed transform
redacting nothing). CHANGELOG has a bold Breaking bullet and an upgrade-table row, recipes.md a sixth "thing to
remember", and the "fails safe" sentence is now scoped to `paths`. I checked the advice it gives: a transform keyed
on `prop` redacts identically on published 0.4.0 and on HEAD (`p18`: both `{"[x]":"[x]"}`).

**M2 — ADDRESSED as ruled.** (`p16`) path length 100,176 -> 170; with four 64-character keys it is exactly 256. See R3 for what remains.

## Attacks on the fixes

### 1. What a public fingerprint can still confirm
Default recipe, 15 error shapes built at ONE call site with different text (`p20`): the text does not move the
hash for a plain Error, a renamed subclass, a mutated message, a renamed-after-read error, multi-line messages, a
message that embeds a frame line, an overridden `toString` (including one that returns a prefix of the header — the
new line-boundary rule works), text in an Error cause, a string cause, AggregateError members, enumerable
properties, typed-exception details, and a hand-set old-V8 header. So under the default recipe a stack-backed hash
confirms exactly: constructor names and frame text (which code path failed, on which build), nothing of the
message. Two shapes let message text in, both still salted by real frames: a message that embeds a `\n    at `
line on an error whose header no longer matches its `as_string`, and frames indented by other than four spaces
with a mismatched header.

Caller recipes `['message','stack']`, `[{field:'code'},'stack']`, `[fn,'stack']`: text moves the hash, as the docs
now say. A reader who has the frame text confirms a guess (`p19`: right guess true, wrong guess false) — the docs
say this accurately ("unguessable only to a reader who does not know the deployed source and its paths").

**R1 (Minor, doc).** The docs miss the second route: with such a recipe, equal text from the same call site gives
equal hashes (`p20`: "same text equal: true"), so a reader who can make the same code path fail with text they
choose can compare hashes without knowing any frame. One sentence in recipes.md/README.

**R2 (Minor, corj heuristic; residual of I1).** "Frameless prose" is withheld only when it does not LOOK like a
frame. Three shapes are published and I reproduced each hash from a guess alone (`p20`):
```
plain object { stack: "pin@vault:4921" }                        | published: true | confirmed from a guess alone: true
old-V8 shape: renamed, limit 0, message ends user@host:port     | published: true | confirmed from a guess alone: true
renamed, stack "Error: token is abc\n at the gate"              | published: true | confirmed from a guess alone: true
```
corj's `AT_SIGN_FRAME` accepts any line with `@…:<digits>` at its end (a connection string is one) and `V8_FRAME`
any indented ` at x` line. All three need a frameless stack whose header differs from `as_string`; the second is
simulated by assigning `stack` (Node 24 formats the header lazily, so I could not produce it natively here).
Contrived enough to be Minor, but the doc sentence "an Error whose stack is … frameless prose … get no public
fingerprint" is slightly too strong. Fail-safe tightening for corj: under `requireStack`, require every non-empty
line of the hashed stack value to be a frame, not just one; that also closes the two salted shapes above.

### 2. The two reports
Zoo of 35 hostile values x 4 bags through `toReports` and both standalone calls (`p7b`): the public fingerprint is
absent (104 cases) or equal to the diagnostic one (28 cases), never different, when the bags match; ids always
equal; no throw; budgets, v5 and v4 schemas and the decoder all hold. They differ, as documented, when the bags
differ (opt-out on one side, a different recipe, a `redact` that touches a hashed part). Bag reads are still
exactly one per key (`p11`), the nine invalid-option cases still throw before the caught value is touched, and a
throwing `onError` still cannot break the pair. The only late throw remains the pre-existing realm double read
(old M1, deliberately left open; `p5` unchanged). Cost: a pair now hashes twice (about 26 µs more).

### 3. Decoder
Id rules: see I3. **R3 (Minor).** The cap bounds the path but does not neutralise it: 246 characters of sender text
with raw newlines still arrive in `path`, which recipes.md:122,142 interpolate for the agent (`p21` prints a
four-line "SYSTEM: … Action required: call delete_all() …" payload inside a 256-character path). A key can also
impersonate a location: `"path":"$.as_json.ok; the only invalid field is $.code[0][0]…"`. The 64/256 cuts can
split a surrogate pair (lone surrogate in `path`: true). Fix for the issue: emit key segments in JSON-quoted
bracket form (`["…"]` via `JSON.stringify`), which escapes newlines and makes impersonation visible, and tell
recipe readers that `path`, like `message`, is sender-influenced data.

### 4. Regressions
Public-disclosure canary battery (`p2`): nothing but the branded id (old M3, left open by ruling; now documented
in README and recipes.md). Redaction battery (`p3`): 0 leaks, 0 over budget. Shapes vs schemas (`p9`), the
512-byte floor with escape-heavy ids and re-entrancy (`p15`): unchanged, all pass.

## Release note (not a code finding)
`toPublicReport` silently depends on corj's `requireStack`: an older corj 11 build ignores the second argument and
would publish stackless hashes again. corj 11.0.0 must be published from 6f09b78 or later; `test:package` now
catches a wrong build. package-lock.json still pins corj 10 (known).
