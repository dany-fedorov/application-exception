import { CorjMaker } from 'caught-object-report-json';
import type { CorjOptionsInput } from 'caught-object-report-json';
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
 * One maker per options bag identity and redaction policy. The bag is frozen on
 * first sight: it is read once, so a later mutation must fail instead of being ignored.
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
    const { metadata } = options;
    maker = new CorjMaker({
      onError: silent,
      ...options,
      metadata:
        typeof metadata === 'object' && metadata !== null
          ? { ...metadata, v: true }
          : { v: true, $schema: metadata === true },
      redact: policy ?? null,
    });
    Object.freeze(options);
    byPolicy.set(key, maker);
  }
  return maker;
}
