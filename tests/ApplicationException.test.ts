import { ApplicationException } from '../src';

describe('ApplicationException', function () {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  describe('Regular constructor', function () {
    test('defaults', () => {
      const e = new ApplicationException({
        message: 'test message',
        id: 'test-id',
        timestamp: new Date(),
        useMessageAsDisplayMessage: false,
        useClassNameAsCode: false,
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
        message: 'test message',
        id: 'test-id',
        timestamp: new Date(),
        useMessageAsDisplayMessage: false,
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

    test('useMessageAsDisplayMessage: true', () => {
      const e = new ApplicationException({
        message: 'test message',
        id: 'test-id',
        timestamp: new Date(),
        useMessageAsDisplayMessage: true,
        useClassNameAsCode: false,
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

    test('useMessageAsDisplayMessage: true', () => {
      const e = new ApplicationException({
        message: 'test message',
        id: 'test-id',
        timestamp: new Date(),
        useMessageAsDisplayMessage: false,
        useClassNameAsCode: false,
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
});
