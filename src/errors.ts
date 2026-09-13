/** Every code an error thrown by this package can carry. Each has a section in docs/agent/errors.md. */
export const APPEX_ERROR_CODES = [
  'APPEX_INVALID_TAG',
  'APPEX_INVALID_MESSAGE',
  'APPEX_INVALID_ID_PREFIX',
  'APPEX_INVALID_PUBLIC_POLICY',
  'APPEX_INVALID_DETAILS',
  'APPEX_INVALID_CAUSES',
  'APPEX_INVALID_OPTIONS',
  'APPEX_INVALID_REFERENCE',
  'APPEX_INVALID_PUBLIC_CODE',
  'APPEX_INVALID_PUBLIC_MESSAGE',
] as const;

/** One of the codes in `APPEX_ERROR_CODES`. */
export type AppexErrorCode = (typeof APPEX_ERROR_CODES)[number];

/** Where every error message points; the fragment is the code in lower case. */
export const ERRORS_GUIDE_URL =
  'https://github.com/dany-fedorov/application-exception/blob/main/docs/agent/errors.md';

/** A `TypeError` thrown by this package: `message` is `<code>: <text>; see <url>#<code>` and `code` is enumerable. */
export type AppexTypeError = TypeError & { readonly code: AppexErrorCode };

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
  return error as AppexTypeError;
}
