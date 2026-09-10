// Reproductions of observed defects, not assertions of desired behavior.
// Run from the repository root after `npm run build`:
//   node docs/reviews/2026-09-10-review-probes.cjs
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const api = require('../../dist');
const {
  defineException,
  toDiagnosticReport,
  toPublicReport,
  decodeDiagnosticReport,
  isTypedException,
} = api;
const log = (probe, evidence) =>
  console.log(JSON.stringify({ probe, ...evidence }));
const Failure = defineException()({
  tag: 'review/Failure',
  message: () => 'failed',
});

let constructionFailure;
try {
  api.AppEx.new('failed');
} catch (error) {
  constructionFailure = error.message;
}
assert.match(constructionFailure, /syncNativeCause is not a function/);
log('built-legacy-constructor', { constructionFailure });

let inspected = 0;
const wide = new Proxy(
  Object.fromEntries(Array.from({ length: 100000 }, (_, i) => ['k' + i, i])),
  {
    getOwnPropertyDescriptor(target, key) {
      inspected++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  },
);
const start = performance.now();
const wideReport = toDiagnosticReport(new Failure({ details: { wide } }), {
  limits: { maxEntries: 1, maxValues: 5 },
});
assert.equal(inspected, 100000);
log('wide-object', {
  inspected,
  ms: performance.now() - start,
  bytes: Buffer.byteLength(JSON.stringify(wideReport)),
});

const accessorObject = Object.defineProperties(
  {},
  Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      'k' + i,
      {
        enumerable: true,
        get() {
          throw new Error('This getter must not execute');
        },
      },
    ]),
  ),
);
const rows = Array.from({ length: 5 }, () =>
  Array.from({ length: 50 }, () => accessorObject),
);
const report = toDiagnosticReport(new Failure({ details: { rows } }));
const decoded = decodeDiagnosticReport(report);
const publicReport = toPublicReport(report);
assert.equal(decoded.success, false);
assert.notEqual(publicReport.reference, report.reference);
log('default-budget-roundtrip', {
  bytes: Buffer.byteLength(JSON.stringify(report)),
  markers: (JSON.stringify(report).match(/unreadable/g) || []).length,
  decodeError: decoded.error,
  sameReference: publicReport.reference === report.reference,
});

let dateGetterCalls = 0;
let functionGetterCalls = 0;
const date = new Date(0);
Object.defineProperty(date, 'getTime', {
  get() {
    dateGetterCalls++;
    return () => 0;
  },
});
const fn = function () {};
Object.defineProperty(fn, 'name', {
  get() {
    functionGetterCalls++;
    return 'side effect';
  },
});
toDiagnosticReport({ date, fn });
assert.equal(dateGetterCalls, 1);
assert.equal(functionGetterCalls, 1);
const customDate = new Date(0);
Object.defineProperty(customDate, 'toISOString', {
  value: () => ({
    toJSON() {
      throw new Error('not JSON safe');
    },
  }),
});
assert.throws(
  () => JSON.stringify(toDiagnosticReport({ customDate })),
  /not JSON safe/,
);
log('special-value-getters', {
  dateGetterCalls,
  functionGetterCalls,
  customDateBreaksJson: true,
});

const definition = { tag: 'review/Original', message: () => 'original' };
const Kind = defineException()(definition);
definition.tag = 'review/Changed';
definition.message = () => 'changed';
const changed = new Kind({ details: {} });
assert.notEqual(Kind.tag, changed._tag);
log('mutable-definition', {
  classTag: Kind.tag,
  instanceTag: changed._tag,
  message: changed.message,
});

let referenceReads = 0;
const unstable = new Proxy(
  {
    v: 'appex/diagnostic/v1',
    reference: 'AE_original',
    name: 'Error',
    message: 'failed',
  },
  {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'reference' && ++referenceReads > 1) {
        return {
          value: 42,
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  },
);
const unstableDecoded = decodeDiagnosticReport(unstable);
assert.equal(unstableDecoded.success, true);
assert.equal(unstableDecoded.value.reference, 42);
log('decode-before-clone', { decoded: unstableDecoded });

// Re-evaluate the module to model independent installed copies. Restore cache.
const typedPath = require.resolve('../../dist/typed');
const cached = require.cache[typedPath];
let foreign;
try {
  delete require.cache[typedPath];
  const other = require('../../dist/typed');
  const Foreign = other.defineException()({
    tag: 'foreign/Failure',
    message: () => 'failed',
  });
  foreign = new Foreign({ details: { key: 'value' } });
} finally {
  require.cache[typedPath] = cached;
}
const foreignReport = toDiagnosticReport(foreign);
assert.equal(isTypedException(foreign), false);
assert.notEqual(foreignReport.reference, foreign.id);
assert.equal(foreignReport.kind, undefined);
assert.equal(foreignReport.details, undefined);
log('duplicate-module', {
  isTyped: isTypedException(foreign),
  sameReference: foreignReport.reference === foreign.id,
  kind: foreignReport.kind ?? null,
  details: foreignReport.details ?? null,
});

let preparations = 0;
const originalPrepare = Error.prepareStackTrace;
try {
  Error.prepareStackTrace = () => {
    preparations++;
    return 'prepared';
  };
  new Failure({ details: {} });
  assert.equal(preparations, 1);
  new Error('native');
  assert.equal(preparations, 1);
} finally {
  Error.prepareStackTrace = originalPrepare;
}
log('eager-stack', { typedPreparations: 1, nativePreparations: 0 });

const provider = Object.assign(new Error('provider'), {
  code: 'ETIMEDOUT',
  status: 503,
});
const providerReport = toDiagnosticReport(
  new Error('failed', { cause: provider }),
);
assert.equal(providerReport.cause.code, undefined);
assert.equal(providerReport.cause.status, undefined);
assert.deepEqual(toDiagnosticReport(new Map([['key', 'value']])).thrown, {});
log('diagnostic-fidelity', {
  causeKeys: Object.keys(providerReport.cause),
  map: toDiagnosticReport(new Map([['key', 'value']])).thrown,
});

console.log('All review reproductions matched the observed behavior.');
