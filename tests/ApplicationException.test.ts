import { AppExIcfg, ApplicationException } from '../src';

jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));

const APPLICATION_EXCEPTION_DEFAULTS: AppExIcfg = {
  message: 'test message',
  id: 'test-id',
  timestamp: new Date(),
  mergeDetails: (d0, d1) => ({ ...d0, ...d1 }),
  useMessageAsDisplayMessage: false,
  useClassNameAsCode: false,
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
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "raw_message": "test message",
          "timestamp": 2023-01-01T00:00:00.000Z,
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
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "raw_message": "test message",
          "timestamp": 2023-01-01T00:00:00.000Z,
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
                    "compiled_display_message": "test message",
                    "compiled_message": "test message",
                    "constructor_name": "ApplicationException",
                    "id": "test-id",
                    "raw_display_message": "test message",
                    "raw_message": "test message",
                    "timestamp": 2023-01-01T00:00:00.000Z,
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
                    "compiled_display_message": "test display message",
                    "compiled_message": "test message",
                    "constructor_name": "ApplicationException",
                    "id": "test-id",
                    "raw_display_message": "test display message",
                    "raw_message": "test message",
                    "timestamp": 2023-01-01T00:00:00.000Z,
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
            "compiled_message": "test message",
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
            "id": "test-id",
            "raw_message": "test message",
            "timestamp": 2023-01-01T00:00:00.000Z,
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
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "raw_message": "test message",
          "timestamp": 2023-01-01T00:00:00.000Z,
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
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "num_code": 404,
          "raw_message": "test message",
          "timestamp": 2023-01-01T00:00:00.000Z,
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
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "raw_message": "test message",
          "timestamp": 3032-01-01T00:00:00.000Z,
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
    expect(typeof json.causes[0].stack_prop).toBe('string');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete json.causes[0].stack_prop;
    expect(json).toMatchInlineSnapshot(`
        Object {
          "causes": Array [
            Object {
              "as_json": Object {
                "format": "safe-stable-stringify@2.4.1",
                "value": Object {},
              },
              "as_string": Object {
                "format": "String",
                "value": "Error: Je suis Erreur",
              },
              "constructor_name": "Error",
              "is_error_instance": true,
              "message_prop": "Je suis Erreur",
              "typeof": "object",
              "v": "corj/v0.1",
            },
            Object {
              "as_json": Object {
                "format": "safe-stable-stringify@2.4.1",
                "value": "And I'm just a string",
              },
              "as_string": Object {
                "format": "String",
                "value": "And I'm just a string",
              },
              "constructor_name": "String",
              "is_error_instance": false,
              "typeof": "string",
              "v": "corj/v0.1",
            },
            Object {
              "as_json": Object {
                "format": "safe-stable-stringify@2.4.1",
                "value": 9876,
              },
              "as_string": Object {
                "format": "String",
                "value": "9876",
              },
              "constructor_name": "Number",
              "is_error_instance": false,
              "typeof": "number",
              "v": "corj/v0.1",
            },
          ],
          "compiled_message": "test message",
          "constructor_name": "ApplicationException",
          "id": "test-id",
          "raw_message": "test message",
          "timestamp": 2023-01-01T00:00:00.000Z,
          "v": "appex/v0.1",
        }
      `);
  });
});

describe('ApplicationException: Constructor variants', function () {
  test('createDefaultInstance', () => {});
  test('new', () => {});
  test('lines', () => {});
  test('prefixedLines', () => {});
  test('plines', () => {});
});
describe('ApplicationException: Static helpers', function () {
  test('normalizeInstanceConfig', () => {});
  test('compileTemplate', () => {});
});

describe('ApplicationException: Subclass helper', function () {});

describe('ApplicationException: Template compilation', function () {});

describe('ApplicationException: Builder methods', function () {});
