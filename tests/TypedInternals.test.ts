import { APPEX_ERROR_CODES } from '../src/errors';
import { installCause } from '../src/occurrence';
import { defineException } from '../src/typed';
import {
  TYPED_EXCEPTION_BRAND,
  brandedOccurrenceId,
  isLocalTypedException,
  memoizedReference,
  publicPolicyOf,
  registerTypedException,
} from '../src/typed-internals';

describe('typed internals', () => {
  test('registers instances and their public policy', () => {
    const withPolicy = new Error('a');
    const withoutPolicy = new Error('b');
    registerTypedException(withPolicy, { code: 'A' });
    registerTypedException(withoutPolicy, undefined);

    expect(isLocalTypedException(withPolicy)).toBe(true);
    expect(isLocalTypedException({})).toBe(false);
    expect(isLocalTypedException(null)).toBe(false);
    expect(publicPolicyOf(withPolicy)).toEqual({ code: 'A' });
    expect(publicPolicyOf(withoutPolicy)).toBeUndefined();
    expect(publicPolicyOf('a')).toBeUndefined();
  });

  test('reads the id of a branded occurrence without running getters', () => {
    let reads = 0;
    const branded = {
      [TYPED_EXCEPTION_BRAND]: true,
      id: 'AE_branded',
      get _tag() {
        reads++;
        return 'x';
      },
    };
    expect(brandedOccurrenceId(branded)).toBe('AE_branded');
    expect(reads).toBe(0);
    expect(brandedOccurrenceId({ [TYPED_EXCEPTION_BRAND]: true, id: '' })).toBeUndefined();
    expect(
      brandedOccurrenceId({ [TYPED_EXCEPTION_BRAND]: true, id: 'x'.repeat(129) }),
    ).toBeUndefined();
    expect(brandedOccurrenceId({ [TYPED_EXCEPTION_BRAND]: true, id: 42 })).toBeUndefined();
    expect(brandedOccurrenceId({ id: 'AE_unbranded' })).toBeUndefined();
    expect(brandedOccurrenceId(null)).toBeUndefined();
    expect(brandedOccurrenceId('AE_string')).toBeUndefined();
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(brandedOccurrenceId(proxy)).toBeUndefined();
  });

  test('memoizes a reference per object or function and never for primitives', () => {
    let counter = 0;
    const create = () => `AE_${++counter}`;
    const target = {};
    const fn = () => undefined;
    expect(memoizedReference(target, create)).toBe('AE_1');
    expect(memoizedReference(target, create)).toBe('AE_1');
    expect(memoizedReference(fn, create)).toBe('AE_2');
    expect(memoizedReference(fn, create)).toBe('AE_2');
    expect(memoizedReference('thrown string', create)).toBe('AE_3');
    expect(memoizedReference('thrown string', create)).toBe('AE_4');
    expect(memoizedReference(null, create)).toBe('AE_5');
    expect(memoizedReference(undefined, create)).toBe('AE_6');
  });
});

describe('installCause', () => {
  test('rejects both cause forms with a coded error', () => {
    expect(() =>
      installCause(new Error('x'), { cause: 1, causes: [] }),
    ).toThrow(expect.objectContaining({ code: 'APPEX_INVALID_CAUSES' }));
    expect(() =>
      installCause(new Error('x'), { causes: 'nope' as never }),
    ).toThrow(expect.objectContaining({ code: 'APPEX_INVALID_CAUSES' }));
  });

  test('installs one cause, wraps several, ignores an empty list', () => {
    const single = new Error('single');
    installCause(single, { causes: [1] });
    expect(single.cause).toBe(1);
    const several = new Error('several');
    installCause(several, { causes: [1, 2] });
    expect(several.cause).toBeInstanceOf(AggregateError);
    expect((several.cause as AggregateError).errors).toEqual([1, 2]);
    const none = new Error('none');
    installCause(none, { causes: [] });
    expect(Object.prototype.hasOwnProperty.call(none, 'cause')).toBe(false);
    installCause(none, {});
    expect(Object.prototype.hasOwnProperty.call(none, 'cause')).toBe(false);
  });
});

describe('hostile constructor input', () => {
  test('turns an uninspectable cause into a coded error', () => {
    const Unavailable = defineException({
      tag: 'app/Unavailable',
      message: 'Unavailable',
    });
    const trapped = new Proxy(
      {},
      {
        has() {
          throw new TypeError('trap');
        },
        getOwnPropertyDescriptor() {
          throw new TypeError('trap');
        },
      },
    );
    let thrown: unknown;
    try {
      new Unavailable(trapped as never);
    } catch (failure: unknown) {
      thrown = failure;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(APPEX_ERROR_CODES).toContain((thrown as { code: string }).code);
    expect((thrown as { code: string }).code).toBe('APPEX_INVALID_CAUSES');
    expect((thrown as Error).message).toContain('docs/agent/errors.md');
  });
});
