# API, LLM usability, and performance review

Reviewed **2026-09-10**, commit **`2cc5e7e`**, with breaking changes allowed.
Scope: public API, declarations, reporting, examples, documentation, and compiled
CommonJS output. “LLM friendly” covers both generating correct application code
and consuming error reports as tool output. This review records findings; it
does not change the implementation.

This is a historical observation of `2cc5e7e`. See the
[0.2 resolution](2026-09-10-review-resolution.md) for the implemented outcome and
current verification. Source links below are pinned to the reviewed revision.

## Recommendation

Make typed errors the default API and remove the legacy builder from the core.
Preserve complete constructor input, literal `_tag`, native causes, occurrence
identity, separate observation context, and explicit public presentation. These
are useful concepts with good existing runtime and type coverage.

The largest brevity gain comes from removing competing ways to perform the same
operation. Shorter function names offer much less value. Before optimizing small
allocations, fix report budget enforcement, serialization guarantees, and the
compiled legacy constructor failure.

## Priorities

P1 means a confirmed defect to fix before relying on the affected contract. P2
means a concrete issue under the stated conditions. Design items are deliberate
breaking-change recommendations, rather than claims that compatibility support
was implemented incorrectly.

| ID  | Priority       | Finding                                                                           | Primary concern                |
| --- | -------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| F1  | P1             | Compiled `AppEx.new()` throws during construction                                 | Reliability / adoption         |
| F2  | P1             | Small report limits still inspect every input property                            | Scalability                    |
| F3  | P1             | Uncounted markers exceed budgets and break reference correlation                  | Scalability / machine contract |
| F4  | P1             | Date/function normalization invokes getters; date overrides can break JSON output | LLM/tool reliability           |
| F5  | P2             | Mutating a definition changes an existing kind inconsistently                     | Stable machine identity        |
| F6  | P2             | Decoder validates one snapshot and returns another                                | Machine contract               |
| F7  | P2             | Separate module instances lose typed metadata and identity                        | Integration scalability        |
| F8  | Design, high   | Root exports and main guide promote two competing usage models                    | API brevity / code generation  |
| F9  | Design, medium | Factory, empty details, and context typing add avoidable friction                 | API brevity / code generation  |
| F10 | P2             | Public projection traverses diagnostics that it discards                          | Performance                    |
| F11 | P2             | Typed construction eagerly formats every stack                                    | Performance                    |
| F12 | Design, medium | Agent reports lack a compact, explicit consumption contract                       | LLM consumption                |

## Confirmed defects and bottlenecks

### F1. The compiled legacy constructor fails before repairing its prototype

**Evidence:** [ApplicationException.ts:835–870](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L835),
[tsconfig.build.json](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/tsconfig.build.json),
[tsconfig.json](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/tsconfig.json),
[package smoke test](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/tests/package-smoke.js).

After `npm run build`, this fails:

```sh
node -e 'require("./dist").AppEx.new("failed")'
# TypeError: _this.syncNativeCause is not a function
```

The effective build emits downleveled classes. The native `Error` returned from
the superclass call does not yet have the application prototype when
`this.syncNativeCause()` runs. `Object.setPrototypeOf` follows that call. Source
tests pass, and the package smoke test exercises typed construction but never
constructs a legacy error.

**Recommendation:** target a modern JavaScript version consistent with the
declared Node requirement, or repair the prototype before calling an instance
method. Exercise every supported constructor family against the built package.
If legacy is removed, make that an explicit breaking removal.

### F2. Traversal limits bound selected output, not input inspection

**Evidence:** [reporting.ts:330–380](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L330),
[decoder:745–784](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L745),
[typed detail copying:42–80](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L42).

`Object.getOwnPropertyDescriptors(value)` eagerly allocates descriptors for the
whole object or array before `maxEntries` is applied. Object handling then
allocates and filters full key lists. The decoder repeats this pattern before
its value budget stops recursion. Typed construction also copies every top-level
detail field without a size limit.

**Reproduced:** a nested object with 100,000 properties and limits
`{ maxEntries: 1, maxValues: 5 }` triggered **100,000 descriptor inspections**.
One local run took approximately **132 ms**, despite an output below 1 KB.
The proxy only counted ordinary descriptor reads; no slow or non-returning trap
was involved. The same full-descriptor allocation occurs for plain objects.

**Impact:** a wide request object, dense array, or binary view can make error
reporting block the event loop and allocate heavily during a failure burst.
Smaller configured output limits do not eliminate that cost.

**Recommendation:** inspect array length and selected indexes directly; avoid
allocating descriptors for entries that will be omitted. For ordinary objects,
cap descriptor reads and avoid multiple full key copies. Be precise about the
remaining cost of key enumeration: JavaScript reflection and arbitrary proxy
traps cannot provide a hard execution-time bound. Project large request/binary
values into small application-owned summaries before reporting.

### F3. Markers bypass the budget, and generated reports can fail decoding

**Evidence:** [reporting.ts:353–393](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L353),
[value counter:421–428](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L421),
[decoder limits:683–704](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L683),
[public fallback:650–657](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L650).

Unreadable and redacted markers are added without going through the value
counter. Containers also continue emitting truncation markers after the budget
is exhausted. This is not a single global budget for emitted report data.

**Reproduced with default limits:** five arrays containing 50 references each
to an object with 50 accessor fields emitted **12,500 unreadable markers**, about
**624 KB** of JSON. The getters were not invoked. The report's own decoder rejected
it with `Report exceeds decode value limit`.

`toPublicReport(report)` then treated that rejected report as a newly thrown
object and generated a **different reference**. The user-facing reference no
longer identified the diagnostic occurrence. This also makes configuring larger
normalization limits unsafe without considering the fixed decoder limits.

**Recommendation:** count every emitted entry/marker against a shared budget;
stop a container with one omission marker when exhausted. Define a supported
encoder/decoder round-trip invariant. Add an overall serialized-size budget if
report size is contractual, since character and node limits alone are not byte
or token budgets. Public projection must not silently replace the reference of
an invalid report with a new occurrence.

### F4. Special values bypass the getter-free normalization contract

**Evidence:** [date handling:320–326](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L320),
[function handling:449–457](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L449),
[documented guarantee](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/docs/migration-to-typed-errors.md#diagnostic-normalization).

Date normalization calls `date.getTime()` and `date.toISOString()` through the
instance. Function normalization reads `value.name` directly. Both properties
can be accessors; the date methods can be overridden.

**Reproduced:** getters for a date's `getTime` and a function's `name` each ran
once during normalization. An overridden `toISOString` returned an object with
a throwing `toJSON`; `JSON.stringify(toDiagnosticReport(...))` then threw. Thus
a special value can escape the supposedly JSON-safe representation altogether.

**Recommendation:** invoke captured Date intrinsic methods with the value as
receiver, validate the result, and inspect function names through data
descriptors. Test the final JSON serialization as well as the intermediate
report. Audit the legacy adapter separately: it executes legacy message
rendering, which is also outside a descriptor-only traversal guarantee.

### F5. An error definition is live mutable configuration

**Evidence:** [typed.ts:155–218](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L155).

The class's static tag/name are captured at definition, while construction reads
the original definition object's `tag`, `message`, and `idPrefix` again.
Changing that object produced `Kind.tag === 'review/Original'` alongside
`new Kind(...)._tag === 'review/Changed'` and changed message behavior.

**Recommendation:** snapshot validated definition fields once. A kind's identity
should not depend on subsequent edits to a reusable caller configuration object.
TypeScript's readonly parameter view does not freeze the original object.

### F6. The decoder validates before cloning, rather than validating its result

**Evidence:** [reporting.ts:851–930](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L851).

The decoder first validates envelope descriptors, then re-reads the input while
cloning it. A proxy can return different descriptors on those reads.

**Reproduced:** a proxy returned a string `reference` during validation and the
number `42` during cloning. Decoding returned `success: true` with
`value.reference === 42`, violating `DiagnosticReport`. Public projection can
then return that number as its supposedly string reference.

**Recommendation:** perform bounded detachment and validate the detached object,
or build the result directly from the descriptors actually validated. This
matters for the explicitly supported hostile in-process object case; ordinary
immutable JSON parsed from the wire does not have this behavior.

### F7. Typed identity only works within one evaluated module instance

**Evidence:** [typed.ts:3–9](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L3),
[typed guard:225–234](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L225),
[report dispatch:591–629](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L591).

The guard uses a module-local `WeakSet`, despite also installing a global-symbol
brand. A second evaluated copy of the module has a different registry.

**Reproduced:** an error created by that second copy was reported by the first
as an ordinary native error. Its `kind` and `details` disappeared, and its report
reference differed from its existing `id`. Independent dependency copies in a
plugin or multi-package application can therefore break occurrence correlation.

**Recommendation:** explicitly separate trusted local instance narrowing from
diagnostic metadata extraction. Support validated data descriptors or an adapter
for foreign copies without claiming their detail shape has been authenticated.
Do not fix this by making a forgeable tag/symbol alone a trusted type guard.

### F10. Public projection processes the full diagnostic graph

**Evidence:** [reporting.ts:650–666](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L650).

`toPublicReport(error)` constructs a full diagnostic report, then keeps only its
reference. `toPublicReport(report)` decodes and clones the full report, then
keeps only its reference. Applications that log a diagnostic and present it
perform a second graph traversal. Public projection can also trigger the getter
and size problems above, although it needs none of those diagnostic fields.

**Measured:** public projection of an existing report rose from approximately
**5.7 µs** with one nested data field to **23.2 µs** with 50. Projection directly
from the typed error rose from **3.6 µs** to **19.9 µs**. These are local
microbenchmarks, not production throughput estimates.

**Recommendation:** give public projection a narrow occurrence reference input,
or provide an internal constant-cost path for known local occurrences/reports.
Keep untrusted report decoding an explicit boundary operation. A reference-only
API also removes the error-versus-report guessing responsible for F3.

### F11. Typed construction formats the stack even if nobody reads it

**Evidence:** [typed.ts:191–201](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L191).

The constructor reads `this.stack` and installs the resulting string. In this
Node runtime, an `Error.prepareStackTrace` probe ran once merely from constructing
a typed error; constructing an ordinary `Error` did not run it.

**Measured:** approximately **11.5 µs** per typed construction versus **1.9 µs**
per native `Error`, without a later stack read. This is the total difference,
including details copying, IDs, timestamps, and metadata; it does not isolate
stack formatting as the whole cost.

**Recommendation:** consider lazy stack formatting or an explicit stack policy
for frequently returned expected failures. Preserve the intended message/stack
agreement and getter-free reporting behavior when doing so. Measure realistic
stack depth and failure rate before changing ID generation or small allocations.

The legacy path additionally recompiles Handlebars on every message read
([compileTemplate](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L931),
[getCompiledMessage](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L1259)). Repeated
`addCauses` copies the accumulated list and rebuilds its aggregate
([source](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L1301)), making one-at-a-time growth
quadratic. These are secondary if legacy is removed. If retained, cache compiled
template functions while re-evaluating data, and batch causes; do not restore a
stale rendered-message cache.

## API brevity and LLM usability

### F8. Choose one default API and one primary teaching path

**Evidence:** [root exports](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/index.ts),
[legacy aliases](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L1375),
[README](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/README.md#user-guide), [package exports](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/package.json).

The 1,466-line legacy implementation exposes fluent aliases, getters/setters,
subclass defaults, template helpers, and configuration types alongside the
239-line typed module. For example, `setDetails`, `addDetails`, and `details`
coexist, as do `prefixedLines` and `plines`. A typed error's `details` and
`timestamp` are values; the legacy versions are methods.

The README introduces typed construction, then its main User Guide spends
roughly 490 lines teaching the legacy model. One example branches on message
text, while the agent guide recommends stable machine fields. This creates
competing examples for both human readers and an LLM generating code.

**Breaking recommendation:** explicitly export typed construction and reporting
from the root. Remove legacy, or move it and its guide into an optional legacy
package. Keep `getMessageRenderingError` internal. Preserve descriptive names
such as `toDiagnosticReport`; avoid adding short aliases.

This also has a measured loading benefit to pursue: fresh processes loading the
current compiled `/typed` module loaded **4 modules**, versus **82** for the root,
with median require times around **5.1 ms** and **28.0 ms** respectively. Reporting
imports the legacy class directly, so merely removing the root's legacy export
does not remove that dependency. The `sideEffects: false` declaration does not
prevent eager CommonJS imports. These measurements concern the local build,
not packed bundle size or total installation size.

Teach one complete sequence: define → construct → narrow → report → present.
Show `caught instanceof UserAlreadyExists` for local catches, exhaustive `_tag`
handling for a known union, and explicit decoding for remote reports. A broad
`isTypedException` check cannot validate a catalog-specific detail type.

### F9. Reduce type ceremony without weakening constructor guarantees

**Evidence:** [factory signature](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/typed.ts#L134),
[empty-detail example](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/tests/TypedException.test.ts#L54),
[context type](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L44).

The curried `defineException<Details>()({...})` preserves tag inference when
details are explicitly supplied. It is a TypeScript workaround, not an error
model requirement. Without that generic, the first call fixes details to
`object`; a typed callback in the second call does not recover inference.
Constant-message errors also require a function and an empty details object.

Separately, `context: Record<string, unknown>` rejects a normal named interface
such as `interface RequestContext { requestId: string }`, although the runtime
can normalize its instances. Typed error details already accept such interfaces.

**Recommendation:** evaluate a single definition call that infers details from
the annotated renderer; support a constant-message/no-details case. Accept
object-shaped context without requiring an index signature. Keep one constructor
style and retain the `details` envelope to avoid collisions with error metadata.
Keep `_tag` for the existing structural Effect integration.

An illustrative breaking API, **not implemented**:

```ts
const UserAlreadyExists = defineException({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }: { email: string }) =>
    `An account already exists for ${email}`,
});

const error = new UserAlreadyExists({ details: { email }, cause });
const diagnostic = toDiagnosticReport(error, { context: { requestId } });
const body = toPublicReport(diagnostic.reference, {
  code: 'ACCOUNT_ALREADY_EXISTS',
  message: 'An account with this email already exists.',
});
```

Retain literal-tag, missing-field, extra-field, and cause-exclusivity type checks
while changing the factory. For an error without details, allow a definition
with a constant message and `new Unavailable()`.

If legacy survives, its types also need repair: `ApplicationException.new<Special>`
can claim a subclass with methods the returned instance does not have
([source](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L925)). The documented typed-details
override accepts partial `.details(...)` but subsequently claims complete details
([source](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L1281),
[builder](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/ApplicationException.ts#L1407)). Both permit code that compiles
and then reads nonexistent data or calls nonexistent methods.

### F12. Give agents a small, explicit report contract

**Evidence:** [agent example](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/examples/agent-tool-observations.ts),
[agent guide](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/docs/migration-to-typed-errors.md#agent-and-tool-consumers),
[error normalization](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L210),
[published-file staging](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/package.json).

The existing guide correctly recommends stable fields, unknown-kind handling,
and application-owned retry/disclosure policy. The reporting contract still has
several consumption costs:

- There is no stack-exclusion option or overall byte/token budget. A 1,000-value
  limit with 4,096-character strings can permit megabytes of text; it is not a
  useful model-input budget by itself. Typed `kind` and `name` also normally repeat
  the same value. These are observations about payload size; token counts were
  not measured.
- Native provider errors lose custom structured fields such as `code` and
  `status`. A reproduced cause with `code: 'ETIMEDOUT'` and `status: 503` retained
  only `name`, `message`, and `stack`. A `Map` with entries became `{}` without an
  unsupported-value marker. Such omissions can force consumers to reason from
  prose or mistake omitted data for genuinely empty data.
- The runtime decoder is useful for JavaScript consumers, but no standalone
  JSON Schema or compact wire reference is shipped for other tool consumers.
  The publish script copies the README but not its linked migration/agent guide.
- Diagnostic redaction matches selected keys; it does not sanitize secrets or
  instructions embedded in messages and stacks. The guide acknowledges message
  disclosure limits. For agent use, also state explicitly that external error
  prose is untrusted data and must not become instructions or tool commands.

**Recommendation:** document a small, application-selected agent observation
using stable code/kind, reference, and allowlisted remediation details. Reuse
public presentation where its semantics fit. Keep authorization, retry decisions,
and transport status at the application boundary. Add stack omission and a size
budget to reporting, and export a schema for the existing wire contract rather
than building a new schema framework or making a universal retry flag.

Preserve selected native-error fields through a bounded, redacted adapter, or
document a deliberate allowlist; do not copy every provider field automatically.
Represent unsupported collection values explicitly. Ship the short guide with
the package and show one complete agent recovery example.

## Validation and limitations

- `npm test -- --runInBand`: **6 suites, 82 tests, 13 snapshots passed**.
- `npm run test:types`: **passed**.
- `npm run build`: **passed**, but built legacy construction fails as in F1.
- [Review probes](2026-09-10-review-probes.cjs) reproduce F1–F7, eager stack
  formatting, and the diagnostic field/collection losses. They assert the
  observed defects, not desired future behavior. Run after building:
  `node docs/reviews/2026-09-10-review-probes.cjs`.
- Runtime measurements used **Node v24.20.0**, the local installed dependencies,
  and the compiled CommonJS files. Construction/projection timings used five
  batches after 1,000 warmups, with 5,000 constructions or 3,000 projections per
  batch. Cold imports used five fresh processes per entry. Values are illustrative
  medians from this environment, with no production load or minimum-Node matrix.
- Full package installation/smoke testing was not run. The
  built files and the smoke-test coverage were inspected directly. No bundle-size,
  production throughput, LLM success-rate, or tokenizer benchmark was performed.

A smaller reporting edge also remains: a renderer that throws `undefined` loses
its `messageRenderingError` because presence is tested with `!== undefined`
([reporting.ts:514](https://github.com/dany-fedorov/application-exception/blob/2cc5e7e/src/reporting.ts#L514)); preserve presence separately.

## Suggested order

1. Fix F1–F4 and add built-artifact, bounded-work, and report round-trip coverage.
2. Fix definition snapshotting, decoder detachment, and foreign-copy reporting.
3. Make the typed API the core, decouple reporting from legacy dependencies, and
   replace the main guide with one complete typed workflow.
4. Simplify definition/context inputs and public projection; establish the compact
   agent contract and ship its schema/guide.
5. Profile realistic failure bursts and deep stacks, then optimize stack policy
   and any retained legacy rendering. Reconsider ID-generation or micro-allocation
   changes only if those measurements justify them.
