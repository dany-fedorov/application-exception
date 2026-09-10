import {
  defineException,
  getMessageRenderingError,
  isTypedException,
} from '../src/typed';

describe('defineException', () => {
  const UserAlreadyExists = defineException<{ email: string }>()({
    tag: 'UserAlreadyExists',
    message: ({ email }) => `An account already exists for ${email}`,
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
    const RichError = defineException<{
      email: string;
      nested: { attempt: number };
    }>()({
      tag: 'RichError',
      message: ({ email }) => email,
    });

    const error = new RichError({ details: supplied });
    supplied.email = 'changed@example.test';

    expect(error.details).not.toBe(supplied);
    expect(error.details.email).toBe('ada@example.test');
    expect(error.details.nested).toBe(nested);
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  test('uses the configured occurrence prefix and creates distinct ids', () => {
    const AgentFailure = defineException<Record<string, never>>()({
      tag: 'agent/ToolFailure',
      idPrefix: 'ERR_',
      message: () => 'Tool invocation failed',
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
    const BrokenMessage = defineException<{ operation: string }>()({
      tag: 'agent/BrokenMessage',
      message: () => {
        throw renderingFailure;
      },
    });

    const error = new BrokenMessage({ details: { operation: 'search' } });

    expect(error.message).toBe('agent/BrokenMessage');
    expect(getMessageRenderingError(error)).toBe(renderingFailure);
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});
