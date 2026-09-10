import { defineException, isTypedException } from '../src/typed';
import {
  getMessageRenderingFailure,
  getTypedExceptionView,
} from '../src/typed-internals';

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
    expect(error.message).toBe(
      'An account already exists for ada@example.test',
    );
    expect(error.id).toMatch(/^AE_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(Date.parse(error.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(error.timestamp)).toBeLessThanOrEqual(after);
    expect(isTypedException(error)).toBe(true);
    expect(isTypedException({ _tag: 'UserAlreadyExists' })).toBe(false);
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

    expect((error.cause as Error).constructor.name).toBe('AggregateError');
    expect((error.cause as Error & { errors: unknown[] }).errors).toEqual([
      first,
      second,
    ]);
  });

  test('treats an empty cause list as no cause', () => {
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
      causes: [],
    });

    expect(Object.prototype.hasOwnProperty.call(error, 'cause')).toBe(false);
  });

  test('rejects simultaneous cause forms at runtime', () => {
    expect(
      () =>
        new UserAlreadyExists({
          details: { email: 'ada@example.test' },
          cause: new Error('first'),
          causes: [new Error('second')],
        } as never),
    ).toThrow('Provide either cause or causes, not both');
  });

  test('keeps the occurrence when message rendering fails', () => {
    const renderingFailure = new Error('renderer failed');
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const BrokenMessage = defineException({
      tag: 'agent/BrokenMessage',
      message: (_details: { operation: string }) => {
        throw renderingFailure;
      },
    });

    const error = new BrokenMessage({ details: { operation: 'search' } });

    expect(error.message).toBe('agent/BrokenMessage');
    expect(getMessageRenderingFailure(error)).toEqual({
      present: true,
      value: renderingFailure,
    });
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
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

  test('rejects invalid runtime definitions', () => {
    expect(() =>
      defineException({
        tag: '',
        message: (_details: Record<string, never>) => 'failed',
      }),
    ).toThrow('Exception tag must be a non-empty string');
    expect(() =>
      defineException({
        tag: 'ValidTag',
        message: 123,
      } as never),
    ).toThrow('Exception message must be a string or function');
  });

  test('rejects non-record details from JavaScript callers', () => {
    expect(() => new UserAlreadyExists({ details: null } as never)).toThrow(
      'Exception details must be a non-array object',
    );
    expect(() => new UserAlreadyExists({ details: [] } as never)).toThrow(
      'Exception details must be a non-array object',
    );
    expect(
      () => new UserAlreadyExists({ details: new Date() } as never),
    ).toThrow('Exception details must have a data-only object prototype');
    expect(
      () => new UserAlreadyExists({ details: new ArrayBuffer(8) } as never),
    ).toThrow('Exception details must have a data-only object prototype');
    class DetailsWithMethod {
      describe(): string {
        return 'not copied';
      }
    }
    expect(
      () =>
        new UserAlreadyExists({ details: new DetailsWithMethod() } as never),
    ).toThrow('Exception details must have a data-only object prototype');
    class DetailsWithFunctionField {
      readonly operation = 'search';
      readonly describe = () => this.operation;
    }
    expect(
      () =>
        new UserAlreadyExists({
          details: new DetailsWithFunctionField(),
        } as never),
    ).toThrow('Exception details must contain enumerable data properties');
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
  test.each(['', ' ', 'x'.repeat(129)])('rejects invalid tag %p', (tag) => {
    expect(() => defineException({ tag, message: 'failure' })).toThrow(
      TypeError,
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
      ).toThrow(TypeError);
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
      expect(() => new Kind({ causes } as never)).toThrow(TypeError);
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
    expect(() => new Kind({ details: proxy })).toThrow(TypeError);
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
      TypeError,
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
    expect(() => new Kind({ details: cyclic })).toThrow(TypeError);
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
  test('records thrown undefined separately from successful rendering', () => {
    const Broken = defineException({
      tag: 'Broken',
      message: (_details: {}) => {
        throw undefined;
      },
    });
    const Good = defineException({ tag: 'Good', message: 'good' });
    expect(getMessageRenderingFailure(new Broken({ details: {} }))).toEqual({
      present: true,
      value: undefined,
    });
    expect(getMessageRenderingFailure(new Good())).toEqual({ present: false });
  });
  test('provides a descriptor-only foreign-copy view without granting local trust', () => {
    let foreign: unknown;
    jest.isolateModules(() => {
      const copy = require('../src/typed') as typeof import('../src/typed');
      const Kind = copy.defineException({ tag: 'Foreign', message: 'foreign' });
      foreign = new Kind();
    });
    expect(isTypedException(foreign)).toBe(false);
    expect(getTypedExceptionView(foreign)).toMatchObject({
      tag: 'Foreign',
      details: {},
      id: expect.stringMatching(/^AE_/),
    });
    let reads = 0;
    const hostile = {
      [Symbol.for('application-exception/TypedException')]: true,
      get _tag() {
        reads++;
        return 'Forged';
      },
    };
    expect(getTypedExceptionView(hostile)).toBeUndefined();
    expect(reads).toBe(0);
  });
});
