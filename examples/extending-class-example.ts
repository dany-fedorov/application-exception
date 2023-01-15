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

console.log(e1.toJSON());

const e2 = MyAppException.create(1);

console.log(e2.toJSON());

class MyServiceException extends MyAppException {
  static override defaults(): ApplicationExceptionDefaultsProps {
    return {
      // applySuperDefaults() {
      //   return { value: false };
      // },
      details() {
        return { value: { scope: 'my-service' } };
      },
    };
  }
}

console.log(MyServiceException.create(123).toJSON());
