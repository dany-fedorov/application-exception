'use strict';
// Driver: pack the publishable artifact, install it with its real dependency closure, build a
// minimal Vite app against it, then execute that build in headless Chromium.
//
// The build runs with no Node shims or polyfills; the Vite config fails the build if a Node
// builtin is reached. After the build the bundle is inspected directly: nanoid must have been
// taken through its browser entry, and nothing resembling Node's crypto may be present.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { preparePackedConsumer, repositoryRoot } = require('./pack-consumer.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serve(root) {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent(request.url.split('?')[0]);
    const relative = requested === '/' ? '/index.html' : requested;
    const file = path.join(
      root,
      path.normalize(relative).replace(/^(\.\.[/\\])+/, ''),
    );
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    process.stderr.write(
      'playwright-core is required for this suite; run npm ci and `npx playwright-core install chromium`.\n',
    );
    process.exit(1);
  }

  const { temporaryRoot, consumerDir } = preparePackedConsumer('browser');
  let server;
  let browser;
  try {
    const fixture = path.join(consumerDir, 'browser');
    fs.mkdirSync(fixture, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, 'flow.mjs'),
      path.join(consumerDir, 'flow.mjs'),
    );
    for (const file of ['index.html', 'main.mjs']) {
      fs.copyFileSync(
        path.join(__dirname, 'browser', file),
        path.join(fixture, file),
      );
    }

    // Vite comes from the repository's devDependencies; the fixture stays a plain consumer.
    const viteBin = path.join(repositoryRoot, 'node_modules', '.bin', 'vite');
    assert.equal(
      fs.existsSync(viteBin),
      true,
      'vite must be installed as a devDependency',
    );
    const buildLog = execFileSync(
      viteBin,
      [
        'build',
        fixture, // Vite takes the root as a positional argument
        '--config',
        path.join(__dirname, 'browser', 'vite.config.mjs'),
        '--logLevel',
        'warn',
      ],
      { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (buildLog.trim()) process.stdout.write(`${buildLog.trim()}\n`);

    const dist = path.join(fixture, 'dist');
    const moduleIds = JSON.parse(
      fs.readFileSync(path.join(dist, 'modules.json'), 'utf8'),
    );
    const nanoidModules = moduleIds.filter((id) =>
      /[/\\]node_modules[/\\]nanoid[/\\]/.test(id),
    );
    assert.ok(
      nanoidModules.length > 0,
      'nanoid must be part of the browser bundle',
    );
    const nanoidEntry = nanoidModules.find((id) =>
      /[/\\]nanoid[/\\]index[^/\\]*$/.test(id),
    );
    assert.equal(
      path.basename(nanoidEntry || ''),
      'index.browser.js',
      `nanoid must resolve through its browser entry, got ${nanoidEntry} (all nanoid modules: ${nanoidModules.join(', ')})`,
    );
    for (const id of nanoidModules) {
      assert.equal(
        /[/\\]nanoid[/\\]index\.(js|cjs)$/.test(id),
        false,
        `nanoid's Node entry ${id} must not be bundled for the browser`,
      );
    }
    assert.ok(
      moduleIds.some((id) =>
        /node_modules[/\\]application-exception[/\\]index\.js$/.test(id),
      ),
      'the packed CommonJS entry must be the module that was bundled',
    );

    // No Node builtin, and specifically no Node crypto, may survive into the bundle.
    const bundleFiles = fs
      .readdirSync(path.join(dist, 'assets'))
      .filter((name) => name.endsWith('.js'))
      .map((name) => path.join(dist, 'assets', name));
    assert.ok(
      bundleFiles.length > 0,
      'the build must emit at least one JS chunk',
    );
    for (const file of bundleFiles) {
      const code = fs.readFileSync(file, 'utf8');
      for (const pattern of [
        /\bfrom\s*["']node:/,
        /\brequire\(\s*["'](?:node:)?crypto["']\s*\)/,
        /\bfrom\s*["']crypto["']/,
        /getRandomValuesPolyfill/,
      ]) {
        assert.equal(
          pattern.test(code),
          false,
          `${path.basename(file)} contains ${pattern} — a Node builtin leaked into the frontend bundle`,
        );
      }
      assert.ok(
        /crypto\.getRandomValues/.test(code) || bundleFiles.length > 1,
        'the bundle must use the Web Crypto API for id generation',
      );
    }
    const combined = bundleFiles
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    assert.ok(
      /crypto\.getRandomValues/.test(combined),
      'nanoid must generate ids from crypto.getRandomValues in the browser',
    );

    server = await serve(dist);
    const { port } = server.address();
    // http://127.0.0.1 is a secure context, which is what Web Crypto requires.
    const url = `http://127.0.0.1:${port}/`;

    browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__APPEX__ !== undefined, null, {
      timeout: 30_000,
    });
    const result = await page.evaluate(() => window.__APPEX__);

    assert.deepEqual(consoleErrors, [], 'the page must not log errors');
    assert.equal(result.ok, true, `browser flow failed: ${result.error}`);
    assert.equal(
      result.isSecureContext,
      true,
      'the page must be a secure context',
    );
    assert.equal(result.diagnosticVersion, 'corj/v0.14');
    assert.equal(result.publicVersion, 'appex/public/v4');
    assert.equal(result.diagnosticOccurrenceId, result.occurrenceId);
    assert.equal(result.publicOccurrenceId, result.occurrenceId);
    assert.equal(result.decodedOccurrenceId, result.occurrenceId);

    process.stdout.write(
      [
        `Browser runtime check passed (${result.userAgent}).`,
        `  nanoid -> ${nanoidEntry}`,
        `  bundled chunks: ${bundleFiles.map((file) => path.basename(file)).join(', ')}`,
        '  no Node builtin, no shim, no ambient Bun global in the bundle or the page',
        `  occurrenceId ${result.occurrenceId} correlates across diagnostic, public and decoded reports`,
        `  versions ${result.diagnosticVersion} / ${result.publicVersion}`,
        '',
      ].join('\n'),
    );
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
});
