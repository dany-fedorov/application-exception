'use strict';
// Documentation drift checks: api card, snippet type-check, budgets, error sections, links.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { render, OUTPUT } = require('./api-card.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SNIPPET_DIR = path.join(__dirname, '.snippets');
const SNIPPET_SOURCES = ['README.md', 'AGENTS.md', 'docs/agent/api-card.md', 'docs/agent/recipes.md', 'docs/agent/errors.md'];
const LINK_SOURCES = [...SNIPPET_SOURCES, 'CHANGELOG.md', 'CONTEXT.md', 'docs/README.md'];
const BUDGETS = { 'AGENTS.md': 150, 'docs/agent/api-card.md': 400 };
const findings = [];
const finding = (text) => findings.push(text);
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function checkCard() {
  const expected = render();
  const actual = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (expected !== actual) finding('docs/agent/api-card.md is stale; run npm run docs:generate');
}

function checkBudgets() {
  for (const [relative, limit] of Object.entries(BUDGETS)) {
    const lines = read(relative).trimEnd().split('\n').length;
    if (lines > limit) finding(`${relative} has ${lines} lines; budget is ${limit}`);
  }
}

function checkErrorSections() {
  const source = read('src/errors.ts');
  // Codes are the quoted string literals in APPEX_ERROR_CODES; bare identifiers such as
  // APPEX_ERROR_CODES itself are names, not codes, and must not be treated as one.
  const codes = new Set((source.match(/'(APPEX_[A-Z_]+)'/g) || []).map((literal) => literal.slice(1, -1)));
  const sections = new Set((read('docs/agent/errors.md').match(/^## (APPEX_[A-Z_]+)$/gm) || []).map((line) => line.slice(3)));
  for (const code of codes) if (!sections.has(code)) finding(`docs/agent/errors.md lacks a section for ${code}`);
  for (const code of sections) if (!codes.has(code)) finding(`docs/agent/errors.md documents unknown code ${code}`);
  for (const relative of ['README.md', 'AGENTS.md', 'docs/agent/recipes.md']) {
    for (const code of read(relative).match(/APPEX_[A-Z_]+/g) || []) {
      if (!codes.has(code)) finding(`${relative} mentions unknown code ${code}`);
    }
  }
}

function checkLinks() {
  for (const relative of LINK_SOURCES) {
    const markdown = read(relative);
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const resolved = path.resolve(ROOT, path.dirname(relative), target);
      if (!fs.existsSync(resolved)) finding(`${relative} links to missing ${target}`);
    }
  }
}

function extractSnippets() {
  const snippets = [];
  for (const relative of SNIPPET_SOURCES) {
    const lines = read(relative).split('\n');
    let open = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (open === null) {
        if (/^```ts\s*$/.test(line)) open = { start: index + 1, body: [] };
      } else if (/^```\s*$/.test(line)) {
        snippets.push({ relative, line: open.start + 1, body: open.body.join('\n') });
        open = null;
      } else {
        open.body.push(line);
      }
    }
    if (open !== null) finding(`${relative}: unterminated ts block starting at line ${open.start}`);
  }
  return snippets;
}

function checkSnippets() {
  const snippets = extractSnippets();
  fs.rmSync(SNIPPET_DIR, { recursive: true, force: true });
  fs.mkdirSync(SNIPPET_DIR, { recursive: true });
  const files = snippets.map((snippet, index) => {
    const file = path.join(SNIPPET_DIR, `snippet-${index}.ts`);
    fs.writeFileSync(file, `${snippet.body}\nexport {};\n`);
    const expectation = /^\/\/ expect-error: (.+)$/m.exec(snippet.body);
    return { ...snippet, file, expectError: expectation ? expectation[1].trim() : null };
  });
  const options = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noPropertyAccessFromIndexSignature: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    skipLibCheck: true,
    baseUrl: ROOT,
    paths: { 'application-exception': ['src/index.ts'] },
    typeRoots: [path.join(ROOT, 'node_modules', '@types')],
    types: ['node'],
  };
  const program = ts.createProgram(files.map((entry) => entry.file), options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  for (const entry of files) {
    const own = diagnostics.filter((diagnostic) => diagnostic.file && path.resolve(diagnostic.file.fileName) === entry.file);
    const messages = own.map((diagnostic) => {
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start || 0);
      return `line ${position.line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
    });
    const where = `${entry.relative}:${entry.line}`;
    if (entry.expectError === null) {
      for (const message of messages) finding(`${where} snippet: ${message}`);
    } else if (!messages.some((message) => message.includes(entry.expectError))) {
      finding(`${where} snippet expected a diagnostic containing "${entry.expectError}"; got ${messages.length ? messages.join('; ') : 'none'}`);
    }
  }
  const global = diagnostics.filter((diagnostic) => !diagnostic.file);
  for (const diagnostic of global) finding(`snippets: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  fs.rmSync(SNIPPET_DIR, { recursive: true, force: true });
  return files.length;
}

checkCard();
checkBudgets();
checkErrorSections();
checkLinks();
const count = checkSnippets();
if (findings.length > 0) {
  process.stderr.write(`${findings.map((text) => `- ${text}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Documentation checks passed (${count} snippets type-checked).\n`);
