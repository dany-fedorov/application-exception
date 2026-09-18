import { CorjMaker } from 'caught-object-report-json';
import type { CorjMetadata, CorjOptionsInput } from 'caught-object-report-json';
import { invalid } from './errors';
import { compiledPolicy } from './redaction';

/**
 * Options of caught-object-report-json, passed through as `corj`. Every corj
 * option is available except `redact`, which both reports share at the top level.
 * `metadata.v` is always on. `onError` defaults to a silent function: the same
 * records are in the report's `reporting_errors`.
 */
export type AppexCorjOptions = Omit<CorjOptionsInput, 'redact'>;

const NO_OPTIONS: AppexCorjOptions = Object.freeze({});
const NO_POLICY: object = Object.freeze({});
const makers = new WeakMap<object, WeakMap<object, CorjMaker>>();

function silent(): void {
  return undefined;
}

/**
 * `v` is forced on; `$schema` follows the caller. A value that is neither a
 * boolean nor an object is passed through untouched, so corj rejects it with
 * its own error instead of this package silently accepting it.
 */
function metadataFor(
  metadata: unknown,
): NonNullable<CorjOptionsInput['metadata']> {
  if (metadata === undefined || typeof metadata === 'boolean')
    return { v: true, $schema: metadata === true };
  if (typeof metadata === 'object' && metadata !== null)
    return { ...(metadata as Partial<CorjMetadata>), v: true };
  return metadata as NonNullable<CorjOptionsInput['metadata']>;
}

/**
 * One maker per options bag identity and redaction policy. The bag's own keys
 * are frozen on first sight: they are read once, so a later assignment to one
 * of them must fail instead of being ignored. The freeze is shallow, as corj
 * copies the values it keeps.
 */
export function makerFor(corj: unknown, redact: unknown): CorjMaker {
  const policy = compiledPolicy(redact);
  if (
    corj !== undefined &&
    (typeof corj !== 'object' || corj === null || Array.isArray(corj))
  )
    throw invalid(
      'APPEX_INVALID_OPTIONS',
      'corj must be an object of caught-object-report-json options',
    );
  const options = (corj ?? NO_OPTIONS) as AppexCorjOptions;
  if ('redact' in options)
    throw invalid(
      'APPEX_INVALID_OPTIONS',
      'corj.redact is not accepted; pass the policy as the top-level redact option, which both reports share',
    );
  let byPolicy = makers.get(options);
  if (byPolicy === undefined) {
    byPolicy = new WeakMap();
    makers.set(options, byPolicy);
  }
  const key = policy ?? NO_POLICY;
  let maker = byPolicy.get(key);
  if (maker === undefined) {
    maker = new CorjMaker({
      ...options,
      // Resolved after the spread: a bag that carries `onError: undefined`
      // spreads that key too, and corj would read it as "no handler given" and
      // print to the console. Anything else, a non-function included, is corj's
      // to accept or reject.
      onError: options.onError === undefined ? silent : options.onError,
      metadata: metadataFor(options.metadata),
      redact: policy ?? null,
    });
    Object.freeze(options);
    byPolicy.set(key, maker);
  }
  return maker;
}
