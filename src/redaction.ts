import { describeValue, invalid } from './errors';
import type { CorjJsonValue } from 'caught-object-report-json';

/**
 * How a redaction policy rewrites one value it decided to redact, and what the
 * policy was asked about. `path` is a JSON path rooted at `$`.
 */
export interface RedactionContext {
  readonly path: string;
  readonly key: string | undefined;
}

/** Input of `createRedactionPolicy`; every rule is optional and they compose. */
export interface RedactionPolicyOptions {
  /** Property names redacted wherever they appear, by exact match or pattern. */
  readonly keys?: readonly (string | RegExp)[];
  /** Exact JSON paths redacted, such as `$.as_json.token` or `$.children[0].as_json.password`. */
  readonly paths?: readonly string[];
  /** String values redacted wherever they appear, including in messages and stack lines. */
  readonly values?: readonly RegExp[];
  /** What a redacted value becomes. Defaults to `[redacted]`. */
  readonly replacement?: string;
  /** Last word on any value the rules above did not redact; return the value unchanged to keep it. */
  readonly transform?: (value: CorjJsonValue, context: RedactionContext) => unknown;
}

/** An opaque, reusable redaction policy. Build it once and share it between reports. */
export interface RedactionPolicy {
  readonly [REDACTION_POLICY]: CompiledRedactionPolicy;
}

/** Module-private mark: only `createRedactionPolicy` can mint a policy. */
export const REDACTION_POLICY = Symbol('application-exception/RedactionPolicy');

const DEFAULT_REPLACEMENT = '[redacted]';

/**
 * Fields of a report node that carry its identity, version, or shape. Protection
 * is positional, never by name: a value the application happens to call `id`,
 * `code`, or `path` inside `as_json` or `context` is ordinary data and stays
 * redactable, while the report's own fields at those positions do not.
 */
const NODE_KEYS =
  'v|\\$schema|id|path|level|child_ids|typeof|instanceof_error|truncated|as_json_format|as_string_format|children_omitted|stack|children';

/**
 * Positions in a diagnostic report a policy may not replace. Containers are
 * listed so an array is never swapped for a string; their items are still
 * walked, except where the schema pins them to an enum.
 */
const DIAGNOSTIC_PROTECTED = new RegExp(
  `^\\$$` +
    `|^\\$\\.(?:${NODE_KEYS}|occurrence_id|report_omitted|reporting_errors)$` +
    `|^\\$\\.report_omitted\\[\\d+\\]$` +
    `|^\\$(?:\\.children\\[\\d+\\])?\\.child_ids\\[\\d+\\]$` +
    `|^\\$\\.children\\[\\d+\\](?:\\.(?:${NODE_KEYS}))?$` +
    `|^\\$\\.reporting_errors\\[\\d+\\](?:\\.stage)?$`,
);

/** Positions in a public report a policy may not replace. */
const PUBLIC_PROTECTED = /^\$$|^\$\.(?:v|occurrence_id|code|truncated)$/;

/**
 * Depth past which the walk stops descending and replaces the subtree. corj
 * bounds a report by bytes, not by nesting, so a hostile caught value can
 * produce an `as_json` thousands of levels deep; replacing is the safe
 * outcome, since it can only narrow what is disclosed.
 */
const MAX_REDACTION_DEPTH = 512;

export interface CompiledRedactionPolicy {
  readonly keys: readonly (string | RegExp)[];
  readonly paths: ReadonlySet<string>;
  readonly values: readonly RegExp[];
  readonly replacement: string;
  readonly transform:
    | ((value: CorjJsonValue, context: RedactionContext) => unknown)
    | undefined;
}

function assertArrayOf(
  value: unknown,
  name: string,
  ok: (item: unknown) => boolean,
  expected: string,
): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw invalid('APPEX_INVALID_REDACTION_POLICY', `${name} must be an array`);
  for (const item of value) {
    if (!ok(item))
      throw invalid(
        'APPEX_INVALID_REDACTION_POLICY',
        `${name} must contain only ${expected}`,
      );
  }
  return value;
}

/**
 * Build a reusable redaction policy for `toDiagnosticReport`, `toPublicReport`,
 * and `toReports`.
 *
 * The policy rewrites values in the produced report: messages, stacks,
 * `as_json`, `context`, `reporting_errors`, and every nested cause. On a public
 * report it runs **after** the kind's `public.details` selector, so redaction
 * can only narrow what was selected — it never authorizes disclosure, and a
 * field the selector did not choose stays absent.
 *
 * Identity and shape fields (`v`, `occurrence_id`, `code`, and corj's
 * structural keys) are walked but never replaced, so a redacted report still
 * validates against its schema.
 *
 * @throws `APPEX_INVALID_REDACTION_POLICY`
 * @example
 * ```ts
 * import { createRedactionPolicy, toDiagnosticReport } from 'application-exception';
 * const redact = createRedactionPolicy({ keys: ['password', /token$/i], values: [/\bsk-[A-Za-z0-9]{8,}\b/] });
 * const report = toDiagnosticReport(new Error('bad key sk-abcdefgh'), { redact });
 * console.log(report.message); // 'bad key [redacted]'
 * ```
 */
export function createRedactionPolicy(
  options: RedactionPolicyOptions = {},
): RedactionPolicy {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  )
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      'redaction policy options must be an object',
    );
  const keys = assertArrayOf(
    options.keys,
    'keys',
    (item) => typeof item === 'string' || item instanceof RegExp,
    'strings and regular expressions',
  ) as readonly (string | RegExp)[];
  const paths = assertArrayOf(
    options.paths,
    'paths',
    (item) => typeof item === 'string',
    'strings',
  ) as readonly string[];
  const values = assertArrayOf(
    options.values,
    'values',
    (item) => item instanceof RegExp,
    'regular expressions',
  ) as readonly RegExp[];
  for (const pattern of values) {
    // A sticky pattern anchors at lastIndex and would silently match nothing.
    if (pattern.flags.includes('y'))
      throw invalid(
        'APPEX_INVALID_REDACTION_POLICY',
        `values must not use the sticky flag; ${String(pattern)} would match nothing`,
      );
  }
  const { replacement, transform } = options;
  if (
    replacement !== undefined &&
    (typeof replacement !== 'string' || replacement.length > 128)
  )
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      'replacement must be a string of at most 128 characters',
    );
  if (transform !== undefined && typeof transform !== 'function')
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      'transform must be a function',
    );
  const compiled: CompiledRedactionPolicy = {
    keys,
    paths: new Set(paths),
    values,
    replacement: replacement ?? DEFAULT_REPLACEMENT,
    transform,
  };
  return Object.freeze({ [REDACTION_POLICY]: Object.freeze(compiled) });
}

/** The compiled policy behind a value, or `undefined` for `undefined`; anything else throws. */
export function compiledPolicy(policy: unknown): CompiledRedactionPolicy | undefined {
  if (policy === undefined) return undefined;
  let compiled: unknown;
  try {
    compiled =
      typeof policy === 'object' && policy !== null
        ? (policy as Record<symbol, unknown>)[REDACTION_POLICY]
        : undefined;
  } catch {
    compiled = undefined;
  }
  if (typeof compiled !== 'object' || compiled === null)
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      'redact must be a value returned by createRedactionPolicy',
    );
  return compiled as CompiledRedactionPolicy;
}

function matchesKey(policy: CompiledRedactionPolicy, key: string): boolean {
  for (const rule of policy.keys) {
    if (typeof rule === 'string' ? rule === key : reTest(rule, key))
      return true;
  }
  return false;
}

/** `RegExp.test` without letting a `g`/`y` flag's `lastIndex` make results depend on call order. */
function reTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function redactStringValues(
  policy: CompiledRedactionPolicy,
  text: string,
): string | undefined {
  let output = text;
  for (const pattern of policy.values) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );
    output = output.replace(global, policy.replacement);
  }
  return output === text ? undefined : output;
}

/** A never-throwing report of a redaction failure, so a broken policy is observable rather than silent. */
export type RedactionFailure = (path: string, error: string) => void;

/**
 * Rewrite a report tree through a policy. Positions the schema pins survive; a
 * throwing `transform` drops the value it was asked about and reports the
 * failure, which is always safe because dropping can only narrow disclosure.
 */
export function applyRedaction(
  value: CorjJsonValue,
  policy: CompiledRedactionPolicy,
  onFailure: RedactionFailure,
  protectedAt: RegExp = DIAGNOSTIC_PROTECTED,
): CorjJsonValue {
  const walk = (
    node: CorjJsonValue,
    path: string,
    key: string | undefined,
    depth: number,
  ): CorjJsonValue => {
    const structural = protectedAt.test(path);
    if (!structural) {
      if (
        depth > MAX_REDACTION_DEPTH ||
        policy.paths.has(path) ||
        (key !== undefined && matchesKey(policy, key))
      )
        return typeof node === 'object' && node !== null
          ? policy.replacement
          : blankOf(node, policy.replacement);
    }
    if (Array.isArray(node))
      return node.map((item, index) =>
        walk(item as CorjJsonValue, `${path}[${index}]`, undefined, depth + 1),
      );
    if (typeof node === 'object' && node !== null) {
      const output: Record<string, CorjJsonValue> = {};
      for (const [childKey, childValue] of Object.entries(node)) {
        output[childKey] = walk(
          childValue as CorjJsonValue,
          `${path}.${childKey}`,
          childKey,
          depth + 1,
        );
      }
      return output;
    }
    if (structural) return node;
    if (typeof node === 'string') {
      const replaced = redactStringValues(policy, node);
      if (replaced !== undefined) return replaced;
    }
    if (policy.transform === undefined) return node;
    try {
      const produced = policy.transform(node, { path, key });
      if (produced === node) return node;
      return narrowTo(node, produced, policy.replacement);
    } catch (failure: unknown) {
      onFailure(path, describeValue(failure));
      return blankOf(node, policy.replacement);
    }
  };
  return walk(value, '$', undefined, 0);
}

/**
 * What a transform is allowed to put in place of one value. It may return a
 * JSON scalar of the same type, which is the narrowing case, and nothing else:
 * a report pins types positionally (stack lines are strings, `level` is a
 * number), so a substitution of a different type would make the report fail its
 * own schema. Anything else collapses to a blank of the original's type, which
 * carries no information.
 */
function narrowTo(
  original: CorjJsonValue,
  produced: unknown,
  replacement: string,
): CorjJsonValue {
  if (original === null) return null;
  if (typeof produced === typeof original) {
    if (typeof produced !== 'number') return produced as CorjJsonValue;
    if (Number.isFinite(produced)) return produced;
  }
  return blankOf(original, replacement);
}

/** The information-free value of the same JSON type, used when a transform cannot be honoured. */
function blankOf(original: CorjJsonValue, replacement: string): CorjJsonValue {
  if (typeof original === 'number') return 0;
  if (typeof original === 'boolean') return false;
  if (original === null) return null;
  return replacement;
}

export { DIAGNOSTIC_PROTECTED, PUBLIC_PROTECTED };
