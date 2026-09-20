'use strict';
// Generates docs/agent/api-card.md from the JSDoc of src/index.ts exports.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const ENTRY = path.join(ROOT, 'src', 'index.ts');
const OUTPUT = path.join(ROOT, 'docs', 'agent', 'api-card.md');
const CORJ_README =
  'https://github.com/dany-fedorov/caught-object-report-json#the-report';

const TASKS = [
  [
    'Define an error kind with typed details',
    '`defineException({ tag, message })`',
  ],
  [
    'Decide what a kind discloses',
    '`defineException({ tag, message, public: { code, message, detailsSelector } })`',
  ],
  ['Create an occurrence', '`new Kind({ details, cause })`'],
  ['Narrow a caught value to one kind', '`caught instanceof Kind`'],
  [
    'Recognize any occurrence of this package copy',
    '`isTypedException(caught)`',
  ],
  [
    'Record a failure for operators',
    '`makeDiagnosticReport(caught, { context })`',
  ],
  ['Answer an agent or user about a failure', '`makePublicReport(caught)`'],
  [
    'Correlate the two reports',
    '`report.occurrence_id`, equal on both for any object; pass `occurrenceId` for thrown primitives',
  ],
  ['Read a public report received as JSON', '`decodePublicReport(value)`'],
  [
    'Capture both reports as one occurrence',
    '`makeReportPair(caught, { diagnostic, public })`',
  ],
  [
    'Bound the whole diagnostic report',
    '`makeDiagnosticReport(caught, { maxReportBytes })`',
  ],
  [
    'Configure CORJ inspection and fingerprinting',
    '`{ corj: { inspection, maxDepth, fingerprintParts, … } }`; public reports accept only effective keys',
  ],
  [
    'Override what one call discloses',
    '`makePublicReport(caught, { policyOverride: { code, message, detailsSelector } })`',
  ],
  [
    'Tell two failures apart, or recognize a repeat',
    '`report.fingerprint`, equal on both reports of one occurrence',
  ],
  [
    'Keep secrets out of either report',
    '`makeRedactionPolicy({ keys, paths, patterns })` passed as `redact`',
  ],
  [
    'Freeze details against later mutation',
    '`defineException({ tag, message, snapshotDetails: true })`',
  ],
  [
    'Trust failures from another loaded copy',
    '`makeTrustRealm()` passed as `realm` to `defineException` and `makePublicReport`',
  ],
  [
    'Read omitted corj fields of a diagnostic report',
    '`Corj.restoreExpectedValues(report)`',
  ],
];

const RUNTIME_ORDER = [
  'defineException',
  'isTypedException',
  'isTrustedException',
  'makeTrustRealm',
  'makeRedactionPolicy',
  'makeDiagnosticReport',
  'makePublicReport',
  'makeReportPair',
  'decodePublicReport',
  'Corj',
  'DIAGNOSTIC_REPORT_VERSION',
  'PUBLIC_REPORT_VERSION',
  'APPEX_ERROR_CODES',
];

function compilerOptions() {
  const config = ts.readConfigFile(
    path.join(ROOT, 'tsconfig.json'),
    ts.sys.readFile,
  );
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    );
  return ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT).options;
}

const FORMAT =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals;

function fenceExample(text) {
  return text.startsWith('```') ? text : `\`\`\`ts\n${text}\n\`\`\``;
}

function describeExport(symbol, checker) {
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const declaration = (target.declarations || [])[0];
  if (!declaration) throw new Error(`No declaration for export ${symbol.name}`);
  const file = declaration.getSourceFile().fileName;
  // TypeScript normalizes SourceFile.fileName to forward slashes on every platform.
  const foreign = file.includes('/node_modules/');
  // JSDoc written on the export specifier itself (used to document re-exports whose
  // upstream declaration carries no comment) wins over the declaration's own comment.
  const ownSummary = ts
    .displayPartsToString(symbol.getDocumentationComment(checker))
    .trim();
  const ownTags = symbol.getJsDocTags(checker);
  const documented = ownSummary || ownTags.length > 0 ? symbol : target;
  const summary = ts
    .displayPartsToString(documented.getDocumentationComment(checker))
    .trim();
  const tags = documented.getJsDocTags(checker);
  const texts = (name) =>
    tags
      .filter((tag) => tag.name === name)
      .map((tag) => ts.displayPartsToString(tag.text || []).trim());
  let code;
  let runtime;
  if (target.flags & ts.SymbolFlags.Function) {
    runtime = true;
    const type = checker.getTypeOfSymbolAtLocation(target, declaration);
    code = type
      .getCallSignatures()
      .map(
        (signature) =>
          `function ${symbol.name}${checker.signatureToString(
            signature,
            declaration,
            FORMAT,
          )};`,
      )
      .join('\n');
  } else if (target.flags & ts.SymbolFlags.Variable) {
    runtime = true;
    const type = checker.getTypeOfSymbolAtLocation(target, declaration);
    if (symbol.name === 'Corj') {
      const properties = type.getProperties().map((property) => {
        const propertyDeclaration = (property.declarations || [])[0];
        if (!propertyDeclaration)
          throw new Error(`No declaration for Corj.${property.name}`);
        const propertyType = checker.getTypeOfSymbolAtLocation(
          property,
          propertyDeclaration,
        );
        const signatures = propertyType.getCallSignatures();
        if (signatures.length !== 1)
          throw new Error(`Corj.${property.name} must have one call signature`);
        return `readonly ${property.name}: ${checker.signatureToString(
          signatures[0],
          propertyDeclaration,
          FORMAT | ts.TypeFormatFlags.WriteArrowStyleSignature,
        )};`;
      });
      code = `const Corj: { ${properties.join(' ')} };`;
    } else {
      code = `const ${symbol.name}: ${checker.typeToString(
        type,
        declaration,
        FORMAT,
      )};`;
    }
  } else {
    runtime = false;
    code = declaration.getText(declaration.getSourceFile());
  }
  return {
    name: symbol.name,
    runtime,
    foreign,
    code,
    summary,
    examples: texts('example').map(fenceExample),
    throws: texts('throws'),
  };
}

function section(entry) {
  // "```ts signature" keeps GitHub's TypeScript highlighting while marking the block as
  // a signature, not a standalone program: the snippet type-check reads plain ```ts only.
  const lines = [`### \`${entry.name}\``, ''];
  // A re-exported type is described by its summary and the upstream link, not by its
  // declaration text, which names symbols this package does not export.
  if (!(entry.foreign && !entry.runtime))
    lines.push('```ts signature', entry.code, '```', '');
  if (entry.summary) lines.push(entry.summary, '');
  for (const text of entry.throws) lines.push(`Throws: ${text}`, '');
  for (const example of entry.examples) lines.push(example, '');
  if (entry.foreign && entry.name !== 'Corj')
    lines.push(
      `Re-exported from caught-object-report-json; field meanings: ${CORJ_README}`,
      '',
    );
  return lines.join('\n');
}

function render() {
  const program = ts.createProgram([ENTRY], compilerOptions());
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(ENTRY);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const entries = checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => describeExport(symbol, checker));
  for (const entry of entries) {
    if (!entry.summary)
      throw new Error(`Export ${entry.name} has no JSDoc summary`);
    if (
      entry.runtime &&
      !entry.foreign &&
      entry.examples.length === 0 &&
      !/^[A-Z_]+$/.test(entry.name)
    )
      throw new Error(`Runtime export ${entry.name} has no @example`);
  }
  const runtime = entries.filter((entry) => entry.runtime);
  for (const entry of runtime) {
    if (!RUNTIME_ORDER.includes(entry.name))
      throw new Error(
        `Runtime export ${
          entry.name
        } is missing from RUNTIME_ORDER in ${path.relative(ROOT, __filename)}`,
      );
  }
  runtime.sort(
    (a, b) => RUNTIME_ORDER.indexOf(a.name) - RUNTIME_ORDER.indexOf(b.name),
  );
  const types = entries
    .filter((entry) => !entry.runtime && !entry.foreign)
    .sort((a, b) => a.name.localeCompare(b.name));
  const foreignTypes = entries
    .filter((entry) => !entry.runtime && entry.foreign)
    .sort((a, b) => a.name.localeCompare(b.name));
  const out = [
    '# API card',
    '',
    'Generated from the JSDoc in `src/` by `npm run docs:generate`; `npm run docs:check` fails when this file drifts. Do not edit by hand.',
    'Rules: [AGENTS.md](../../AGENTS.md). Tasks: [recipes.md](recipes.md). Error codes: [errors.md](errors.md).',
    '',
    '## One way per task',
    '',
    '| Task | Call |',
    '| --- | --- |',
    ...TASKS.map(([task, call]) => `| ${task} | ${call} |`),
    '',
    '## Runtime exports',
    '',
    ...runtime.map(section),
    '## Types',
    '',
    ...types.map(section),
    '## Types re-exported from caught-object-report-json',
    '',
    ...foreignTypes.map(section),
  ];
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

module.exports = { render, OUTPUT };

if (require.main === module) {
  const markdown = render();
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, markdown);
    process.stdout.write(
      `Wrote ${path.relative(ROOT, OUTPUT)} (${
        markdown.split('\n').length
      } lines)\n`,
    );
  } else {
    process.stdout.write(markdown);
  }
}
