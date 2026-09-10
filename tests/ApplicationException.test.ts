import { AppExIcfg, ApplicationException } from '../src';

jest
  .useFakeTimers({ doNotFake: ['performance'] })
  .setSystemTime(new Date('2023-01-01'));

const APPLICATION_EXCEPTION_DEFAULTS: AppExIcfg = {
  idPrefix: 'ID_PREFIX_',
  message: 'test message',
  idBody: 'test-id',
  timestamp: new Date(),
  mergeDetails: (d0, d1) => ({ ...d0, ...d1 }),
  handlebarsHelpers: {},
  useMessageAsDisplayMessage: false,
  useClassNameAsCode: false,
  timestampFormatInJson: 'iso',
  applySuperDefaults: true,
  addWrapperInstanceStackToJson: false,
};

describe('ApplicationException: Regular constructor', function () {
  test('defaults', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
    });
    expect(e).toMatchInlineSnapshot(`[Error: test message]`);
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "raw_message": "test message",
        "timestamp": "2023-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });

  test('useClassNameAsCode: true', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
      useClassNameAsCode: true,
    });
    expect(e).toMatchInlineSnapshot(`[Error: test message]`);
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "code": "ApplicationException",
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "raw_message": "test message",
        "timestamp": "2023-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });

  describe('useMessageAsDisplayMessage', function () {
    test('useMessageAsDisplayMessage: true / no display message provided', () => {
      const e = new ApplicationException({
        ...APPLICATION_EXCEPTION_DEFAULTS,
        useMessageAsDisplayMessage: true,
      });
      expect(e).toMatchInlineSnapshot(`[Error: test message]`);
      const json = e.toJSON();
      expect(typeof json.stack).toBe('string');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete json.stack;
      expect(json).toMatchInlineSnapshot(`
        Object {
          "constructor_name": "ApplicationException",
          "display_message": "test message",
          "id": "ID_PREFIX_test-id",
          "message": "test message",
          "raw_display_message": "test message",
          "raw_message": "test message",
          "timestamp": "2023-01-01T00:00:00.000Z",
          "v": "appex/v0.1",
        }
      `);
    });

    test('useMessageAsDisplayMessage: true / provided displayMessage overrides', () => {
      const e = new ApplicationException({
        ...APPLICATION_EXCEPTION_DEFAULTS,
        useMessageAsDisplayMessage: true,
        displayMessage: 'test display message',
      });
      expect(e).toMatchInlineSnapshot(`[Error: test message]`);
      const json = e.toJSON();
      expect(typeof json.stack).toBe('string');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete json.stack;
      expect(json).toMatchInlineSnapshot(`
        Object {
          "constructor_name": "ApplicationException",
          "display_message": "test display message",
          "id": "ID_PREFIX_test-id",
          "message": "test message",
          "raw_display_message": "test display message",
          "raw_message": "test message",
          "timestamp": "2023-01-01T00:00:00.000Z",
          "v": "appex/v0.1",
        }
      `);
    });
  });

  describe('mergeDetails', () => {
    test('Merges on input', () => {
      const e = new ApplicationException({
        ...APPLICATION_EXCEPTION_DEFAULTS,
        mergeDetails: (d0, d1) => {
          return {
            ...d0,
            ...d1,
            deep: { ...(d0?.['deep'] ?? {}), ...(d1?.['deep'] ?? {}) },
          };
        },
      });
      e.details({
        a: 1,
        b: 2,
        c: { d: 3, e: 4 },
        deep: { da: 1, db: 2, dc: 3 },
      }).details({
        a: 111,
        c: { d: 333 },
        deep: { da: 111, dc: 333 },
      });
      const json = e.toJSON();
      expect(typeof json.stack).toBe('string');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete json.stack;
      expect(json).toMatchInlineSnapshot(`
        Object {
          "constructor_name": "ApplicationException",
          "details": Object {
            "a": 111,
            "b": 2,
            "c": Object {
              "d": 333,
            },
            "deep": Object {
              "da": 111,
              "db": 2,
              "dc": 333,
            },
          },
          "id": "ID_PREFIX_test-id",
          "message": "test message",
          "raw_message": "test message",
          "timestamp": "2023-01-01T00:00:00.000Z",
          "v": "appex/v0.1",
        }
      `);
    });
  });

  test('code', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
      code: 'the-new-code',
    });
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "code": "the-new-code",
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "raw_message": "test message",
        "timestamp": "2023-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });

  test('numCode', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
      numCode: 404,
    });
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "num_code": 404,
        "raw_message": "test message",
        "timestamp": "2023-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });

  test('timestamp', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
      timestamp: new Date('3032-01-01T00:00:00.000Z'),
    });
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "raw_message": "test message",
        "timestamp": "3032-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });

  test('causes', () => {
    const e = new ApplicationException({
      ...APPLICATION_EXCEPTION_DEFAULTS,
      causes: [new Error(`Je suis Erreur`), `And I'm just a string`, 9876],
    });
    const json = e.toJSON();
    expect(typeof json.stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.stack;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(typeof json.causes[0].stack).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.causes[0].stack;
    expect(json).toMatchInlineSnapshot(`
      Object {
        "causes": Array [
          Object {
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.8/report-object.json",
            "as_json": Object {},
            "as_json_format": "safe-stable-stringify@2.4.1",
            "as_string": "Error: Je suis Erreur",
            "as_string_format": "String",
            "children_sources": Array [
              "cause",
              "errors",
            ],
            "constructor_name": "Error",
            "instanceof_error": true,
            "message": "Je suis Erreur",
            "typeof": "object",
            "v": "corj/v0.8",
          },
          Object {
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.8/report-object.json",
            "as_json": "And I'm just a string",
            "as_json_format": "safe-stable-stringify@2.4.1",
            "as_string": "And I'm just a string",
            "as_string_format": "String",
            "children_sources": Array [
              "cause",
              "errors",
            ],
            "constructor_name": "String",
            "instanceof_error": false,
            "typeof": "string",
            "v": "corj/v0.8",
          },
          Object {
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.8/report-object.json",
            "as_json": 9876,
            "as_json_format": "safe-stable-stringify@2.4.1",
            "as_string": "9876",
            "as_string_format": "String",
            "children_sources": Array [
              "cause",
              "errors",
            ],
            "constructor_name": "Number",
            "instanceof_error": false,
            "typeof": "number",
            "v": "corj/v0.8",
          },
        ],
        "constructor_name": "ApplicationException",
        "id": "ID_PREFIX_test-id",
        "message": "test message",
        "raw_message": "test message",
        "timestamp": "2023-01-01T00:00:00.000Z",
        "v": "appex/v0.1",
      }
    `);
  });
});

describe('ApplicationException: Constructor variants', function () {
  test('createDefaultInstance preserves configured causes', () => {
    const cause = new Error('database unavailable');

    const error = ApplicationException.createDefaultInstance({
      message: 'registration failed',
      causes: [cause],
    });

    expect(error.getMessage()).toBe('registration failed');
    expect(error.getCauses()).toEqual([cause]);
  });

  test('new uses the default message when omitted', () => {
    expect(ApplicationException.new().getMessage()).toBe(
      'Something went wrong',
    );
  });

  test('lines joins every line', () => {
    expect(ApplicationException.lines('first', 'second').getMessage()).toBe(
      'first\nsecond',
    );
  });

  test('prefixedLines prefixes every line', () => {
    expect(
      ApplicationException.prefixedLines(
        'UserService.register',
        'first',
        'second',
      ).getMessage(),
    ).toBe('UserService.register: first\nUserService.register: second');
  });

  test('plines is the prefixedLines shorthand', () => {
    expect(ApplicationException.plines('scope', 'failed').getMessage()).toBe(
      'scope: failed',
    );
  });
});
describe('ApplicationException: Static helpers', function () {
  test('normalizeInstanceConfig applies defaults and input', () => {
    const normalized = ApplicationException.normalizeInstanceConfig({
      message: 'custom',
      code: 'CUSTOM',
    });

    expect(normalized.message).toBe('custom');
    expect(normalized.code).toBe('CUSTOM');
    expect(normalized.idPrefix).toBe('AE_');
    expect(normalized.timestamp).toEqual(new Date('2023-01-01'));
  });

  test('compileTemplate renders the supplied context', () => {
    expect(
      ApplicationException.compileTemplate(
        'Hello {{name}}',
        { name: 'Ada' },
        {},
      ),
    ).toBe('Hello Ada');
  });
});

describe('ApplicationException: wrapping', function () {
  test('a subclass keeps an existing application exception by identity', () => {
    class RegistrationException extends ApplicationException {}
    const existing = ApplicationException.new('existing');

    const wrapped = RegistrationException.wrap(existing);

    expect(wrapped).toBe(existing);
    expect(wrapped).not.toBeInstanceOf(RegistrationException);
  });

  test('a newly wrapped value is an instance of the receiver', () => {
    class RegistrationException extends ApplicationException {}
    const cause = new Error('database unavailable');

    const wrapped = RegistrationException.wrap(cause);

    expect(wrapped).toBeInstanceOf(RegistrationException);
    expect(wrapped.getCauses()).toEqual([cause]);
  });
});

describe('ApplicationException: Template compilation', function () {
  test('message reflects details added after an earlier read', () => {
    const error = ApplicationException.new('Hello {{name}}').details({
      name: 'Ada',
    });
    expect(error.getMessage()).toBe('Hello Ada');

    error.details({ name: 'Grace' });

    expect(error.getMessage()).toBe('Hello Grace');
  });

  test('message reflects external mutation of legacy details', () => {
    const details = { name: 'Ada' };
    const error = ApplicationException.new('Hello {{name}}').details(details);
    expect(error.getMessage()).toBe('Hello Ada');

    const storedDetails = error.getDetails();
    if (!storedDetails) {
      throw new Error('expected stored details');
    }
    storedDetails['name'] = 'Grace';

    expect(error.getMessage()).toBe('Hello Grace');
  });

  test('display message reflects a replacement after an earlier read', () => {
    const error = ApplicationException.new('internal').displayMessage(
      'First message',
    );
    expect(error.getDisplayMessage()).toBe('First message');

    error.displayMessage('Second message');

    expect(error.getDisplayMessage()).toBe('Second message');
  });
});

describe('ApplicationException: causes', function () {
  test('one cause is exposed through the native cause property', () => {
    const cause = new Error('database unavailable');

    const error = ApplicationException.new('registration failed').causedBy(
      cause,
    );

    expect((error as Error & { cause?: unknown }).cause).toBe(cause);
  });

  test('several causes are exposed through an ordered AggregateError', () => {
    const first = new Error('first');
    const second = new Error('second');

    const error = ApplicationException.new('import failed').causedBy(
      first,
      second,
    );
    const aggregate = (error as Error & { cause?: unknown }).cause as Error & {
      errors: unknown[];
    };

    expect(aggregate.constructor.name).toBe('AggregateError');
    expect(aggregate.errors).toEqual([first, second]);
  });
});
