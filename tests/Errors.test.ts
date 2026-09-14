import { APPEX_ERROR_CODES, ERRORS_GUIDE_URL, invalid } from '../src/errors';

describe('invalid', () => {
  test('builds a TypeError whose message carries the code and the guide anchor', () => {
    const error = invalid('APPEX_INVALID_TAG', 'tag must be a nonempty string');

    expect(error).toBeInstanceOf(TypeError);
    expect(error.code).toBe('APPEX_INVALID_TAG');
    expect(error.message).toBe(
      `APPEX_INVALID_TAG: tag must be a nonempty string; see ${ERRORS_GUIDE_URL}#appex_invalid_tag`,
    );
    expect(Object.keys(error)).toContain('code');
  });

  test('lists every code once', () => {
    expect(new Set(APPEX_ERROR_CODES).size).toBe(APPEX_ERROR_CODES.length);
    expect(APPEX_ERROR_CODES).toContain('APPEX_INVALID_OPTIONS');
  });
});
