'use strict';
// Driver: pack the publishable artifact and run the shared contract flow from a Node ESM
// consumer ("type": "module"). tests/package-smoke.js already covers the CommonJS consumer;
// this measures what an `import` of the CommonJS artifact actually gives a caller today, which
// is the evidence behind the "do not add ESM export conditions" decision in
// docs/runtime-support.md.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { preparePackedConsumer } = require('./pack-consumer.js');

const { temporaryRoot, consumerDir } = preparePackedConsumer('node-esm', {
  type: 'module',
});
try {
  fs.copyFileSync(
    path.join(__dirname, 'flow.mjs'),
    path.join(consumerDir, 'flow.mjs'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'node-esm-entry.mjs'),
    [
      "import { createRequire } from 'node:module';",
      "import appex from 'application-exception';",
      // Named imports must work even though the artifact is CommonJS: Node's cjs-module-lexer
      // reads the tsc-emitted exports. If this ever stops working the import throws here.
      "import { defineException, PUBLIC_REPORT_VERSION, DIAGNOSTIC_REPORT_VERSION } from 'application-exception';",
      "import { runFlow } from './flow.mjs';",
      '',
      'const summary = runFlow(appex, { runtime: `node ${process.version} (esm)` });',
      "if (typeof defineException !== 'function') throw new Error('named import of defineException failed');",
      '',
      '// The ESM import and a CommonJS require must reach the same module instance: there is a',
      '// single artifact, so there is no dual-package hazard to reason about.',
      'const required = createRequire(import.meta.url)("application-exception");',
      'const sameInstance = required.defineException === defineException;',
      '',
      'process.stdout.write(',
      '  `__APPEX_RESULT__${JSON.stringify({',
      '    ...summary,',
      '    nodeVersion: process.version,',
      '    namedExports: Object.keys(appex).sort(),',
      '    publicVersionNamed: PUBLIC_REPORT_VERSION,',
      '    diagnosticVersionNamed: DIAGNOSTIC_REPORT_VERSION,',
      '    sameInstance,',
      '  })}\\n`,',
      ');',
      '',
    ].join('\n'),
  );

  const stdout = execFileSync(process.execPath, ['./node-esm-entry.mjs'], {
    cwd: consumerDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const marker = stdout.split('__APPEX_RESULT__')[1];
  assert.equal(
    typeof marker,
    'string',
    'the Node ESM entry must print a result',
  );
  const result = JSON.parse(marker.trim());

  assert.deepEqual(result.namedExports, [
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
  assert.equal(result.publicVersionNamed, 'appex/public/v3');
  assert.equal(result.diagnosticVersionNamed, 'corj/v0.13');
  assert.equal(
    result.sameInstance,
    true,
    'import and require must share one instance',
  );
  assert.equal(result.diagnosticOccurrenceId, result.occurrenceId);
  assert.equal(result.publicOccurrenceId, result.occurrenceId);
  assert.equal(result.decodedOccurrenceId, result.occurrenceId);

  process.stdout.write(
    [
      `Node ESM runtime check passed (${result.nodeVersion}).`,
      `  named imports resolved from the CommonJS artifact: ${result.namedExports.length}`,
      '  import and require share one module instance (no dual-package hazard)',
      `  occurrenceId ${result.occurrenceId} correlates across diagnostic, public and decoded reports`,
      `  versions ${result.diagnosticVersion} / ${result.publicVersion}`,
      '',
    ].join('\n'),
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
