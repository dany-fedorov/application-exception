'use strict';
// Documentation drift checks: api card, snippet type-check, budgets, error sections, links.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { render, OUTPUT } = require('./api-card.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SNIPPET_DIR = path.join(__dirname, '.snippets');
const SNIPPET_SOURCES = [
  'README.md',
  'AGENTS.md',
  'docs/agent/api-card.md',
  'docs/agent/recipes.md',
  'docs/agent/errors.md',
];
const LINK_SOURCES = [
  ...SNIPPET_SOURCES,
  'CHANGELOG.md',
  'CONTEXT.md',
  'docs/README.md',
];
const BUDGETS = { 'AGENTS.md': 150, 'docs/agent/api-card.md': 400 };
const findings = [];
const finding = (text) => findings.push(text);
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function checkCard() {
  const expected = render();
  const actual = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (expected !== actual)
    finding('docs/agent/api-card.md is stale; run npm run docs:generate');
}

function checkBudgets() {
  for (const [relative, limit] of Object.entries(BUDGETS)) {
    const lines = read(relative).trimEnd().split('\n').length;
    if (lines > limit)
      finding(`${relative} has ${lines} lines; budget is ${limit}`);
  }
}

function checkErrorSections() {
  const source = read('src/errors.ts');
  // Codes are the quoted string literals in APPEX_ERROR_CODES; bare identifiers such as
  // APPEX_ERROR_CODES itself are names, not codes, and must not be treated as one.
  const codes = new Set(
    (source.match(/'(APPEX_[A-Z_]+)'/g) || []).map((literal) =>
      literal.slice(1, -1),
    ),
  );
  const sections = new Set(
    (read('docs/agent/errors.md').match(/^## (APPEX_[A-Z_]+)$/gm) || []).map(
      (line) => line.slice(3),
    ),
  );
  for (const code of codes)
    if (!sections.has(code))
      finding(`docs/agent/errors.md lacks a section for ${code}`);
  for (const code of sections)
    if (!codes.has(code))
      finding(`docs/agent/errors.md documents unknown code ${code}`);
  // Docs may also name the exported APPEX_* identifiers themselves (APPEX_ERROR_CODES); derive
  // those from the same source so the scan never has to repeat the list of codes.
  const exported = new Set(
    [
      ...source.matchAll(
        /^export\s+(?:const|type|enum|function)\s+(APPEX_[A-Z_]+)\b/gm,
      ),
    ].map((match) => match[1]),
  );
  const allowed = new Set([...codes, ...exported]);
  for (const relative of ['README.md', 'AGENTS.md', 'docs/agent/recipes.md']) {
    for (const code of read(relative).match(/APPEX_[A-Z_]+/g) || []) {
      if (!allowed.has(code))
        finding(`${relative} mentions unknown code ${code}`);
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
      if (!fs.existsSync(resolved))
        finding(`${relative} links to missing ${target}`);
    }
  }
}

// AGENTS.md is prose and a table only; every other snippet source must carry examples.
const SNIPPET_SOURCES_WITHOUT_BLOCKS = new Set(['AGENTS.md']);
const SNIPPET_FLOOR = 20;

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
        snippets.push({
          relative,
          line: open.start + 1,
          body: open.body.join('\n'),
        });
        open = null;
      } else {
        open.body.push(line);
      }
    }
    if (open !== null)
      finding(
        `${relative}: unterminated ts block starting at line ${open.start}`,
      );
    if (
      !SNIPPET_SOURCES_WITHOUT_BLOCKS.has(relative) &&
      !snippets.some((snippet) => snippet.relative === relative)
    ) {
      finding(
        `${relative} yields no \`\`\`ts blocks; the extractor or the document is broken`,
      );
    }
  }
  if (snippets.length < SNIPPET_FLOOR) {
    finding(
      `only ${snippets.length} ts snippets extracted; expected at least ${SNIPPET_FLOOR}`,
    );
  }
  return snippets;
}

function checkSnippets() {
  const snippets = extractSnippets();
  fs.rmSync(SNIPPET_DIR, { recursive: true, force: true });
  fs.mkdirSync(SNIPPET_DIR, { recursive: true });
  try {
    return typeCheckSnippets(snippets);
  } finally {
    fs.rmSync(SNIPPET_DIR, { recursive: true, force: true });
  }
}

function typeCheckSnippets(snippets) {
  const files = snippets.map((snippet, index) => {
    const file = path.join(SNIPPET_DIR, `snippet-${index}.ts`);
    fs.writeFileSync(file, `${snippet.body}\nexport {};\n`);
    // The marker is only honored as the block's very first line, so a stray comment deeper in a
    // snippet can never turn a real failure into an expectation.
    const expectation = /^\/\/ expect-error: (.+)$/.exec(
      snippet.body.split('\n')[0] || '',
    );
    return {
      ...snippet,
      file,
      expectError: expectation ? expectation[1].trim() : null,
    };
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
  const program = ts.createProgram(
    files.map((entry) => entry.file),
    options,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  for (const entry of files) {
    const own = diagnostics.filter(
      (diagnostic) =>
        diagnostic.file &&
        path.resolve(diagnostic.file.fileName) === entry.file,
    );
    const messages = own.map((diagnostic) => {
      const position = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start || 0,
      );
      return `line ${position.line + 1}: ${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        ' ',
      )}`;
    });
    const where = `${entry.relative}:${entry.line}`;
    if (entry.expectError === null) {
      for (const message of messages) finding(`${where} snippet: ${message}`);
      continue;
    }
    const matched = messages.findIndex((message) =>
      message.includes(entry.expectError),
    );
    if (matched === -1) {
      finding(
        `${where} snippet expected a diagnostic containing "${
          entry.expectError
        }"; got ${messages.length ? messages.join('; ') : 'none'}`,
      );
    }
    // One diagnostic satisfies the marker; every other one is still a real failure.
    for (const [index, message] of messages.entries()) {
      if (index !== matched) finding(`${where} snippet: ${message}`);
    }
  }
  const global = diagnostics.filter((diagnostic) => !diagnostic.file);
  for (const diagnostic of global)
    finding(
      `snippets: ${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        ' ',
      )}`,
    );
  return files.length;
}

let count = 0;
try {
  checkCard();
  checkBudgets();
  checkErrorSections();
  checkLinks();
  count = checkSnippets();
} catch (error) {
  // A missing document or a generator that throws is a documentation finding, not a crash.
  finding(
    `unexpected error: ${
      error && error.message ? error.message : String(error)
    }`,
  );
}
if (findings.length > 0) {
  process.stderr.write(`${findings.map((text) => `- ${text}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  `Documentation checks passed (${count} snippets type-checked).\n`,
);
