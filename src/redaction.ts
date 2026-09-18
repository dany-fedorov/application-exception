import { resolveCorjRedactPolicy } from 'caught-object-report-json';
import type {
  CorjContext,
  CorjRedactPolicy,
  CorjRedactPolicyInput,
} from 'caught-object-report-json';
import { describeValue, invalid } from './errors';

/**
 * What a `transform` is told about a value: `stage`, the report `key`, the
 * source `prop`, and a `path` whose root names the document: `$` the caught
 * value, `$context` the context, `$public` the public report.
 */
export type RedactionContext = CorjContext;

/** Input of `createRedactionPolicy`: corj's policy input. `keys` and `paths` skip properties; `patterns` and `transform` scrub text. All optional. */
export type RedactionPolicyOptions = CorjRedactPolicyInput;

/** An opaque, reusable redaction policy. Build it once, at startup, and share it between reports. */
export interface RedactionPolicy {
  readonly [REDACTION_POLICY]: CorjRedactPolicy;
}

/** Module-private mark: only `createRedactionPolicy` can mint a policy. */
export const REDACTION_POLICY = Symbol('application-exception/RedactionPolicy');

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
 * - `keys` match a name everywhere. `paths` are JSON paths: `$...` into the
 *   caught value, `$context...` into `context`, `$public...` into the selected
 *   public details. Anchor a `RegExp` path with `^\$\.` to keep it on the
 *   caught value.
 * - Every pattern needs the `g` flag; `replacement` is inserted literally.
 * - A skip rule hides the value, not the name: a secret *name* needs `patterns`.
 * - Redaction never discloses: on a public report the policy is given only what
 *   the kind's `public.details` selector returned.
 *
 * A policy that throws fails closed: the value becomes the replacement. The
 * diagnostic report lists the failure in `reporting_errors` with
 * `stage: 'redact'`; the thrown message is withheld, because it may quote what
 * the policy was protecting.
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
  let resolved: CorjRedactPolicy;
  try {
    resolved = resolveCorjRedactPolicy(options) as CorjRedactPolicy;
  } catch (failure: unknown) {
    throw invalid('APPEX_INVALID_REDACTION_POLICY', corjMessage(failure));
  }
  return Object.freeze({ [REDACTION_POLICY]: resolved });
}

/** The compiled policy behind a value, or `undefined` for `undefined`; anything else throws. */
export function compiledPolicy(policy: unknown): CorjRedactPolicy | undefined {
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
  return compiled as CorjRedactPolicy;
}
