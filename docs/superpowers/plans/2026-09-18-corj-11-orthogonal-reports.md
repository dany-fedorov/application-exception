# corj 11: Orthogonal Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Intended executor: Opus at medium reasoning effort. Every decision below is already made. Do not re-open one. If a step is impossible as written, stop and report why instead of redesigning.

**Goal:** Move error records, caller context, the occurrence id and a new fingerprint into corj as general mechanisms, expose the bounded JSON view as a primitive, and merge corj's two context types, so application-exception can delete its own copies of all of them.

**Architecture:** `CorjMaker` keeps its options per maker and gains per-call input (`occurrenceId`, `fingerprint`, `context`). Failures become `CorjReportingError` records that are both written into the report and handed to `onError`. The `as_json` pipeline is reachable directly as `maker.makeJson` with a named document root. Two new root fields, `occurrence_id` and `fingerprint`, are fixed (counted, never trimmed); `context` and `reporting_errors` are droppable, in that order, before error content is touched.

**Tech Stack:** TypeScript (`@tsconfig/strictest`), Jest 28 + ts-jest with a 100% coverage gate, `ajv` 2020 for schema tests, semantic-release (commit messages drive the version), zero runtime dependencies, Node 18+.

**Spec:** `/home/df/wd/personal/application-exception/docs/superpowers/specs/2026-09-18-orthogonal-reports-corj11-appex05.md` — read Part 1 (D1 to D7) and the two tables at the top before any task.

**Repo:** `/home/df/wd/personal/caught-object-report-json`. All paths below are relative to it. This plan file lives in the application-exception repo because both plans and the spec travel together.

## Global Constraints

- Branch: `feat/orthogonal-reports`, cut from `main`. Never commit to `main`. Never merge the PR: merging publishes.
- Gate after every task: `npm run test-ci` must pass with 100% statements, branches, functions and lines. Also `npx eslint . --ext .ts` and `npx prettier --check .` must be clean (there is no lint script; these invocations work).
- One test run: `npx jest tests/<file>.test.ts -t '<test name>'`.
- Zero runtime dependencies. No `node:` imports in `src/`. No `require`. `src/` must run unchanged in a browser.
- Nothing the caught object does may make a report function throw. Only the caller's own configuration throws: `TypeError` or `RangeError`, from the constructor, `makeCorj`, `makeCorjArray`, or a call input.
- Breaking commits use `feat!:` and a `BREAKING CHANGE:` footer. End every commit message with the attribution trailer the session provides.
- Exact values, copied from the spec: reporting errors cap `8`; record text cap `256` characters; size floor `512`; id pattern `/^[\x21-\x7e]{1,128}$/`; caller fingerprint pattern `/^[\x21-\x7e]{1,64}$/`; `maxContextSize` default `16_384`; fingerprint nested-value cap `16_384`; `replacement` cap `128` characters; random id `CORJ_` + 26 characters of `0123456789ABCDEFGHJKMNPQRSTVWXYZ`; fingerprint `fp1_` + 32 hex characters; report format `corj/v0.14` and `corj/v0.14-full`.
- **Never run a break-and-restore experiment in a tree with uncommitted work.** Commit first. (An agent lost 514 lines that way in this repo.)
- `npm run test-consumers` deletes `dist/` and `npm-module-build/`. Never run it while another step needs either.
- Existing tests are the regression net. Until Task 8 no expectation in an existing test may change, except the changes a task names explicitly.

## File Structure

| File | Responsibility | Tasks |
| --- | --- | --- |
| `src/index.ts` | Options, types, the maker, node building. Already 1,339 lines: new pure logic goes into the new modules below, only `Ctx`-dependent glue lands here. | all |
| `src/redaction.ts` | Policy validation and the `Redactor`. | 1, 3 |
| `src/report-size.ts` | The size limiter and the minimal report. | 5 |
| `src/expected-values.ts` | Omission and restoration. Unchanged except the version labels. | 9 |
| `src/version.ts` | Format version and schema links. | 9 |
| `src/tokens.ts` (new) | Id and fingerprint token validation, the random id, the per-object memo. Pure. | 6 |
| `src/sha256.ts` (new) | Synchronous SHA-256 of a string. Pure. | 7 |
| `src/fingerprint.ts` (new) | Part validation, labels, header strip, canonical hash input. Pure. | 7 |
| `tests/legacy-options.ts` (new) | `LEGACY` options bag that turns the two new default-on fields off. | 8 |
| `schema-versions/corj/v0.14/`, `v0.14-full/` (new) | Published JSON Schemas. | 9 |

---

### Task 0: Branch and baseline

**Files:** none modified.

- [ ] **Step 1: Create the branch**

```bash
cd /home/df/wd/personal/caught-object-report-json
git status --short          # must print nothing; if it prints anything, stop and report
git checkout main && git pull --ff-only
git checkout -b feat/orthogonal-reports
```

- [ ] **Step 2: Record the baseline**

Run: `npm run test-ci`
Expected: all suites pass, coverage 100% on all four metrics. Record the suite and test counts in your report. If the baseline is not green, stop and report.

---

### Task 1: One context type and one stage enum

**Files:**
- Modify: `src/redaction.ts` (the `CorjRedactStage` and `CorjRedactContext` declarations near lines 14 to 35)
- Modify: `src/index.ts` (`CorjErrorStage`, `CorjErrorContext`, `CorjErrorHandler` near lines 193 to 215; the three deprecated aliases near lines 162 to 165 and 245; the re-exported type list near line 43)
- Modify: `tests/consumers/fixtures/types/probe.ts`
- Create: `tests/context-types.test.ts`

**Interfaces:**
- Produces, exported from the package root:

```ts
export type CorjStage =
  | 'prop-access' | 'as_string' | 'as_json' | 'children'
  | 'limit' | 'redact' | 'warning' | 'other';
export type CorjReportKey = keyof CorjReport | keyof CorjReportChild;
export type CorjContext = {
  stage: CorjStage;
  /** JSONPath of the value. `$` is the caught root; a named root such as `$context` is a separate document. */
  path: string;
  /** Report field the value is destined for, when known. */
  key?: CorjReportKey | undefined;
  /** Property of the caught object the value came from, when known. */
  prop?: string | undefined;
};
/** @deprecated Use {@link CorjStage}. */ export type CorjRedactStage = CorjStage;
/** @deprecated Use {@link CorjStage}. */ export type CorjErrorStage = CorjStage;
/** @deprecated Use {@link CorjContext}. */ export type CorjRedactContext = CorjContext;
/** @deprecated Use {@link CorjContext}. */ export type CorjErrorContext = CorjContext;
```

- Removed: `CaughtObjectReportJson`, `CaughtObjectReportJsonChild`, `CorjMakerOptions`.

`CorjContext` must be declared in `src/redaction.ts` (it has no imports from `index.ts` at runtime; use `import type` for `CorjReport` and `CorjReportChild`), and re-exported from `src/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/context-types.test.ts`. ts-jest type-checks test files, so a wrong type fails the run.

```ts
import type {
  CorjContext,
  CorjErrorContext,
  CorjErrorStage,
  CorjRedactContext,
  CorjRedactStage,
  CorjStage,
} from '../src/index';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
const assertType = <T extends true>(): T => true as T;

describe('shared context types', () => {
  test('the four old names are aliases of the two new ones', () => {
    assertType<Equal<CorjRedactStage, CorjStage>>();
    assertType<Equal<CorjErrorStage, CorjStage>>();
    assertType<Equal<CorjRedactContext, CorjContext>>();
    assertType<Equal<CorjErrorContext, CorjContext>>();
  });

  test('one value is a valid context for a transform and for a handler', () => {
    const context: CorjContext = {
      stage: 'as_json',
      path: '$context.user',
      key: 'as_json',
      prop: 'user',
    };
    const forTransform: CorjRedactContext = context;
    const forHandler: CorjErrorContext = context;
    expect(forTransform).toBe(forHandler);
  });

  test('every stage of the old two enums is a CorjStage', () => {
    const stages: CorjStage[] = [
      'prop-access', 'as_string', 'as_json', 'children',
      'limit', 'redact', 'warning', 'other',
    ];
    expect(stages).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest tests/context-types.test.ts`
Expected: FAIL, `Module '"../src/index"' has no exported member 'CorjContext'`.

- [ ] **Step 3: Implement**

Replace the two stage unions and the two context types with the declarations in **Interfaces**. Inside `src/index.ts` and `src/redaction.ts`, rename every internal use to `CorjContext` / `CorjStage`. The cast `context.key as keyof CorjReport | undefined` in the `CorjMaker` constructor disappears. Delete the three removed aliases. In `tests/consumers/fixtures/types/probe.ts`, replace any use of a removed alias with `CorjReport`, `CorjReportChild` or `CorjOptions`.

- [ ] **Step 4: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat!: one CorjContext and one CorjStage for transforms, handlers and records

BREAKING CHANGE: CaughtObjectReportJson, CaughtObjectReportJsonChild and CorjMakerOptions are removed (deprecated since 9). CorjRedactStage, CorjErrorStage, CorjRedactContext and CorjErrorContext are now deprecated aliases of CorjStage and CorjContext."
```

---

### Task 2: Reporting errors are report data, and the handler stays

**Files:**
- Modify: `src/index.ts` (`Ctx` near line 440, `reportError` near 459, `defaultOnError` near 272, `build` near 1182, `finish` near 1236, the `CorjMaker` class near 1268, `CorjReportBase` near 109)
- Create: `tests/reporting-errors.test.ts`
- Modify: existing tests, only to add the `reporting_errors` a provoked failure now produces

**Interfaces:**
- Consumes: `CorjContext` from Task 1.
- Produces:

```ts
export type CorjReportingError = CorjContext & { error: string };
export type CorjErrorHandler = (caught: unknown, record: CorjReportingError) => void;
// on CorjReportBase, root only:
reporting_errors?: CorjReportingError[];
// internal
type Ctx = { options; stringify; redactor; errors: CorjReportingError[] | null };
function reportError(ctx: Ctx, caught: unknown, context: CorjContext): void;
```

`ctx.errors === null` means "sealed": the record goes to the handler only.

- [ ] **Step 1: Write the failing tests**

Create `tests/reporting-errors.test.ts`:

```ts
import { CorjMaker, makeCorj } from '../src/index';
import type { CorjReportingError } from '../src/index';

const silent = () => undefined;

function throwingGetter(message: string): Error {
  const error = new Error('outer');
  Object.defineProperty(error, 'message', {
    get() {
      throw new Error(message);
    },
    enumerable: false,
    configurable: true,
  });
  return error;
}

describe('reporting errors as data', () => {
  test('a failure is written into the report and handed to onError as the same record', () => {
    const seen: [unknown, CorjReportingError][] = [];
    const report = makeCorj(throwingGetter('getter blew up'), {
      onError: (caught, record) => seen.push([caught, record]),
    });
    expect(report.reporting_errors).toBeDefined();
    const row = report.reporting_errors!.find((r) => r.prop === 'message')!;
    expect(row).toEqual({
      stage: 'prop-access',
      path: '$',
      key: 'message',
      prop: 'message',
      error: 'Error: getter blew up',
    });
    const handed = seen.find(([, r]) => r.prop === 'message')!;
    expect(handed[1]).toEqual(row);
    expect(handed[0]).toBeInstanceOf(Error); // the raw thrown value, for sinks such as Sentry
  });

  test('a clean report has no reporting_errors field', () => {
    expect(makeCorj(new Error('fine'), { onError: silent })).not.toHaveProperty(
      'reporting_errors',
    );
  });

  test('at most 8 records are kept; the handler still sees every failure', () => {
    // One failing getter per child: a single hostile object fails `as_json` once, as a whole.
    const children = Array.from({ length: 12 }, (_, i) => throwingGetter(`boom ${i}`));
    let calls = 0;
    const report = makeCorj(new AggregateError(children, 'many'), {
      onError: () => calls++,
    });
    expect(report.reporting_errors).toHaveLength(8);
    expect(calls).toBeGreaterThan(8);
  });

  test('text is scrubbed before it is cut to 256 characters', () => {
    const secret = 'sk-abcdefghij';
    const padding = 'x'.repeat(250);
    const report = makeCorj(throwingGetter(`${padding}${secret}`), {
      onError: silent,
      redact: { patterns: [/sk-[a-z]{10}/g] },
    });
    const row = report.reporting_errors!.find((r) => r.prop === 'message')!;
    expect(row.error).toHaveLength(256);
    expect(row.error).not.toContain('sk-');
    expect(JSON.stringify(report)).not.toContain('sk-abc');
  });

  test('path and prop of a record go through the policy', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'link_sk-abcdefghij', {
      get() {
        throw new Error('nope');
      },
    });
    const report = makeCorj(hostile, {
      onError: silent,
      childrenSources: ['link_sk-abcdefghij'],
      redact: { patterns: [/sk-[a-z]{10}/g] },
    });
    const row = report.reporting_errors!.find((r) => r.stage === 'children')!;
    expect(row.prop).toBe('link_[redacted]');
    expect(JSON.stringify(report.reporting_errors)).not.toContain('sk-abc');
  });

  test('a redact-stage record withholds the thrown message entirely', () => {
    const report = makeCorj(new Error('plain'), {
      onError: silent,
      redact: {
        transform: () => {
          throw new Error('policy failed on SECRET-VALUE');
        },
      },
    });
    const rows = report.reporting_errors!.filter((r) => r.stage === 'redact');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.error).toBe('[redacted]');
    expect(JSON.stringify(report)).not.toContain('SECRET-VALUE');
  });

  test('records are per call: a shared maker does not leak one report into the next', () => {
    const maker = new CorjMaker({ onError: silent });
    expect(maker.makeReportObject(throwingGetter('first')).reporting_errors).toBeDefined();
    expect(maker.makeReportObject(new Error('clean'))).not.toHaveProperty('reporting_errors');
  });

  test('a caught object that re-enters the same maker keeps both record lists apart', () => {
    const maker = new CorjMaker({ onError: silent });
    let inner: ReturnType<typeof maker.makeReportObject> | undefined;
    const outer = {
      toCorjAsJson() {
        inner = maker.makeReportObject(new Error('inner is clean'));
        throw new Error('outer hook failed');
      },
    };
    const report = maker.makeReportObject(outer);
    expect(inner).not.toHaveProperty('reporting_errors');
    expect(report.reporting_errors!.some((r) => r.prop === 'toCorjAsJson')).toBe(true);
  });

  test('the default handler prints the scrubbed record, never the raw text', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      makeCorj(throwingGetter('leak sk-abcdefghij'), {
        redact: { patterns: [/sk-[a-z]{10}/g] },
      });
      const printed = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(printed).toContain('stage=prop-access');
      expect(printed).toContain('prop=message');
      expect(printed).not.toContain('sk-abc');
    } finally {
      warn.mockRestore();
    }
  });

  test('a handler that throws cannot break the report', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const report = makeCorj(throwingGetter('x'), {
        onError: () => {
          throw new Error('handler bug');
        },
      });
      expect(report.reporting_errors).toBeDefined();
    } finally {
      warn.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest tests/reporting-errors.test.ts`
Expected: FAIL to compile, `Property 'reporting_errors' does not exist on type 'CorjReport'`.

- [ ] **Step 3: Implement**

1. Add `reporting_errors?: CorjReportingError[]` to `CorjReportBase` with the doc comment: `Root only. Failures met while this report was produced, at most 8. Absent when there were none.`
2. Add `errors: CorjReportingError[] | null` to `Ctx`; the constructor sets `errors: null`.
3. Replace `reportError` and `defaultOnError`:

```ts
const MAX_REPORTING_ERRORS = 8;
const REPORTING_ERROR_MAX_LENGTH = 256;

function makeRecord(
  ctx: Ctx,
  caught: unknown,
  context: CorjContext,
): CorjReportingError {
  const redactor = ctx.redactor;
  // The whole record is scrubbed as the `warning` text it is, with corj's own
  // context, so a path- or prop-keyed `transform` behaves as it did on the value.
  const where: CorjContext = {
    stage: 'warning',
    path: context.path,
    key: context.key,
    prop: context.prop,
  };
  const scrub = (text: string): string =>
    redactor === null ? text : redactor.text(text, where);
  // Scrub first, cut second: a secret straddling the cut would stop matching.
  // A policy's own failure is never quoted: its message can hold what it protected.
  const error =
    context.stage === 'redact' && redactor !== null
      ? redactor.policy.replacement
      : scrub(describeValue(caught)).slice(0, REPORTING_ERROR_MAX_LENGTH);
  return toObject<CorjReportingError>([
    ['stage', context.stage],
    ['path', scrub(context.path)],
    ['key', context.key],
    ['prop', context.prop === undefined ? undefined : scrub(context.prop)],
    ['error', error],
  ]);
}

function reportError(ctx: Ctx, caught: unknown, context: CorjContext): void {
  const record = makeRecord(ctx, caught, context);
  if (ctx.errors !== null && ctx.errors.length < MAX_REPORTING_ERRORS) {
    ctx.errors.push(record);
  }
  try {
    ctx.options.onError(caught, record);
  } catch (failure: unknown) {
    console.warn(
      `[caught-object-report-json] onError threw: ${describeValue(failure)}`,
    );
  }
}

function defaultOnError(_caught: unknown, record: CorjReportingError): void {
  const where = [
    `stage=${record.stage}`,
    `path=${record.path}`,
    record.key === undefined ? null : `field=${record.key}`,
    record.prop === undefined ? null : `prop=${record.prop}`,
  ]
    .filter(Boolean)
    .join(' ');
  console.warn(`[caught-object-report-json] ${where}: ${record.error}`);
}
```

   `toObject` is declared later in the file as a function declaration, so it is hoisted. `Redactor.text` already returns the replacement while the redactor's own failure is being reported (its `failing` guard), so a redact-stage record's `path` may be the replacement. That is the fail-closed behaviour; keep it.
4. In the `CorjMaker` class add a private scope helper and use it in both report methods:

```ts
  /** Records are per call. A caught object may re-enter this maker, so the previous list is restored. */
  private collecting<T>(produce: () => T): T {
    const previous = this.ctx.errors;
    this.ctx.errors = [];
    try {
      return produce();
    } finally {
      this.ctx.errors = previous;
    }
  }

  makeReportObject(caught: unknown): CorjReport {
    return this.collecting(() =>
      finish(this.ctx, build(this.ctx, caught, false) as CorjReport),
    );
  }
```

5. In `build`, compute `const reportingErrors = ctx.errors !== null && ctx.errors.length > 0 ? [...ctx.errors] : undefined;` as the **last** thing before the root object is assembled, and add the entry `['reporting_errors', reportingErrors]` to the root in both shapes, directly before `...tail`. Then seal: at the top of `finish`, set `ctx.errors = null` (the `collecting` helper restores it). Failures inside `finish` therefore reach the handler only.
6. Update the `onError` doc comment in `CorjOptions` to `(caught, record)`.

- [ ] **Step 4: Update the existing expectations this changes**

Run: `npx jest`. Tests that provoke a failure and compare a whole report now see an extra `reporting_errors` field. For each such failure, add the field to the expectation. **Allowed change: adding `reporting_errors`, and changing a handler assertion from a context to a record (the record has the same four fields plus `error`).** Nothing else. If another field changed, the implementation is wrong.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%. If the `collecting` `finally` branch or the `ctx.errors !== null` false branch is uncovered, the re-entrancy test and a test that provokes a `stage: 'limit'` failure cover them; add the latter to `tests/reporting-errors.test.ts` the way `tests/review-regressions.test.ts` already provokes it: `jest.spyOn(reportSize, 'limitReportSize').mockImplementation(() => { throw failure; })` with `import * as reportSize from '../src/report-size'`, restored in `afterEach`. Assert the handler saw a record with `stage: 'limit'` and that the returned report has no row with that stage.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: reporting errors are report data, and onError receives the same scrubbed record

BREAKING CHANGE: onError is called as (caught, record); record is the old context plus a scrubbed, bounded error text. Reports gain a root reporting_errors field (at most 8 rows). Closes #219."
```

---

### Task 3: `makeJson`, `scrubText`, and a tighter policy

**Files:**
- Modify: `src/index.ts` (`serialize` near 1055, `makeAsJson` near 1074, the `CorjMaker` class, the export list near lines 37 to 49)
- Modify: `src/redaction.ts` (`resolveRedactPolicy` near 76)
- Create: `tests/json-view.test.ts`
- Modify: `tests/exports-assertions.test.ts` (the surface snapshot loses `CorjRedactor`), `tests/redaction.test.ts` (tests that construct `CorjRedactor` move to `maker.scrubText`)

**Interfaces:**
- Produces:

```ts
export type CorjJsonView = {
  value: CorjJsonValue | null;
  truncated: boolean;
  errors: CorjReportingError[];
};
// on CorjMaker
makeJson(value: unknown, options?: { root?: string; maxSize?: number | null }): CorjJsonView;
scrubText(text: string, where?: { path?: string; key?: CorjReportKey; prop?: string }): string;
```

- Removed export: `CorjRedactor`. `resolveCorjRedactPolicy` stays.

- [ ] **Step 1: Write the failing tests**

Create `tests/json-view.test.ts`:

```ts
import { CorjMaker, resolveCorjRedactPolicy } from '../src/index';
import * as corj from '../src/index';

const silent = () => undefined;

describe('maker.makeJson', () => {
  test('returns the bounded JSON form of any value', () => {
    const view = new CorjMaker().makeJson({ runId: 'run-1', nested: { n: 1 } });
    expect(view).toEqual({
      value: { runId: 'run-1', nested: { n: 1 } },
      truncated: false,
      errors: [],
    });
  });

  test('does not hide children sources: a view has no children', () => {
    const view = new CorjMaker().makeJson({ cause: 'kept', errors: [1] });
    expect(view.value).toEqual({ cause: 'kept', errors: [1] });
  });

  test('maxSize bounds the view and reports truncation', () => {
    const view = new CorjMaker().makeJson(
      { big: 'x'.repeat(5000) },
      { maxSize: 256 },
    );
    expect(view.truncated).toBe(true);
    expect(JSON.stringify(view.value).length).toBeLessThanOrEqual(256);
  });

  test('a named root is where paths start, so rules can tell documents apart', () => {
    const maker = new CorjMaker({
      onError: silent,
      redact: { paths: ['$context.user.email'] },
    });
    const inContext = maker.makeJson(
      { user: { email: 'a@b.c', name: 'A' } },
      { root: '$context' },
    );
    expect(inContext.value).toEqual({ user: { email: '[redacted]', name: 'A' } });
    const elsewhere = maker.makeJson(
      { user: { email: 'a@b.c' } },
      { root: '$public' },
    );
    expect(elsewhere.value).toEqual({ user: { email: 'a@b.c' } });
  });

  test('a rule rooted at the caught value does not reach a named root', () => {
    const maker = new CorjMaker({ redact: { paths: ['$.password'] } });
    expect(maker.makeJson({ password: 'p' }, { root: '$context' }).value).toEqual({
      password: 'p',
    });
    expect(maker.makeJson({ password: 'p' }).value).toEqual({
      password: '[redacted]',
    });
  });

  test('failures come back as records with the named root in their path', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'bad', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    const view = new CorjMaker({ onError: silent }).makeJson(hostile, {
      root: '$context',
    });
    expect(view.errors.length).toBeGreaterThan(0);
    expect(view.errors[0]!.path.startsWith('$context')).toBe(true);
  });

  test.each([['context'], ['$'.repeat(2)], ['$.a'], ['$a.b'], ['$1a'], ['']])(
    'rejects the root %j',
    (root) => {
      expect(() => new CorjMaker().makeJson({}, { root })).toThrow(TypeError);
    },
  );

  test.each([[255], [1.5], [Number.NaN]])('rejects maxSize %p', (maxSize) => {
    expect(() => new CorjMaker().makeJson({}, { maxSize })).toThrow(RangeError);
  });

  test('maxSize: null removes the view bound', () => {
    const view = new CorjMaker({ maxReportSize: 512 }).makeJson(
      { big: 'x'.repeat(5000) },
      { maxSize: null },
    );
    expect(view.truncated).toBe(false);
  });

  test('obeys inspection: no-invoke reads no getter', () => {
    let ran = 0;
    const value = {};
    Object.defineProperty(value, 'lazy', {
      enumerable: true,
      get() {
        ran++;
        return 1;
      },
    });
    const view = new CorjMaker({ inspection: 'no-invoke' }).makeJson(value);
    expect(ran).toBe(0);
    expect(view.value).toEqual({ lazy: '[not-inspected]' });
  });
});

describe('maker.scrubText', () => {
  test('applies the scrub rules to one string, with a literal replacement', () => {
    const maker = new CorjMaker({
      redact: { patterns: [/sk-[a-z]{10}/g], replacement: '<$&>' },
    });
    expect(maker.scrubText('key sk-abcdefghij here')).toBe('key <$&> here');
  });

  test('is the identity without a policy', () => {
    expect(new CorjMaker().scrubText('unchanged')).toBe('unchanged');
  });

  test('passes where to a transform with stage warning', () => {
    const seen: unknown[] = [];
    const maker = new CorjMaker({
      redact: {
        transform: (value, context) => {
          seen.push(context);
          return value;
        },
      },
    });
    maker.scrubText('text', { path: '$public.message', key: 'message' });
    expect(seen).toEqual([
      { stage: 'warning', path: '$public.message', key: 'message', prop: undefined },
    ]);
  });

  test('a throwing policy fails closed to the replacement', () => {
    const maker = new CorjMaker({
      onError: silent,
      redact: {
        transform: () => {
          throw new Error('bug');
        },
      },
    });
    expect(maker.scrubText('anything')).toBe('[redacted]');
  });
});

describe('policy validation', () => {
  test('a replacement longer than 128 characters is rejected', () => {
    expect(() =>
      resolveCorjRedactPolicy({ replacement: 'x'.repeat(129) }),
    ).toThrow('redact.replacement must be a string of at most 128 characters');
    expect(resolveCorjRedactPolicy({ replacement: 'x'.repeat(128) })).not.toBeNull();
  });

  test('a resolved policy is returned as is, without re-validation', () => {
    const resolved = resolveCorjRedactPolicy({ keys: ['a'] });
    expect(resolveCorjRedactPolicy(resolved)).toBe(resolved);
  });

  test('CorjRedactor is no longer exported', () => {
    expect(Object.keys(corj)).not.toContain('CorjRedactor');
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest tests/json-view.test.ts`
Expected: FAIL to compile, `Property 'makeJson' does not exist on type 'CorjMaker'`.

- [ ] **Step 3: Implement the policy changes in `src/redaction.ts`**

```ts
const MAX_REPLACEMENT_LENGTH = 128;
/** Policies this module froze; handing one back in skips validation. */
const resolved = new WeakSet<object>();
```

At the top of `resolveRedactPolicy`, after the `null` check: `if (typeof input === 'object' && resolved.has(input)) return input as CorjRedactPolicy;`. Change the replacement check to reject `input.replacement.length > MAX_REPLACEMENT_LENGTH` with the message `redact.replacement must be a string of at most 128 characters` (one message for both the non-string and the too-long case; update the existing test that asserts the old message). Before returning, `resolved.add(policy)`.

- [ ] **Step 4: Implement the view in `src/index.ts`**

1. `serialize` gains a last parameter `lengthLimit?: number | null`. Pass it through as the per-call `lengthLimit` only when it is a number. When it is `null`, the view must be unbounded: the configured serializer always has the maker's `lengthLimit`, so build the maker's serializer options once in the constructor and keep a second, unbounded serializer lazily: add `unbounded: Stringify | null` to `Ctx`, created on first use with the same options minus `lengthLimit`.
2. `makeAsJson(ctx, node, view?: { lengthLimit: number | null })`. When `view` is given: the default serialization passes `replacer = null` and `skipChildrenSources = false`, and both serializations pass `view.lengthLimit`. `.toCorjAsJson` is still honoured, under the same `inspection` rule as today.
3. Add to `CorjMaker`:

```ts
const ROOT_PATTERN = /^\$([A-Za-z_][A-Za-z0-9_]*)?$/;

  makeJson(
    value: unknown,
    options: { root?: string; maxSize?: number | null } = {},
  ): CorjJsonView {
    const root = options.root ?? '$';
    if (typeof root !== 'string' || !ROOT_PATTERN.test(root)) {
      throw new TypeError(
        'root must be "$" or a named root such as "$context": "$" followed by an identifier',
      );
    }
    const maxSize =
      options.maxSize === undefined ? this.options.maxReportSize : options.maxSize;
    if (maxSize !== null && (!Number.isSafeInteger(maxSize) || maxSize < 256)) {
      throw new RangeError('maxSize must be a safe integer >= 256, or null');
    }
    return this.collecting(() => {
      const made = makeAsJson(
        this.ctx,
        { id: 'root', index: -1, level: 0, path: root, obj: value, childIds: [] },
        { lengthLimit: maxSize },
      );
      return {
        value: made.value,
        truncated: made.truncated,
        errors: [...(this.ctx.errors as CorjReportingError[])],
      };
    });
  }

  scrubText(
    text: string,
    where: { path?: string; key?: CorjReportKey; prop?: string } = {},
  ): string {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    const redactor = this.ctx.redactor;
    if (redactor === null) return text;
    return redactor.text(text, {
      stage: 'warning',
      path: where.path ?? '$',
      key: where.key,
      prop: where.prop,
    });
  }
```

   `ROOT_PATTERN` is a module constant, not a class member. The floor of `maxSize` stays 256 here; Task 5 raises only the **report** floor.
4. Delete `export { Redactor as CorjRedactor }`. Update the surface snapshot in `tests/exports-assertions.test.ts`. In `tests/redaction.test.ts`, rewrite the tests that build a `CorjRedactor` so they call `new CorjMaker({ redact }).scrubText(...)`; each must keep asserting the same behaviour.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: maker.makeJson with named roots and maker.scrubText; CorjRedactor is no longer exported

BREAKING CHANGE: the CorjRedactor export is removed; use maker.scrubText. redact.replacement is capped at 128 characters."
```

---

### Task 4: Per-call input and the `context` container

**Files:**
- Modify: `src/index.ts` (`CorjOptions`, `CORJ_DEFAULT_OPTIONS`, `OPTION_KEYS`, `resolveOptions`, `CorjReportBase`, `build`, the maker methods, `makerFor`, `makeCorj`, `makeCorjArray`)
- Create: `tests/call-input.test.ts`

**Interfaces:**
- Consumes: `makeAsJson(ctx, node, view)` and `collecting` from Tasks 2 and 3.
- Produces:

```ts
export type CorjCallInput = {
  occurrenceId?: string;  // wired in Task 6
  fingerprint?: string;   // wired in Task 7
  context?: unknown;
};
// option
maxContextSize: number | null;       // default 16_384
// on CorjReportBase, root only
context?: CorjJsonValue | null;
context_omitted?: 'max_size';        // set by the limiter in Task 5
// signatures
makeReportObject(caught: unknown, call?: CorjCallInput): CorjReport;
makeReportArray(caught: unknown, call?: CorjCallInput): CorjReportChild[];
makeCorj(caught: unknown, options?: CorjOptionsInput, call?: CorjCallInput): CorjReport;
makeCorjArray(caught: unknown, options?: CorjOptionsInput, call?: CorjCallInput): CorjReportChild[];
// internal
function resolveCall(call: unknown): CorjCallInput;   // validates, throws TypeError
function build(ctx: Ctx, caught: unknown, asArray: boolean, call: CorjCallInput): Report;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/call-input.test.ts`:

```ts
import { CorjMaker, makeCorj, makeCorjArray, restoreExpectedValues } from '../src/index';

const silent = () => undefined;

describe('call input: context', () => {
  test('context is rendered into the root of an object report', () => {
    const report = makeCorj(new Error('x'), undefined, { context: { runId: 'run-1' } });
    expect(report.context).toEqual({ runId: 'run-1' });
  });

  test('context sits on the root row of an array report', () => {
    const rows = makeCorjArray(new Error('x', { cause: new Error('y') }), undefined, {
      context: { runId: 'run-1' },
    });
    expect(rows[0]!.context).toEqual({ runId: 'run-1' });
    expect(rows[1]).not.toHaveProperty('context');
  });

  test('no context argument, no field; an explicit undefined is the same', () => {
    expect(makeCorj(new Error('x'))).not.toHaveProperty('context');
    expect(makeCorj(new Error('x'), undefined, { context: undefined })).not.toHaveProperty(
      'context',
    );
  });

  test('context: null is kept as null', () => {
    expect(makeCorj(new Error('x'), undefined, { context: null }).context).toBeNull();
  });

  test('context paths start at $context, so the policy can address it', () => {
    const report = makeCorj(
      Object.assign(new Error('x'), { user: { email: 'kept@caught' } }),
      { redact: { paths: ['$context.user.email'] } },
      { context: { user: { email: 'gone@context' } } },
    );
    expect(report.context).toEqual({ user: { email: '[redacted]' } });
    expect(report.as_json).toEqual({ user: { email: 'kept@caught' } });
  });

  test('a failure inside context is recorded with a $context path', () => {
    const context = {};
    Object.defineProperty(context, 'bad', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    const report = makeCorj(new Error('x'), { onError: silent }, { context });
    expect(report.reporting_errors!.some((r) => r.path.startsWith('$context'))).toBe(true);
  });

  test('maxContextSize caps the container on its own', () => {
    const report = makeCorj(
      new Error('x'),
      { maxContextSize: 256 },
      { context: { big: 'c'.repeat(5000) } },
    );
    expect(JSON.stringify(report.context).length).toBeLessThanOrEqual(256);
    expect(report.truncated).toBe(true);
  });

  test('maxContextSize: null leaves only the report budget', () => {
    const report = makeCorj(
      new Error('x'),
      { maxContextSize: null, maxReportSize: null },
      { context: { big: 'c'.repeat(20_000) } },
    );
    expect((report.context as { big: string }).big).toHaveLength(20_000);
  });

  test.each([[255], [1.5], ['1000']])('rejects maxContextSize %p', (maxContextSize) => {
    expect(
      () => new CorjMaker({ maxContextSize: maxContextSize as number }),
    ).toThrow(RangeError);
  });

  test('a call input that is not an object, or has an unknown key, is rejected', () => {
    const maker = new CorjMaker();
    expect(() => maker.makeReportObject(new Error('x'), 5 as never)).toThrow(TypeError);
    expect(() =>
      maker.makeReportObject(new Error('x'), { contxt: 1 } as never),
    ).toThrow('Unknown call input "contxt". Known call inputs: occurrenceId, fingerprint, context');
  });

  test('one maker serves calls with different context', () => {
    const maker = new CorjMaker();
    expect(maker.makeReportObject(new Error('a'), { context: 1 }).context).toBe(1);
    expect(maker.makeReportObject(new Error('b'), { context: 2 }).context).toBe(2);
    expect(maker.makeReportObject(new Error('c'))).not.toHaveProperty('context');
  });

  test('restoreExpectedValues leaves context alone', () => {
    const report = makeCorj(new Error('x'), undefined, { context: { a: 1 } });
    expect(restoreExpectedValues(report).context).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest tests/call-input.test.ts`
Expected: FAIL to compile, `Expected 1-2 arguments, but got 3`.

- [ ] **Step 3: Implement**

1. `maxContextSize`: add to `CorjOptions` (doc: `Own size cap of the context container, inside maxReportSize. Defaults to 16384; null leaves only the report budget.`), to `CORJ_DEFAULT_OPTIONS` (`16_384`), to `OPTION_KEYS` and `resolveOptions` (`pick`; validate: `null`, or a safe integer >= 256, else `RangeError('maxContextSize must be a safe integer >= 256, or null')`).
2. `resolveCall`:

```ts
const CALL_KEYS = ['occurrenceId', 'fingerprint', 'context'] as const;

function resolveCall(call: unknown): CorjCallInput {
  if (call === undefined) return {};
  if (typeof call !== 'object' || call === null || Array.isArray(call)) {
    throw new TypeError('call input must be an object');
  }
  for (const key of Object.keys(call)) {
    if (!(CALL_KEYS as readonly string[]).includes(key)) {
      throw new TypeError(
        `Unknown call input "${key}". Known call inputs: ${CALL_KEYS.join(', ')}`,
      );
    }
  }
  return call as CorjCallInput;
}
```

3. In `build`, after the node rows are made and before `reporting_errors` is read (context failures must be in that list):

```ts
  let context: CorjJsonValue | null | undefined;
  if (call.context !== undefined) {
    const view = makeAsJson(
      ctx,
      { id: 'context', index: -1, level: 0, path: '$context', obj: call.context, childIds: [] },
      { lengthLimit: ctx.options.maxContextSize },
    );
    context = view.value;
    anyTruncated ||= view.truncated;
  }
```

   Add `['context', context]` to the root entries in both shapes, directly before `['reporting_errors', ...]`.
   `makeAsJson` returns `value: null` for a value without a JSON form, so `context: () => 1` becomes `null`; that is intended.
4. Thread `call` through: `makeReportObject(caught, call)` runs `resolveCall(call)` **before** `collecting` (a bad call input throws before any work), then `build(this.ctx, caught, false, resolved)`. Same for the array form. `makeCorj(caught, options, call)` and `makeCorjArray` pass `call` on.
5. `src/expected-values.ts` and `src/report-size.ts` are untouched in this task: `context` is not a content key yet, so an over-budget context is currently trimmed by nothing. Task 5 handles it; do not add a test for that here.

- [ ] **Step 4: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: per-call input and a budgeted context container rooted at \$context"
```

---

### Task 5: The limiter: drop order, fixed fields, floor 512

**Files:**
- Modify: `src/report-size.ts` (`resolveReportSizeOptions` near 36, `metadataKeys` near 74, `makeMinimalReport` near 84, `limitReportSize` near 106)
- Modify: `src/index.ts` (`CorjReportBase`: `reporting_errors_omitted`)
- Create: `tests/limiter-order.test.ts`
- Modify: existing tests that use a `maxReportSize` below 512, and those that expect `v` to be dropped

**Interfaces:**
- Produces, on `CorjReportBase`, root only: `context_omitted?: 'max_size'` (declared in Task 4), `reporting_errors_omitted?: 'max_size'`.
- Produces: `export const CORJ_MIN_REPORT_SIZE = 512` from `src/report-size.ts` (internal; not re-exported from the package root).
- Fixed root fields, never trimmed and present in the minimal report: `occurrence_id`, `fingerprint`, `v`. The first two do not exist until Tasks 6 and 7; this task handles them by name so those tasks need no limiter change. Declare them on `CorjReportBase` now: `occurrence_id?: string; fingerprint?: string;` with the doc comments `Root only. Identifies this occurrence; see occurrenceIdSources.` and `Root only. Equal for failures of the same kind from the same place; see fingerprintParts.`

- [ ] **Step 1: Write the failing tests**

Create `tests/limiter-order.test.ts`:

```ts
import { CorjMaker, makeCorj, makeCorjArray } from '../src/index';
import type { CorjReport } from '../src/index';

const silent = () => undefined;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

function noisy(): Error {
  const error = new Error('m'.repeat(300));
  // A fixed stack: jest runs with a stack trace limit of 1000, and a real stack would decide the sizes below.
  error.stack = 'Error: fixed\n    at fixed (file.js:1:1)';
  Object.defineProperty(error, 'bad', {
    enumerable: true,
    get() {
      throw new Error('getter failed');
    },
  });
  return error;
}

describe('limiter drop order', () => {
  test('the floor is 512', () => {
    expect(() => new CorjMaker({ maxReportSize: 511 })).toThrow(
      'maxReportSize must be a safe integer >= 512, or null to disable the limit',
    );
    expect(() => new CorjMaker({ maxReportSize: 512 })).not.toThrow();
  });

  test('context goes first, whole, and the report says so', () => {
    const big = { blob: 'c'.repeat(3000) };
    const roomy = makeCorj(noisy(), { onError: silent, maxReportSize: 100_000 }, { context: big });
    expect(roomy.context).toEqual(big);
    const tight = makeCorj(noisy(), { onError: silent, maxReportSize: 2500 }, { context: big });
    expect(tight).not.toHaveProperty('context');
    expect(tight.context_omitted).toBe('max_size');
    expect(tight.truncated).toBe(true);
    expect(tight.reporting_errors).toBeDefined(); // errors survive when dropping context was enough
    expect(bytes(tight)).toBeLessThanOrEqual(2500);
  });

  test('reporting_errors go second, and the report says so', () => {
    const report = makeCorj(noisy(), { onError: silent, maxReportSize: 600 }, {
      context: { blob: 'c'.repeat(3000) },
    });
    expect(report.context_omitted).toBe('max_size');
    expect(report).not.toHaveProperty('reporting_errors');
    expect(report.reporting_errors_omitted).toBe('max_size');
    expect(bytes(report)).toBeLessThanOrEqual(600);
  });

  test('context goes before any error content is trimmed, however small it is', () => {
    const report = makeCorj(new Error('m'.repeat(5000)), { maxReportSize: 1024 }, {
      context: { runId: 'run-1' },
    });
    expect(report.truncated).toBe(true);
    expect(report).not.toHaveProperty('context');
    expect(report.context_omitted).toBe('max_size');
  });

  test('a report that fits keeps its context untouched', () => {
    const report = makeCorj(new Error('small'), { maxReportSize: 100_000 }, {
      context: { runId: 'run-1' },
    });
    expect(report.context).toEqual({ runId: 'run-1' });
    expect(report).not.toHaveProperty('context_omitted');
  });

  test('v survives the tightest budget', () => {
    const report = makeCorj(new Error('m'.repeat(5000)), { maxReportSize: 512 });
    expect(report.v).toBe(makeCorj(new Error('x')).v);
  });

  test('v is still absent when metadata turned it off', () => {
    expect(
      makeCorj(new Error('m'.repeat(5000)), { maxReportSize: 512, metadata: false }),
    ).not.toHaveProperty('v');
  });

  test('the minimal report keeps the fixed fields and both flags, and fits the floor in the worst case', () => {
    const worstRoot = {
      occurrence_id: '!'.repeat(128),
      fingerprint: '~'.repeat(64),
      instanceof_error: false,
      typeof: 'undefined',
      context: { blob: 'c'.repeat(3000) },
      reporting_errors: [{ stage: 'other', path: '$', error: 'x' }],
      v: CORJ_VERSION_FULL,
      $schema: 'https://example.invalid/dropped',
    } as unknown as CorjReport;
    const child = { id: '0', path: '$.cause', level: 1 };
    const asObject = makeMinimalReport({ ...worstRoot, children: [child] } as CorjReport);
    const asArray = makeMinimalReport([
      { id: 'root', path: '$', level: 0, ...worstRoot },
      child,
    ] as CorjReportChild[]);
    for (const minimal of [asObject, asArray[0]!]) {
      expect(minimal).toMatchObject({
        occurrence_id: '!'.repeat(128),
        fingerprint: '~'.repeat(64),
        context_omitted: 'max_size',
        reporting_errors_omitted: 'max_size',
        children_omitted: 'max_size',
        v: CORJ_VERSION_FULL,
      });
      expect(minimal).not.toHaveProperty('context');
      expect(minimal).not.toHaveProperty('reporting_errors');
      expect(minimal).not.toHaveProperty('$schema');
    }
    expect(bytes(asObject)).toBeLessThanOrEqual(512);
    expect(bytes(asArray)).toBeLessThanOrEqual(512); // measured while planning: 487
  });
});
```

   Add to the imports of this file: `CORJ_VERSION_FULL` from `'../src/index'`, `makeMinimalReport` from `'../src/report-size'`, and the type `CorjReportChild`. **If either byte count exceeds 512, stop and report the measured number: do not raise the floor on your own.** Task 7 Step 6 adds the end-to-end version of this test once the two fields exist.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest tests/limiter-order.test.ts`
Expected: FAIL, first on the floor message.

- [ ] **Step 3: Implement in `src/report-size.ts`**

1. `export const CORJ_MIN_REPORT_SIZE = 512;` and use it in `resolveReportSizeOptions` (message: `maxReportSize must be a safe integer >= 512, or null to disable the limit`).
2. Remove `'v'` from `metadataKeys`. `$schema` stays droppable.
3. In `limitReportSize`, directly after `if (fits(report)) return report;`:

```ts
  // Optional root parts go before any error content: the caller's context,
  // whole, then the reporting errors. Each leaves a flag behind.
  const isArrayReport = Array.isArray(report);
  const stripped = (
    drop: ('context' | 'reporting_errors')[],
  ): T => {
    const source = (isArrayReport ? report[0] : report) as CorjReport;
    const next: CorjReport = { ...source, truncated: true };
    for (const key of drop) {
      if (next[key] === undefined) continue;
      delete next[key];
      next[`${key}_omitted`] = 'max_size';
    }
    return (isArrayReport ? [next, ...report.slice(1)] : next) as T;
  };
  const rootNow = (isArrayReport ? report[0] : report) as CorjReport;
  if (rootNow.context !== undefined) {
    const next = stripped(['context']);
    if (fits(next)) return next;
  }
  if (rootNow.context !== undefined || rootNow.reporting_errors !== undefined) {
    const next = stripped(['context', 'reporting_errors']);
    if (fits(next)) return next;
    report = next;
  }
```

   `report` must become a `let`-style rebindable parameter for this (it is a function parameter, so assignment is allowed). The rest of the function then runs unchanged on a root that no longer carries the two optional parts; its `candidate` spreads the root, so the two `_omitted` flags and the fixed fields ride along. Confirm by reading `trimNode`: it starts from `{ ...node }` and only rewrites `contentKeys`, deletes `metadataKeys`, and edits `child_ids`.
4. `makeMinimalReport` must carry the fixed fields and the flags:

```ts
    ...(root.occurrence_id === undefined ? {} : { occurrence_id: root.occurrence_id }),
    ...(root.fingerprint === undefined ? {} : { fingerprint: root.fingerprint }),
```

   as the first two entries of `minimal`, and after `children_omitted`:

```ts
    ...(root.context === undefined && root.context_omitted === undefined
      ? {}
      : { context_omitted: 'max_size' as const }),
    ...(root.reporting_errors === undefined && root.reporting_errors_omitted === undefined
      ? {}
      : { reporting_errors_omitted: 'max_size' as const }),
    ...(root.v === undefined ? {} : { v: root.v }),
```

- [ ] **Step 4: Move the existing tests off the old floor**

Run: `npx jest`. Two kinds of existing test fail:
   - A `maxReportSize` below 512 (about 18 places mention 256): raise each to 512 and re-derive the expectation. **Allowed change: the number, and the expected output that follows from it.** Where a test asserts the floor itself (`>= 256`), it now asserts 512.
   - A test that expects `v` to be dropped at a tiny budget: it now expects `v` present.
   List every expectation you changed in your report, with one line of why.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%. `tests/report-size-invariants.test.ts` and `tests/fuzz.test.ts` assert "every report fits its budget"; they must pass without loosening.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: the limiter drops context, then reporting_errors, before error content; v is fixed; the floor is 512

BREAKING CHANGE: maxReportSize must be >= 512 (was 256). v is no longer dropped to meet a budget."
```

---

### Task 6: `occurrence_id` and `occurrenceIdSources`

Default in this task: `null` (off). Task 8 turns it on. That keeps every existing exact-shape test green while the feature lands.

**Files:**
- Create: `src/tokens.ts`, `tests/tokens.test.ts`, `tests/occurrence-id.test.ts`
- Modify: `src/index.ts` (options, `access` near 610, `build`, exports)

**Interfaces:**
- Consumes: `CorjCallInput.occurrenceId` (Task 4), the fixed-field handling (Task 5), `CorjReportIdContext` (exists).
- Produces, exported from the package root:

```ts
export type CorjSourceEntry =
  | { field: string; inspection?: CorjInspection }
  | { path: readonly (string | number)[]; inspection?: CorjInspection };
export type CorjEntryFunction = (context: CorjReportIdContext) => unknown;
export type CorjOccurrenceIdSource = CorjSourceEntry | CorjEntryFunction | { auto: 'random' };
// option
occurrenceIdSources: readonly CorjOccurrenceIdSource[] | null;
```

- Produces, internal, from `src/tokens.ts`:

```ts
export const ID_PATTERN: RegExp;             // /^[\x21-\x7e]{1,128}$/
export const FINGERPRINT_PATTERN: RegExp;    // /^[\x21-\x7e]{1,64}$/
export function isValidId(value: unknown): value is string;
export function randomOccurrenceId(caught: unknown): string;   // memoized per object
export function validateSourceEntry(entry: unknown, where: string): void;  // throws TypeError
```

- Produces, internal, in `src/index.ts` (Task 7 consumes it):

```ts
function access(ctx, context, host, prop, redactPath?: string, inspection?: CorjInspection): Access;
function readEntry(ctx: Ctx, node: Pick<Node, 'obj' | 'path'>, entry: CorjSourceEntry, key: CorjReportKey): Access;
```

- [ ] **Step 1: Write `tests/tokens.test.ts`**

```ts
import { isValidId, randomOccurrenceId, validateSourceEntry } from '../src/tokens';

describe('tokens', () => {
  test.each([['AE_1'], ['req-42'], ['!'.repeat(128)], ['a:b/c=d']])('accepts the id %j', (id) => {
    expect(isValidId(id)).toBe(true);
  });

  test.each([[''], [' '], ['has space'], ['x'.repeat(129)], ['tab\there'], ['café'], [42], [null]])(
    'rejects the id %j',
    (id) => {
      expect(isValidId(id)).toBe(false);
    },
  );

  test('a random id is CORJ_ plus 26 Crockford base32 characters', () => {
    expect(randomOccurrenceId('primitive')).toMatch(/^CORJ_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test('one object keeps one id; primitives get a new one each time', () => {
    const error = new Error('x');
    expect(randomOccurrenceId(error)).toBe(randomOccurrenceId(error));
    expect(randomOccurrenceId(new Error('x'))).not.toBe(randomOccurrenceId(error));
    expect(randomOccurrenceId('s')).not.toBe(randomOccurrenceId('s'));
    const fn = () => 1;
    expect(randomOccurrenceId(fn)).toBe(randomOccurrenceId(fn));
  });

  test('uses the platform source when there is one', () => {
    // jest's sandbox may or may not expose `crypto`; a fake makes the branch deterministic.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: (array: Uint8Array) => array.fill(7) },
      configurable: true,
    });
    try {
      expect(randomOccurrenceId('p')).toBe(`CORJ_${'7'.repeat(26)}`);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });

  test('falls back to Math.random when the platform has no crypto', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(randomOccurrenceId('p')).toMatch(/^CORJ_[0-9A-HJKMNP-TV-Z]{26}$/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });

  test.each([
    [{ field: '' }, 'x[0].field must be a nonempty string'],
    [{ field: 1 }, 'x[0].field must be a nonempty string'],
    [{ path: [] }, 'x[0].path must be an array of 1 to 16 strings or nonnegative integers'],
    [{ path: ['a', -1] }, 'x[0].path must be an array of 1 to 16 strings or nonnegative integers'],
    [{ path: new Array(17).fill('a') }, 'x[0].path must be an array of 1 to 16 strings or nonnegative integers'],
    [{ field: 'a', path: ['a'] }, 'x[0] must have exactly one of field or path'],
    [{ field: 'a', inspection: 'strict' }, 'x[0].inspection must be "default" or "no-invoke"'],
    [{ field: 'a', extra: 1 }, 'x[0] has an unknown key "extra"'],
    [{}, 'x[0] must have exactly one of field or path'],
  ])('validateSourceEntry rejects %j', (entry, message) => {
    expect(() => validateSourceEntry(entry, 'x[0]')).toThrow(message);
  });

  test('validateSourceEntry accepts both forms, with and without inspection', () => {
    expect(() => validateSourceEntry({ field: 'id' }, 'x[0]')).not.toThrow();
    expect(() =>
      validateSourceEntry({ path: ['a', 0, 'b'], inspection: 'no-invoke' }, 'x[0]'),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Write `src/tokens.ts`**

```ts
/** A bounded printable-ASCII token without spaces. Ids bypass redaction, so they are nothing else. */
export const ID_PATTERN = /^[\x21-\x7e]{1,128}$/;
export const FINGERPRINT_PATTERN = /^[\x21-\x7e]{1,64}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

// Crockford base32: no I, L, O or U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_BODY_LENGTH = 26;

function randomBody(): string {
  const values = new Uint8Array(ID_BODY_LENGTH);
  const platform = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => unknown };
    }
  ).crypto;
  if (platform !== undefined && typeof platform.getRandomValues === 'function') {
    platform.getRandomValues(values);
  } else {
    // A correlation handle, not a secret: uniqueness is what matters here.
    for (let i = 0; i < ID_BODY_LENGTH; i++) {
      values[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  // 256 is a multiple of 32, so `& 31` is unbiased.
  for (const value of values) out += ALPHABET[value & 31];
  return out;
}

const memo = new WeakMap<object, string>();

/** One id per object or function for the life of the process; a primitive gets a new one each time. */
export function randomOccurrenceId(caught: unknown): string {
  const keyable =
    (typeof caught === 'object' && caught !== null) ||
    typeof caught === 'function';
  if (!keyable) return `CORJ_${randomBody()}`;
  const existing = memo.get(caught as object);
  if (existing !== undefined) return existing;
  const created = `CORJ_${randomBody()}`;
  memo.set(caught as object, created);
  return created;
}

const MAX_PATH_SEGMENTS = 16;

/** Validates a `{ field }` or `{ path }` entry. `where` names it in the message, e.g. `occurrenceIdSources[0]`. */
export function validateSourceEntry(entry: unknown, where: string): void {
  const record = entry as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'field' && key !== 'path' && key !== 'inspection') {
      throw new TypeError(`${where} has an unknown key "${key}"`);
    }
  }
  const hasField = record['field'] !== undefined;
  const hasPath = record['path'] !== undefined;
  if (hasField === hasPath) {
    throw new TypeError(`${where} must have exactly one of field or path`);
  }
  if (hasField && (typeof record['field'] !== 'string' || record['field'] === '')) {
    throw new TypeError(`${where}.field must be a nonempty string`);
  }
  if (hasPath) {
    const path = record['path'];
    const valid =
      Array.isArray(path) &&
      path.length >= 1 &&
      path.length <= MAX_PATH_SEGMENTS &&
      path.every(
        (segment) =>
          (typeof segment === 'string' && segment !== '') ||
          (Number.isSafeInteger(segment) && (segment as number) >= 0),
      );
    if (!valid) {
      throw new TypeError(
        `${where}.path must be an array of 1 to ${MAX_PATH_SEGMENTS} strings or nonnegative integers`,
      );
    }
  }
  const inspection = record['inspection'];
  if (inspection !== undefined && inspection !== 'default' && inspection !== 'no-invoke') {
    throw new TypeError(`${where}.inspection must be "default" or "no-invoke"`);
  }
}
```

Run: `npx jest tests/tokens.test.ts`. Expected: PASS.

- [ ] **Step 3: Write `tests/occurrence-id.test.ts`**

```ts
import { CorjMaker, makeCorj, makeCorjArray } from '../src/index';
import type { CorjOccurrenceIdSource } from '../src/index';

const silent = () => undefined;
const withSources = (occurrenceIdSources: readonly CorjOccurrenceIdSource[] | null) =>
  new CorjMaker({ onError: silent, occurrenceIdSources });

describe('occurrence_id', () => {
  test('null and [] both turn the field off', () => {
    expect(withSources(null).makeReportObject(new Error('x'))).not.toHaveProperty('occurrence_id');
    expect(withSources([]).makeReportObject(new Error('x'))).not.toHaveProperty('occurrence_id');
  });

  test('auto random: one object, one id, across calls and makers', () => {
    const error = new Error('x');
    const a = withSources([{ auto: 'random' }]).makeReportObject(error).occurrence_id;
    const b = withSources([{ auto: 'random' }]).makeReportObject(error).occurrence_id;
    expect(a).toMatch(/^CORJ_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(b).toBe(a);
  });

  test('the first source that yields a valid id wins', () => {
    const maker = withSources([{ field: 'requestId' }, { field: 'traceId' }, { auto: 'random' }]);
    expect(
      maker.makeReportObject(Object.assign(new Error('x'), { requestId: 'req-1', traceId: 't-1' }))
        .occurrence_id,
    ).toBe('req-1');
    expect(
      maker.makeReportObject(Object.assign(new Error('x'), { traceId: 't-1' })).occurrence_id,
    ).toBe('t-1');
    expect(maker.makeReportObject(new Error('x')).occurrence_id).toMatch(/^CORJ_/);
  });

  test.each([[42], [''], ['has space'], ['x'.repeat(129)], [{ nested: 1 }], [null]])(
    'an invalid field value %j falls through silently',
    (value) => {
      const report = withSources([{ field: 'requestId' }]).makeReportObject(
        Object.assign(new Error('x'), { requestId: value }),
      );
      expect(report).not.toHaveProperty('occurrence_id');
      expect(report).not.toHaveProperty('reporting_errors');
    },
  );

  test('a path entry walks into the value, array indexes included', () => {
    const error = Object.assign(new Error('x'), {
      response: { headers: { 'x-request-id': 'req-9' }, ids: ['first', 'second'] },
    });
    expect(
      withSources([{ path: ['response', 'headers', 'x-request-id'] }]).makeReportObject(error)
        .occurrence_id,
    ).toBe('req-9');
    expect(
      withSources([{ path: ['response', 'ids', 1] }]).makeReportObject(error).occurrence_id,
    ).toBe('second');
    expect(
      withSources([{ path: ['response', 'missing', 'deeper'] }]).makeReportObject(error),
    ).not.toHaveProperty('occurrence_id');
  });

  test('sources read the root only, never a cause', () => {
    const error = new Error('outer', { cause: Object.assign(new Error('inner'), { requestId: 'inner-1' }) });
    expect(withSources([{ field: 'requestId' }]).makeReportObject(error)).not.toHaveProperty(
      'occurrence_id',
    );
  });

  test('a getter runs under the default inspection and is skipped under no-invoke', () => {
    let ran = 0;
    class WithGetter extends Error {
      get requestId() {
        ran++;
        return 'from-getter';
      }
    }
    expect(
      withSources([{ field: 'requestId' }]).makeReportObject(new WithGetter('x')).occurrence_id,
    ).toBe('from-getter');
    const before = ran;
    const strict = new CorjMaker({
      onError: silent,
      inspection: 'no-invoke',
      occurrenceIdSources: [{ field: 'requestId' }, { auto: 'random' }],
    });
    expect(strict.makeReportObject(new WithGetter('x')).occurrence_id).toMatch(/^CORJ_/);
    expect(ran).toBe(before);
  });

  test('a per-entry inspection overrides the maker in both directions', () => {
    let ran = 0;
    class WithGetter extends Error {
      get requestId() {
        ran++;
        return 'from-getter';
      }
    }
    const tightened = withSources([{ field: 'requestId', inspection: 'no-invoke' }]);
    expect(tightened.makeReportObject(new WithGetter('x'))).not.toHaveProperty('occurrence_id');
    expect(ran).toBe(0);
    const loosened = new CorjMaker({
      onError: silent,
      inspection: 'no-invoke',
      occurrenceIdSources: [{ field: 'requestId', inspection: 'default' }],
    });
    expect(loosened.makeReportObject(new WithGetter('x')).occurrence_id).toBe('from-getter');
  });

  test('a throwing getter is recorded and resolution continues', () => {
    const error = new Error('x');
    Object.defineProperty(error, 'requestId', {
      get() {
        throw new Error('id getter failed');
      },
    });
    const report = withSources([{ field: 'requestId' }, { auto: 'random' }]).makeReportObject(error);
    expect(report.occurrence_id).toMatch(/^CORJ_/);
    expect(report.reporting_errors).toEqual([
      expect.objectContaining({ stage: 'prop-access', key: 'occurrence_id', prop: 'requestId' }),
    ]);
  });

  test('a skip rule hides the field from the chain too', () => {
    const maker = new CorjMaker({
      onError: silent,
      redact: { keys: ['requestId'] },
      occurrenceIdSources: [{ field: 'requestId' }],
    });
    expect(
      maker.makeReportObject(Object.assign(new Error('x'), { requestId: 'req-1' })),
    ).not.toHaveProperty('occurrence_id');
  });

  test('the id is never passed through the scrub rules', () => {
    const maker = new CorjMaker({
      onError: silent,
      redact: { patterns: [/req/g] },
      occurrenceIdSources: [{ field: 'requestId' }],
    });
    expect(
      maker.makeReportObject(Object.assign(new Error('x'), { requestId: 'req-1' })).occurrence_id,
    ).toBe('req-1');
  });

  test('a function source gets the root id context; invalid results fall through; a throw is recorded', () => {
    const seen: unknown[] = [];
    const error = new Error('x');
    const report = withSources([
      (context) => {
        seen.push(context);
        return 42;
      },
      () => {
        throw new Error('source failed');
      },
      () => 'fn-id',
    ]).makeReportObject(error);
    expect(seen).toEqual([{ index: -1, level: 0, path: '$', caught: error }]);
    expect(report.occurrence_id).toBe('fn-id');
    expect(report.reporting_errors).toEqual([
      { stage: 'other', path: '$', key: 'occurrence_id', error: 'Error: source failed' },
    ]);
  });

  test('the call argument wins over every source', () => {
    const maker = withSources([{ field: 'requestId' }]);
    expect(
      maker.makeReportObject(Object.assign(new Error('x'), { requestId: 'req-1' }), {
        occurrenceId: 'explicit-1',
      }).occurrence_id,
    ).toBe('explicit-1');
    // and works with the feature off
    expect(withSources(null).makeReportObject('primitive', { occurrenceId: 'explicit-2' }).occurrence_id).toBe(
      'explicit-2',
    );
  });

  test.each([[''], ['has space'], ['x'.repeat(129)], [7]])(
    'an invalid call argument %j is the caller\'s mistake and throws',
    (occurrenceId) => {
      expect(() =>
        withSources(null).makeReportObject(new Error('x'), { occurrenceId: occurrenceId as string }),
      ).toThrow('occurrenceId must be 1 to 128 printable ASCII characters without spaces');
    },
  );

  test('occurrence_id is the first key of the root, in both shapes', () => {
    const options = { onError: silent, occurrenceIdSources: [{ auto: 'random' }] } as const;
    expect(Object.keys(makeCorj(new Error('x'), options))[0]).toBe('occurrence_id');
    const rows = makeCorjArray(new Error('x', { cause: new Error('y') }), options);
    expect(Object.keys(rows[0]!)[0]).toBe('occurrence_id');
    expect(rows[1]).not.toHaveProperty('occurrence_id');
  });

  test('the id survives the tightest budget', () => {
    const report = makeCorj(
      new Error('m'.repeat(5000)),
      { maxReportSize: 512, occurrenceIdSources: [{ auto: 'random' }] },
    );
    expect(report.occurrence_id).toMatch(/^CORJ_/);
  });

  test.each([
    [5, 'occurrenceIdSources must be an array or null'],
    [[{ auto: 'uuid' }], 'occurrenceIdSources[0].auto must be "random"'],
    [[{ auto: 'random' }, { field: 'id' }], 'occurrenceIdSources[1] can never be reached: it follows { auto }'],
    [['requestId'], 'occurrenceIdSources[0] must be an object or a function'],
    [[{ field: '' }], 'occurrenceIdSources[0].field must be a nonempty string'],
  ])('rejects the option %j', (value, message) => {
    expect(() => new CorjMaker({ occurrenceIdSources: value as never })).toThrow(message);
  });
});
```

Run: `npx jest tests/occurrence-id.test.ts`. Expected: FAIL to compile, unknown option.

- [ ] **Step 4: Implement in `src/index.ts`**

1. Option plumbing: add `occurrenceIdSources` to `CorjOptions` (doc: `Where occurrence_id comes from: an ordered list, first valid id wins. null or [] omits the field.`), default **`null`** in `CORJ_DEFAULT_OPTIONS` for now, `OPTION_KEYS`, `pick`. Validation in `resolveOptions`:

```ts
function resolveOccurrenceIdSources(
  value: unknown,
): readonly CorjOccurrenceIdSource[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new TypeError('occurrenceIdSources must be an array or null');
  }
  let autoAt = -1;
  value.forEach((entry: unknown, index) => {
    const where = `occurrenceIdSources[${index}]`;
    if (autoAt !== -1) {
      throw new TypeError(`${where} can never be reached: it follows { auto }`);
    }
    if (typeof entry === 'function') return;
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError(`${where} must be an object or a function`);
    }
    if ('auto' in entry) {
      if ((entry as { auto: unknown }).auto !== 'random' || Object.keys(entry).length !== 1) {
        throw new TypeError(`${where}.auto must be "random"`);
      }
      autoAt = index;
      return;
    }
    validateSourceEntry(entry, where);
  });
  return Object.freeze([...value]) as readonly CorjOccurrenceIdSource[];
}
```

2. `access` gains a sixth parameter `inspection?: CorjInspection`; replace `ctx.options.inspection === 'no-invoke'` inside it with `(inspection ?? ctx.options.inspection) === 'no-invoke'`.
3. `readEntry`:

```ts
/** Walk a `{ field }` or `{ path }` entry from a node. Skip rules and `inspection` apply at every segment. */
function readEntry(
  ctx: Ctx,
  node: Pick<Node, 'obj' | 'path'>,
  entry: CorjSourceEntry,
  key: CorjReportKey,
): Access {
  const segments: readonly (string | number)[] =
    'field' in entry ? [entry.field] : entry.path;
  let host: unknown = node.obj;
  let path = node.path;
  let last: Access = { found: false, threw: false };
  for (const segment of segments) {
    const prop = String(segment);
    const next =
      typeof segment === 'number' ? `${path}[${prop}]` : `${path}.${prop}`;
    last = access(
      ctx,
      { stage: 'prop-access', path, key },
      host,
      prop,
      next,
      entry.inspection,
    );
    if (!last.found || last.redacted !== undefined || last.omitted === true) {
      return last;
    }
    host = last.value;
    path = next;
  }
  return last;
}
```

   (`access` returns `found: false` when it threw, so the first condition covers that case.)
4. Resolution, called from `build` before anything else is produced, so the id is the first root entry:

```ts
function resolveOccurrenceId(
  ctx: Ctx,
  caught: unknown,
  call: CorjCallInput,
): string | undefined {
  if (call.occurrenceId !== undefined) return call.occurrenceId;
  const sources = ctx.options.occurrenceIdSources;
  if (sources === null) return undefined;
  for (const source of sources) {
    let candidate: unknown;
    if (typeof source === 'function') {
      try {
        candidate = source({ index: -1, level: 0, path: '$', caught });
      } catch (failure: unknown) {
        reportError(ctx, failure, { stage: 'other', path: '$', key: 'occurrence_id' });
        continue;
      }
    } else if ('auto' in source) {
      return randomOccurrenceId(caught);
    } else {
      const read = readEntry(ctx, { obj: caught, path: '$' }, source, 'occurrence_id');
      candidate = read.found && read.redacted === undefined && read.omitted !== true
        ? read.value
        : undefined;
    }
    if (isValidId(candidate)) return candidate;
  }
  return undefined;
}
```

5. `resolveCall` validates the argument: if `occurrenceId !== undefined && !isValidId(occurrenceId)`, throw `new TypeError('occurrenceId must be 1 to 128 printable ASCII characters without spaces')`.
6. In `build`, put `['occurrence_id', occurrenceId]` as the **first** entry of the root in both shapes (before `truncated` in the object form; before `id` in the array form's root row).
7. Export the three new types from the package root.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: occurrence_id from an ordered list of sources (field, path, function, random), or from the call"
```

---

### Task 7: `fingerprint`, `fingerprintParts`, `makeFingerprint`

Default in this task: `null` (off). Task 8 turns it on.

**Files:**
- Create: `src/sha256.ts`, `src/fingerprint.ts`, `tests/sha256.test.ts`, `tests/fingerprint-pure.test.ts`, `tests/fingerprint.test.ts`
- Modify: `src/index.ts` (options, `Ctx`, `makeNodeFields` near 1133, `build`, the maker class, exports), `tests/limiter-order.test.ts`

**Interfaces:**
- Consumes: `readEntry`, `CorjSourceEntry`, `CorjEntryFunction`, `validateSourceEntry`, `FINGERPRINT_PATTERN`, `CorjCallInput.fingerprint`, the fixed-field handling of Task 5.
- Produces, exported from the package root:

```ts
export type CorjFingerprintPart =
  | 'constructor_name' | 'message' | 'stack' | 'as_string' | 'typeof'
  | CorjSourceEntry | CorjEntryFunction;
// option
fingerprintParts: readonly CorjFingerprintPart[] | null;
// on CorjMaker
makeFingerprint(caught: unknown): string | undefined;
```

- Produces, internal:

```ts
// src/sha256.ts
export function sha256Hex(text: string): string;
// src/fingerprint.ts
export const FINGERPRINT_VERSION = 'fp1';
export const FIELD_PARTS: readonly ['as_string', 'constructor_name', 'message', 'stack', 'typeof'];
export type ResolvedPart = { label: string; part: CorjFingerprintPart };
export function resolveFingerprintParts(value: unknown): readonly ResolvedPart[] | null; // validates, sorts, throws TypeError
export function stackWithoutHeader(stack: string, asString: unknown): string;
export type FingerprintValue = string | number | boolean | null | CorjJsonValue;
export function fingerprintOf(
  labels: readonly string[],
  rows: readonly (readonly [path: string, values: readonly FingerprintValue[]])[],
  rootFallback: readonly [typeofValue: string, asString: string | null],
  forceFallback?: boolean,   // true when the root has no string stack
): string;
```

- [ ] **Step 1: `src/sha256.ts` and its test**

`tests/sha256.test.ts`. The expected digests are the NIST FIPS 180-4 example vectors, so the test does not depend on a platform API:

```ts
import { sha256Hex } from '../src/sha256';

describe('sha256Hex', () => {
  test.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the FIPS 180-4 vector for %j', (input, digest) => {
    expect(sha256Hex(input)).toBe(digest);
  });

  test('agrees with node crypto across block boundaries and UTF-8 widths', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const reference = (text: string) =>
      createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');
    const loneSurrogates = `${String.fromCharCode(0xd800)} lone ${String.fromCharCode(0xdc00)}`;
    const widths = [0x00, 0x7f, 0x80, 0x7ff, 0x800, 0xffff].map((c) => String.fromCharCode(c)).join('');
    const inputs = [
      'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65),
      'a'.repeat(100_000), `emoji ${String.fromCodePoint(0x1f642)}`, loneSurrogates, widths,
    ];
    for (const input of inputs) expect(sha256Hex(input)).toBe(reference(input));
  });
});
```

`src/sha256.ts`. This exact algorithm was run against `node:crypto` on 2,000 random inputs plus the cases above before the plan was written; keep the arithmetic as is, only adapt what the type checker demands:

```ts
/**
 * Synchronous SHA-256 of a string's UTF-8 encoding, as lowercase hex.
 *
 * The web platform's digest is async and corj is synchronous with no
 * dependencies, so the fingerprint carries its own implementation.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** UTF-8 bytes of a string; a lone surrogate becomes U+FFFD, as `TextEncoder` does. */
function utf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export function sha256Hex(text: string): string {
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (const word of [Math.floor(bitLength / 0x100000000), bitLength >>> 0]) {
    bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j]! << 24) | (bytes[j + 1]! << 16) | (bytes[j + 2]! << 8) | bytes[j + 3]!;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = h[0]! + a;
    h[1] = h[1]! + b;
    h[2] = h[2]! + c;
    h[3] = h[3]! + d;
    h[4] = h[4]! + e;
    h[5] = h[5]! + f;
    h[6] = h[6]! + g;
    h[7] = h[7]! + hh;
  }
  let hex = '';
  for (const word of h) hex += word.toString(16).padStart(8, '0');
  return hex;
}
```

Run: `npx jest tests/sha256.test.ts`. Expected: PASS. Every branch of `utf8` is reached by the "widths", emoji and lone-surrogate inputs.

- [ ] **Step 2: `src/fingerprint.ts` and its test**

`tests/fingerprint-pure.test.ts`:

```ts
import {
  fingerprintOf,
  resolveFingerprintParts,
  stackWithoutHeader,
} from '../src/fingerprint';
import { sha256Hex } from '../src/sha256';

describe('stackWithoutHeader', () => {
  test('cuts the node\'s own string form from the head, multi-line messages included', () => {
    const error = new Error('line one\nline two');
    const rest = stackWithoutHeader(error.stack!, String(error));
    expect(rest.startsWith('    at ')).toBe(true);
    expect(rest).not.toContain('line one');
  });

  test('falls back to the first V8 frame line when the string form does not match', () => {
    const stack = 'Error: User 12345 not found\n    at run (/app/a.js:1:1)\n    at main (/app/b.js:2:2)';
    expect(stackWithoutHeader(stack, 'custom toString')).toBe(
      '    at run (/app/a.js:1:1)\n    at main (/app/b.js:2:2)',
    );
  });

  test('leaves a stack without a header alone (Firefox, Safari)', () => {
    const stack = 'run@file.js:1:2\nmain@file.js:9:1';
    expect(stackWithoutHeader(stack, 'Error: x')).toBe(stack);
  });

  test('a stack that is only the header becomes empty', () => {
    expect(stackWithoutHeader('Error: x', 'Error: x')).toBe('');
  });

  test.each([[undefined], [null], [''], [42]])('ignores the string form %p', (asString) => {
    expect(stackWithoutHeader('Error: x\n    at a (b:1:1)', asString)).toBe('    at a (b:1:1)');
  });
});

describe('resolveFingerprintParts', () => {
  test('null and [] both mean off', () => {
    expect(resolveFingerprintParts(null)).toBeNull();
    expect(resolveFingerprintParts([])).toBeNull();
  });

  test('named parts are sorted by label; functions keep their order after them', () => {
    const first = () => 1;
    const second = () => 2;
    const resolved = resolveFingerprintParts([
      'stack', first, { path: ['details', 'tool'] }, 'constructor_name', second, { field: '_tag' },
    ])!;
    expect(resolved.map((r) => r.label)).toEqual([
      'constructor_name', 'field:_tag', 'path:["details","tool"]', 'stack', 'fn:0', 'fn:1',
    ]);
    expect(resolved[4]!.part).toBe(first);
    expect(resolved[5]!.part).toBe(second);
  });

  test.each([
    [5, 'fingerprintParts must be an array or null'],
    [['as_json'], 'fingerprintParts[0] must be one of as_string, constructor_name, message, stack, typeof, an entry object, or a function'],
    [['stack', 'stack'], 'fingerprintParts[1] repeats "stack"'],
    [[{ field: 'a' }, { field: 'a' }], 'fingerprintParts[1] repeats "field:a"'],
    [[{ field: '' }], 'fingerprintParts[0].field must be a nonempty string'],
    [[null], 'fingerprintParts[0] must be one of'],
  ])('rejects %j', (value, message) => {
    expect(() => resolveFingerprintParts(value)).toThrow(message);
  });
});

describe('fingerprintOf', () => {
  const labels = ['constructor_name', 'stack'];

  test('is fp1_ plus 32 lowercase hex characters', () => {
    expect(fingerprintOf(labels, [['$', ['Error', 'frames']]], ['object', 'Error: x'])).toMatch(
      /^fp1_[0-9a-f]{32}$/,
    );
  });

  test('is a pure function of its input', () => {
    const rows = [['$', ['Error', 'frames']] as const];
    expect(fingerprintOf(labels, rows, ['object', 'a'])).toBe(fingerprintOf(labels, rows, ['object', 'b']));
  });

  test('values cannot slide between slots', () => {
    expect(fingerprintOf(labels, [['$', ['ab', 'c']]], ['object', null])).not.toBe(
      fingerprintOf(labels, [['$', ['a', 'bc']]], ['object', null]),
    );
    expect(fingerprintOf(labels, [['$', [null, 'x']]], ['object', null])).not.toBe(
      fingerprintOf(labels, [['$', ['x', null]]], ['object', null]),
    );
  });

  test('the recipe is part of the input', () => {
    const rows = [['$', ['same', 'same']] as const];
    expect(fingerprintOf(['constructor_name', 'stack'], rows, ['object', null])).not.toBe(
      fingerprintOf(['message', 'stack'], rows, ['object', null]),
    );
  });

  test('the path is part of the input', () => {
    expect(fingerprintOf(labels, [['$', ['A', 'f']], ['$.cause', ['B', 'g']]], ['object', null])).not.toBe(
      fingerprintOf(labels, [['$', ['A', 'f']], ['$.errors[0]', ['B', 'g']]], ['object', null]),
    );
  });

  test('an empty root falls back to typeof and the string form', () => {
    const empty = [['$', [null, '']] as const];
    expect(fingerprintOf(labels, empty, ['string', 'socket closed'])).not.toBe(
      fingerprintOf(labels, empty, ['string', 'disk full']),
    );
    expect(fingerprintOf(labels, empty, ['string', 'same'])).not.toBe(
      fingerprintOf(labels, empty, ['number', 'same']),
    );
  });

  test('a root without a stack always carries the fallback, even when a part has a value', () => {
    // A thrown string has constructor_name "String", so its row is not empty.
    const row = [['$', ['String', null]] as const];
    expect(fingerprintOf(labels, row, ['string', 'socket closed'], true)).not.toBe(
      fingerprintOf(labels, row, ['string', 'disk full'], true),
    );
    expect(fingerprintOf(labels, row, ['string', 'a'], false)).toBe(
      fingerprintOf(labels, row, ['string', 'b'], false),
    );
  });

  test('the exact input format is pinned', () => {
    // sha256 of JSON.stringify(['fp1', ['constructor_name','stack'], [['$', ['Error','f']]]])
    const input = JSON.stringify(['fp1', labels, [['$', ['Error', 'f']]]]);
    expect(fingerprintOf(labels, [['$', ['Error', 'f']]], ['object', 'Error: x'])).toBe(
      `fp1_${sha256Hex(input).slice(0, 32)}`,
    );
  });
});
```

`src/fingerprint.ts`:

```ts
import type { CorjFingerprintPart, CorjJsonValue } from './index';
import { sha256Hex } from './sha256';
import { validateSourceEntry } from './tokens';

/** Prefix of every fingerprint. It changes whenever the hash input recipe does, so old and new never look comparable. */
export const FINGERPRINT_VERSION = 'fp1';
export const FIELD_PARTS = [
  'as_string',
  'constructor_name',
  'message',
  'stack',
  'typeof',
] as const;

export type ResolvedPart = { label: string; part: CorjFingerprintPart };
export type FingerprintValue = string | number | boolean | null | CorjJsonValue;

const ONE_OF =
  'must be one of as_string, constructor_name, message, stack, typeof, an entry object, or a function';

/** Validates the option and puts it in canonical order: named parts by label, then functions as given. */
export function resolveFingerprintParts(
  value: unknown,
): readonly ResolvedPart[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new TypeError('fingerprintParts must be an array or null');
  }
  const named: ResolvedPart[] = [];
  const functions: ResolvedPart[] = [];
  const seen = new Set<string>();
  value.forEach((part: unknown, index) => {
    const where = `fingerprintParts[${index}]`;
    if (typeof part === 'function') {
      functions.push({
        label: `fn:${functions.length}`,
        part: part as CorjFingerprintPart,
      });
      return;
    }
    let label: string;
    if (typeof part === 'string') {
      if (!(FIELD_PARTS as readonly string[]).includes(part)) {
        throw new TypeError(`${where} ${ONE_OF}`);
      }
      label = part;
    } else if (typeof part === 'object' && part !== null) {
      validateSourceEntry(part, where);
      const entry = part as { field?: string; path?: readonly (string | number)[] };
      label =
        entry.field !== undefined
          ? `field:${entry.field}`
          : `path:${JSON.stringify(entry.path)}`;
    } else {
      throw new TypeError(`${where} ${ONE_OF}`);
    }
    if (seen.has(label)) throw new TypeError(`${where} repeats "${label}"`);
    seen.add(label);
    named.push({ label, part: part as CorjFingerprintPart });
  });
  if (named.length + functions.length === 0) return null;
  named.sort((a, b) => (a.label < b.label ? -1 : 1));
  return Object.freeze([...named, ...functions]);
}

const V8_FIRST_FRAME = /\n {4}at /;

/**
 * The stack without the node's own header, so the `message` and `stack` parts
 * do not overlap. A message may span lines, so the header is cut by prefix, not
 * by line; Firefox and Safari stacks carry no header and come back unchanged.
 */
export function stackWithoutHeader(stack: string, asString: unknown): string {
  if (typeof asString === 'string' && asString !== '' && stack.startsWith(asString)) {
    const rest = stack.slice(asString.length);
    return rest.startsWith('\n') ? rest.slice(1) : rest;
  }
  const match = V8_FIRST_FRAME.exec(stack);
  return match === null ? stack : stack.slice(match.index + 1);
}

/** Hash one canonical JSON document: the recipe version, the labels, and one row of values per node. */
export function fingerprintOf(
  labels: readonly string[],
  rows: readonly (readonly [path: string, values: readonly FingerprintValue[]])[],
  rootFallback: readonly [typeofValue: string, asString: string | null],
  /** Set when the root has no string stack: a thrown primitive or plain object, whose only identity is its string form. */
  forceFallback = false,
): string {
  const root = rows[0];
  const rootIsEmpty =
    root !== undefined && root[1].every((value) => value === null || value === '');
  const hashed = rows.map((row, index) =>
    index === 0 && (rootIsEmpty || forceFallback)
      ? [row[0], row[1], rootFallback]
      : [row[0], row[1]],
  );
  const input = JSON.stringify([FINGERPRINT_VERSION, labels, hashed]);
  return `${FINGERPRINT_VERSION}_${sha256Hex(input).slice(0, 32)}`;
}
```

Run: `npx jest tests/fingerprint-pure.test.ts`. Expected: PASS. (`rows[0]` is `undefined` only for an empty `rows`, which `build` never passes; cover the branch with one extra test: `fingerprintOf(labels, [], ['object', null])` matches the `fp1_` pattern.)

- [ ] **Step 3: Write `tests/fingerprint.test.ts`**

```ts
import { CorjMaker, makeCorj, makeCorjArray } from '../src/index';
import type { CorjFingerprintPart } from '../src/index';

const silent = () => undefined;
const withParts = (
  fingerprintParts: readonly CorjFingerprintPart[] | null,
  more: Record<string, unknown> = {},
) => new CorjMaker({ onError: silent, fingerprintParts, ...more });
const DEFAULT_PARTS = ['constructor_name', 'stack'] as const;

function thrownAt(message: string): Error {
  return new Error(message); // every call creates the error on this same line
}

describe('fingerprint', () => {
  test('null and [] both turn the field off', () => {
    expect(withParts(null).makeReportObject(new Error('x'))).not.toHaveProperty('fingerprint');
    expect(withParts([]).makeReportObject(new Error('x'))).not.toHaveProperty('fingerprint');
    expect(withParts(null).makeFingerprint(new Error('x'))).toBeUndefined();
  });

  test('same site, different interpolated message: same fingerprint by default', () => {
    const maker = withParts(DEFAULT_PARTS);
    // One call site for both: a stack frame carries line and column, so two
    // separate `thrownAt(...)` expressions would already be two places.
    const [a, b] = ['User 12345 not found', 'User 67890 not found'].map(
      (message) => maker.makeReportObject(thrownAt(message)).fingerprint,
    );
    expect(a).toMatch(/^fp1_[0-9a-f]{32}$/);
    expect(b).toBe(a);
  });

  test('adding the message part separates them', () => {
    const maker = withParts(['message', 'stack']);
    const [one, two] = ['one', 'two'].map(
      (message) => maker.makeReportObject(thrownAt(message)).fingerprint,
    );
    expect(one).not.toBe(two);
  });

  test('a different site gives a different fingerprint', () => {
    const maker = withParts(DEFAULT_PARTS);
    const elsewhere = new Error('x');
    expect(maker.makeReportObject(thrownAt('x')).fingerprint).not.toBe(
      maker.makeReportObject(elsewhere).fingerprint,
    );
  });

  test('part order in the config does not matter', () => {
    const error = thrownAt('x');
    expect(withParts(['stack', 'message']).makeFingerprint(error)).toBe(
      withParts(['message', 'stack']).makeFingerprint(error),
    );
  });

  test('the budget, the stack format, omission and the report shape do not move it', () => {
    const error = new Error('m'.repeat(5000), { cause: new Error('inner') });
    const base = withParts(DEFAULT_PARTS).makeReportObject(error).fingerprint;
    expect(withParts(DEFAULT_PARTS, { maxReportSize: 512 }).makeReportObject(error).fingerprint).toBe(base);
    expect(withParts(DEFAULT_PARTS, { stackFormat: 'string' }).makeReportObject(error).fingerprint).toBe(base);
    expect(withParts(DEFAULT_PARTS, { omitExpectedValues: false }).makeReportObject(error).fingerprint).toBe(base);
    expect(withParts(DEFAULT_PARTS).makeReportArray(error)[0]!.fingerprint).toBe(base);
    expect(withParts(DEFAULT_PARTS).makeFingerprint(error)).toBe(base);
  });

  test('causes are part of it, with their path', () => {
    const maker = withParts(['constructor_name']);
    class A extends Error {}
    class B extends Error {}
    expect(maker.makeFingerprint(new Error('x', { cause: new A('a') }))).not.toBe(
      maker.makeFingerprint(new Error('x', { cause: new B('b') })),
    );
    expect(maker.makeFingerprint(new Error('x', { cause: new A('a') }))).not.toBe(
      maker.makeFingerprint(new AggregateError([new A('a')], 'x')),
    );
  });

  test('a field part applies to every node', () => {
    const maker = withParts([{ field: 'code' }]);
    const refused = new Error('x', { cause: Object.assign(new Error('c'), { code: 'ECONNREFUSED' }) });
    const reset = new Error('x', { cause: Object.assign(new Error('c'), { code: 'ECONNRESET' }) });
    expect(maker.makeFingerprint(refused)).not.toBe(maker.makeFingerprint(reset));
  });

  test('a path part reads relative to each node', () => {
    const maker = withParts([{ path: ['details', 'tool'] }]);
    const search = Object.assign(new Error('x'), { details: { tool: 'search', userId: 1 } });
    const sameTool = Object.assign(new Error('y'), { details: { tool: 'search', userId: 2 } });
    const otherTool = Object.assign(new Error('x'), { details: { tool: 'fetch', userId: 1 } });
    expect(maker.makeFingerprint(search)).toBe(maker.makeFingerprint(sameTool));
    expect(maker.makeFingerprint(search)).not.toBe(maker.makeFingerprint(otherTool));
  });

  test('a nested value hashes the same whatever its key order', () => {
    const maker = withParts([{ field: 'details' }]);
    const ab = Object.assign(new Error('x'), { details: { a: 1, b: { c: [1, 2] } } });
    const ba = Object.assign(new Error('x'), { details: { b: { c: [1, 2] }, a: 1 } });
    const other = Object.assign(new Error('x'), { details: { a: 2, b: { c: [1, 2] } } });
    expect(maker.makeFingerprint(ab)).toBe(maker.makeFingerprint(ba));
    expect(maker.makeFingerprint(ab)).not.toBe(maker.makeFingerprint(other));
  });

  test('a huge nested value is cut at a fixed cap, not at the report budget', () => {
    const big = Object.assign(new Error('x'), { details: { blob: 'd'.repeat(50_000) } });
    expect(withParts([{ field: 'details' }], { maxReportSize: 512 }).makeFingerprint(big)).toBe(
      withParts([{ field: 'details' }], { maxReportSize: null }).makeFingerprint(big),
    );
  });

  test('numbers and booleans count; functions, symbols, bigints and undefined are null', () => {
    const maker = withParts([{ field: 'v' }]);
    const of = (v: unknown) => maker.makeFingerprint(Object.assign(new Error('x'), { v }));
    expect(of(1)).not.toBe(of(2));
    expect(of(true)).not.toBe(of(false));
    expect(of(() => 1)).toBe(of(undefined));
    expect(of(Symbol('s'))).toBe(of(undefined));
    expect(of(BigInt(1))).toBe(of(undefined));
    expect(of(Number.NaN)).toBe(of(undefined));
  });

  test('thrown primitives do not all share one fingerprint', () => {
    const maker = withParts(DEFAULT_PARTS);
    expect(maker.makeFingerprint('socket closed')).not.toBe(maker.makeFingerprint('disk full'));
    expect(maker.makeFingerprint('same')).toBe(maker.makeFingerprint('same'));
  });

  test('values are hashed after redaction: a secret cannot be confirmed from the hash', () => {
    const maker = withParts(['message'], { redact: { patterns: [/sk-[a-z]{10}/g] } });
    expect(maker.makeFingerprint(thrownAt('key sk-aaaaaaaaaa'))).toBe(
      maker.makeFingerprint(thrownAt('key sk-bbbbbbbbbb')),
    );
  });

  test('a skipped field hashes as the replacement; a no-invoke getter as the marker', () => {
    const skipping = withParts([{ field: 'code' }], { redact: { keys: ['code'] } });
    expect(skipping.makeFingerprint(Object.assign(new Error('x'), { code: 'A' }))).toBe(
      skipping.makeFingerprint(Object.assign(new Error('x'), { code: 'B' })),
    );
    let ran = 0;
    class WithGetter extends Error {
      get code() {
        ran++;
        return 'G';
      }
    }
    const strict = withParts([{ field: 'code' }], { inspection: 'no-invoke' });
    expect(strict.makeFingerprint(new WithGetter('x'))).toMatch(/^fp1_/);
    expect(ran).toBe(0);
    const loosened = withParts([{ field: 'code', inspection: 'default' }], { inspection: 'no-invoke' });
    loosened.makeFingerprint(new WithGetter('x'));
    expect(ran).toBe(1);
  });

  test('a function part is called per node; a throw is recorded and counts as null', () => {
    const paths: string[] = [];
    const maker = withParts([
      ({ path }) => {
        paths.push(path);
        if (path === '$.cause') throw new Error('part failed');
        return 'constant';
      },
    ]);
    const report = maker.makeReportObject(new Error('x', { cause: new Error('y') }));
    expect(paths).toEqual(['$', '$.cause']);
    expect(report.fingerprint).toMatch(/^fp1_/);
    expect(report.reporting_errors).toEqual([
      { stage: 'other', path: '$.cause', key: 'fingerprint', error: 'Error: part failed' },
    ]);
  });

  test('the call argument wins, works with the feature off, and is validated', () => {
    expect(
      withParts(DEFAULT_PARTS).makeReportObject(new Error('x'), { fingerprint: 'group-7' }).fingerprint,
    ).toBe('group-7');
    expect(withParts(null).makeReportObject(new Error('x'), { fingerprint: 'group-7' }).fingerprint).toBe(
      'group-7',
    );
    expect(() =>
      withParts(null).makeReportObject(new Error('x'), { fingerprint: 'x'.repeat(65) }),
    ).toThrow('fingerprint must be 1 to 64 printable ASCII characters without spaces');
  });

  test('fingerprint follows occurrence_id at the head of the root, in both shapes', () => {
    const options = {
      onError: silent,
      occurrenceIdSources: [{ auto: 'random' }],
      fingerprintParts: DEFAULT_PARTS,
    } as const;
    expect(Object.keys(makeCorj(new Error('x'), options)).slice(0, 2)).toEqual([
      'occurrence_id',
      'fingerprint',
    ]);
    const rows = makeCorjArray(new Error('x', { cause: new Error('y') }), options);
    expect(Object.keys(rows[0]!).slice(0, 2)).toEqual(['occurrence_id', 'fingerprint']);
    expect(rows[1]).not.toHaveProperty('fingerprint');
  });

  test('makeFingerprint never builds as_json', () => {
    let serialized = 0;
    const error = Object.assign(new Error('x'), {
      toCorjAsJson() {
        serialized++;
        return {};
      },
    });
    withParts(DEFAULT_PARTS).makeFingerprint(error);
    expect(serialized).toBe(0);
  });

  test('a custom toCorjAsString does not leak the message into the default fingerprint', () => {
    const maker = withParts(DEFAULT_PARTS);
    const [one, two] = ['User 1', 'User 2'].map((message) =>
      maker.makeFingerprint(
        Object.assign(thrownAt(message), { toCorjAsString: () => 'custom' }),
      ),
    );
    expect(one).toBe(two);
  });
});
```

Run: `npx jest tests/fingerprint.test.ts`. Expected: FAIL to compile, unknown option.

- [ ] **Step 4: Implement in `src/index.ts`**

1. Option: `fingerprintParts: readonly CorjFingerprintPart[] | null` in `CorjOptions` (doc: `What the fingerprint is hashed from; every part contributes. null or [] omits the field.`), default **`null`** for now, `OPTION_KEYS`. In `resolveOptions`, call `resolveFingerprintParts(pick-or-base)` for validation only and store the caller's value frozen (`Object.freeze([...value])` or `null`); keep the resolved, sorted list on `Ctx` as `parts: readonly ResolvedPart[] | null`, computed in the constructor. (`with()` re-resolves from the stored caller value, which is why the option keeps the caller's shape.)
2. `makeNodeFields(ctx, node, withJson = true)`: when `withJson` is `false`, skip `makeAsJson` (use `{ value: undefined, format: CORJ_EXPECTED_VALUES.as_json_format, truncated: false }`). Return two more members: `rawStack: string | null | undefined` and `values: { constructor_name, message, as_string, typeof }` so the fingerprint collector does not read the caught object again. `rawStack` is the value **before** `split('\n')`, after redaction.
3. The sorted serializer for nested values, lazily, one per inspection mode, stored on `Ctx` as `sorted: { default?: Stringify; 'no-invoke'?: Stringify }`:

```ts
const FINGERPRINT_VALUE_MAX_SIZE = 16_384;

function sortedStringify(ctx: Ctx, mode: CorjInspection): Stringify {
  ctx.sorted[mode] ??= configureStringify({
    circularValue: CORJ_CIRCULAR_MARKER,
    deterministic: true,
    // Fixed unit and cap: neither reportSizeUnit nor maxReportSize may move a fingerprint.
    lengthUnit: 'utf8-bytes',
    lengthLimit: FINGERPRINT_VALUE_MAX_SIZE,
    ...(mode === 'no-invoke' ? { skipAccessors: CORJ_OMITTED_MARKER } : {}),
  }) as Stringify;
  return ctx.sorted[mode] as Stringify;
}
```

4. One value per part per node:

```ts
function fingerprintValue(
  ctx: Ctx,
  node: Node,
  fields: NodeFields,
  { part }: ResolvedPart,
): FingerprintValue {
  if (typeof part === 'string') {
    if (part === 'stack') {
      return typeof fields.rawStack === 'string'
        ? stackWithoutHeader(fields.rawStack, fields.values.as_string)
        : null;
    }
    return fields.values[part] ?? null;
  }
  let raw: unknown;
  let mode = ctx.options.inspection;
  if (typeof part === 'function') {
    try {
      raw = part({ index: node.index, level: node.level, path: node.path, caught: node.obj });
    } catch (failure: unknown) {
      reportError(ctx, failure, { stage: 'other', path: node.path, key: 'fingerprint' });
      return null;
    }
  } else {
    const read = readEntry(ctx, node, part, 'fingerprint');
    if (read.redacted !== undefined) return read.redacted;
    if (read.omitted === true) return CORJ_OMITTED_MARKER;
    if (!read.found) return null;
    raw = read.value;
    mode = part.inspection ?? mode;
  }
  if (typeof raw === 'string') {
    return redactText(ctx, raw, { stage: 'prop-access', path: node.path, key: 'fingerprint' }) ?? null;
  }
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'object' || raw === null) return null;
  try {
    const redact = jsonRedact(ctx, node, false);
    const json = sortedStringify(ctx, mode)(raw, null, {
      ...(redact === undefined
        ? {}
        : { redact, mapKey: jsonKeyRedact(ctx), basePath: node.path }),
    });
    return json === undefined ? null : (JSON.parse(json) as CorjJsonValue);
  } catch (failure: unknown) {
    reportError(ctx, failure, { stage: 'as_json', path: node.path, key: 'fingerprint' });
    return null;
  }
}
```

   `fields.values.typeof` is `typeof node.obj`. Skip rules inside a nested value use the node's path as the base; that is an approximation (the true base is the entry's path) and is acceptable: `keys` rules, the common case, do not depend on the base.
5. Collection and hashing, shared by `build` and `makeFingerprint`:

```ts
function computeFingerprint(
  ctx: Ctx,
  call: CorjCallInput,
  root: Node,
  rootFields: NodeFields,
  children: readonly (readonly [Node, NodeFields])[],
): string | undefined {
  if (call.fingerprint !== undefined) return call.fingerprint;
  const parts = ctx.parts;
  if (parts === null) return undefined;
  const rows = [[root, rootFields] as const, ...children].map(
    ([node, fields]) =>
      [node.path, parts.map((part) => fingerprintValue(ctx, node, fields, part))] as const,
  );
  return fingerprintOf(
    parts.map((part) => part.label),
    rows,
    [rootFields.values.typeof, rootFields.values.as_string ?? null],
    // A thrown primitive or plain object has no stack; its string form is its identity.
    typeof rootFields.rawStack !== 'string',
  );
}
```

   In `build`, keep each node's `NodeFields` next to its row so they can be passed here. Call `computeFingerprint` after the rows and before `context` and `reporting_errors`, and add `['fingerprint', fingerprint]` as the root's second entry, right after `occurrence_id`.
6. `resolveCall`: if `fingerprint !== undefined` and it fails `FINGERPRINT_PATTERN`, throw `new TypeError('fingerprint must be 1 to 64 printable ASCII characters without spaces')`.
7. On the maker:

```ts
  /** The fingerprint alone: discovery and node fields, without `as_json`, the context or the limiter. */
  makeFingerprint(caught: unknown): string | undefined {
    if (this.ctx.parts === null) return undefined;
    return this.collecting(() => {
      const { root, nodes } = discover(this.ctx, caught);
      const fieldsOf = (node: Node) =>
        [node, makeNodeFields(this.ctx, node, false)] as const;
      const [, rootFields] = fieldsOf(root);
      return computeFingerprint(this.ctx, {}, root, rootFields, nodes.map(fieldsOf));
    });
  }
```

8. Export `CorjFingerprintPart` from the package root.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 6: Prove the floor end to end in `tests/limiter-order.test.ts`**

Add this test next to the minimal-report one. It drives the real limiter with the largest fixed fields the call input allows:

```ts
  test('the largest fixed fields survive the floor, in both shapes', () => {
    const huge = new AggregateError([new Error('child')], 'm'.repeat(5000));
    const options = { onError: silent, maxReportSize: 512, metadata: true, omitExpectedValues: false } as const;
    const call = {
      context: { blob: 'c'.repeat(3000) },
      occurrenceId: '!'.repeat(128),
      fingerprint: '~'.repeat(64),
    };
    for (const make of [makeCorj, makeCorjArray] as const) {
      const made = make(huge, options, call);
      const root = (Array.isArray(made) ? made[0] : made) as CorjReport;
      expect(root.truncated).toBe(true);
      expect(root.occurrence_id).toBe(call.occurrenceId);
      expect(root.fingerprint).toBe(call.fingerprint);
      expect(root.v).toBeDefined();
      expect(bytes(made)).toBeLessThanOrEqual(512);
    }
  });
```

Run: `npx jest tests/limiter-order.test.ts`. Expected: PASS. **If the byte count exceeds 512, stop and report the measured number. Do not change the floor or the patterns.**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: fingerprint from a list of parts, hashed after redaction and before limiting; maker.makeFingerprint"
```

---

### Task 8: Turn both fields on by default

**Files:**
- Create: `tests/legacy-options.ts`
- Modify: `src/index.ts` (`CORJ_DEFAULT_OPTIONS`), every pre-existing file under `tests/` that builds a report, `tests/consumers/fixtures/**` where a fixture compares a whole report, `examples/*.ts` output comments
- Create: `tests/defaults.test.ts`

**Interfaces:**
- Produces: `occurrenceIdSources` default `[{ auto: 'random' }]`; `fingerprintParts` default `['constructor_name', 'stack']`. Both frozen.
- Produces: `tests/legacy-options.ts`:

```ts
import type { CorjOptionsInput } from '../src/index';

/**
 * corj 11 adds `occurrence_id` (random) and `fingerprint` (depends on stack line
 * numbers) to every report by default. Tests written against the 10.x shape pass
 * this to keep asserting exactly what they asserted before; the two fields have
 * their own suites.
 */
export const LEGACY: CorjOptionsInput = Object.freeze({
  occurrenceIdSources: null,
  fingerprintParts: null,
});
```

- [ ] **Step 1: Write `tests/defaults.test.ts`**

```ts
import { CORJ_DEFAULT_OPTIONS, makeCorj } from '../src/index';

describe('defaults', () => {
  test('a report carries an id and a fingerprint out of the box', () => {
    const report = makeCorj(new Error('x'));
    expect(report.occurrence_id).toMatch(/^CORJ_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(report.fingerprint).toMatch(/^fp1_[0-9a-f]{32}$/);
  });

  test('the default lists are these, and frozen', () => {
    expect(CORJ_DEFAULT_OPTIONS.occurrenceIdSources).toEqual([{ auto: 'random' }]);
    expect(CORJ_DEFAULT_OPTIONS.fingerprintParts).toEqual(['constructor_name', 'stack']);
    expect(Object.isFrozen(CORJ_DEFAULT_OPTIONS.occurrenceIdSources)).toBe(true);
    expect(Object.isFrozen(CORJ_DEFAULT_OPTIONS.fingerprintParts)).toBe(true);
  });

  test('a test that needs a deterministic report turns both off, or pins them', () => {
    expect(
      makeCorj(new Error('x'), { occurrenceIdSources: null, fingerprintParts: null }),
    ).not.toHaveProperty('occurrence_id');
    const pinned = makeCorj(new Error('x'), undefined, {
      occurrenceId: 'test-id',
      fingerprint: 'test-fp',
    });
    expect([pinned.occurrence_id, pinned.fingerprint]).toEqual(['test-id', 'test-fp']);
  });
});
```

- [ ] **Step 2: Commit the tree, then flip the defaults**

`git status --short` must be clean before this step (it is a mechanical edit across many files; you need a clean point to return to). Change the two defaults in `CORJ_DEFAULT_OPTIONS`. Run `npx jest` and note how many tests fail: that is the work list.

- [ ] **Step 3: Apply `LEGACY` to the pre-existing tests, mechanically**

The files created by Tasks 1 to 7 already pass explicit options where they need them; do not touch them unless they fail. For every **other** failing file add `import { LEGACY } from './legacy-options';` and rewrite the call sites:

| Before | After |
| --- | --- |
| `makeCorj(x)` | `makeCorj(x, LEGACY)` |
| `makeCorj(x, { a: 1 })` | `makeCorj(x, { ...LEGACY, a: 1 })` |
| `makeCorjArray(x)` | `makeCorjArray(x, LEGACY)` |
| `new CorjMaker()` | `new CorjMaker(LEGACY)` |
| `new CorjMaker({ a: 1 })` | `new CorjMaker({ ...LEGACY, a: 1 })` |
| `maker.with({ a: 1 })` | unchanged: it inherits from its maker |

**Rules.** No expectation changes in this step: if a test still fails after the rewrite, the rewrite is incomplete, or the test asserts `CORJ_DEFAULT_OPTIONS` or the default-maker cache. For those two kinds only: update the defaults snapshot in `tests/exports-assertions.test.ts` to include the two new options and `maxContextSize`; for a test of the cached default maker (`makeCorj(x)` with no options, by design), assert with `expect.objectContaining` or delete the two fields from the actual value before comparing. List every such exception in your report.

- [ ] **Step 4: Examples and consumer fixtures**

`examples/*.ts` print reports in comments. Re-run each with `npm run ts-file -- examples/<file>` and update the printed output; ids and fingerprints vary per run, so write them as `"CORJ_…"` and `"fp1_…"` in the comments. In `tests/consumers/fixtures/scenarios.mjs`, where a whole report is compared, pass `{ occurrenceIdSources: null, fingerprintParts: null }`, and add one scenario asserting the default report has both fields matching the two patterns.

- [ ] **Step 5: Run the gate**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Expected: PASS, 100%.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: occurrence_id and fingerprint are on by default

BREAKING CHANGE: every report gains occurrence_id and fingerprint. Pass occurrenceIdSources: null and fingerprintParts: null for the 10.x shape, or pin both through the call input."
```

---

### Task 9: Report format `corj/v0.14`, schemas, README

**Files:**
- Create: `schema-versions/corj/v0.14/{definitions,report-object,report-array}.json`, `schema-versions/corj/v0.14-full/{definitions,report-object,report-array}.json`
- Modify: `src/version.ts`, `tests/utils/getReportObjectReportValidator.ts`, every test and example that names `v0.13` (find them with `git grep -l "v0\.13" -- . ':!docs' ':!schema-versions' ':!CHANGELOG.md'`), `README.md`
- Create: `tests/schema-v014.test.ts`

Never edit a file under `schema-versions/corj/v0.13*`: they are published.

**Interfaces:**
- Produces: `CORJ_VERSION = 'corj/v0.14'`, `CORJ_VERSION_FULL = 'corj/v0.14-full'`; the four schema links follow.

- [ ] **Step 1: Copy and extend the schemas**

```bash
cp -R schema-versions/corj/v0.13 schema-versions/corj/v0.14
cp -R schema-versions/corj/v0.13-full schema-versions/corj/v0.14-full
grep -rl "v0\.13" schema-versions/corj/v0.14 schema-versions/corj/v0.14-full | xargs sed -i 's/v0\.13/v0.14/g'
```

In **both** `definitions.json` files add to `$defs.BASE_PROPERTIES_MIXIN.properties`, and add `$defs.REPORTING_ERROR`:

```json
"occurrence_id": {
  "description": "Root only. Identifies this occurrence: from the call, from a configured source, or a generated CORJ_ id.",
  "type": "string", "pattern": "^[\\x21-\\x7e]{1,128}$"
},
"fingerprint": {
  "description": "Root only. Equal for failures of the same kind from the same place. fp1_ plus 32 hex characters, or a caller-supplied token.",
  "type": "string", "pattern": "^[\\x21-\\x7e]{1,64}$"
},
"context": {
  "description": "Root only. Caller data rendered as JSON; paths inside it start at $context."
},
"context_omitted": { "description": "Root only. The context was dropped to meet maxReportSize.", "const": "max_size" },
"reporting_errors": {
  "description": "Root only. Failures met while this report was produced.",
  "type": "array", "maxItems": 8,
  "items": { "$ref": "#/$defs/REPORTING_ERROR" }
},
"reporting_errors_omitted": { "description": "Root only. The reporting errors were dropped to meet maxReportSize.", "const": "max_size" }
```

```json
"REPORTING_ERROR": {
  "type": "object",
  "required": ["stage", "path", "error"],
  "additionalProperties": false,
  "properties": {
    "stage": { "enum": ["prop-access", "as_string", "as_json", "children", "limit", "redact", "warning", "other"] },
    "path": { "type": "string" },
    "key": { "type": "string" },
    "prop": { "type": "string" },
    "error": { "type": "string", "maxLength": 256 }
  }
}
```

Match the file's existing `$ref` style for `REPORTING_ERROR` (the other refs in these files are absolute URLs into `definitions.json`; use the same form). Update the `v` enum to the two new versions.

- [ ] **Step 2: Write `tests/schema-v014.test.ts`**

```ts
import { CORJ_VERSION, CORJ_VERSION_FULL, makeCorj, makeCorjArray, restoreExpectedValues } from '../src/index';
import {
  getReportArrayReportValidator,
  getReportObjectReportValidator,
} from './utils/getReportObjectReportValidator';

const silent = () => undefined;

function everything() {
  const error = new Error('outer', { cause: new Error('inner') });
  Object.defineProperty(error, 'bad', {
    enumerable: true,
    get() {
      throw new Error('getter failed');
    },
  });
  return error;
}

describe('corj/v0.14', () => {
  test('the version constants', () => {
    expect(CORJ_VERSION).toBe('corj/v0.14');
    expect(CORJ_VERSION_FULL).toBe('corj/v0.14-full');
  });

  test('a report using every new field validates, compact and full, object and array', () => {
    const call = { context: { runId: 'run-1' } };
    const compact = makeCorj(everything(), { onError: silent }, call);
    expect(compact.reporting_errors).toBeDefined();
    const validateObject = getReportObjectReportValidator('compact');
    expect(validateObject(compact)).toBe(true);
    expect(getReportObjectReportValidator('full')(restoreExpectedValues(compact))).toBe(true);
    const rows = makeCorjArray(everything(), { onError: silent }, call);
    expect(getReportArrayReportValidator('compact')(rows)).toBe(true);
    expect(getReportArrayReportValidator('full')(restoreExpectedValues(rows))).toBe(true);
  });

  test('a trimmed report with both omission flags validates', () => {
    const report = makeCorj(everything(), { onError: silent, maxReportSize: 600 }, {
      context: { blob: 'c'.repeat(3000) },
    });
    expect(report.context_omitted).toBe('max_size');
    expect(getReportObjectReportValidator('compact')(report)).toBe(true);
  });

  test.each([
    [{ occurrence_id: 'has space' }],
    [{ fingerprint: 'x'.repeat(65) }],
    [{ context_omitted: 'max_depth' }],
    [{ reporting_errors: [{ stage: 'nope', path: '$', error: 'x' }] }],
    [{ reporting_errors: [{ stage: 'other', path: '$', error: 'x', extra: 1 }] }],
  ])('the schema rejects %j', (patch) => {
    const report = { ...makeCorj(new Error('x')), ...patch };
    expect(getReportObjectReportValidator('compact')(report)).toBe(false);
  });
});
```

- [ ] **Step 3: Move the code to v0.14**

`src/version.ts`: both constants. `tests/utils/getReportObjectReportValidator.ts`: `VERSIONS = { compact: 'v0.14', full: 'v0.14-full' }`. Then replace `v0.13` with `v0.14` in every file the `git grep` above lists (tests, `examples/example-12-agent-harness.ts`). Run `npx jest`. Expected: PASS.

- [ ] **Step 4: README**

Rewrite, do not append. Every ```typescript block must stay runnable. Change these sections:
   - **The report / Fields:** add the six root fields with one line each. State the root order: `occurrence_id`, `fingerprint`, then the existing fields, then `context`, `reporting_errors`.
   - **Errors while reporting:** the handler is `(caught, record)`; `CorjReportingError` is `CorjContext & { error }`; the same record is in `reporting_errors`; limit-stage failures reach the handler only; at most 8 rows; text is scrubbed and cut to 256.
   - **Size limit:** the floor is 512; the drop order (context whole, reporting errors, then content); the two `_omitted` flags; `occurrence_id`, `fingerprint` and `v` are never trimmed.
   - **Options:** add `occurrenceIdSources`, `fingerprintParts`, `maxContextSize`; fix the `onError` row.
   - New section **Occurrence id**, after "Nested errors": the resolution order; the four source kinds with one example (`[{ field: 'requestId' }, { path: ['response', 'headers', 'x-request-id'] }, { auto: 'random' }]`); root only; follows `inspection`, and that a per-entry `inspection: 'default'` under a global `no-invoke` runs caught code; the token rule; never redacted, and why; one object keeps one id; `null` or `[]` turns it off; the random source and "a correlation handle, not a secret".
   - New section **Fingerprint**: what it is for (an agent in a retry loop; grouping in logs); every part contributes; the allowed parts and why `as_json` is not one; `stack` excludes the header so `message` and `stack` do not overlap; applies to every node with its path; taken after redaction and before limiting; what moves it (`maxDepth`, `maxChildren`, `childrenSources`, the policy, a new build) and what does not (budget, `stackFormat`, omission, format version); nested values are key-sorted and capped at 16,384; `fp1_` and what a prefix change means; `makeFingerprint`; the warning: a recipe without `stack` lets a reader who can guess the hashed values confirm them, so keep `stack` in the recipe when the fingerprint is shown to an untrusted audience.
   - New section **Context**, and **A JSON view of any value** (`makeJson`, named roots, `scrubText`).
   - **Redacting what the report emits / What the policy reaches:** `paths` now also see `$context...` and named-root paths; an unanchored `RegExp` such as `/\.headers$/` starts matching there; anchor with `^\$\.` to keep a rule on the caught value. Replace "Applying the policy to your own text" with `maker.scrubText`.
   - **API:** signatures with the `call` parameter; `makeJson`, `scrubText`, `makeFingerprint`; remove `new CorjRedactor`.
   - **Report schema history** and a new **Upgrading from v10** table: format `corj/v0.14`; two default-on fields and how to turn them off; `onError(caught, record)`; `CorjRedactor` removed; floor 512; `v` fixed; `replacement` capped at 128; the three removed aliases and the four deprecated ones; the `paths` widening.
   - **Links:** the v0.14 schema URLs.

- [ ] **Step 5: Run the gate, then the consumers**

Run: `npm run test-ci && npx eslint . --ext .ts && npx prettier --check .`
Then: `npm run build && npm run test-consumers`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: report format corj/v0.14

BREAKING CHANGE: the report format is corj/v0.14. New root fields: occurrence_id, fingerprint, context, context_omitted, reporting_errors, reporting_errors_omitted."
```

---

### Task 10: Open the PR and produce the development tarball

**Files:** none modified.

- [ ] **Step 1: Final gate on a clean tree**

```bash
git status --short                      # must print nothing
npm run test-ci && npx eslint . --ext .ts && npx prettier --check .
npm run build && npm run test-consumers
```

- [ ] **Step 2: Check the version semantic-release will compute**

Run: `git log main..HEAD --format=%s%n%b | grep -c "BREAKING CHANGE"`
Expected: at least 1. The next version must be `11.0.0`.

- [ ] **Step 3: Push and open the PR. Do not merge.**

corj's `origin` is HTTPS with no credential helper. Push with the SSH URL:

```bash
git push -u git@github.com:dany-fedorov/caught-object-report-json.git feat/orthogonal-reports
gh pr create --title "feat!: orthogonal reports (corj 11, format corj/v0.14)" --body "$(cat <<'EOF'
Implements Part 1 of the design in application-exception: docs/superpowers/specs/2026-09-18-orthogonal-reports-corj11-appex05.md

- One CorjContext and one CorjStage
- reporting_errors as report data; onError(caught, record) kept
- maker.makeJson with named roots, maker.scrubText; CorjRedactor removed
- Per-call input: occurrenceId, fingerprint, context
- occurrence_id from occurrenceIdSources; fingerprint from fingerprintParts; maker.makeFingerprint
- Limiter: context, then reporting_errors, then content; v fixed; floor 512
- Format corj/v0.14

Closes #219.

Merging publishes 11.0.0. The owner merges.
EOF
)"
```

- [ ] **Step 4: Build the tarball application-exception develops against**

Only after `test-consumers` has finished (it deletes `dist/` and `npm-module-build/`):

```bash
npm run prepublish-me && cd npm-module-build && npm pack && ls -1 "$PWD"/*.tgz
```

Report the absolute tarball path. Its `package.json` still says `10.0.0`; semantic-release bumps at publish.

- [ ] **Step 5: Report**

List: commits, suite and test counts, coverage, every existing expectation changed (Tasks 2, 5, 8) with its reason, the PR URL, the tarball path, and anything in this plan that was impossible as written.
