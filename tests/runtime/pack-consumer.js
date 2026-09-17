'use strict';
// Builds the real publishable artifact (the one `prepublish-me` assembles), packs it with
// `npm pack`, and installs the tarball plus its real dependency closure into a throwaway
// directory. Nothing here hand-wires node_modules: npm resolves nanoid and
// caught-object-report-json exactly as a downstream consumer would.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

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

const npmCli = () => {
  const cli = process.env.npm_execpath;
  assert.equal(
    typeof cli,
    'string',
    'Run runtime fixtures through an npm script so npm_execpath is set',
  );
  return cli;
};

const runNpm = (args, options = {}) =>
  run(process.execPath, [npmCli(), ...args], options);

function makeTemporaryRoot(label) {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), `application-exception-${label}-`),
  );
}

function packArtifact(destination) {
  runNpm(['run', 'prepublish-me']);
  const staged = path.join(repositoryRoot, 'npm-module-build');
  const output = runNpm(['pack', '--json', '--pack-destination', destination], {
    cwd: staged,
  });
  const filename = output.trim()
    ? JSON.parse(output)[0].filename
    : fs.readdirSync(destination).find((entry) => entry.endsWith('.tgz'));
  assert.equal(typeof filename, 'string', 'npm pack must create a tarball');
  fs.rmSync(staged, { recursive: true, force: true });
  return path.join(destination, filename);
}

// Installs the tarball into `consumerDir` with its real dependency closure.
// `extraDependencies` lets a fixture add its own build tooling (the browser fixture needs none:
// Vite runs from the repository's devDependencies).
function installConsumer(tarball, consumerDir, packageJsonExtras = {}) {
  fs.mkdirSync(consumerDir, { recursive: true });
  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'appex-runtime-consumer',
        private: true,
        version: '0.0.0',
        ...packageJsonExtras,
      },
      null,
      2,
    )}\n`,
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
    { cwd: consumerDir },
  );
  const installedRoot = path.join(
    consumerDir,
    'node_modules',
    'application-exception',
  );
  assert.equal(
    fs.existsSync(path.join(installedRoot, 'index.js')),
    true,
    'the packed artifact must install into the consumer',
  );
  for (const dependency of ['nanoid', 'caught-object-report-json']) {
    assert.equal(
      fs.existsSync(path.join(consumerDir, 'node_modules', dependency)),
      true,
      `${dependency} must be installed as part of the real dependency closure`,
    );
  }
  return installedRoot;
}

// Packs and installs in one step. Returns { temporaryRoot, tarball, consumerDir, installedRoot }.
function preparePackedConsumer(label, packageJsonExtras = {}) {
  const temporaryRoot = makeTemporaryRoot(label);
  const tarball = packArtifact(temporaryRoot);
  const consumerDir = path.join(temporaryRoot, 'consumer');
  const installedRoot = installConsumer(
    tarball,
    consumerDir,
    packageJsonExtras,
  );
  return { temporaryRoot, tarball, consumerDir, installedRoot };
}

module.exports = {
  repositoryRoot,
  run,
  runNpm,
  packArtifact,
  installConsumer,
  preparePackedConsumer,
};

if (require.main === module) {
  const target = process.argv[2];
  assert.equal(typeof target, 'string', 'usage: pack-consumer.js <directory>');
  const tarball = packArtifact(path.resolve(target));
  process.stdout.write(`${tarball}\n`);
}
