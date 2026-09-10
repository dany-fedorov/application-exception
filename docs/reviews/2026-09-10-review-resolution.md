# Resolution of the September 10 API, LLM, and performance review

The [historical review](2026-09-10-api-llm-performance.md) examined commit
`2cc5e7e`. Version 0.2 resolves its F1–F12 findings and the renderer-throws-
`undefined` edge through commits `e2ffaf9`, `7003e9a`, `fedde73`, and the delivery
commit containing this document. The original defect-asserting probe is preserved
at [planning revision 34d5532](https://github.com/dany-fedorov/application-exception/blob/34d5532/docs/reviews/2026-09-10-review-probes.cjs).
The working probe now asserts current invariants.

## Finding map

| Finding                          | Resolution                                                                                                                                                                                   | Regression/evidence                                                                                                     | Remaining limit                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| F1 compiled legacy constructor   | Removed the legacy constructor and dependencies; build targets ES2022/CommonJS.                                                                                                              | Built native constructors in `tests/package-smoke.js`; root-surface probe.                                              | Existing users must migrate or stay on 0.1.x.                                                       |
| F2 full input inspection         | Arrays read selected indexes; objects cap descriptor reads; typed details reject over 1,000 keys and 32 prototype levels.                                                                    | Wide/array/constructor cases in `tests/ReportingBounds.test.ts` and `tests/TypedException.test.ts`; current wide probe. | `Reflect.ownKeys` still costs O(input width); arbitrary proxy traps have no time guarantee.         |
| F3 uncounted markers/round trips | Shared value/entry/byte credits count selected slots and markers; exhausted containers get one terminal marker; exact final byte fallback preserves the reference.                           | Budget matrix and generated-report decoder round trips in `tests/ReportingBounds.test.ts`; schema producer fixture.     | Incremental accounting is conservative and may truncate before the exact cap.                       |
| F4 Date/function getters         | Uses captured Date intrinsics and data descriptors for function names; avoids custom `toJSON` and coercion.                                                                                  | Special-value regressions and current zero-getter probe.                                                                | Hostile proxy traps can still throw or run when reflection itself is requested.                     |
| F5 mutable definition            | Snapshots validated `tag`, message, and ID prefix when the class is defined.                                                                                                                 | Definition mutation cases in `tests/TypedException.test.ts` and current probe.                                          | Definition values must meet the documented identifier bounds.                                       |
| F6 validate/clone race           | Decoder performs one bounded detachment and validates the returned snapshot.                                                                                                                 | Changing-proxy tests in `tests/ReportingBounds.test.ts`; current snapshot probe.                                        | Decoder intentionally rejects accessors, cycles, symbols, and non-plain prototypes.                 |
| F7 duplicate module identity     | Local guard remains WeakSet-based; a descriptor-only foreign view preserves valid occurrence metadata for diagnostics.                                                                       | Isolated-copy runtime tests and current copied-build probe.                                                             | Foreign metadata is diagnostic data and does not certify its details schema.                        |
| F8 competing APIs                | Root exports only typed construction/reporting; legacy and `/typed` are removed. README teaches one sequence.                                                                                | Installed-tarball exact export checks and root module-load probe.                                                       | This is an intentional breaking change.                                                             |
| F9 factory/context friction      | One-call renderer inference, constant-message no-details classes, and ordinary object-shaped context.                                                                                        | Runtime/type regressions plus installed declaration consumer.                                                           | Renderer parameters should be annotated when details inference is needed.                           |
| F10 public traversal             | `toPublicReport` accepts only a bounded nonempty reference and selected presentation.                                                                                                        | Runtime/type rejection tests, installed smoke test, projection benchmark.                                               | Applications explicitly decide what public details to normalize.                                    |
| F11 eager stacks                 | Construction and default reports do not read stack; `includeStack: true` opts in.                                                                                                            | Node 18/20/24 regressions, packed smoke test, current hook probe.                                                       | Explicit native formatting may execute `Error.prepareStackTrace`.                                   |
| F12 agent contract               | Shipped v2 schemas and agent guide; executable helper validates public wire values, branches on stable code, selects small details, escalates unknowns, and requires operation retry budget. | `tests/Schemas.test.ts`, `tests/AgentRecovery.test.ts`, and `examples/agent-recovery.ts`.                               | Authorization, idempotency, retry/backoff, and domain details validation remain application policy. |
| renderer throws `undefined`      | Records rendering-failure presence independently of its thrown value.                                                                                                                        | Reporting/typed regressions and current `$appex: undefined` probe.                                                      | Rendering failure data is diagnostic only.                                                          |

## Decisions and tradeoffs

These rulings are carried from the implementation ledger into the versioned
record:

| Decision                                                                                          | Reason                                                                                                                 | Cost if the choice is wrong                                                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Develop on `fix/reviewed-api-and-reporting` in the existing checkout.                             | Preserve review artifacts and avoid the npm-publishing `main` workflow.                                                | A separate checkout could have provided more isolation; the feature branch requires later integration. |
| Remove legacy instead of retaining a facade or second package.                                    | One learning path and no legacy runtime/dependency cost.                                                               | Legacy consumers must migrate or remain on 0.1.x.                                                      |
| Use wire v2, root-only exports, and reference-only public projection.                             | Make the new bounds and trust boundary explicit.                                                                       | Imports, call sites, and wire decoders require an intentional upgrade.                                 |
| Omit stacks by default; default to a 64 KiB report with bounded overrides.                        | Avoid eager formatting and keep ordinary tool reports compact.                                                         | Operators must opt into stacks or increase limits when richer diagnostics are justified.               |
| Reject empty/oversized public codes instead of truncating them.                                   | Truncation could collapse distinct machine codes into one branch.                                                      | Applications with codes over 128 UTF-16 units must rename them.                                        |
| Return detached plain JSON with readonly TypeScript types; do not deep-freeze reports at runtime. | Detachment prevents later input mutation from changing the result without imposing recursive freeze cost or semantics. | Consumers that require runtime immutability must freeze their own report copy.                         |
| Cap bigint decimal conversion at 4,096 magnitude digits even with a larger string limit.          | Bound conversion work before allocating decimal text.                                                                  | Larger exact bigints must be encoded upstream; reports emit `bigint-magnitude` truncation.             |

## Schemas and procedural bounds

The shipped diagnostic/public schemas validate JSON shape, exact v2 versions,
allowed envelope fields, truncation fields, and ordinary recursive JSON details.
They do not reserve `$appex`-shaped application objects or claim domain-specific
detail validation. JSON Schema cannot express total byte/work budgets, live
descriptor/accessor/prototype rules, or JavaScript's UTF-16 length units exactly;
its `maxLength` counts Unicode code points. Runtime normalization and decoding
remain authoritative for those procedural constraints.

## Measurements

All numbers are illustrative local microbenchmarks without pass/fail thresholds.
The saved pre-change experiment used Node v24.20.0, stackTraceLimit 10, five
batches after 1,000 warmups: root/typed cold imports loaded 82/4 modules; typed
construction median was 11.12 µs versus native Error 1.91 µs; public projection
from a report was 5.71 µs with one nested field and 21.50 µs with 50 fields.

The current repeatable benchmark (`npm run benchmark`) used Node v24.20.0, V8
13.6.233.17-node.53, Linux x64, and five timed batches after 1,000 warmups. On
this run: root cold import was 6.52 ms and 10 modules; typed construction 4.41 µs;
fresh construction plus diagnostic reporting was 7.96 µs without stack and
18.79 µs with stack; reference-only public projection was 0.37 µs. A 100,000-key
proxy with `maxEntries=1`, `maxValues=5`, and `maxBytes=4096` took 36.25 ms,
performed two descriptor reads, and produced 268 bytes. Key enumeration still
dominates that wide case. Baseline and current scenarios differ where noted, so
these figures describe this machine and method rather than production throughput.

## Verification

- Full `npm run test:all` passed on Node 18.20.8, 20.20.2, and 24.20.0:
  153 tests across eight suites, declaration checks, build, and an installed-tarball
  consumer check. TypeScript was 5.9.3; npm was 10.9.9 on Node 18/20 and 11.19.0
  on Node 24.
- An independent clean checkout of `c1c87c8` passed `npm ci` followed by
  `npm run test-ci` on Node 24.20.0, including coverage and installed-package
  verification. Line coverage was 93.91%; no coverage target substitutes for the
  behavioral regressions listed above.
- Four repository examples, the current invariant probe, formatting, and diff
  checks passed. The tarball test verifies all shipped relative Markdown links.
- `npm audit --omit=dev` reported zero production vulnerabilities. The unchanged
  development toolchain still produced 14 audit findings during the clean install;
  upgrading that toolchain is outside this API/reporting change.

Check remote delivery on the
[feature branch](https://github.com/dany-fedorov/application-exception/tree/fix/reviewed-api-and-reporting)
and its [test runs](https://github.com/dany-fedorov/application-exception/actions/workflows/test.yml?query=branch%3Afix%2Freviewed-api-and-reporting).
