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
| `patterns` | scrub | strings and property names in both reports; each needs the `g` flag |
| `transform` | scrub | every value and property name, after `patterns`; `undefined` drops the field |
| `replacement` | — | what skipped and scrubbed content becomes, inserted literally |

Skipping a property does not remove its text elsewhere — an error's message is
also in its `stack` — so removing a secret's *text* is a job for `patterns`.
Redaction never discloses: on a public report the policy is given only what the
kind's `details` selector returned. `occurrence_id` and `code` are identifiers
the application chooses; no rule rewrites them. How to use it is in
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

**`paths` address the caught value only.** A path such as `$.password` is a path
into the caught value. Letting it also match inside `context` or inside the
details a selector chose would be an accident of implementation, not a policy
anyone wrote. `keys` match everywhere, and are the rule for a name that is
sensitive wherever it appears.

A `transform` is different. The `path` it is told is rooted at whatever is being
serialized — the caught value, the `context` object, or the selected details — so
inside `context` it also sees `$.password`. Key a transform on `prop`.

## The two flat strings corj never sees

corj scrubs the warning line only inside its own default `onError`; a custom
handler receives the caught object unchanged. This package installs its own
handler, so it scrubs those strings itself, with corj's exported `CorjRedactor`
— the same traversal and the same policy, not a second implementation:

- the public report's `message`, scrubbed **before** the 4,096-character cut;
- each `reporting_errors` entry: its `error`, `path` and `prop` go through the
  full policy with the context corj gave, and `error` is cut to 256 characters
  only **after** scrubbing. Cutting first would let a secret that straddles the
  cut lose its tail, stop matching, and leak its head. `stage` and `key` are
  corj's own vocabulary and are never scrubbed.

**A policy failure's own message is withheld.** An entry at `stage: 'redact'`
records that the application's `transform` or matcher threw. Its `error` is the
replacement, never the thrown text: that text is written by the failing policy
and can quote exactly what the policy was protecting — a `transform` that is a
field's only protection, or one handed a whole object whose excluded members are
still inside. No scrub can be trusted there, because the only thing that knew how
to protect the content just failed. The entry, its stage and its scrubbed `path`
remain, so the failure is observable. corj's default handler does the same.

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

**Selection and redaction stay distinct.** On a public report the policy is
given only the output of the kind's `public.details` selector; the library never
feeds it anything the selector left out. A kind with no selector emits no
`as_json`, and an unknown failure keeps the generic `INTERNAL_ERROR` shape. A
`transform` is application code and can rewrite what it is given, so keep it free
of outside data.

**A `transform` sees raw input.** corj hands it whole objects, including members
a skip rule excludes, and property names as well as values. It must never quote
its input in an error it throws. It also does not quite run last: corj re-applies
`patterns` to a string it returns.

**A policy failure shows only in the diagnostic report.** `toPublicReport` has no
`reporting_errors`; there the value is simply the replacement.

## corj behaviours worth knowing

Each is pinned by a test in `tests/Redaction.test.ts`.

**A policy failure is reported once per value.** A throwing `transform` or
matcher fails closed — the value becomes the replacement — and the failure is
recorded once for the value it was asked about, without re-consulting the
policy. A transform that throws for *every* value therefore produces **several**
`stage: 'redact'` entries, not one (*a transform that always throws blanks the
report without recursing*).

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

**No policy means no change.** Reports without `redact` take the same path as
before, apart from the format version; the suite asserts the secret comes back
when the policy is bypassed.

## Follow-up, not done

corj 10.0.0 also offers `inspection: 'no-invoke'`, which reads nothing from the
caught object that could run application code. Exposing it through this package
is **out of scope** here — it changes what every report contains, not just a
redacted one, and deserves its own decision.
