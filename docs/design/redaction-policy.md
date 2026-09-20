# Redaction policy — decision record (issue #43)

Status: **implemented** as `makeRedactionPolicy`, applied by
`caught-object-report-json` while it inspects the caught value.

## The rules in one minute

A policy has two kinds of rule. **Skip** rules name properties that are never
read; **scrub** rules rewrite text wherever it appears.

| Rule | Kind | Reach |
| --- | --- | --- |
| `keys` | skip | a property name, in the caught value, `context`, and selected public details |
| `paths` | skip | one named property in one document: `$...` the caught value, `$context...` the context, `$public...` the selected public details |
| `patterns` | scrub | strings and property names in both reports; each needs the `g` flag |
| `transform` | scrub | every value and property name, after `patterns`; `undefined` drops the field |
| `replacement` | — | what skipped and scrubbed content becomes, inserted literally |

Skipping a property does not remove its text elsewhere — an error's message is
also in its `stack` — so removing a secret's *text* is a job for `patterns`.
Redaction never discloses: on a public report the policy is given only what the
kind's `details` selector returned. `occurrence_id` and `code` are identifiers
the application chooses and `fingerprint` is a hash of values the policy has
already seen; no rule rewrites any of the three. How to use it is in
[../agent/recipes.md](../agent/recipes.md#keep-secrets-out-of-both-reports); the
rest of this page is why it is built this way.

## History, in three sentences

An unreleased 0.4.0 draft applied redaction as a post-production walk over the
already produced report, because corj had no mechanism of its own. corj 10.0.0
(format `corj/v0.13`) ships that mechanism, so the walk was deleted before
0.4.0 was ever published — and with it a bug where `replacement: '<$&>'` was
handed to `String.prototype.replace` and re-inserted the match it was supposed
to remove. corj 11.0.0 (format `corj/v0.14`) adds named document roots, which
retired the last thing this package still had to arrange itself: the split
policy described below.

## corj owns the mechanism

[#43](https://github.com/dany-fedorov/application-exception/issues/43) says to
avoid duplicating corj's traversal. It is not duplicated: `new CorjMaker({
redact })` consults `keys` and `paths` *before* reading a property, and applies
`patterns` and then `transform` to every value it emits. `src/redaction.ts` in
this package is validation plus forwarding — it validates the options by calling
corj's `resolveCorjRedactPolicy`, rewraps corj's `TypeError` as
`APPEX_INVALID_REDACTION_POLICY`, and freezes the result into an opaque policy
object. corj 11 bounds `replacement` at 128 characters itself, so this package
no longer carries its own bound; the rejection a caller sees is corj's, rewrapped
as `APPEX_INVALID_REDACTION_POLICY`. The public message bound depends on that
bound holding.

## One policy, three named documents

A policy now holds **one** resolved corj policy. It is forwarded to one
`CorjMaker` built from a one-read snapshot of each call's current CORJ bag, and that maker
produces everything: the diagnostic report, the `context` document, the public
report's `as_json`, and the scrubbed public `message`.

The split is gone because CORJ names its documents. Every path carries the
root of the document it belongs to:

| Root | Document |
| --- | --- |
| `$...` | the caught value and its children |
| `$context...` | the call's `context` |
| `$public...` | the JSON the kind's `public.detailsSelector` returned |

A named root matches `/^\$([A-Za-z_][A-Za-z0-9_]*)?$/` — the name is optional, so
the bare `$` is a root too — and a property path always
continues with `.` or `[`, so `$context` can never collide with a `context`
property of the caught value — which is exactly the ambiguity the old split was
working around. A string `paths` rule now says which document it means:
`'$.password'` is the caught value's, `'$context.user.email'` is the context's.

**An unanchored `RegExp` path widens.** A rule such as `/\.headers$/` used to see
the caught value alone; it now also matches inside `$context` and `$public`. That
direction fails safe — more is redacted, not less — and a rule meant for the
caught value alone is anchored with `^\$\.`, as in `/^\$\..*\.headers$/`.

**A path- or stage-keyed `transform` fails open, and must be re-keyed.** This is
the upgrade note that costs redaction rather than adding it. 0.4 offered context
values at `$.<key>` and the public message as `stage: 'as_string'`,
`path: '$.message'`; 0.5 roots context values at `$context.<key>`, selected
public details at `$public.<key>`, and delivers the public message as
`stage: 'warning'` at `$public.message`. A 0.4 policy keyed on the old values
simply stops matching, and nothing is redacted — silently. A `transform` is told
the new paths, so it can tell the documents apart from `path` alone; keying it on
`sourceProperty` names the source property and is usually the simplest rule.

**Fingerprint inputs go through the policy too.** Every value a `fingerprintParts`
entry reads is offered under its own path — `$.details` for `{ field: 'details' }`,
`$.cause.details` on a child — so a `paths` rule or a path-keyed `transform` that
rewrites a value in `as_json` rewrites the same value in the hash input. What the
policy removed is not hashed, and cannot be confirmed by guessing.

## The one flat string corj never sees

`reporting_errors` records are CORJ's own: CORJ builds one record per failure,
puts its `path` and `sourceProperty` through the policy, scrubs the text
**before** cutting it to 256 characters, and writes the replacement rather than
the thrown message for a `stage: 'redact'` entry. Cutting first would let a
secret that straddles the cut lose its tail, stop matching, and leak its head.
`stage` and `reportKey` are CORJ's vocabulary and are never scrubbed. This package no
longer collects or scrubs those records; it only asks for them, and reads them
out of the report.

That leaves one string corj never sees: the public report's `message`, which
this package renders from the kind's policy. It goes through
`maker.scrubText(rendered, { path: '$public.message', reportKey: 'message' })` — the
maker's own policy, applied with `stage: 'warning'` — **before** the
4,096-character cut, so a replacement longer than what it replaced can never push
the message past the bound.

**A policy failure's own message is withheld.** An entry at `stage: 'redact'`
records that the application's `transform` or matcher threw. Its `error` is the
replacement, never the thrown text: that text is written by the failing policy
and can quote exactly what the policy was protecting — a `transform` that is a
field's only protection, or one handed a whole object whose excluded members are
still inside. No scrub can be trusted there, because the only thing that knew how
to protect the content just failed. The entry, its stage and its scrubbed `path`
remain, so the failure is observable.

## What this design gains

**An excluded property is never read.** `keys` and `paths` are consulted before
the property access, so a getter under `keys: ['password']` does not run — the
counting-getter test *never reads a property the policy excluded* asserts zero
reads. The post-production walk could only rewrite a value it had already
caused to be produced.

**The size budget is spent on surviving content.** Redaction happens during
inspection, so top-level `maxReportBytes` measures what is actually emitted. A
replacement can still be longer than what it replaced, so a policy can enlarge a
report; corj then drops `context`, then `reporting_errors`, then trims error
content, and never the identifying fields.

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
given only the output of the kind's `public.detailsSelector`; the library never
feeds it anything the selector left out. A kind with no selector emits no
`as_json`, and an unknown failure keeps the generic `INTERNAL_ERROR` shape. A
`transform` is application code and can rewrite what it is given, so keep it free
of outside data.

**A `transform` sees raw input.** corj hands it whole objects, including members
a skip rule excludes, and property names as well as values. It must never quote
its input in an error it throws. It also does not quite run last: corj re-applies
`patterns` to a string it returns.

**A policy failure shows only in the diagnostic report.** `makePublicReport` has no
`reporting_errors`; there the value is simply the replacement.

## corj behaviours worth knowing

Each is pinned by a test in `tests/Redaction.test.ts`.

**A policy failure is reported once per value.** A throwing `transform` or
matcher fails closed — the value becomes the replacement — and the failure is
recorded once for the value it was asked about, without re-consulting the
policy. A transform that throws for *every* value therefore produces **several**
`stage: 'redact'` entries, not one (*a transform that always throws blanks the
report without recursing*).

**Three fields are never rewritten.** A default report `id`, `occurrence_id` and
`fingerprint`. `id`, `path` and `level` are corj's own structure, and a default
id carries nothing from the caught object, so corj never emits it through the
policy: a policy that redacts every digit still leaves ids `"0"`, `"1"` and the
`child_ids` linkage intact (*leaves the positions corj generates itself intact*).
A scrubbed `occurrence_id` would correlate with nothing, and a `fingerprint` is a
hash of values the policy has already seen. Only an id from a caller-supplied
`makeReportId` is scrubbed, which appex does not set.

**Report-shaped names are ordinary data.** A value the application calls `id`,
`code`, `path`, `stage`, `level` or `truncated` inside `as_json` or `context` is
redacted like anything else. Protecting such names would silently leak exactly
the fields most likely to hold a session id or a file path.

**A redacted children source is marked.** Excluding the property children come
from yields `children_omitted: 'redacted'`, and the report still validates
against `schemas/diagnostic-report-v6.json`.

**No policy means no change.** Reports without `redact` take the same path as
before, apart from the format version; the suite asserts the secret comes back
when the policy is bypassed.

## The follow-up, now done

corj also offers `inspection: 'no-invoke'`, which reads nothing from the caught
object that could run application code. 0.4.0 left it unexposed on purpose: it
changes what every report contains, not just a redacted one. 0.5.0 exposes every
corj option through one `corj` bag, so it needs no mirror option of its own —
`makeDiagnosticReport(caught, { corj: { inspection: 'no-invoke' } })`. The two
compose as corj documents: `redact` decides what may be reported, `inspection`
decides how much may run to report it. This package keeps corj's default, which
is `'default'`; reading nothing is the caller's decision, per call site.
