const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'application-exception-package-'),
);

try {
  execFileSync('npm', ['run', 'prepublish-me'], {
    cwd: repositoryRoot,
    stdio: 'pipe',
  });
  const stagedPackage = path.join(repositoryRoot, 'npm-module-build');
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', temporaryRoot],
    { cwd: stagedPackage, encoding: 'utf8' },
  );
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = path.join(temporaryRoot, filename);
  const consumer = path.join(temporaryRoot, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'appex-smoke-consumer', private: true }),
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarball,
    ],
    { cwd: consumer, stdio: 'pipe' },
  );

  const consumerRequire = createRequire(path.join(consumer, 'package.json'));
  const installedPackage = consumerRequire(
    'application-exception/package.json',
  );
  assert.deepEqual(installedPackage.exports, {
    '.': {
      types: './index.d.ts',
      require: './index.js',
      default: './index.js',
    },
    './typed': {
      types: './typed.d.ts',
      require: './typed.js',
      default: './typed.js',
    },
    './package.json': './package.json',
  });

  const before = new Set(Object.keys(require.cache));
  const { defineException } = consumerRequire('application-exception/typed');
  const loadedByTypedEntry = Object.keys(require.cache).filter(
    (modulePath) => !before.has(modulePath),
  );
  assert.equal(
    loadedByTypedEntry.some(
      (modulePath) =>
        modulePath.includes(`${path.sep}handlebars${path.sep}`) ||
        modulePath.includes(`${path.sep}pojo-constructor${path.sep}`),
    ),
    false,
  );

  const ToolFailure = defineException()({
    tag: 'agent/ToolFailure',
    message: ({ tool }) => `${tool} failed`,
  });
  const cause = new Error('connection refused');
  const error = new ToolFailure({
    details: { tool: 'search' },
    cause,
  });
  assert.equal(error._tag, 'agent/ToolFailure');
  assert.equal(error.message, 'search failed');
  assert.equal(error.cause, cause);

  const { toDiagnosticReport, toPublicReport } = consumerRequire(
    'application-exception',
  );
  const diagnostic = toDiagnosticReport(error);
  const publicReport = toPublicReport(diagnostic);
  assert.equal(diagnostic.reference, error.id);
  assert.equal(publicReport.reference, diagnostic.reference);
  assert.equal(publicReport.message, 'Something went wrong');

  fs.writeFileSync(
    path.join(consumer, 'consumer.ts'),
    [
      "import { toDiagnosticReport } from 'application-exception';",
      "import { defineException } from 'application-exception/typed';",
      '',
      'const Failure = defineException<{ tool: string }>()({',
      "  tag: 'agent/Failure',",
      '  message: ({ tool }) => `${tool} failed`,',
      '});',
      "const error = new Failure({ details: { tool: 'search' } });",
      "const tag: 'agent/Failure' = error._tag;",
      'const reference: string = toDiagnosticReport(error).reference;',
      'void tag;',
      'void reference;',
      '',
    ].join('\n'),
  );
  execFileSync(
    path.join(repositoryRoot, 'node_modules', '.bin', 'tsc'),
    [
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2021',
      '--module',
      'Node16',
      '--moduleResolution',
      'Node16',
      'consumer.ts',
    ],
    { cwd: consumer, stdio: 'pipe' },
  );

  process.stdout.write('Packed package smoke test passed.\n');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  fs.rmSync(path.join(repositoryRoot, 'npm-module-build'), {
    recursive: true,
    force: true,
  });
}
