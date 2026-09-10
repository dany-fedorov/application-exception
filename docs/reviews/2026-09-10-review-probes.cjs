// Current invariants replacing the historical defect reproductions at 34d5532.
// Run from the repository root after `npm run build`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = require('../../dist');

const log = (probe, evidence) =>
  process.stdout.write(`${JSON.stringify({ probe, ...evidence })}\n`);

assert.deepEqual(Object.keys(api).sort(), [
  'DIAGNOSTIC_REPORT_VERSION',
  'PUBLIC_REPORT_VERSION',
  'decodeDiagnosticReport',
  'defineException',
  'isTypedException',
  'toDiagnosticReport',
  'toPublicReport',
]);
log('root-surface', { exports: Object.keys(api).sort() });

const definition = {
  tag: 'review/Original',
  message: ({ operation }) => `${operation} failed`,
};
const Failure = api.defineException(definition);
definition.tag = 'review/Changed';
definition.message = () => 'changed';
const failure = new Failure({ details: { operation: 'search' } });
assert.equal(failure instanceof Error, true);
assert.equal(failure._tag, 'review/Original');
assert.equal(failure.message, 'search failed');
log('construction-and-snapshot', {
  tag: failure._tag,
  message: failure.message,
});

let inspected = 0;
const wide = new Proxy(
  Object.fromEntries(Array.from({ length: 100000 }, (_, i) => [`k${i}`, i])),
  {
    getOwnPropertyDescriptor(target, key) {
      inspected++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  },
);
const wideReport = api.toDiagnosticReport(wide, {
  limits: { maxEntries: 1, maxValues: 5, maxBytes: 4096 },
});
assert.equal(inspected <= 2, true);
assert.equal(Buffer.byteLength(JSON.stringify(wideReport)) <= 4096, true);
assert.equal(api.decodeDiagnosticReport(wideReport).success, true);
log('bounded-wide-object', {
  inspected,
  bytes: Buffer.byteLength(JSON.stringify(wideReport)),
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
const safeSpecials = api.toDiagnosticReport({ date, fn });
assert.doesNotThrow(() => JSON.stringify(safeSpecials));
assert.equal(dateGetterCalls, 0);
assert.equal(functionGetterCalls, 0);
log('special-values', { dateGetterCalls, functionGetterCalls });

let referenceReads = 0;
const unstable = new Proxy(
  {
    v: 'appex/diagnostic/v2',
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
const unstableDecoded = api.decodeDiagnosticReport(unstable);
assert.equal(
  !unstableDecoded.success ||
    typeof unstableDecoded.value.reference === 'string',
  true,
);
log('single-decoder-snapshot', { result: unstableDecoded });

const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appex-copy-'));
try {
  fs.cpSync(path.resolve(__dirname, '../../dist'), foreignRoot, {
    recursive: true,
  });
  fs.symlinkSync(
    path.resolve(__dirname, '../../node_modules'),
    path.join(foreignRoot, 'node_modules'),
    'dir',
  );
  const other = require(path.join(foreignRoot, 'typed.js'));
  const Foreign = other.defineException({
    tag: 'foreign/Failure',
    message: ({ key }) => `failed ${key}`,
  });
  const foreign = new Foreign({ details: { key: 'value' } });
  const foreignReport = api.toDiagnosticReport(foreign);
  assert.equal(api.isTypedException(foreign), false);
  assert.equal(foreignReport.reference, foreign.id);
  assert.equal(foreignReport.kind, 'foreign/Failure');
  assert.deepEqual(foreignReport.details, { key: 'value' });
  log('foreign-copy-diagnostics', {
    locallyTrusted: api.isTypedException(foreign),
    sameReference: foreignReport.reference === foreign.id,
  });
} finally {
  fs.rmSync(foreignRoot, { recursive: true, force: true });
}

let preparations = 0;
const originalPrepare = Error.prepareStackTrace;
try {
  Error.prepareStackTrace = () => {
    preparations++;
    return 'prepared';
  };
  const lazy = new Failure({ details: { operation: 'index' } });
  const withoutStack = api.toDiagnosticReport(lazy);
  assert.equal(withoutStack.stack, undefined);
  assert.equal(preparations, 0);
  const withStack = api.toDiagnosticReport(lazy, { includeStack: true });
  assert.equal(withStack.stack, 'prepared');
  assert.equal(preparations, 1);
} finally {
  Error.prepareStackTrace = originalPrepare;
}
log('stack-policy', { defaultPreparations: 0, optInPreparations: 1 });

const provider = Object.assign(new Error('provider'), {
  code: 'ETIMEDOUT',
  status: 503,
});
const providerReport = api.toDiagnosticReport(
  new Error('failed', { cause: provider }),
);
assert.equal(providerReport.cause.code, 'ETIMEDOUT');
assert.equal(providerReport.cause.status, 503);
assert.deepEqual(api.toDiagnosticReport(new Map()).thrown, {
  $appex: 'unsupported',
  reason: 'Map',
});
log('diagnostic-fidelity', {
  providerCode: providerReport.cause.code,
  providerStatus: providerReport.cause.status,
});

const publicReport = api.toPublicReport(failure.id, {
  code: 'SEARCH_FAILED',
});
assert.equal(publicReport.reference, failure.id);
assert.throws(() => api.toPublicReport(failure), TypeError);
log('reference-only-public-report', { reference: publicReport.reference });

const UndefinedRenderingFailure = api.defineException({
  tag: 'review/UndefinedRenderingFailure',
  message: () => {
    throw undefined;
  },
});
const renderingReport = api.toDiagnosticReport(
  new UndefinedRenderingFailure({ details: {} }),
);
assert.deepEqual(renderingReport.messageRenderingError, {
  $appex: 'undefined',
});
log('undefined-rendering-failure', {
  marker: renderingReport.messageRenderingError,
});

process.stdout.write('All current review invariants passed.\n');
