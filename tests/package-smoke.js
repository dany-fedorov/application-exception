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
  assert.deepEqual(installedPackage.dependencies, { nanoid: '^3.3.19' });
  assert.deepEqual(installedPackage.exports, {
    '.': {
      types: './index.d.ts',
      require: './index.js',
      default: './index.js',
    },
    './package.json': './package.json',
    './schemas/diagnostic-report-v2.json':
      './schemas/diagnostic-report-v2.json',
    './schemas/public-report-v2.json': './schemas/public-report-v2.json',
  });

  for (const relativePath of [
    'README.md',
    'CHANGELOG.md',
    'docs/api.md',
    'docs/agent-recovery.md',
    'schemas/diagnostic-report-v2.json',
    'schemas/public-report-v2.json',
  ]) {
    assert.equal(
      fs.existsSync(
        path.join(
          consumer,
          'node_modules',
          'application-exception',
          relativePath,
        ),
      ),
      true,
      `${relativePath} must be included in the tarball`,
    );
  }

  const installedRoot = path.join(
    consumer,
    'node_modules',
    'application-exception',
  );
  for (const relativePath of [
    'README.md',
    'CHANGELOG.md',
    'docs/api.md',
    'docs/agent-recovery.md',
  ]) {
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

  const before = new Set(Object.keys(require.cache));
  const api = consumerRequire('application-exception');
  const loadedByRoot = Object.keys(require.cache).filter(
    (modulePath) => !before.has(modulePath),
  );
  assert.deepEqual(Object.keys(api).sort(), [
    'DIAGNOSTIC_REPORT_VERSION',
    'PUBLIC_REPORT_VERSION',
    'decodeDiagnosticReport',
    'defineException',
    'isTypedException',
    'toDiagnosticReport',
    'toPublicReport',
  ]);
  assert.equal(
    loadedByRoot.some((modulePath) =>
      ['handlebars', 'pojo-constructor', 'caught-object-report-json'].some(
        (dependency) =>
          modulePath.includes(`${path.sep}${dependency}${path.sep}`),
      ),
    ),
    false,
  );
  assert.throws(
    () => consumerRequire('application-exception/typed'),
    /not defined|not exported/i,
  );

  const Failure = api.defineException({
    tag: 'agent/ToolFailure',
    message: ({ tool }) => `${tool} failed`,
  });
  const Unavailable = api.defineException({
    tag: 'agent/Unavailable',
    message: 'Unavailable',
  });
  const cause = new Error('connection refused');
  const error = new Failure({ details: { tool: 'search' }, cause });
  const unavailable = new Unavailable();
  assert.equal(error instanceof Error, true);
  assert.equal(error instanceof Failure, true);
  assert.equal(error._tag, 'agent/ToolFailure');
  assert.equal(error.message, 'search failed');
  assert.equal(error.cause, cause);
  assert.equal(unavailable instanceof Error, true);
  assert.deepEqual(unavailable.details, {});

  let stackPreparations = 0;
  const originalPrepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () => {
      stackPreparations++;
      return 'package-smoke-stack';
    };
    const stackError = new Failure({ details: { tool: 'index' } });
    const withoutStack = api.toDiagnosticReport(stackError);
    assert.equal(withoutStack.stack, undefined);
    assert.equal(stackPreparations, 0);
    const withStack = api.toDiagnosticReport(stackError, {
      includeStack: true,
    });
    assert.equal(withStack.stack, 'package-smoke-stack');
    assert.equal(stackPreparations, 1);
  } finally {
    Error.prepareStackTrace = originalPrepare;
  }

  const diagnostic = api.toDiagnosticReport(error);
  const decoded = api.decodeDiagnosticReport(diagnostic);
  assert.equal(decoded.success, true);
  assert.deepEqual(decoded.success && decoded.value, diagnostic);
  const publicReport = api.toPublicReport(diagnostic.reference, {
    code: 'TOOL_UNAVAILABLE',
    details: { tool: error.details.tool },
  });
  assert.equal(publicReport.reference, diagnostic.reference);
  assert.equal(publicReport.message, 'Something went wrong');

  const Ajv = require('ajv');
  const diagnosticSchema = consumerRequire(
    'application-exception/schemas/diagnostic-report-v2.json',
  );
  const publicSchema = consumerRequire(
    'application-exception/schemas/public-report-v2.json',
  );
  const ajv = new Ajv({ strict: true });
  assert.equal(
    ajv.validate(diagnosticSchema, diagnostic),
    true,
    ajv.errorsText(),
  );
  assert.equal(
    ajv.validate(publicSchema, publicReport),
    true,
    ajv.errorsText(),
  );

  fs.writeFileSync(
    path.join(consumer, 'consumer.ts'),
    [
      "import { defineException, toDiagnosticReport, toPublicReport } from 'application-exception';",
      '// @ts-expect-error legacy root API was removed',
      "import { AppEx } from 'application-exception';",
      '// @ts-expect-error the typed subpath was removed',
      "import { defineException as oldDefineException } from 'application-exception/typed';",
      '',
      'const Failure = defineException({',
      "  tag: 'agent/Failure',",
      '  message: ({ tool }: { tool: string }) => `${tool} failed`,',
      '});',
      "const error = new Failure({ details: { tool: 'search' } });",
      "const tag: 'agent/Failure' = error._tag;",
      'const reference: string = toDiagnosticReport(error).reference;',
      "toPublicReport(reference, { code: 'TOOL_FAILED' });",
      '// @ts-expect-error details are required',
      'new Failure();',
      '// @ts-expect-error inferred details reject missing fields',
      'new Failure({ details: {} });',
      '// @ts-expect-error inferred details reject excess fields',
      "new Failure({ details: { tool: 'search', extra: true } });",
      '// @ts-expect-error cause and causes are mutually exclusive',
      "new Failure({ details: { tool: 'search' }, cause: new Error(), causes: [] });",
      'const Unavailable = defineException({',
      "  tag: 'agent/Unavailable',",
      "  message: 'Unavailable',",
      '});',
      'new Unavailable();',
      'new Unavailable({ cause: undefined });',
      'void tag;',
      'void AppEx;',
      'void oldDefineException;',
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
