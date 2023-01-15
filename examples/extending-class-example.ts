import {
  ApplicationExceptionDefaultsProps,
  ApplicationException,
  ApplicationExceptionStatic,
} from '../src';
import { format } from 'date-fns';
import localeUkraine from 'date-fns/locale/uk';

class MyAppException extends ApplicationException {
  static override defaults(): ApplicationExceptionDefaultsProps {
    return {
      details({ now }) {
        return {
          value: {
            src: 'my-app-api-server',
            ts_in_ukraine: format(now, 'd MMMM yyyy, HH:mm:ss', {
              locale: localeUkraine,
            }),
          },
        };
      },
      useClassNameAsCode() {
        return { value: true };
      },
    };
  }

  static create(this: ApplicationExceptionStatic, num: number) {
    return this.new(
      'Creating from `create` static method. "num" is: {{num}}. Also "src" is set by default: {{src}}.',
    ).details({ num });
  }
}

const e1 = MyAppException.new(
  'Using the default `new` constructor. "src" is set by default: {{src}}',
);

const e1Json = e1.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e1Json.stack;

console.log(e1Json);

const e2 = MyAppException.create(21);

const e2Json = e2.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e2Json.stack;

console.log(e2Json);

class MyServiceException extends MyAppException {
  static override defaults(): ApplicationExceptionDefaultsProps {
    return {
      details() {
        return { value: { scope: 'my-service' } };
      },
    };
  }
}

const e3 = MyServiceException.create(123);

const e3Json = e3.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e3Json.stack;

console.log(e3Json);
