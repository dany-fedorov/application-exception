import { defineException, isTypedException } from '../src/typed';
import { publicPolicyOf } from '../src/typed-internals';

const code = (value: string) => expect.objectContaining({ code: value });

describe('defineException', () => {
  const UserAlreadyExists = defineException({
    tag: 'UserAlreadyExists',
    message: ({ email }: { email: string }) =>
      `An account already exists for ${email}`,
  });

  test('constructs a tagged native error with complete occurrence metadata', () => {
    const before = Date.now();
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
    });
    const after = Date.now();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserAlreadyExists);
    expect(error._tag).toBe('UserAlreadyExists');
    expect(error.name).toBe('UserAlreadyExists');
    expect(UserAlreadyExists.name).toBe('UserAlreadyExists');
    expect(UserAlreadyExists.tag).toBe('UserAlreadyExists');
    expect(error.message).toBe(
      'An account already exists for ada@example.test',
    );
    expect(error.id).toMatch(/^AE_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(Date.parse(error.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(error.timestamp)).toBeLessThanOrEqual(after);
    expect(isTypedException(error)).toBe(true);
    expect(isTypedException({ _tag: 'UserAlreadyExists' })).toBe(false);
  });

  test('exposes only occurrence data as enumerable own properties', () => {
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
      cause: new Error('unique constraint'),
    });
    expect(Object.keys(error).sort()).toEqual([
      '_tag',
      'details',
      'id',
      'timestamp',
    ]);
    expect(Object.prototype.hasOwnProperty.call(error, 'name')).toBe(false);
    expect(String(error)).toBe(
      'UserAlreadyExists: An account already exists for ada@example.test',
    );
    expect(error.stack?.split('\n')[0]).toBe(
      'UserAlreadyExists: An account already exists for ada@example.test',
    );
  });

  test('copies and shallow-freezes details while preserving nested identity', () => {
    const nested = { attempt: 1 };
    const supplied = { email: 'ada@example.test', nested };
    const RichError = defineException({
      tag: 'RichError',
      message: ({ email }: { email: string; nested: { attempt: number } }) =>
        email,
    });

    const error = new RichError({ details: supplied });
    supplied.email = 'changed@example.test';

    expect(error.details).not.toBe(supplied);
    expect(error.details.email).toBe('ada@example.test');
    expect(error.details.nested).toBe(nested);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  test('uses the configured occurrence prefix and creates distinct ids', () => {
    const AgentFailure = defineException({
      tag: 'agent/ToolFailure',
      idPrefix: 'ERR_',
      message: (_details: Record<string, never>) => 'Tool invocation failed',
    });

    const first = new AgentFailure({ details: {} });
    const second = new AgentFailure({ details: {} });

    expect(first.id).toMatch(/^ERR_/);
    expect(second.id).not.toBe(first.id);
  });

  test('preserves a single cause by identity and makes it non-enumerable', () => {
    const cause = new Error('unique constraint');
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).not.toContain('cause');
  });

  test('distinguishes an explicit undefined cause from no cause', () => {
    const explicit = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
      cause: undefined,
    });
    const absent = new UserAlreadyExists({
      details: { email: 'grace@example.test' },
    });

    expect(Object.prototype.hasOwnProperty.call(explicit, 'cause')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(absent, 'cause')).toBe(false);
  });

  test('preserves several causes in an ordered AggregateError', () => {
    const first = new Error('first');
    const second = 'second';
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
      causes: [first, second],
    });

    expect(error.cause).toBeInstanceOf(AggregateError);
    expect((error.cause as AggregateError).errors).toEqual([first, second]);
    expect((error.cause as AggregateError).message).toBe(
      'UserAlreadyExists has multiple causes',
    );
  });

  test('rejects simultaneous cause forms with a coded error', () => {
    expect(
      () =>
        new UserAlreadyExists({
          details: { email: 'ada@example.test' },
          cause: new Error('first'),
          causes: [new Error('second')],
        } as never),
    ).toThrow(code('APPEX_INVALID_CAUSES'));
  });

  test('keeps the occurrence and explains the failure when rendering throws', () => {
    const BrokenMessage = defineException({
      tag: 'agent/BrokenMessage',
      message: (_details: { operation: string }) => {
        throw new Error('renderer failed');
      },
    });
    const ReturnsNumber = defineException({
      tag: 'agent/ReturnsNumber',
      message: (_details: { operation: string }) => 42 as unknown as string,
    });
    const ThrowsUnprintable = defineException({
      tag: 'agent/ThrowsUnprintable',
      message: (_details: { operation: string }) => {
        throw {
          toString() {
            throw new Error('no string form');
          },
        };
      },
    });

    expect(
      new BrokenMessage({ details: { operation: 'search' } }).message,
    ).toBe(
      'agent/BrokenMessage [message rendering failed: Error: renderer failed]',
    );
    expect(
      new ReturnsNumber({ details: { operation: 'search' } }).message,
    ).toBe(
      'agent/ReturnsNumber [message rendering failed: renderer returned number]',
    );
    expect(
      new ThrowsUnprintable({ details: { operation: 'search' } }).message,
    ).toBe(
      'agent/ThrowsUnprintable [message rendering failed: [unprintable value]]',
    );
  });

  test('bounds the rendering failure description', () => {
    const Long = defineException({
      tag: 'Long',
      message: (_details: {}) => {
        throw 'x'.repeat(1000);
      },
    });
    expect(new Long({ details: {} }).message).toHaveLength(
      'Long [message rendering failed: ]'.length + 256,
    );
  });

  test('rejects hostile proxies without throwing during narrowing', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => isTypedException(proxy)).not.toThrow();
    expect(isTypedException(proxy)).toBe(false);
  });

  test('does not trust a forgeable global-symbol brand', () => {
    const forged = {
      [Symbol.for('application-exception/TypedException')]: true,
      _tag: 'Forged',
      id: 'AE_forged',
      timestamp: new Date().toISOString(),
      details: {},
    };

    expect(isTypedException(forged)).toBe(false);
  });

  test('rejects invalid runtime definitions with coded errors', () => {
    expect(() =>
      defineException({
        tag: '',
        message: (_details: Record<string, never>) => 'failed',
      }),
    ).toThrow(code('APPEX_INVALID_TAG'));
    expect(() =>
      defineException({ tag: 'ValidTag', message: 123 } as never),
    ).toThrow(code('APPEX_INVALID_MESSAGE'));
  });

  test('rejects non-record details from JavaScript callers', () => {
    const invalidDetails = code('APPEX_INVALID_DETAILS');
    expect(() => new UserAlreadyExists({ details: null } as never)).toThrow(
      invalidDetails,
    );
    expect(() => new UserAlreadyExists({ details: [] } as never)).toThrow(
      invalidDetails,
    );
    expect(() => new UserAlreadyExists(null as never)).toThrow(invalidDetails);
    expect(() => new UserAlreadyExists([] as never)).toThrow(invalidDetails);
    expect(
      () => new UserAlreadyExists({ details: new Date() } as never),
    ).toThrow(invalidDetails);
    class DetailsWithMethod {
      describe(): string {
        return 'not copied';
      }
    }
    expect(
      () =>
        new UserAlreadyExists({ details: new DetailsWithMethod() } as never),
    ).toThrow(invalidDetails);
    class DetailsWithFunctionField {
      readonly operation = 'search';
      readonly describe = () => this.operation;
    }
    expect(
      () =>
        new UserAlreadyExists({
          details: new DetailsWithFunctionField(),
        } as never),
    ).toThrow(invalidDetails);
    const withAccessor = Object.defineProperty({}, 'email', {
      get: () => 'ada',
      enumerable: true,
    });
    expect(
      () => new UserAlreadyExists({ details: withAccessor } as never),
    ).toThrow(invalidDetails);
    const hidden = Object.defineProperty({}, 'email', {
      value: 'ada',
      enumerable: false,
    });
    expect(() => new UserAlreadyExists({ details: hidden } as never)).toThrow(
      invalidDetails,
    );
    const lying = new Proxy(
      {},
      {
        ownKeys: () => ['email'],
        getOwnPropertyDescriptor: () => undefined,
      },
    );
    expect(() => new UserAlreadyExists({ details: lying } as never)).toThrow(
      invalidDetails,
    );
    const uninspectable = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys for you');
        },
      },
    );
    expect(
      () => new UserAlreadyExists({ details: uninspectable } as never),
    ).toThrow(invalidDetails);
  });

  test('copies enumerable data from a data-only class without its prototype', () => {
    class DataOnlyDetails {
      readonly operation = 'search';
    }
    const CustomFailure = defineException({
      tag: 'CustomFailure',
      message: ({ operation }: DataOnlyDetails) => operation,
    });

    const error = new CustomFailure({ details: new DataOnlyDetails() });

    expect(error.details).toEqual({ operation: 'search' });
    expect(error.details).not.toBeInstanceOf(DataOnlyDetails);
  });
});

describe('public policy', () => {
  test('validates and stores the policy on each instance', () => {
    const ToolUnavailable = defineException({
      tag: 'tools/Unavailable',
      message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
      public: {
        code: 'TOOL_UNAVAILABLE',
        message: ({ tool }) => `${tool} is unavailable`,
        details: ({ tool }) => ({ tool }),
      },
    });
    const error = new ToolUnavailable({ details: { tool: 'search' } });
    const policy = publicPolicyOf(error);
    expect(policy?.code).toBe('TOOL_UNAVAILABLE');
    expect(typeof policy?.message).toBe('function');
    expect(policy?.details?.(error.details)).toEqual({ tool: 'search' });
  });

  test('accepts a constant public message and no details selector', () => {
    const Unavailable = defineException({
      tag: 'Unavailable',
      message: 'Unavailable',
      public: { code: 'UNAVAILABLE', message: 'Try again later.' },
    });
    expect(publicPolicyOf(new Unavailable())).toEqual({
      code: 'UNAVAILABLE',
      message: 'Try again later.',
    });
    const CodeOnly = defineException({
      tag: 'CodeOnly',
      message: 'code only',
      public: { code: 'CODE_ONLY' },
    });
    expect(publicPolicyOf(new CodeOnly())).toEqual({ code: 'CODE_ONLY' });
  });

  test.each([
    ['not an object', 'public'],
    ['an array', []],
    ['null', null],
    ['missing code', {}],
    ['empty code', { code: '' }],
    ['long code', { code: 'x'.repeat(129) }],
    ['non-string code', { code: 42 }],
    ['non-string message', { code: 'X', message: 42 }],
    ['non-function details', { code: 'X', details: {} }],
  ])('rejects %s public policies', (_label, policy) => {
    expect(() =>
      defineException({
        tag: 'Failure',
        message: 'failure',
        public: policy as never,
      }),
    ).toThrow(code('APPEX_INVALID_PUBLIC_POLICY'));
  });
});

describe('typed construction boundaries', () => {
  test('constant messages allow no input and freeze empty details', () => {
    const Unavailable = defineException({
      tag: 'Unavailable',
      message: 'Literal {{text}}',
    });
    const absent = new Unavailable();
    const explicit = new Unavailable({ cause: undefined });
    expect(absent.message).toBe('Literal {{text}}');
    expect(absent.details).toEqual({});
    expect(Object.isFrozen(absent.details)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(absent, 'cause')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(explicit, 'cause')).toBe(true);
  });
  test('snapshots all definition fields before construction', () => {
    const definition = {
      tag: 'Original',
      message: (_details: {}) => 'first',
      idPrefix: 'FIRST_',
    };
    const Kind = defineException(definition);
    definition.tag = 'Changed';
    definition.message = () => 'second';
    definition.idPrefix = 'SECOND_';
    const error = new Kind({ details: {} });
    expect(Kind.tag).toBe('Original');
    expect(error._tag).toBe('Original');
    expect(error.name).toBe('Original');
    expect(error.message).toBe('first');
    expect(error.id).toMatch(/^FIRST_/);
  });
  test.each(['', ' ', 'x'.repeat(129), 42])('rejects invalid tag %p', (tag) => {
    expect(() => defineException({ tag, message: 'failure' } as never)).toThrow(
      code('APPEX_INVALID_TAG'),
    );
  });
  test.each(['', ' ', 'x'.repeat(33), 42])(
    'rejects invalid prefix %p',
    (idPrefix) => {
      expect(() =>
        defineException({
          tag: 'Failure',
          message: 'failure',
          idPrefix,
        } as never),
      ).toThrow(code('APPEX_INVALID_ID_PREFIX'));
    },
  );
  test('accepts identifier limits', () => {
    const Kind = defineException({
      tag: 'x'.repeat(128),
      idPrefix: 'p'.repeat(32),
      message: 'failure',
    });
    expect(new Kind().id).toHaveLength(58);
  });
  test.each([undefined, null, 'cause', { length: 2 }])(
    'rejects non-array causes %p',
    (causes) => {
      const Kind = defineException({ tag: 'Failure', message: 'failure' });
      expect(() => new Kind({ causes } as never)).toThrow(
        code('APPEX_INVALID_CAUSES'),
      );
    },
  );
  test('collapses a single-element causes array without wrapping', () => {
    const Kind = defineException({ tag: 'Failure', message: 'failure' });
    const cause = { provider: 'offline' };
    expect(new Kind({ causes: [cause] }).cause).toBe(cause);
  });
  test('rejects detail overflow before inspecting descriptors', () => {
    const Kind = defineException({
      tag: 'Failure',
      message: (_details: Record<string, number>) => 'failure',
    });
    let reads = 0;
    const wide = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [String(i), i]),
    );
    const proxy = new Proxy(wide, {
      getOwnPropertyDescriptor(target, key) {
        reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(() => new Kind({ details: proxy })).toThrow(
      code('APPEX_INVALID_DETAILS'),
    );
    expect(reads).toBe(0);
    delete wide['1000'];
    expect(Object.keys(new Kind({ details: wide }).details)).toHaveLength(1000);
  });
  test('bounds prototype traversal including cyclic proxy prototypes', () => {
    const Kind = defineException({
      tag: 'Failure',
      message: (_details: {}) => 'failure',
    });
    let value = {};
    for (let i = 0; i < 32; i++) value = Object.create(value) as object;
    expect(() => new Kind({ details: value })).not.toThrow();
    expect(() => new Kind({ details: Object.create(value) as object })).toThrow(
      code('APPEX_INVALID_DETAILS'),
    );
    let reads = 0;
    const cyclic: object = new Proxy(
      {},
      {
        getPrototypeOf() {
          reads++;
          if (reads > 40) throw new Error('unbounded');
          return cyclic;
        },
      },
    );
    expect(() => new Kind({ details: cyclic })).toThrow(
      code('APPEX_INVALID_DETAILS'),
    );
    expect(reads).toBeLessThanOrEqual(33);
  });
  test('does not format a native stack during construction', () => {
    const original = Error.prepareStackTrace;
    let calls = 0;
    Error.prepareStackTrace = () => {
      calls++;
      return 'formatted';
    };
    try {
      const Kind = defineException({ tag: 'Failure', message: 'failure' });
      const error = new Kind();
      expect(calls).toBe(0);
      expect(error.stack).toBe('formatted');
      expect(calls).toBe(1);
    } finally {
      Error.prepareStackTrace = original;
    }
  });
  test('does not grant local trust to another copy of the module', () => {
    let foreign: unknown;
    jest.isolateModules(() => {
      const copy = require('../src/typed') as typeof import('../src/typed');
      const Kind = copy.defineException({ tag: 'Foreign', message: 'foreign' });
      foreign = new Kind();
    });
    expect(isTypedException(foreign)).toBe(false);
    expect((foreign as { _tag: string })._tag).toBe('Foreign');
  });
});
