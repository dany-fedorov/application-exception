# Runtime support

What this page states is what the suites in [`tests/runtime`](../tests/runtime) and
[`tests/package-smoke.js`](../tests/package-smoke.js) actually observed. Every suite builds the
real publishable artifact with `prepublish-me`, runs `npm pack` on it, and installs that tarball
with its real dependency closure (`nanoid`, `caught-object-report-json`) into a throwaway
directory. No `node_modules` is hand-wired, and no suite imports `src/` or `dist/`.

## Exercised runtimes

| Runtime | How it is exercised | Script | CI job |
| --- | --- | --- | --- |
| Node 18, 20, 24 — CommonJS `require` | packed artifact installed into a consumer; full API, both reports, both JSON Schemas, and a `Node16` `tsc` check of the declarations | `npm run test:package` | `test` (matrix) |
| Node — ESM `import` | same packed artifact imported from a `"type": "module"` consumer | `npm run test:node-esm` | `test` (matrix) |
| Bun (latest; 1.4.2 locally) | same packed artifact, run by Bun from the consumer directory | `npm run test:bun` | `bun` |
| Chromium (headless, Playwright; 153.0.8010.12 locally) | a minimal Vite app that imports the packed artifact, built for the browser and served over `http://127.0.0.1` | `npm run test:browser` | `browser` |

`npm run test:runtimes` runs the three non-jest suites in order. They are deliberately out of the
default `npm test` jest run: they build, pack and install, and the browser one needs Chromium.

All four runtimes run the same file, [`tests/runtime/flow.mjs`](../tests/runtime/flow.mjs), which
uses no host API beyond the language: it defines a typed exception, builds a diagnostic and a
public report, decodes the public one after a JSON round trip, and checks that

- `error.occurrenceId`, `diagnostic.occurrence_id`, `publicReport.occurrence_id` and the decoded
  report's `occurrence_id` are the same string, in every runtime;
- `diagnostic.v` is `corj/v0.12` and equals the exported `DIAGNOSTIC_REPORT_VERSION`;
- `publicReport.v` is `appex/public/v3` and equals the exported `PUBLIC_REPORT_VERSION`;
- the public report does not carry the cause, and an invalid public code still raises
  `APPEX_INVALID_PUBLIC_CODE`.

## Occurrence ids and `nanoid`

Occurrence ids come from `nanoid`'s `customAlphabet`. `nanoid@3` declares a `browser` export
condition, and the observed resolution differs per runtime:

| Runtime | Resolved `nanoid` entry | Randomness source |
| --- | --- | --- |
| Node (CJS and ESM) | `nanoid/index.cjs` / `nanoid/index.js` | Node `crypto` |
| Bun | `nanoid/index.js` | Node-compatible `crypto` |
| Vite browser build | `nanoid/index.browser.js` | `crypto.getRandomValues` (Web Crypto) |

The browser suite asserts this rather than assuming it: it reads the Rollup module graph of the
build and fails unless `nanoid/index.browser.js` is the entry that was bundled, and unless
`nanoid/index.js` and `nanoid/index.cjs` are absent from the graph.

nanoid's browser build draws from `crypto.getRandomValues`, which is **not** gated on a secure
context — only `crypto.subtle` and `crypto.randomUUID` are. Occurrence ids were observed to
generate on a plain-HTTP non-loopback origin in headless Chromium, where `isSecureContext` is
`false` and `crypto.subtle` is `undefined`. The suite nonetheless serves the build over
`http://127.0.0.1` and asserts `window.isSecureContext === true`, so the non-secure case is
described from a one-off probe rather than pinned by CI; treat it as observed, not guaranteed
across browsers.

## No Node shims in the browser

The browser fixture is a plain frontend build. The Vite config
([`tests/runtime/browser/vite.config.mjs`](../tests/runtime/browser/vite.config.mjs)) installs no
polyfill plugin and instead fails the build if any Node builtin is resolved at all, nothing may be
left external, and after the build the emitted chunk is scanned for `node:` imports and for
`require('crypto')`. The page itself refuses to run if `Bun`, `process`, `require`, `Buffer`,
`global` or `__dirname` is defined, and the driver fails on any console error or page error.

Observed: the bundle contains `application-exception`, `caught-object-report-json` and
`nanoid/index.browser.js` and nothing from Node. `caught-object-report-json@9` has no dependencies
and requires no Node builtin, so nothing in the closure pulls Node `crypto` into the bundle.

This was verified negatively as well: adding `import 'node:crypto'` to the fixture entry fails the
build with `Node builtin "node:crypto" reached the browser bundle`.

## ESM and browser export conditions: measured, not added

The package stays CommonJS, `main: ./index.js`, with `exports` unchanged. This was measured, not
assumed.

Adding `"browser": "./index.js"` and `"import": "./index.js"` to the `"."` export was tried on a
throwaway checkout. With the extra conditions, `npm run test:types`, `npm run test:package`
(including its `Node16` declaration check) and all three runtime suites passed — and produced
**exactly the same resolutions**: Bun still loaded `index.js`, Vite still bundled the same
CommonJS entry and still picked `nanoid/index.browser.js`, Node ESM still got the same named
exports (13 today; `tests/runtime/run-node-esm.js` asserts the exact list). The conditions changed nothing because every one of them points at the same file, and the
existing `"default"` condition already covers `import` and `browser`.

So the conditions were not added:

- **No measured gain.** Nothing failed without them. Node CJS, Node ESM, Bun and a Vite browser
  build all already resolve the package correctly through `require`/`default`.
- **An `"import"` condition would advertise something the artifact is not.** `index.js` is
  CommonJS; there is no ES module build. Today `import` and `require` of the installed package
  reach one module instance — `test:node-esm` asserts that. A real dual build is what would create
  two instances, two `TypedException` constructor identities, and `instanceof` results that depend
  on how the caller loaded the package. (The internal brand uses `Symbol.for`, so
  `isTypedException` would survive that; `instanceof` would not.)
- **ESM packaging would not be evidence of portability anyway.** What the browser works on here is
  the bundle produced from the CommonJS artifact, verified in Chromium — not a packaging claim.

If an ES module build is ever added, it has to come with its own runs of these suites; the
conditions are the last step, not the proof.

## Known limitations

- **Non-secure browser contexts.** No Web Crypto means no occurrence ids. HTTPS or loopback only.
- **Browser coverage is Chromium only.** Firefox and WebKit are not exercised; the flow uses only
  `crypto.getRandomValues`, `JSON`, `Error.cause` and `AggregateError`, but that is reasoning, not
  a measurement.
- **Bun is checked at `latest` in CI** (1.4.2 locally). No lower Bun bound is claimed or tested.
- **Deno, Cloudflare Workers, React Native and edge runtimes are not exercised.** Nothing is
  claimed about them.
- **`engines.node` remains `>=18`,** and the Node matrix is 18, 20 and 24.
- The runtime suites need network access to install the dependency closure from the registry, and
  the browser suite needs a Chromium download (`npx playwright-core install chromium`).
