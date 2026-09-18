import { resolveCorjRedactPolicy } from 'caught-object-report-json';
import type {
  CorjRedactContext,
  CorjRedactPolicy,
  CorjRedactTransform,
} from 'caught-object-report-json';
import { describeValue, invalid } from './errors';

/**
 * What a policy was asked about: `stage` is where corj produced the value,
 * `path` is a JSON path rooted at the caught value's `$`, `key` is the report
 * field it is destined for, and `prop` the property it was read from.
 */
export type RedactionContext = CorjRedactContext;

/** Input of `createRedactionPolicy`. `keys` and `paths` skip properties; `patterns` and `transform` scrub text. All optional. */
export interface RedactionPolicyOptions {
  /** Skip: property names never read, wherever they appear. Exact string or `RegExp`. */
  readonly keys?: readonly (string | RegExp)[];
  /** Skip: JSON paths into the caught value never read, such as `$.cause.config.headers`. */
  readonly paths?: readonly (string | RegExp)[];
  /** Scrub: replaced in every string either report emits. Each must carry the `g` flag. */
  readonly patterns?: readonly RegExp[];
  /** What skipped and scrubbed content becomes, inserted literally. Defaults to `[redacted]`. */
  readonly replacement?: string;
  /** Scrub: runs last on every emitted value; return `undefined` to drop the field. */
  readonly transform?: CorjRedactTransform;
}

/** An opaque, reusable redaction policy. Build it once and share it between reports. */
export interface RedactionPolicy {
  readonly [REDACTION_POLICY]: CompiledRedactionPolicy;
}

/** Module-private mark: only `createRedactionPolicy` can mint a policy. */
export const REDACTION_POLICY = Symbol('application-exception/RedactionPolicy');

const MAX_REPLACEMENT_LENGTH = 128;

/** The two resolved corj policies a minted policy carries. */
export interface CompiledRedactionPolicy {
  /** Forwarded to the diagnostic report's inspection of the caught value. */
  readonly forCaught: CorjRedactPolicy;
  /** Forwarded to `context` and to the public `as_json`: the same policy without `paths`. */
  readonly forViews: CorjRedactPolicy;
}

/** corj's own explanation, without the `TypeError:` prefix `String` adds. */
function corjMessage(failure: unknown): string {
  return describeValue(failure).replace(/^TypeError: /, '');
}

/**
 * Build a reusable redaction policy, accepted as `redact` by
 * `toDiagnosticReport`, `toPublicReport`, and `toReports`.
 *
 * A policy has two kinds of rule. **Skip** rules (`keys`, `paths`) name
 * properties corj never reads, so an excluded getter never runs. **Scrub** rules
 * (`patterns`, `transform`) rewrite text wherever it appears in either report:
 * messages, stacks, `as_json`, `context`, `reporting_errors`, nested causes.
 *
 * - To remove a secret's *text*, use `patterns`. Skipping a property does not
 *   remove its text elsewhere: `keys: ['message']` leaves it in `stack`.
 * - `keys` match a name everywhere; `paths` reach the caught value only, never
 *   `context` or selected public details.
 * - Every pattern needs the `g` flag; `replacement` is inserted literally.
 * - Redaction never discloses: on a public report it runs on what the kind's
 *   `public.details` selector returned.
 *
 * A policy that throws fails closed — the value becomes the replacement — and
 * is listed in `reporting_errors` with `stage: 'redact'`, its reason readable.
 *
 * @throws `APPEX_INVALID_REDACTION_POLICY`
 * @example
 * ```ts
 * import { createRedactionPolicy, toDiagnosticReport } from 'application-exception';
 * const redact = createRedactionPolicy({
 *   keys: ['password', /token$/i],
 *   patterns: [/\bsk-[A-Za-z0-9]{8,}\b/g],
 * });
 * const report = toDiagnosticReport(new Error('bad key sk-abcdefgh'), { redact });
 * console.log(report.stack?.[0]); // 'Error: bad key [redacted]'
 * ```
 */
export function createRedactionPolicy(
  options: RedactionPolicyOptions = {},
): RedactionPolicy {
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      'redaction policy options must be an object',
    );
  const { replacement } = options;
  // corj puts no bound on the replacement; the public message bound depends on
  // one, so a replacement can never blow a budget open on its own.
  if (
    replacement !== undefined &&
    (typeof replacement !== 'string' ||
      replacement.length > MAX_REPLACEMENT_LENGTH)
  )
    throw invalid(
      'APPEX_INVALID_REDACTION_POLICY',
      `replacement must be a string of at most ${MAX_REPLACEMENT_LENGTH} characters`,
    );
  let compiled: CompiledRedactionPolicy;
  try {
    compiled = {
      forCaught: resolveCorjRedactPolicy(options) as CorjRedactPolicy,
      // D5: `paths` address the caught value; they must not also match inside
      // `context` or the selected public details.
      forViews: resolveCorjRedactPolicy({
        ...options,
        paths: [],
      }) as CorjRedactPolicy,
    };
  } catch (failure: unknown) {
    throw invalid('APPEX_INVALID_REDACTION_POLICY', corjMessage(failure));
  }
  return Object.freeze({ [REDACTION_POLICY]: Object.freeze(compiled) });
}

/** The compiled policy behind a value, or `undefined` for `undefined`; anything else throws. */
export function compiledPolicy(
  policy: unknown,
): CompiledRedactionPolicy | undefined {
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
