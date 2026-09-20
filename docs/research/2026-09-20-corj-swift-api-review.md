# corj API review through Swift's design guidelines

Reviewed 2026-09-20. Scope: the public root export of installed
`caught-object-report-json` **11.0.1**, not internal exports in bundled files.
The sibling source checkout is also 11.0.1, clean at
`78afaceb152978e6f0f73caee8fc9ffc4de5b79b`.
Sources: [installed manifest](../../node_modules/caught-object-report-json/package.json),
[published declarations](../../node_modules/caught-object-report-json/index.d.ts),
[upstream source snapshot](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/index.ts).

## Evaluation lens

Swift prioritizes call-site clarity, useful defaults, role-based names,
consistent terminology, and informative documentation. Those principles transfer
to TypeScript; Swift's argument labels, factory spelling, mutation suffixes, and
casing are language conventions rather than requirements for this package.
([Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/))

## Findings, in priority order

1. **Medium: common per-call context requires a positional hole.**
   `makeCorj(caught, undefined, { context })` is the documented path when using
   default configuration. A reader must learn the distinction between the second
   and third optional bags; the maker method instead accepts that same call bag
   second. Preserve separate constructor configuration, but consider one named bag
   for the free function, e.g. a future
   `makeCorj(caught, { context, options: { maxDepth: 2 } })`.
   Existing users can avoid the hole with
   `maker.makeReportObject(caught, { context })`.
   Evidence: installed `index.d.ts:230,267`; installed `README.md:165-171`;
   [source function](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/index.ts#L2199).
   This is usability friction, not an invalid signature.

2. **Medium: `key`/`prop`/`field` assign overlapping words to different roles.**
   In a redaction transform, `context.key` is the destination report field while
   `context.prop` is the source property. Yet `redact.keys` matches source property
   names, and `{ field: 'requestId' }` in a token source also reads a source
   property. A caller cannot consistently infer what "key" means. Prefer explicit
   `reportKey` and `sourceProperty` in callback contexts and text-scrubbing
   options; align source-entry terminology in a future major release. Start with
   a documentation table if compatibility costs outweigh a rename.
   Evidence: installed `redaction.d.ts:33-40,53-56`;
   installed `index.d.ts:132-137,260-264`;
   [source contexts](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/redaction.ts#L37).

3. **Medium: `onError` underspecifies which error and which argument is raw.**
   In an error-reporting library, the option can sound like the hook for the
   original application failure. It actually handles secondary reporting
   failures. Its first parameter is unsanitized, while its second is a scrubbed
   record. `onReportingError` with parameter names `rawError, record` would expose
   both distinctions. At minimum put the raw/scrubbed distinction directly on
   `CorjErrorHandler` and the option's declaration, where editor users see it.
   The README already explains this; the recommendation closes the editor-doc
   gap rather than alleging missing behavior or a demonstrated leak.
   Evidence: installed `index.d.ts:169,199-200`; installed `README.md:679-685,789-790`;
   [source handler](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/index.ts#L274).

4. **Low: two result names do not quite match their roles.**
   `makeJson` returns a `CorjJsonView` envelope with `value`, `truncated`, and
   `errors`, not just a JSON value or serialized string. `makeJsonView` would
   reveal that distinction. Separately, `CorjReportChild` also types the root of
   an array report; `CorjReportNode` would describe all its uses accurately.
   Consider additive aliases first. The current documentation and TypeScript
   return types mitigate both issues.
   Evidence: installed `index.d.ts:86-98,164-168,252-255,269`;
   [source view](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/index.ts#L263),
   [source node](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/index.ts#L184).

5. **Low: make copy semantics visible in editor documentation.**
   `restoreExpectedValues(report)` returns a copy, but its declaration starts
   with "Fill in" and does not explicitly say the input remains unchanged. The
   README does. Lead its JSDoc with the copy/result contract; changing it to a
   Swift-style participle is unnecessary. Similarly, the constructor and
   `makeReportObject` summaries currently describe invalid-input exceptions
   rather than their primary results. Their class/type docs supply the missing
   context, but individual hovers could be self-contained.
   Evidence: installed `expected-values.d.ts:46-57`; `README.md:384`;
   installed `index.d.ts:219-230`;
   [copy implementation](https://github.com/dany-fedorov/caught-object-report-json/blob/78afaceb152978e6f0f73caee8fc9ffc4de5b79b/src/expected-values.ts#L168).

## Strengths and changes to avoid

- `makeCorj(caught)` is a compact default entry point; `CorjMaker` makes shared
  configuration explicit, and `with({ maxDepth: 1 })` documents that it returns
  a new maker. The object/array method pair makes output choice visible.
  Evidence: installed `README.md:134-146`; `index.d.ts:219-232`.
- `occurrenceIdSources` versus `fingerprintParts` conveys the distinction
  between first-valid selection and combining contributors; each declaration
  states its rule. Keep that distinction. Evidence: installed
  `index.d.ts:193-196`.
- `inspection: 'no-invoke'`, `stackFormat: 'lines'`, and explicit size units are
  more readable than positional booleans. The inspection docs clearly explain
  proxy exceptions; do not interpret the name as a sandbox guarantee.
  Evidence: installed `index.d.ts:101-115,171-182`.
- Do not rename `make*` simply because application-exception uses `to*`, convert
  all free functions to methods, or camel-case the existing wire schema just
  to mimic Swift. These are different API roles and compatibility surfaces.
  `Corj` is established package vocabulary; expanding it everywhere would add
  little clarity.

## Verification and limits

Inspected the installed declarations and README against the clean sibling
source. A local Node smoke invocation confirmed the installed version, context
in the third free-function argument, a level-zero root in the array result,
and `{ value, truncated, errors }` from `makeJson`. No implementation changes
or tests were added. Proposed calls and aliases above are design sketches,
not presently supported APIs. Rename costs require a separate compatibility
decision; these findings do not establish runtime defects.
