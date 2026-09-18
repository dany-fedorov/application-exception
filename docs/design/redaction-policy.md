# Redaction policy — decision record (issue #43)

Status: **implemented** as `createRedactionPolicy`, applied by
`caught-object-report-json` while it inspects the caught value.

## The rules in one minute

A policy has two kinds of rule. **Skip** rules name properties that are never
read; **scrub** rules rewrite text wherever it appears.

| Rule | Kind | Reach |
| --- | --- | --- |
| `keys` | skip | a property name, in the caught value, `context`, and selected public details |
| `paths` | skip | one property of the caught value; never `context` or public details |
| `patterns` | scrub | every emitted string and property name, in both reports; each needs the `g` flag |
| `transform` | scrub | every emitted value, last; `undefined` drops the field |
| `replacement` | — | what skipped and scrubbed content becomes, inserted literally |

Skipping a property does not remove its text elsewhere — an error's message is
also in its `stack` — so removing a secret's *text* is a job for `patterns`.
Redaction never discloses: on a public report it runs on what the kind's
`details` selector returned. How to use it is in
[../agent/recipes.md](../agent/recipes.md#keep-secrets-out-of-both-reports); the
rest of this page is why it is built this way.

## History, in two sentences

An unreleased 0.4.0 draft applied redaction as a post-production walk over the
already produced report, because corj had no mechanism of its own. corj 10.0.0
(format `corj/v0.13`) ships that mechanism, so the walk was deleted before
0.4.0 was ever published — and with it a bug where `replacement: '<$&>'` was
handed to `String.prototype.replace` and re-inserted the match it was supposed
to remove.

## corj owns the mechanism

[#43](https://github.com/dany-fedorov/application-exception/issues/43) says to
avoid duplicating corj's traversal. It is not duplicated: `new CorjMaker({
redact })` consults `keys` and `paths` *before* reading a property, and applies
`patterns` and then `transform` to every value it emits. `src/redaction.ts` in
this package is validation plus forwarding — it validates the options by calling
corj's `resolveCorjRedactPolicy`, rewraps corj's `TypeError` as
`APPEX_INVALID_REDACTION_POLICY`, bounds `replacement` at 128 characters (corj
has no bound; the public message bound depends on one), and freezes the result
into an opaque policy object.

## What is forwarded where

This package builds a `CorjMaker` in exactly three places, and a policy carries
two resolved corj policies for them:

- `forCaught` — the whole policy, including `paths`. Forwarded to the
  `CorjMaker` that inspects the caught value for the diagnostic report.
- `forViews` — the same policy with `paths` emptied. Forwarded to the
  `CorjMaker` that renders `context`, and to the one that renders the public
  report's `as_json`.

**D5: `paths` address the caught value only.** A path such as `$.password` is
documented as a path into the caught value, rooted at its `$`. Letting the same
path also match inside `context` or inside the details a kind's selector chose
would be an accident of implementation rather than a policy anyone wrote.
`keys` still match everywhere, and are the rule to reach for when a name is
sensitive wherever it appears.

## The two flat strings corj never sees

corj scrubs the warning line only inside its own default `onError`; a custom
handler receives the caught object unchanged. This package installs its own
handler, so it scrubs those strings itself, with corj's exported `CorjRedactor`
— the same traversal and the same policy, not a second implementation:

- the public report's `message`, scrubbed **before** the 4,096-character cut, so
  a replacement longer than the text it replaced is bounded by the cut rather
  than escaping it;
- `reporting_errors[].error`, scrubbed before the entry is pushed. `stage` is
  never scrubbed: it is this package's own enum.

**The `stage: 'redact'` exception.** An entry at `stage: 'redact'` describes the
policy's *own* failure. Scrubbing it with the full policy ran the application's
throwing `transform` over the description of its own failure, so the text became
`[redacted]` and the operator could no longer see why the policy broke. Such an
entry is scrubbed with the same policy minus its `transform`; every other stage
keeps the full policy. This is safe, not a hole: corj applies `patterns` before
it calls `transform`, and a value excluded by `keys` or `paths` never reaches
`transform` at all, so the text of a transform's error can only embed content
that was already scrubbed.

## What this design gains

**An excluded property is never read.** `keys` and `paths` are consulted before
the property access, so a getter under `keys: ['password']` does not run — the
counting-getter test *never reads a property the policy excluded* asserts zero
reads. The post-production walk could only rewrite a value it had already
caused to be produced.

**The size budget is spent on surviving content.** Redaction happens during
inspection, so `maxReportSize` and `maxFinalReportSize` measure what is actually
emitted. A replacement can still be longer than what it replaced, so a policy
can enlarge a report; the `APPEX_REPORT_BUDGET_TOO_SMALL` message says as much
when a policy is in play.

**One implementation of the traversal.** corj decides what is a property, a
child, a stack line or a JSON value, exactly once.

**`replacement` is literal.** `$&`, `$1` and friends are never expanded — corj
replaces through a function. `replacement: '<$&>'` yields the literal `<$&>`, in
the diagnostic report, in `context`, in the public `as_json`, and in the public
`message`.

## What a policy cannot do

**It cannot discover an unknown secret.** The package supplies the mechanism;
which content is sensitive stays the application's decision.

**`keys` and `paths` select properties, not content.** Error text is duplicated
across `message`, `stack` and `as_string`, and neither the object's own
`toString` nor V8's stack formatting can be stopped from reading `message`. So
`keys: ['message']` leaves the text in `stack`. Removing *content* needs
`patterns` or `transform`.

**Property names are scrubbed too, and can collide.** `patterns` apply to
property names inside `as_json` as well as to values, so `{ 'sk-live-abc': 1 }`
becomes `{ '[redacted]': 1 }`. Two names that scrub to the same text collapse
into one key and the last write wins; corj documents and tests this.

**Selection and redaction stay distinct (D8).** On a public report the policy
runs over the output of the kind's `public.details` selector. It can only narrow
what the selector chose; a kind with no selector still emits no `as_json`, and an
unknown failure keeps the generic `INTERNAL_ERROR` shape.

## corj behaviours worth knowing

Each is pinned by a test in `tests/Redaction.test.ts`.

**A policy failure is reported once per value.** A throwing `transform` or
matcher fails closed — the value becomes the replacement — and the failure is
recorded once for the value it was asked about, without re-consulting the
policy. A transform that throws for *every* value therefore produces **several**
`stage: 'redact'` entries, not one (*a transform that always throws blanks the
report without recursing, and says why*).

**Default report ids are never rewritten.** `id`, `path` and `level` are corj's
own structure. A default id carries nothing from the caught object, so corj
never emits it through the policy: a policy that redacts every digit still
leaves ids `"0"`, `"1"` and the `child_ids` linkage intact (*leaves the positions
corj generates itself intact*). Only an id from a caller-supplied `makeReportId`
is scrubbed, which appex does not set.

**Report-shaped names are ordinary data.** A value the application calls `id`,
`code`, `path`, `stage`, `level` or `truncated` inside `as_json` or `context` is
redacted like anything else. Protecting such names would silently leak exactly
the fields most likely to hold a session id or a file path.

**A redacted children source is marked.** Excluding the property children come
from yields `children_omitted: 'redacted'`, and the report still validates
against `schemas/diagnostic-report-v4.json`.

**No policy means no change.** Reports without `redact` behave exactly as they
did in 0.3.0, apart from the format version; the test suite asserts the secret
comes back when the policy is bypassed.

## Follow-up, not done

corj 10.0.0 also offers `inspection: 'no-invoke'`, which reads nothing from the
caught object that could run application code. Exposing it through this package
is **D7: out of scope** here — it changes what every report contains, not just a
redacted one, and deserves its own decision.
