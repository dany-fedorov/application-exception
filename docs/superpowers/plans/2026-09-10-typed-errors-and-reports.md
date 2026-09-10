# Typed Errors and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved error-model proposal into a backwards-compatible
release with trustworthy legacy behavior, typed native errors, bounded
diagnostic reports, safe public reports, and runnable boundary examples.

**Architecture:** Keep `ApplicationException` as the compatibility surface.
Add a dependency-light typed constructor in `src/typed.ts`, a defensive report
normalizer in `src/reporting.ts`, and expose both through package entry points.
Reporting consumes a small read-only error view, so it works for typed errors,
legacy errors, native errors, and arbitrary thrown values without coupling the
new API to the legacy defaults engine.

**Tech Stack:** TypeScript 4.9, CommonJS, Jest 28, Node.js 18+ native `Error`
and `AggregateError`, Effect v3 only in a pinned development example.

**Spec:** `docs/superpowers/specs/2026-09-10-error-model-design.md`

## Global Constraints

- Preserve `AppEx.new`, fluent builders, subclass defaults, Handlebars, and the
  existing `appex/v0.1` runtime field names.
- New typed construction must use a literal `_tag`, complete details, a rendered
  native message, occurrence ID, ISO timestamp, and native cause semantics.
- `application-exception/typed` must not load Handlebars or `pojo-constructor`.
- Diagnostic reporting must be bounded, deterministic for the same input, and
  must not throw on supported hostile values or print warnings.
- Public reports disclose only generic defaults plus explicitly selected values.
- No custom Result type, computation runtime, schema engine, retry system, or
  transport policy belongs in this release.
- Agentic callers get stable tagged envelopes, explicit truncation/redaction
  markers, and machine-readable decode failures; prose remains supplementary.
- Assumption: Node.js 18 is the minimum runtime because it supplies native
  `Error.cause` and `AggregateError`; TypeScript output remains CommonJS.
- Assumption: the new diagnostic and public report versions are
  `appex/diagnostic/v1` and `appex/public/v1`; legacy JSON remains `appex/v0.1`.

---

### Task 1: Restore the legacy baseline

**Files:**

- Modify: `src/ApplicationException.ts`
- Modify: `tests/ApplicationException.test.ts`

**Interfaces:**

- Consumes: existing `ApplicationException` construction and builder methods.
- Produces: truthful `ApplicationExceptionJson`, preserved normalized causes,
  recomputed template output, native cause interoperability, and truthful wrap
  return types.

- [x] **Step 1: Make the existing test suite executable**

Add `addWrapperInstanceStackToJson: false` to the complete constructor fixture.
Run `npm test -- --runInBand`; confirm the old suite executes before adding
regressions. This is a test-harness repair, not production behavior.

- [x] **Step 2: Add failing legacy regressions**

Add focused tests proving:

```ts
const error = AppEx.new('Hello {{name}}').details({ name: 'Ada' });
expect(error.getMessage()).toBe('Hello Ada');
error.details({ name: 'Grace' });
expect(error.getMessage()).toBe('Hello Grace');

const cause = new Error('database');
expect(
  AppEx.createDefaultInstance({
    message: 'failed',
    causes: [cause],
  }).getCauses(),
).toEqual([cause]);
expect(AppEx.new('failed').causedBy(cause).cause).toBe(cause);
```

Also check display-message recomputation, aggregate native cause behavior, all
documented constructor variants, and that an existing base exception returned
from a subclass's `wrap` is not typed as the subclass. Run the focused Jest file
and `npm run test:types` after that script exists; observe failures caused by
the reproduced implementation defects.

- [x] **Step 3: Implement the minimal repairs**

Add missing normalization resolvers for `causes` and `isWrapper`; recompute
legacy templates on reads so external detail mutation cannot stale the cache;
install a non-enumerable native `cause` from the cause list; change wrap typing
to `Instance | ApplicationException`; and make `ApplicationExceptionJson`
match the existing `toJSON()` output, including optional fields and stack.

- [x] **Step 4: Verify and commit**

Run `npm test -- --runInBand`, `npm run build`, and `npm run test:types`.
Commit as `fix: restore application exception contracts`.

### Task 2: Add complete typed error construction

**Files:**

- Create: `src/occurrence.ts`
- Create: `src/typed.ts`
- Create: `tests/TypedException.test.ts`
- Create: `tests/TypedException.types.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Create: `tsconfig.types.json`

**Interfaces:**

- Consumes: Nano ID and native JavaScript errors.
- Produces: `defineException<Details>()({ tag, message, idPrefix? })`,
  `TypedException<Tag, Details>`, `ExceptionInput<Details>`,
  `isTypedException`, and shared occurrence/cause helpers.

- [x] **Step 1: Specify the runtime constructor API with failing tests**

Test literal tags, `instanceof`, copied and shallow-frozen details, readable
native `.message`, unique prefixed IDs, ISO timestamps, exact single-cause
identity, ordered `AggregateError.errors`, explicit `cause: undefined`,
mutual-exclusion behavior, and renderer failure fallback without console output.
Run `npm test -- tests/TypedException.test.ts --runInBand` and confirm missing
exports are the failure.

- [x] **Step 2: Specify type behavior before implementation**

In `tests/TypedException.types.ts`, compile valid construction and narrowing,
then use `@ts-expect-error` for missing required details, wrong detail fields,
and simultaneous `cause`/`causes`. Add:

```json
"test:types": "tsc -p tsconfig.types.json --noEmit"
```

Run it and confirm failure because the typed API is missing.

- [x] **Step 3: Implement occurrence and typed modules**

Create a shared occurrence generator and a cause adapter that maps zero causes
to absence, one to identity, and many to `AggregateError`. Implement a direct
native `Error` subclass returned by the curried factory. Keep details nested;
copy and shallow-freeze them; define metadata as readonly; record renderer
failure separately for reporting. Avoid importing the legacy module.

- [x] **Step 4: Export, verify, and commit**

Export typed APIs from root and retain the standalone subpath. Run the focused
runtime and compile-time tests plus the build. Commit as
`feat: add typed application exceptions`.

### Task 3: Add bounded diagnostics and explicit public reports

**Files:**

- Create: `src/reporting.ts`
- Create: `tests/Reporting.test.ts`
- Create: `tests/Reporting.types.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: native errors, typed exceptions, legacy exceptions, arbitrary
  thrown values, optional observation context, limits, and redaction keys.
- Produces: `toDiagnosticReport`, `toPublicReport`, `decodeDiagnosticReport`,
  `DiagnosticReport`, `PublicReport`, `DiagnosticValue`, and explicit decode
  success/failure unions.

- [x] **Step 1: Specify diagnostic normalization with failing tests**

Use hand-written expected values for normal details and markers. Cover cycles,
shared values, bigint, `NaN`, infinities, undefined, functions, symbols, valid
and invalid dates, thrown getters, ignored custom `toJSON`, proxy failures,
string/depth/entry/value truncation, default and custom redaction, native cause,
aggregate causes, and renderer failures. Assert no input mutation and no console
output. Run the focused file and confirm missing exports.

- [x] **Step 2: Implement the bounded normalizer and diagnostic envelope**

Use ancestor tracking for cycles and a shared counter for the complete report.
Inspect own property descriptors so getters are never invoked. Mark every lossy,
redacted, failed, or truncated value with a stable `{ "$appex": kind }` object.
Read error metadata defensively. Reuse occurrence IDs for library errors and
create one for other caught values.

- [x] **Step 3: Specify and implement public projection and decoding**

Test that the default public report contains only version, reference, generic
code, and generic message; explicit presentations may add JSON-safe details;
typed and diagnostic inputs preserve reference correlation. Add a structural
decoder that accepts only the supported diagnostic version and validated field
shapes, returns a discriminated result, and never constructs an exception.

- [x] **Step 4: Verify and commit**

Run all runtime tests, type tests, and build. Commit as
`feat: add safe error reporting`.

### Task 4: Package entry points and prove boundary adoption

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/package-smoke.js`
- Create: `examples/account-registration-boundary.ts`
- Create: `examples/effect-integration.ts`
- Create: `docs/migration-to-typed-errors.md`
- Modify: `README.md`
- Modify: `TODO.md`

**Interfaces:**

- Consumes: Tasks 1–3 public APIs and pinned Effect v3 development dependency.
- Produces: root and `/typed` package exports, `test:package`, runnable native
  and Effect examples, and migration/adoption documentation.

- [x] **Step 1: Add a failing packed-package smoke test**

The Node script packs the repository, installs the tarball into a temporary
consumer, requires both `application-exception` and
`application-exception/typed`, constructs/reports an error, and asserts that the
standalone typed import does not load Handlebars or `pojo-constructor`. Run it
before adding package exports and confirm the subpath import fails.

- [x] **Step 2: Add package metadata and scripts**

Declare root and typed CommonJS/type exports, Node `>=18`, `types`, and
side-effect-free metadata. Add `test:all` to run Jest, type tests, build, and
the packed-package smoke test. Pin Effect v3 as a development dependency only.

- [x] **Step 3: Add runnable boundary examples**

The account example translates only a recognized storage uniqueness failure,
retains its cause, reports request context internally, and independently chooses
the public message/status. It exercises authorized registration, privacy-aware
recovery, and unexpected failure paths. The Effect v3 example introduces the
same native typed error with `Effect.fail` and recovers it with `catchTag`.
Run both with `npm run ts-file -- <path>`.

- [x] **Step 4: Document migration and agentic use**

Document legacy-to-typed mappings, failure boundaries, report schemas and
limits, privacy behavior, decoder handling, Effect interop, and a compact agent
consumer example that switches on `_tag`/`code`, treats descriptions as display
text, honors `$appex` markers, and escalates unsupported report versions instead
of guessing.

- [x] **Step 5: Verify and commit**

Run `npm run test:all` and both examples. Commit as
`docs: prove typed error adoption`.

### Task 5: Review, release, push, and merge

**Files:**

- Modify only files required by review findings or release metadata.

**Interfaces:**

- Consumes: complete implementation and repository/forge state.
- Produces: reviewed commits merged into `main` and pushed to `origin`.

- [x] **Step 1: Audit the implementation against every spec stage**

Check every acceptance criterion in the design against tests, declarations,
examples, and the packed artifact. Scan for placeholders and stale “proposed”
wording in user-facing docs. Review the entire branch diff for accidental files,
secrets, generated build output, and backward-incompatible exports.

- [x] **Step 2: Request independent code review**

Give the reviewer the base SHA, head SHA, this plan, and the design. Address all
critical and important findings with fresh failing tests before code changes,
then rerun `npm run test:all`.

- [x] **Step 3: Prepare the release commit**

Choose the next semver from the actual published version and update both package
manifest and lockfile. Verify `npm pack --dry-run`, the complete test suite,
examples, clean diff checks, and Git status. Commit release metadata separately.

- [ ] **Step 4: Push, open a PR, wait for checks, and merge**

Push the feature branch, create a PR against `main` with the concrete behavior
and validation, monitor required checks to completion, merge without force, then
update local `main` and verify its commit matches `origin/main`. Because the user
explicitly requested “push and merge,” no integration-choice prompt is needed.
