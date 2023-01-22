import { AppExIcfg, ApplicationException } from '../src';

jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));

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
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.4.json",
            "_m": Array [
              "corj/v0.4",
              "String",
              "safe-stable-stringify@2.4.1",
            ],
            "as_json": Object {},
            "as_string": "Error: Je suis Erreur",
            "constructor_name": "Error",
            "instanceof_error": true,
            "message": "Je suis Erreur",
            "typeof": "object",
          },
          Object {
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.4.json",
            "_m": Array [
              "corj/v0.4",
              "String",
              "safe-stable-stringify@2.4.1",
            ],
            "as_json": "And I'm just a string",
            "as_string": "And I'm just a string",
            "constructor_name": "String",
            "instanceof_error": false,
            "typeof": "string",
          },
          Object {
            "$schema": "https://raw.githubusercontent.com/dany-fedorov/caught-object-report-json/main/schema-versions/corj/v0.4.json",
            "_m": Array [
              "corj/v0.4",
              "String",
              "safe-stable-stringify@2.4.1",
            ],
            "as_json": 9876,
            "as_string": "9876",
            "constructor_name": "Number",
            "instanceof_error": false,
            "typeof": "number",
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
