# Fable review and verification

Requested through Claude CLI with `--model fable --effort high` on 2026-09-20.
The CLI resolved the reviewer to `claude-fable-5-1` and completed successfully
with no permission denials. Fable had read-only source and web tools and was
explicitly invited to reject proposals and suggest independent alternatives.
No implementation files changed.

## Follow-up verification by Codex

After receiving the review, I ran focused local probes:

- **Stale nested configuration confirmed:** mutating a cached bag's
  `childrenSources` array succeeds but is ignored on reuse. The first and second
  reports had zero children; a fresh bag with the same updated array had one.
- **Unknown policy keys confirmed:** `public: { code, detials: callback }`
  is accepted at runtime and silently produces no disclosed details.
- **Public details unit mismatch confirmed:** the same Unicode payload yielded
  16,384 serialized detail bytes with UTF-8 units, but 36,011 bytes with UTF-16
  units and no truncation. The constant remains named `PUBLIC_DETAILS_MAX_BYTES`.
- **Compatibility risks confirmed in source:** corj emits `key` and `prop` on
  reporting-error rows; fingerprint source labels include `field:`; trust-realm
  policy records use `details` under the existing protocol.

These checks support prioritizing behavior and compatibility over broad factory
renames. The precise public size floor, complete narrowed option set, performance
claims, and migration release numbers remain design proposals, not verified
requirements. `disclose` versus `detailsSelector` is a naming judgment.

The reviewer output below retains Fable's own conclusions and limitations.
A transient progress sentence and an unrelated connector note were omitted.
No other changes were made to its review. Example APIs are proposals.

---

# Independent API design review: application-exception 0.5.0 and corj 11.0.1

Reviewer: Fable, 2026-09-20. This was read-only: nothing was edited and no design approval was requested.

## Summary

- **The highest-value changes are behavioural, not renames.** They are an enforced `maxReportBytes` on the public report, removing the caller-bag freeze together with the identity cache, and rejecting unknown keys in a kind's `public` policy.
- **Three proposed renames are unsafe as written:**
  - `rawError` is not an accurate name. The handler's first argument is the value thrown while reporting, never the original caught value.
  - `reportKey` and `sourceProperty` would rename wire fields, because the callback context and the `reporting_errors` row are the same type.
  - A naive `field` to `property` rename would change every source-entry fingerprint while keeping the `fp1_` prefix.
- **I reject the `create*` to `make*` and `to*` to `make*` function renames in both packages.** They are literal Swift spellings and do not help TypeScript callers.

## Limitations

- **Nothing was executed.** This session had no shell. Every behavioural claim below comes from reading source and is marked *source-verified*. Anything I could not confirm by reading is marked *untested*. I did not re-run the runtime probes from the prior reviews (the 3,123-byte public report and the `Object.isFrozen` flip). The freeze is confirmed by `src/corj-maker.ts:78` and `tests/CorjMaker.test.ts:15-23`.
- **Swift guideline.** I read it through a summarizing fetch, so I cite section anchors only: [fundamentals](https://www.swift.org/documentation/api-design-guidelines/#fundamentals), [promote-clear-usage](https://www.swift.org/documentation/api-design-guidelines/#promote-clear-usage), [strive-for-fluent-usage](https://www.swift.org/documentation/api-design-guidelines/#strive-for-fluent-usage), [use-terminology-well](https://www.swift.org/documentation/api-design-guidelines/#use-terminology-well), [parameter-names](https://www.swift.org/documentation/api-design-guidelines/#parameter-names), [general-conventions](https://www.swift.org/documentation/api-design-guidelines/#general-conventions).
- **corj source.** The sibling checkout at `/home/df/wd/personal/caught-object-report-json/src` was readable. corj line numbers refer to it. The installed `.d.ts` and README line numbers refer to `node_modules/caught-object-report-json`.

---

## 1. Assessment of both current APIs

Both APIs are in better shape than the size of the rename table suggests.

**What already works:**
- The defaults are safe, and option bags are validated with unknown keys rejected.
- The packages hold a consistent "configuration throws, runtime data never throws" contract.
- The vocabulary is small.

**The real problems are contracts:**
- an option that is accepted and then ignored;
- an ownership transfer the types do not show;
- a cache that misses on the documented call shape;
- one word, `field`, that means opposite things in two places.

**The proposal has the priorities inverted.** Seven of its ten application-exception rows and eight of its ten corj rows are spellings.

### application-exception

**A1 (High). The public report accepts a whole-report limit it never enforces.** The prior finding is confirmed.
- `PublicReportOptions.corj` is `AppexCorjOptions`, which is `Omit<CorjOptionsInput,'redact'>` (`src/corj-maker.ts:13`, `src/report-types.ts:95`).
- `publicReportOf` uses only `maker.scrubText`, `maker.makeJson` with a fixed `maxSize: PUBLIC_DETAILS_MAX_BYTES`, and `maker.makeFingerprint` (`src/reporting.ts:373-388`).
- `maxReportSize`, `maxContextSize`, `omitExpectedValues`, `stackFormat`, `metadata` and `occurrenceIdSources` have no effect on a public report.

**A1b (new, Medium). `reportSizeUnit` silently changes the public details bound.**
- The maker builds its serializer with `lengthUnit: reportSizeUnit` (corj `src/index.ts:2029`).
- `makeJson` runs through that serializer (corj `src/index.ts:2150-2162`).
- So `toPublicReport(caught, { corj: { reportSizeUnit: 'utf16-code-units' } })` turns the constant named `PUBLIC_DETAILS_MAX_BYTES` (`src/reporting.ts:26`) into 16,384 code units. That is up to about three times the bytes. *Source-verified; untested.*
- Any option spelled `…Bytes` must therefore pin the unit.

**A2 (Medium to High). The freeze and identity-cache design fails in both of its goals.**
- *Ownership.* `Object.freeze(options)` runs on the caller's bag (`src/corj-maker.ts:78`). Yet `new Kind({ details })` copies caller data and never freezes it (`tests/DetailsSnapshot.test.ts:57-63`). The package contradicts itself on ownership.
- *New: the freeze does not prevent stale settings.* The freeze is shallow by design (`src/corj-maker.ts:41-42`), and corj copies arrays when the maker is built (corj `src/index.ts:543`, `:454`, `:553`). After the first report, `bag.childrenSources.push('inner')` neither throws nor takes effect. This is the silent staleness the freeze was meant to rule out. *Source-verified; untested.*
- *New: the cache misses on the documented call shape.* Every example passes an inline literal (`src/reporting.ts:255-258`, `:417-419`; `docs/agent/recipes.md:99`, `:236`). A fresh literal is a new `WeakMap` key, so a new `CorjMaker` is built on every call. The cache only helps callers who hoist the bag, and those are exactly the callers the freeze surprises.
- Guideline: [fundamentals](https://www.swift.org/documentation/api-design-guidelines/#fundamentals). An undocumented mutation of an argument is a side effect that the name `to…` gives no hint of.

**A3 (Medium). `public: { public: … }`.** Confirmed at `src/report-types.ts:101-107` and `src/reporting.ts:36-42`. It is worth fixing; see the decisions in section 2.

**A4 (new, Medium). A kind's `public` policy silently ignores unknown keys. Every other bag rejects them.**
- `validatePublicPolicy` destructures `code`, `message` and `details` and never inspects the remaining keys (`src/typed.ts:297-331`).
- The per-call override does reject unknown keys (`src/reporting.ts:113`), and so does corj (`src/index.ts:465-471`).
- From JavaScript, from agent-generated code, or through a widened type, `public: { code, detials: … }` defines a kind that discloses nothing and raises no error.
- That is fail-safe, but it is silent and inconsistent. It is also a precondition for any rename of `details`. Without the check, stale `details:` keys would pass silently after the rename.

**A5 (new, Medium). The docs misdescribe the argument `onError` receives.**
- `AppexCorjOptions` says a custom `onError` "is called with the RAW caught value" (`src/corj-maker.ts:9-11`). AGENTS.md rule 10 says the same (`AGENTS.md:56-57`).
- In corj, all sixteen `reportError` call sites pass the value thrown while reporting: a getter's exception, a policy's exception, or a serializer failure. One site passes a fixed string (`src/index.ts:1877`). None pass the value given to `toDiagnosticReport` (`src/index.ts:934`, `1028`, `1089`, `1329`, `1363`, `1369`, `1492`, `1518`, `1547`, `1681`, `1738`, `1815`, `1843`, `1991`, `2002`, `2052`).
- A reader of appex's sentence will take "caught value" to mean the first argument of `toDiagnosticReport`.
- The safety advice still stands. A hostile getter can throw the secret it guards. But the description of what arrives is wrong or, at best, ambiguous.

**A6 (Low). `details` has two roles.** Confirmed at `src/typed.ts:57-61` versus `:64-69`. Misuse is caught twice, by the types and by `APPEX_INVALID_PUBLIC_POLICY`. The case for change is readability only.

**Strengths to preserve:**
- options are read once and then validated (`src/reporting.ts:199-221`);
- `toReports` refuses to return half a pair (`:435-452`);
- `cause` and `causes` exclude each other in the types (`src/typed.ts:14-27`);
- `isTypedException` stays unary;
- `decodePublicReport` returns a result union.

### corj

**C1 (Medium). Common per-call context requires a positional hole.** `makeCorj(caught, undefined, { context })` is the documented form (README `:168`, `:573`; `index.d.ts:267`). Confirmed. Guideline: [parameter-names](https://www.swift.org/documentation/api-design-guidelines/#parameter-names), on defaulted parameters.

**C2 (Medium, sharper than the prior review). "field" is the contradictory word. `key` and `prop` are consistent.**
- Everywhere else, "field" means a report field: "Report field the value is destined for" (`redaction.d.ts:37`), "a field of every node" (`index.d.ts:146`), and the default handler prints `field=${record.key}` (corj `src/index.ts:358`).
- Only `CorjSourceEntry { field: string }` (`index.d.ts:132-134`) uses it for a source property.
- `key` for report key and `prop` for source property are used consistently across `CorjContext`, `scrubText` and the `reporting_errors` rows.

**C3 (Medium). `onError` misleads on the first argument, not only on its scope.** See A5. The parameter name `caught` in `CorjErrorHandler` (`index.d.ts:169`) invites the wrong reading. The README phrase "also gets the raw caught object" (`:681`) adds to it.

**C4 (new, Medium). Any second argument builds a new maker on every call.**
- `makerFor` returns the shared default maker only when `options === undefined` (corj `src/index.ts:2193-2197`).
- This is harmless today. It matters for the merged-bag proposal; see the corj decisions in section 2.

**C5 (Low).** `makeJson` returns an envelope, and `CorjReportChild` also types the root of an array report (`index.d.ts:86-99`, `:232`, `:252-255`). Confirmed.

---

## 2. Decisions on the proposal

### application-exception

| Proposed | Decision | Reason |
| --- | --- | --- |
| `to*Report` to `make*Report` | **Reject** | Literal Swift naming. `make` is for factories, and the guideline says nothing about `to…`. In TypeScript, `toX` is the established conversion idiom. The three calls form a family that is already clear at the point of use. The cost is every consumer boundary, plus AGENTS.md, recipes and the card, which agents copy verbatim. See the collision note under this table. |
| `createRedactionPolicy`, `createTrustRealm` to `make*` | **Reject** | `create*` is the dominant TypeScript factory verb (`createServer`, `createContext`, `createRoot`). The prior review itself called this a weak reason. `makeTrustRealm` is already an internal name (`src/typed-internals.ts:103`), so the rename also blurs the line between public and internal names. |
| `ToReportsOptions` to `ReportsOptions`, `CapturedReports` to `Reports` | **Change** | Use `ReportPair` and `ReportPairOptions`. A bare plural `Reports` reads as "array of reports", and auto-import and search handle it poorly. "Pair" states the invariant of one occurrence and two audiences. Type aliases cost nothing at runtime. Keep the old names as `@deprecated` aliases. |
| Policy `details` to `detailsSelector` | **Change** | Prefer `disclose`. See S1 in section 3. |
| Option `public` to `policyOverride`, `PublicOverride` to `PublicPolicyOverride` | **Keep**, with a refinement | This removes `public: { public: … }`. The refinement: on the single-report call the word "public" disappears from the key, and `toPublicReport(caught, { policyOverride })` still reads unambiguously. Accept both keys for one minor release and throw if both are present. |
| `maxReportBytes` on both bags | **Keep**, with four constraints | See S2 in section 3. |
| Narrow the public `corj` bag | **Keep** | The source supports exactly this set: `inspection`, `fingerprintParts`, `childrenSources`, `maxDepth`, `maxChildren`, and the reporting-error handler. These are what `scrubText`, `makeJson` and `makeFingerprint` consult. Everything else should be a type error and an `APPEX_INVALID_OPTIONS` error. |
| Copy configuration and stop freezing | **Keep**, and go further | Drop the identity cache for caller bags as well. See S3 in section 3. |
| Keep `defineException`, instance `details`, the kind's `public`, the outer `public`, and override inheritance | **Keep** | The per-field merge (`src/reporting.ts:148-162`) is simple and documented. |

**The collision note.** The proposal creates appex `makeReports` alongside corj `makeReport`. These are two packages the same caller imports, and the names would differ by one letter. Under [promote-clear-usage](https://www.swift.org/documentation/api-design-guidelines/#promote-clear-usage), that alone is reason to reject at least one side.

### corj

| Proposed | Decision | Reason |
| --- | --- | --- |
| `makeCorj` to `makeReport`, `makeCorjArray` to `makeReportArray` | **Reject** | A free function has no receiver, so its name must carry the domain. `makeCorj(caught)` is unambiguous far from its import, and `makeReport(caught)` is not. `Corj` is the package's established term. See also the collision note above. |
| `maker.makeReportObject` to `maker.makeReport` | **Reject** | `makeReportObject` and `makeReportArray` are a symmetric pair that names the output shape. The rename breaks the pair for the sake of two words. |
| Merged free-function bag | **Keep**, with three rules | See S4 in section 3. |
| `makeJson` to `makeJsonView` | **Keep as an additive alias**, low priority | It matches the return type `CorjJsonView`, and "makeJson" suggests a string. appex has one call site (`src/reporting.ts:382`). |
| `CorjReportChild` to `CorjReportNode` | **Keep as an additive type alias** | It is accurate, because the type also describes the root row. It costs nothing at runtime. appex should re-export both (`src/index.ts:59`). |
| `maker.with` to `withOptions` | **Reject** | There is direct JavaScript precedent with identical semantics: TC39 Temporal's `date.with({ year })` returns a new value with the fields replaced ([use-terminology-well](https://www.swift.org/documentation/api-design-guidelines/#use-terminology-well), embrace precedent). The README already documents "a new maker, the original is unchanged" (`:146`). |
| `onError` to `onReportingError` | **Keep**, as an alias first | The scope ambiguity is real in an error-reporting library. |
| Handler parameter `caught` to `rawError` | **Reject the name**, and change it to `thrown` | The argument is not the application's error. It is not always an `Error` either: one call site passes a string (`src/index.ts:1877`). `rawError` would entrench the misreading described in A5. `reportingFailure` is an acceptable alternative. |
| Context `key` to `reportKey`, `prop` to `sourceProperty` | **Reject** | This collides with the proposal's own "preserve wire field names". See the wire note under this table. |
| `{ field }` to `{ property }` | **Change to `{ prop }`** | `field` is the right thing to rename (C2). Pick the spelling already on the wire and in the contexts, not a third one. See the fingerprint note under this table. |

**The wire note for `key` and `prop`.**
- `CorjReportingError = CorjContext & { error }` (`index.d.ts:156-158`). The same keys are emitted on the wire in `reporting_errors` under `corj/v0.14`.
- The handler receives a copy of that same row (corj `src/index.ts:743`).
- Renaming the context alone therefore gives `transform(v, { reportKey })` alongside `onReportingError(thrown, { key })`. That is worse than today.
- Renaming both needs a schema bump. A documentation table is enough.

**The fingerprint note for `{ field }`.** Hashed labels are literally `` `field:${entry.field}` `` (corj `src/fingerprint.ts:59-63`, hashed at `:187`). The internal label must stay `field:<name>`. Otherwise every source-entry fingerprint changes while still carrying `fp1_`, which breaks the promise at `fingerprint.d.ts:2`.

---

## 3. My own suggestions

### S1. `disclose` instead of `detailsSelector`

This is my recommendation. The choice between the three candidate names is otherwise unresolved.

```ts
// before
public: { code: 'TOOL_UNAVAILABLE', message: 'The tool is unavailable.', details: ({ tool }) => ({ tool }) }
toPublicReport(caught, { public: { details: null } })

// after
public: { code: 'TOOL_UNAVAILABLE', message: 'The tool is unavailable.', disclose: ({ tool }) => ({ tool }) }
toPublicReport(caught, { policyOverride: { disclose: null } })   // disclose nothing
```

- **Why not `detailsSelector`.**
  - It is a noun plus a role suffix. No other function-valued option in either package is named that way (`transform`, `makeReportId`, `onError`, `message`).
  - By the same logic, a function `message` would need to become `messageRenderer`.
  - It names the input, and the callback parameter already names the input.
- **Why not `selectDetails`** (the prior review's choice). It is consistent with the other options, but `selectDetails: null` reads badly.
- **Why `disclose`.**
  - It names the consequence, and the consequence is the package's central safety property.
  - It reuses the docs' own vocabulary: "discloses", "`null` to disclose nothing", "Redaction never discloses".
  - `disclose: null` reads as plain English.
  - Guideline: [fundamentals](https://www.swift.org/documentation/api-design-guidelines/#fundamentals), clarity at the point of use.
- **This is a TypeScript-caller benefit, not a Swift nicety. It is still Low priority.**
- **Semantic risk the brief missed.** `PublicPolicyRecord.details` crosses copies under `appex/realm/v1` (`src/typed-internals.ts:9-13`, `:81`, `:189-202`).
  - Rename only the input key.
  - Keep the record field as `details`.
  - If the record field were renamed, a mixed 0.5 and 0.6 realm would silently drop selectors in one direction. That fails safe, but it is invisible.
- **Do A4 first.** Reject unknown policy keys in the same release that adds the alias.

### S2. Constraints on `maxReportBytes`

1. **Pin the unit.**
   - `maxReportBytes` should map to `{ maxReportSize: n, reportSizeUnit: 'utf8-bytes' }`.
   - Remove `maxReportSize` and `reportSizeUnit` from both nested bags, as a type error and an `APPEX_INVALID_OPTIONS` error.
   - `maxContextSize` stays on the diagnostic bag, because it sits inside the budget and does not compete with it (README `:582`).
   - This also fixes A1b.
   - `number` carries no unit, so putting the unit in the name is right for TypeScript ([promote-clear-usage](https://www.swift.org/documentation/api-design-guidelines/#promote-clear-usage), weak type information).
   - corj itself should keep `maxReportSize`, because its unit is configurable.
2. **The public floor cannot be 512.** I worked through the worst-case minimal report, `{"v","occurrence_id","fingerprint","code","message":"","truncated":true}`. This is a hand calculation and is *untested*.
   - `occurrence_id` and `fingerprint` may be all `"` or `\` characters, which take 2 bytes each under `[\x21-\x7e]`. That gives 275 and 145 bytes.
   - `code` has only a length rule (`src/reporting.ts:91-99`). A control character serializes as `\u0001`, which is 6 bytes, so 128 of them give 778 bytes.
   - The total is about **1,251 bytes**.
   - Either set the floor at **2,048**, or restrict new codes to `[\x21-\x7e]` without `"` or `\` and set the floor at 768. I recommend 2,048. It needs no validation break, and the brief's own example already uses it.
3. **`makeJson` throws a `RangeError` for `maxSize < 256`** (corj `src/index.ts:344`, `:2149`).
   - A dynamic remaining-budget value passed straight through would throw inside a catch block.
   - Below 256 bytes remaining, drop `as_json` whole and set `truncated: true`.
4. **Trim order for the public report.** Publish this order the same way corj publishes its own (README `:625-634`). It needs no wire change, because `truncated` already exists.
   - First trim `as_json`: cut it through `maxSize`, then drop it whole.
   - Then cut `message`.
   - Never trim `code`, `occurrence_id`, `fingerprint` or `v`.
   - The 4,096-code-unit message cap stays as a protocol constant, because `decodePublicReport` enforces it (`src/reporting.ts:611-616`).
   - *Unresolved:* on overflow, should the agent see a partial `as_json` or an absent one? I lean towards absent. An agent branches on structure.

### S3. Configuration ownership

- Read the bag once, build the maker for that call, and freeze nothing.
- Keep a cache only for the no-`corj` path, keyed by redaction policy. That is the `NO_OPTIONS` branch that already exists (`src/corj-maker.ts:15`, `:54`).
- This removes the freeze, the nested-mutation staleness from A2, and the cache that misses on inline literals.
- *Untested:* I did not benchmark maker construction. It consists of `resolveOptions`, `configureStringify` and `resolveFingerprintParts`.
- If a benchmark shows it matters, add one explicit reusable object and do not bring back an implicit cache: `const reporter = createReporter({ redact, realm, diagnostic, public })`, then `reporter.toReports(caught, { context })`. This mirrors corj's "construct once, reuse".
- I would not ship `createReporter` speculatively. The card's "one way per task" rule is worth more.

### S4. Rules for the merged corj bag

```ts
// before
makeCorj(caught, undefined, { context: { runId } });
// after
makeCorj(caught, { context: { runId }, maxDepth: 3 });
```

1. **Split by key.** The key sets are disjoint today (corj `src/index.ts:402-418` against `:563`). When no option key is present, use the shared default maker. Otherwise the most common call builds a maker every time (C4).
2. **Keep the two failure contracts and document them on one type.**
   - A bad `maxDepth` throws.
   - A bad `occurrenceId` is recorded and the call continues (`src/index.ts:592-599`).
   - Merging the bags hides that distinction unless the JSDoc states it.
3. **Keep the third positional argument as deprecated.**
   - Throw a `TypeError` if a call key appears in both the merged bag and the third positional argument.
   - `maker.makeReportObject(caught, { maxDepth })` should still throw. Its message should name `with`.

### S5. Documentation-only fixes

These cost nothing to compatibility and have immediate value.

- **`CorjErrorHandler` JSDoc.** Proposed wording: "`thrown`: the value thrown while reporting, unscrubbed, which may quote the caught object's content; `record`: the scrubbed, bounded row also written to `reporting_errors`."
- **The appex sentence** at `src/corj-maker.ts:9-11` and AGENTS.md rule 10. Fix it, then run `npm run docs:generate`.
- **A terminology table in the corj README.** It should say that `key` means report field, `prop` means source property, and `path` means a JSONPath with a document root.
- **`restoreExpectedValues`, the `CorjMaker` constructor, and `makeReportObject`.** Lead the JSDoc summary with what the function returns ([fundamentals](https://www.swift.org/documentation/api-design-guidelines/#fundamentals)). I concur with the prior finding.

---

## 4. Preferred API at realistic call sites

```ts
// errors.ts
export const ToolUnavailable = defineException({
  tag: 'tools/Unavailable',
  message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
  public: {
    code: 'TOOL_UNAVAILABLE',
    message: 'The tool is unavailable.',
    disclose: ({ tool }) => ({ tool }),
  },
});

// boundary.ts
const redact = createRedactionPolicy({ keys: ['password'], patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g] });

const pair: ReportPair = toReports(caught, {
  diagnostic: { context: { runId }, redact, maxReportBytes: 32_768, corj: { maxDepth: 3 } },
  public: {
    redact,
    maxReportBytes: 2_048,                       // enforced; floor 2,048
    policyOverride: { message: 'Search is temporarily unavailable.', disclose: null },
  },
});
sink.write(pair.diagnostic);
respond(pair.public);
```

```ts
// corj
makeCorj(caught, { context: { runId }, maxDepth: 3 });

const maker = new CorjMaker({
  maxDepth: 3,
  occurrenceIdSources: [{ prop: 'requestId' }, { auto: 'random' }],
  onReportingError: (thrown, record) => log.warn(maker.scrubText(String(thrown), { path: record.path })),
});
maker.makeReportObject(caught, { context: { runId } });
const rows: CorjReportNode[] = maker.with({ maxDepth: 1 }).makeReportArray(caught);
const view = maker.makeJsonView(payload, { root: '$request', maxSize: 4_096 });
```

All of the following stay unchanged:
- `to*Report`, `create*`, `defineException`, `decodePublicReport` and the `is…` predicates;
- `cause` and `causes`;
- `makeCorj`, `makeCorjArray`, `makeReportObject`, `makeReportArray` and `with`;
- every wire key, including `key` and `prop` in `reporting_errors`.

---

## 5. Costs, risks and migration sequence

**Costs.**
- appex is pre-1.0 and days old, so a breaking change is cheap in semver terms.
- AGENTS.md, recipes and the API card are copied into consumer repos and into agent context. Stale names keep circulating there after a release, which is why I minimized function renames.
- corj is at major version 11 and has external users. Everything I accepted for corj is additive.

**Migration sequence.**

1. **Documentation and validation only.** Ship as appex 0.5.x and corj 11.0.x.
   - S5 and A5.
   - A4 is technically breaking for anyone relying on ignored policy keys. Ship it as 0.6.0 if you want to be strict.
2. **Additive.** Ship as corj 11.1 and appex 0.6.
   - corj: add `onReportingError`, `makeJsonView`, `CorjReportNode`, `{ prop }` and the merged bag.
     - Throw if both the old and new spelling of an option are supplied.
     - `validateSourceEntry` must accept `prop` or `field`.
     - The label must stay `field:`. Add a test pinning one known fingerprint.
   - appex: add `policyOverride`, `disclose`, `ReportPair` and `ReportPairOptions` alongside the old names.
     - Reject both spellings supplied together with `APPEX_INVALID_OPTIONS` or `APPEX_INVALID_PUBLIC_POLICY`.
     - Keep `PublicPolicyRecord.details` and realm protocol v1.
3. **Semantic.** Ship as appex 0.7 and call it out as breaking.
   - Enforce `maxReportBytes` on both bags with the pinned unit.
   - Narrow the public `corj` bag.
   - Remove `corj.maxReportSize` and `corj.reportSizeUnit`.
   - Remove the freeze and the identity cache. Replace the test at `tests/CorjMaker.test.ts:15-23` with a test that the caller's bag stays mutable and that the second call sees the change.
   - Tests to add:
     - a worst-case minimal public report at the floor;
     - a remaining budget under 256;
     - a multi-byte message;
     - an assertion on `Buffer.byteLength(JSON.stringify(report)) <= limit`.
4. **Removal.** At appex 1.0 and corj 12, drop the deprecated spellings and the third positional argument.

**Open decisions:**
- `disclose` against `selectDetails` against `detailsSelector`;
- a public floor of 2,048 against an ASCII-only `code` rule;
- a dropped `as_json` against a truncated one;
- whether `createReporter` is ever needed;
- whether A4 ships as a patch or a minor release.
