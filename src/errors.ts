/** Every code an error thrown by this package can carry. Each has a section in docs/agent/errors.md. */
export const APPEX_ERROR_CODES = [
  'APPEX_INVALID_TAG',
  'APPEX_INVALID_MESSAGE',
  'APPEX_INVALID_ID_PREFIX',
  'APPEX_INVALID_PUBLIC_POLICY',
  'APPEX_INVALID_DETAILS',
  'APPEX_INVALID_CAUSES',
  'APPEX_INVALID_OPTIONS',
  'APPEX_INVALID_OCCURRENCE_ID',
  'APPEX_INVALID_PUBLIC_CODE',
  'APPEX_INVALID_PUBLIC_MESSAGE',
  'APPEX_INVALID_TRUST_REALM',
  'APPEX_INVALID_REDACTION_POLICY',
] as const;

/** One of the codes in `APPEX_ERROR_CODES`. */
export type AppexErrorCode = (typeof APPEX_ERROR_CODES)[number];

/** Where every error message points; the fragment is the code in lower case. */
export const ERRORS_GUIDE_URL =
  'https://github.com/dany-fedorov/application-exception/blob/main/docs/agent/errors.md';

/** A `TypeError` thrown by this package: `message` is `<code>: <text>; see <url>#<code>` and `code` is enumerable. */
export type AppexTypeError = TypeError & { readonly code: AppexErrorCode };

/** Module-private mark on errors this package created; a hostile value cannot forge it. */
const APPEX_ERROR_BRAND = Symbol('application-exception/AppexTypeError');

export function invalid(code: AppexErrorCode, text: string): AppexTypeError {
  const error = new TypeError(
    `${code}: ${text}; see ${ERRORS_GUIDE_URL}#${code.toLowerCase()}`,
  );
  Object.defineProperty(error, 'code', {
    value: code,
    enumerable: true,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(error, APPEX_ERROR_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return error as AppexTypeError;
}

/** Whether a caught value is an error this package created with `invalid`. */
export function isAppexError(value: unknown): value is AppexTypeError {
  try {
    return (
      value instanceof TypeError &&
      (value as { [APPEX_ERROR_BRAND]?: unknown })[APPEX_ERROR_BRAND] === true
    );
  } catch {
    return false;
  }
}

/** How much of a described value error text keeps by default. */
export const DESCRIBE_VALUE_MAX_LENGTH = 256;

/**
 * A short, never-throwing rendering of any value, for error text. `limit` caps
 * the result; pass `Number.POSITIVE_INFINITY` to keep the whole string, which
 * a caller that scrubs the text must do before it cuts (a secret straddling
 * the cut would otherwise stop matching and leak its head).
 */
export function describeValue(
  value: unknown,
  limit: number = DESCRIBE_VALUE_MAX_LENGTH,
): string {
  try {
    return String(value).slice(0, limit);
  } catch {
    return '[unprintable value]';
  }
}
