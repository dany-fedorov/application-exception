import {
  makeTrustRealm,
  defineException,
  isTrustedException,
  isTypedException,
  makePublicReport,
} from '../src/index';
import type { TrustRealm } from '../src/index';
import { TRUST_REALM_API, TYPED_EXCEPTION_BRAND } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

type TypedModule = typeof import('../src/typed');

/** A second, independently loaded copy of this package, as a duplicate install or a separate bundle produces. */
function inOtherCopy<Value>(use: (copy: TypedModule) => Value): Value {
  let result!: Value;
  jest.isolateModules(() => {
    result = use(require('../src/typed') as TypedModule);
  });
  return result;
}

const defineTimeout = (copy: TypedModule, realm?: TrustRealm) =>
  copy.defineException({
    tag: 'db/Timeout',
    message: ({ table }: { table: string }) => `${table} timed out`,
    public: {
      code: 'DB_TIMEOUT',
      message: 'The database timed out.',
      detailsSelector: ({ table }) => ({ table }),
    },
    ...(realm === undefined ? {} : { realm }),
  });

describe('cross-copy trust', () => {
  describe('without a realm', () => {
    test('keeps the documented isolation between copies', () => {
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy);
        const failure = new Timeout({ details: { table: 'orders' } });
        return { failure, recognizedThere: copy.isTypedException(failure) };
      });

      expect(foreign.recognizedThere).toBe(true);
      expect(isTypedException(foreign.failure)).toBe(false);
      expect(makePublicReport(foreign.failure).code).toBe('INTERNAL_ERROR');
      expect(makePublicReport(foreign.failure).message).toBe(
        'Something went wrong',
      );
      expect(makePublicReport(foreign.failure).as_json).toBeUndefined();
    });

    test('still correlates the occurrence through the global brand', () => {
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy);
        return new Timeout({ details: { table: 'orders' } });
      });

      expect(makePublicReport(foreign).occurrence_id).toBe(
        foreign.occurrenceId,
      );
    });
  });

  describe('with a shared realm', () => {
    test('preserves the code, message, and details policy across copies', () => {
      const realm = makeTrustRealm();
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy, realm);
        return new Timeout({ details: { table: 'orders' } });
      });

      const report = makePublicReport(foreign, { realm });

      expect(report.code).toBe('DB_TIMEOUT');
      expect(report.message).toBe('The database timed out.');
      expect(report.as_json).toEqual({ table: 'orders' });
      expect(report.occurrence_id).toBe(foreign.occurrenceId);
      expect(isTrustedException(foreign, realm)).toBe(true);
    });

    test('recognizes locally defined kinds through the realm too', () => {
      const realm = makeTrustRealm();
      const Local = defineTimeout(
        require('../src/typed') as TypedModule,
        realm,
      );
      const failure = new Local({ details: { table: 'orders' } });

      expect(isTrustedException(failure, realm)).toBe(true);
      expect(isTypedException(failure)).toBe(true);
      expect(makePublicReport(failure, { realm }).code).toBe('DB_TIMEOUT');
    });

    test('does not trust a copy that did not join the realm', () => {
      const realm = makeTrustRealm();
      const other = makeTrustRealm();
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy, other);
        return new Timeout({ details: { table: 'orders' } });
      });

      expect(isTrustedException(foreign, realm)).toBe(false);
      expect(makePublicReport(foreign, { realm }).code).toBe('INTERNAL_ERROR');
    });

    test('lets the local registry win over the realm', () => {
      const realm = makeTrustRealm();
      const Local = defineException({
        tag: 'local/Kind',
        message: 'local',
        public: { code: 'LOCAL' },
        realm,
      });
      const failure = new Local();

      expect(makePublicReport(failure, { realm }).code).toBe('LOCAL');
      expect(makePublicReport(failure).code).toBe('LOCAL');
    });
  });

  describe('forgery', () => {
    test('a matching tag and global brand acquire no policy', () => {
      const realm = makeTrustRealm();
      inOtherCopy((copy) => defineTimeout(copy, realm));
      const forged = Object.defineProperty(
        {
          _tag: 'db/Timeout',
          occurrenceId: 'AE_FORGED',
          details: { table: 'orders' },
        },
        TYPED_EXCEPTION_BRAND,
        { value: true, enumerable: false },
      );

      expect(isTrustedException(forged, realm)).toBe(false);
      const report = makePublicReport(forged, { realm });
      expect(report.code).toBe('INTERNAL_ERROR');
      expect(report.as_json).toBeUndefined();
      expect(report.occurrence_id).toBe('AE_FORGED');
    });

    test('a wire-deserialized report acquires no policy', () => {
      const realm = makeTrustRealm();
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy, realm);
        return new Timeout({ details: { table: 'orders' } });
      });
      const revived: unknown = JSON.parse(
        JSON.stringify({
          _tag: foreign._tag,
          occurrenceId: foreign.occurrenceId,
          details: foreign.details,
        }),
      );

      expect(isTrustedException(revived, realm)).toBe(false);
      expect(makePublicReport(revived, { realm }).code).toBe('INTERNAL_ERROR');
    });

    test('a hand-built realm speaks only for the caller that passed it', () => {
      const realm = makeTrustRealm();
      const foreign = inOtherCopy((copy) => {
        const Timeout = defineTimeout(copy, realm);
        return new Timeout({ details: { table: 'orders' } });
      });
      const impostor = {
        [TRUST_REALM_API]: {
          protocol: 'appex/realm/v1',
          register: () => undefined,
          has: () => true,
          policyOf: () => ({ code: 'LEAKED', details: () => foreign.details }),
        },
      } as unknown as TrustRealm;

      // A hand-built realm only ever speaks for itself: the app decides what it
      // passes, and a caught value can never nominate one.
      expect(makePublicReport(foreign, { realm: impostor }).code).toBe(
        'LEAKED',
      );
      expect(makePublicReport(foreign).code).toBe('INTERNAL_ERROR');
    });

    test('survives a realm whose methods throw', () => {
      const hostile = {
        [TRUST_REALM_API]: {
          protocol: 'appex/realm/v1',
          register: () => undefined,
          has: () => {
            throw new Error('hostile');
          },
          policyOf: () => {
            throw new Error('hostile');
          },
        },
      } as unknown as TrustRealm;
      const foreign = inOtherCopy(
        (copy) =>
          new (defineTimeout(copy))({
            details: { table: 'orders' },
          }),
      );

      expect(isTrustedException(foreign, hostile)).toBe(false);
      expect(makePublicReport(foreign, { realm: hostile }).code).toBe(
        'INTERNAL_ERROR',
      );
    });

    test('ignores a realm that answers with a non-policy', () => {
      const loose = {
        [TRUST_REALM_API]: {
          protocol: 'appex/realm/v1',
          register: () => undefined,
          has: () => true,
          policyOf: () => 'DB_TIMEOUT',
        },
      } as unknown as TrustRealm;
      const foreign = inOtherCopy(
        (copy) =>
          new (defineTimeout(copy))({
            details: { table: 'orders' },
          }),
      );

      expect(isTrustedException(foreign, loose)).toBe(true);
      expect(makePublicReport(foreign, { realm: loose }).code).toBe(
        'INTERNAL_ERROR',
      );
    });

    test('a non-object caught value is never realm-trusted', () => {
      const realm = makeTrustRealm();

      expect(isTrustedException('db/Timeout', realm)).toBe(false);
      expect(isTrustedException(null, realm)).toBe(false);
    });
  });

  describe('realm validation', () => {
    const rejected = (realm: unknown) =>
      expect(() => isTrustedException({}, realm as TrustRealm));

    test('rejects a value that is not a realm', () => {
      rejected({}).toThrow(code('APPEX_INVALID_TRUST_REALM'));
      rejected('realm').toThrow(/must be a value returned by makeTrustRealm/);
      rejected(null).toThrow(code('APPEX_INVALID_TRUST_REALM'));
      rejected(7).toThrow(code('APPEX_INVALID_TRUST_REALM'));
    });

    test('rejects a realm whose api getter throws', () => {
      const hostile = Object.defineProperty({}, TRUST_REALM_API, {
        get: () => {
          throw new Error('hostile');
        },
      });

      rejected(hostile).toThrow(code('APPEX_INVALID_TRUST_REALM'));
    });

    test('reports a protocol mismatch explicitly', () => {
      const future = {
        [TRUST_REALM_API]: { protocol: 'appex/realm/v2' },
      } as unknown as TrustRealm;

      rejected(future).toThrow(
        /realm speaks appex\/realm\/v2; this copy speaks appex\/realm\/v1/,
      );
    });

    test('rejects a realm that claims the protocol without its methods', () => {
      const partial = {
        [TRUST_REALM_API]: { protocol: 'appex/realm/v1', has: () => true },
      } as unknown as TrustRealm;

      rejected(partial).toThrow(
        /realm claims appex\/realm\/v1 without its methods/,
      );
    });

    test('rejects a bad realm at definition time', () => {
      expect(() =>
        defineException({
          tag: 'bad/Realm',
          message: 'bad',
          realm: {} as TrustRealm,
        }),
      ).toThrow(code('APPEX_INVALID_TRUST_REALM'));
    });

    test('isTypedException keeps its one-argument shape', () => {
      const Kind = defineException({ tag: 'arity/Kind', message: 'kind' });
      const failure = new Kind();
      const values: unknown[] = [failure, new Error('x'), 'str'];

      // A second parameter would make this throw on the array index.
      expect(values.filter(isTypedException)).toEqual([failure]);
    });
  });
});

describe('a realm may not hand back a policy the package would reject', () => {
  const withPolicy = (policy: unknown) =>
    ({
      [TRUST_REALM_API]: {
        protocol: 'appex/realm/v1',
        register: () => undefined,
        has: () => true,
        policyOf: () => policy,
      },
    }) as unknown as TrustRealm;

  const foreign = () => new Error('boom');

  test.each([
    ['an empty code', { code: '' }],
    ['a non-string code', { code: 123 }],
    ['a code past 128 characters', { code: 'x'.repeat(129) }],
    ['a missing code', { message: 'hello' }],
    ['a non-string non-function message', { code: 'OK', message: 7 }],
    ['a non-function details selector', { code: 'OK', details: 'all' }],
    ['a string in place of a policy', 'DB_TIMEOUT'],
  ])('ignores %s', (_name, policy) => {
    const report = makePublicReport(foreign(), { realm: withPolicy(policy) });

    expect(report.code).toBe('INTERNAL_ERROR');
    expect(report.message).toBe('Something went wrong');
  });

  test('accepts a well-formed foreign policy', () => {
    const report = makePublicReport(foreign(), {
      realm: withPolicy({ code: 'DB_TIMEOUT', message: 'Timed out.' }),
    });

    expect(report.code).toBe('DB_TIMEOUT');
    expect(report.message).toBe('Timed out.');
  });
});
