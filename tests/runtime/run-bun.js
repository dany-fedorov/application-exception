'use strict';
// Driver: pack the publishable artifact, install it with its real dependency closure, then run
// the shared contract flow under Bun. Node only orchestrates; every assertion runs in Bun.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { preparePackedConsumer } = require('./pack-consumer.js');

const bunExecutable = process.env.BUN_EXECUTABLE || 'bun';

let bunVersion;
try {
  bunVersion = execFileSync(bunExecutable, ['--version'], {
    encoding: 'utf8',
  }).trim();
} catch {
  process.stderr.write(
    `Bun is required for this suite. Install it from https://bun.sh or set BUN_EXECUTABLE.\n`,
  );
  process.exit(1);
}

const { temporaryRoot, consumerDir } = preparePackedConsumer('bun');
try {
  for (const file of ['flow.mjs', 'bun-entry.mjs']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(consumerDir, file));
  }

  const stdout = execFileSync(bunExecutable, ['./bun-entry.mjs'], {
    cwd: consumerDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const marker = stdout.split('__APPEX_RESULT__')[1];
  assert.equal(typeof marker, 'string', 'the Bun entry must print a result');
  const result = JSON.parse(marker.trim());

  assert.equal(
    result.bunVersion,
    bunVersion,
    'the reported Bun version must match',
  );
  assert.equal(result.diagnosticVersion, 'corj/v0.14');
  assert.equal(result.publicVersion, 'appex/public/v4');
  assert.equal(result.diagnosticOccurrenceId, result.occurrenceId);
  assert.equal(result.publicOccurrenceId, result.occurrenceId);
  assert.equal(result.decodedOccurrenceId, result.occurrenceId);
  assert.ok(
    result.appexEntry.endsWith(
      path.join('node_modules', 'application-exception', 'index.js'),
    ),
    `Bun must load the packed CommonJS entry, got ${result.appexEntry}`,
  );
  assert.ok(
    /node_modules[/\\]nanoid[/\\]index\.(c?js)$/.test(result.nanoidEntry),
    `Bun must resolve nanoid from the installed closure, got ${result.nanoidEntry}`,
  );

  process.stdout.write(
    [
      `Bun runtime check passed (bun ${result.bunVersion}).`,
      `  application-exception -> ${result.appexEntry}`,
      `  nanoid -> ${result.nanoidEntry}`,
      `  occurrenceId ${result.occurrenceId} correlates across diagnostic, public and decoded reports`,
      `  versions ${result.diagnosticVersion} / ${result.publicVersion}`,
      '',
    ].join('\n'),
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
