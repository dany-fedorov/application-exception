// Optional illustrative microbenchmark. It enforces no performance thresholds.
// Run from the repository root with `npm run benchmark`.
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const api = require('../../dist');

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const batches = (iterations, operation) => {
  for (let i = 0; i < Math.min(1000, iterations); i++) operation();
  const samples = [];
  for (let batch = 0; batch < 5; batch++) {
    const started = performance.now();
    for (let i = 0; i < iterations; i++) operation();
    samples.push(((performance.now() - started) * 1000) / iterations);
  }
  return { medianMicroseconds: median(samples), samplesMicroseconds: samples };
};
const coldImports = Array.from({ length: 5 }, () =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        [
          "const {performance}=require('node:perf_hooks');",
          'const before=new Set(Object.keys(require.cache));',
          'const start=performance.now();',
          "require('./dist');",
          'const elapsed=performance.now()-start;',
          'const modules=Object.keys(require.cache).filter(x=>!before.has(x)).length;',
          'process.stdout.write(JSON.stringify({milliseconds:elapsed,modules}));',
        ].join(''),
      ],
      { encoding: 'utf8' },
    ),
  ),
);

const Failure = api.defineException({
  tag: 'benchmark/Failure',
  message: ({ operation }) => `${operation} failed`,
});
const construct = batches(
  5000,
  () => new Failure({ details: { operation: 'search' } }),
);
const reportError = new Failure({ details: { operation: 'search' } });
const reportWithoutStack = batches(1000, () =>
  api.toDiagnosticReport(new Failure({ details: { operation: 'search' } })),
);
const reportWithStack = batches(1000, () =>
  api.toDiagnosticReport(new Failure({ details: { operation: 'search' } }), {
    includeStack: true,
  }),
);
const projection = batches(5000, () =>
  api.toPublicReport(reportError.id, { code: 'SEARCH_FAILED' }),
);

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
const wideStarted = performance.now();
const wideReport = api.toDiagnosticReport(wide, {
  limits: { maxEntries: 1, maxValues: 5, maxBytes: 4096 },
});
const wideMilliseconds = performance.now() - wideStarted;

const output = {
  runtime: {
    node: process.version,
    v8: process.versions.v8,
    platform: `${process.platform}/${process.arch}`,
    stackTraceLimit: Error.stackTraceLimit,
  },
  methodology: {
    coldImports: 'five fresh processes; elapsed require and cache delta',
    timedOperations:
      '1,000 warmups, five batches; median microseconds per operation; report cases include fresh typed construction',
    wideObject:
      'one 100,000-key proxy; maxEntries=1, maxValues=5, maxBytes=4096',
    caveat:
      'illustrative local microbenchmark; no thresholds or production throughput claim',
  },
  coldRootImport: {
    medianMilliseconds: median(
      coldImports.map((sample) => sample.milliseconds),
    ),
    medianModules: median(coldImports.map((sample) => sample.modules)),
    samples: coldImports,
  },
  typedConstruction: construct,
  diagnosticWithoutStack: reportWithoutStack,
  diagnosticWithStack: reportWithStack,
  publicProjection: projection,
  wideObject: {
    milliseconds: wideMilliseconds,
    inspectedDescriptors: inspected,
    reportBytes: Buffer.byteLength(JSON.stringify(wideReport)),
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
