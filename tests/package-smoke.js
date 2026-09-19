const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const repositoryRoot = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
assert.equal(
  typeof npmCli,
  'string',
  'Run package smoke through an npm script',
);
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'application-exception-package-'),
);

const run = (file, args, options = {}) => {
  try {
    return execFileSync(file, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    if (error.stdout) process.stderr.write(String(error.stdout));
    if (error.stderr) process.stderr.write(String(error.stderr));
    throw error;
  }
};
const runNpm = (args, options = {}) =>
  run(process.execPath, [npmCli, ...args], options);

try {
  runNpm(['run', 'prepublish-me']);
  const stagedPackage = path.join(repositoryRoot, 'npm-module-build');
  const packOutput = runNpm(
    ['pack', '--json', '--pack-destination', temporaryRoot],
    { cwd: stagedPackage },
  );
  const filename = packOutput.trim()
    ? JSON.parse(packOutput)[0].filename
    : fs.readdirSync(temporaryRoot).find((entry) => entry.endsWith('.tgz'));
  assert.equal(typeof filename, 'string', 'npm pack must create a tarball');
  const tarball = path.join(temporaryRoot, filename);
  const consumer = path.join(temporaryRoot, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'appex-smoke-consumer', private: true }),
  );
  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarball,
    ],
    { cwd: consumer },
  );

  const consumerRequire = createRequire(path.join(consumer, 'package.json'));
  const installedPackage = consumerRequire(
    'application-exception/package.json',
  );
  assert.equal(installedPackage.version, require('../package.json').version);
  assert.deepEqual(Object.keys(installedPackage.dependencies).sort(), [
    'caught-object-report-json',
    'nanoid',
  ]);
  assert.deepEqual(installedPackage.exports, {
    '.': {
      types: './index.d.ts',
      require: './index.js',
      default: './index.js',
    },
    './package.json': './package.json',
    './schemas/diagnostic-report-v3.json':
      './schemas/diagnostic-report-v3.json',
    './schemas/diagnostic-report-v4.json':
      './schemas/diagnostic-report-v4.json',
    './schemas/diagnostic-report-v5.json':
      './schemas/diagnostic-report-v5.json',
    './schemas/public-report-v3.json': './schemas/public-report-v3.json',
    './schemas/public-report-v4.json': './schemas/public-report-v4.json',
  });

  const installedRoot = path.join(
    consumer,
    'node_modules',
    'application-exception',
  );
  const packagedMarkdown = [
    'README.md',
    'CHANGELOG.md',
    'AGENTS.md',
    'docs/agent/api-card.md',
    'docs/agent/recipes.md',
    'docs/agent/errors.md',
  ];
  for (const relativePath of [
    ...packagedMarkdown,
    'schemas/diagnostic-report-v3.json',
    'schemas/diagnostic-report-v4.json',
    'schemas/diagnostic-report-v5.json',
    'schemas/public-report-v3.json',
    'schemas/public-report-v4.json',
  ]) {
    assert.equal(
      fs.existsSync(path.join(installedRoot, relativePath)),
      true,
      `${relativePath} must be included in the tarball`,
    );
  }
  for (const relativePath of packagedMarkdown) {
    const markdownPath = path.join(installedRoot, relativePath);
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert.equal(
        fs.existsSync(path.resolve(path.dirname(markdownPath), target)),
        true,
        `${relativePath} links to missing packaged path ${target}`,
      );
    }
  }

  const api = consumerRequire('application-exception');
  assert.deepEqual(Object.keys(api).sort(), [
    'APPEX_ERROR_CODES',
    'DIAGNOSTIC_REPORT_VERSION',
    'PUBLIC_REPORT_VERSION',
    'createRedactionPolicy',
    'createTrustRealm',
    'decodePublicReport',
    'defineException',
    'isTrustedException',
    'isTypedException',
    'restoreExpectedValues',
    'toDiagnosticReport',
    'toPublicReport',
    'toReports',
  ]);
  assert.throws(
    () => consumerRequire('application-exception/typed'),
    /not defined|not exported/i,
  );

  const Failure = api.defineException({
    tag: 'agent/ToolFailure',
    message: ({ tool }) => `${tool} failed`,
    public: { code: 'TOOL_FAILED', details: ({ tool }) => ({ tool }) },
  });
  const cause = new Error('connection refused');
  const error = new Failure({ details: { tool: 'search' }, cause });
  assert.equal(error instanceof Error, true);
  assert.equal(error instanceof Failure, true);
  assert.equal(error._tag, 'agent/ToolFailure');
  assert.equal(error.name, 'agent/ToolFailure');
  assert.equal(error.message, 'search failed');
  assert.equal(error.cause, cause);

  const diagnostic = api.toDiagnosticReport(error, { context: { runId: 'r' } });
  const publicReport = api.toPublicReport(error);
  assert.equal(diagnostic.v, 'corj/v0.14');
  assert.equal(diagnostic.occurrence_id, error.occurrenceId);
  assert.equal(publicReport.occurrence_id, error.occurrenceId);
  assert.match(diagnostic.fingerprint, /^fp1_[0-9a-f]{32}$/);
  assert.deepEqual(publicReport, {
    v: 'appex/public/v4',
    occurrence_id: error.occurrenceId,
    fingerprint: diagnostic.fingerprint,
    code: 'TOOL_FAILED',
    message: 'Something went wrong',
    as_json: { tool: 'search' },
  });
  // Each report is fingerprinted by its own option bag; here both bags carry the
  // same (default) `corj` and `redact` and the value has a real stack, so the
  // two agree. A value with no stack publishes no public fingerprint at all.
  const pair = api.toReports(error, {
    diagnostic: { context: { runId: 'r' } },
  });
  assert.equal(pair.diagnostic.fingerprint, pair.public.fingerprint);
  assert.equal('fingerprint' in api.toReports('socket closed').public, false);
  // A per-call override is one `public` bag laid over the kind's policy, and
  // `details: null` discloses no `as_json` at all.
  const overridden = api.toPublicReport(error, {
    public: { message: 'Search is down.', details: null },
  });
  assert.deepEqual(overridden, {
    v: 'appex/public/v4',
    occurrence_id: error.occurrenceId,
    fingerprint: diagnostic.fingerprint,
    code: 'TOOL_FAILED',
    message: 'Search is down.',
  });
  // Every corj option travels in one bag, and the budget bounds the whole
  // report: `context` goes first, whole, and the identifying fields stay.
  const bounded = api.toDiagnosticReport(error, {
    context: { runId: 'r' },
    corj: { maxReportSize: 512, maxDepth: 3 },
  });
  assert.equal(bounded.occurrence_id, error.occurrenceId);
  assert.equal(bounded.context_omitted, 'max_size');
  assert.ok(Buffer.byteLength(JSON.stringify(bounded), 'utf8') <= 512);
  assert.equal(api.restoreExpectedValues(diagnostic).message, 'search failed');
  assert.equal(
    api.decodePublicReport(JSON.parse(JSON.stringify(publicReport))).ok,
    true,
  );
  assert.equal(api.toPublicReport(new Error('x')).code, 'INTERNAL_ERROR');
  assert.throws(
    () => api.toPublicReport(error, { public: { code: '' } }),
    (thrown) =>
      thrown instanceof TypeError &&
      thrown.code === 'APPEX_INVALID_PUBLIC_CODE' &&
      /docs\/agent\/errors\.md#appex_invalid_public_code/.test(thrown.message),
  );

  const Ajv2020 = require('ajv/dist/2020');
  const ajv = new Ajv2020({ strict: true });
  assert.equal(
    ajv.validate(
      consumerRequire(
        'application-exception/schemas/diagnostic-report-v5.json',
      ),
      JSON.parse(JSON.stringify(diagnostic)),
    ),
    true,
    ajv.errorsText(),
  );
  assert.equal(
    ajv.validate(
      consumerRequire('application-exception/schemas/public-report-v4.json'),
      publicReport,
    ),
    true,
    ajv.errorsText(),
  );

  fs.writeFileSync(
    path.join(consumer, 'consumer.ts'),
    [
      "import { defineException, toDiagnosticReport, toPublicReport, decodePublicReport } from 'application-exception';",
      "import type { DiagnosticReport, PublicReport } from 'application-exception';",
      '// @ts-expect-error legacy root API was removed',
      "import { decodeDiagnosticReport } from 'application-exception';",
      '',
      'const Failure = defineException({',
      "  tag: 'agent/Failure',",
      '  message: ({ tool }: { tool: string }) => `${tool} failed`,',
      "  public: { code: 'TOOL_FAILED', details: ({ tool }) => ({ tool }) },",
      '});',
      "const error = new Failure({ details: { tool: 'search' } });",
      "const tag: 'agent/Failure' = error._tag;",
      'const diagnostic: DiagnosticReport = toDiagnosticReport(error, { corj: { maxReportSize: 4096 } });',
      "const response: PublicReport = toPublicReport(error, { public: { message: 'Down.' } });",
      '// @ts-expect-error corj options do not live at the top level',
      'toDiagnosticReport(error, { maxDepth: 2 });',
      '// @ts-expect-error the per-call code moved into the public bag',
      "toPublicReport(error, { code: 'TOOL_FAILED' });",
      'const decoded = decodePublicReport(response);',
      'if (decoded.ok) void decoded.report.code;',
      '// @ts-expect-error details are required',
      'new Failure();',
      '// @ts-expect-error inferred details reject excess fields',
      "new Failure({ details: { tool: 'search', extra: true } });",
      '// @ts-expect-error diagnostic reports are not public reports',
      'const wrong: PublicReport = diagnostic;',
      'void tag;',
      'void response;',
      'void wrong;',
      'void decodeDiagnosticReport;',
      '',
    ].join('\n'),
  );
  run(
    path.join(repositoryRoot, 'node_modules', '.bin', 'tsc'),
    [
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'Node16',
      '--moduleResolution',
      'Node16',
      'consumer.ts',
    ],
    { cwd: consumer },
  );

  process.stdout.write('Packed package smoke test passed.\n');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  fs.rmSync(path.join(repositoryRoot, 'npm-module-build'), {
    recursive: true,
    force: true,
  });
}
