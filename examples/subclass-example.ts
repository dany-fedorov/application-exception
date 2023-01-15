import { AppEx, ApplicationExceptionStatic } from '../src';
import { format } from 'date-fns';
import localeUkraine from 'date-fns/locale/uk';

const MyAppException = AppEx.subclass(
  'MyAppException',
  {
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
  },
  function create(this: ApplicationExceptionStatic, num: number) {
    return this.new(
      'Creating from `create` static method. "num" is: {{num}}. Also "src" is set by default: {{src}}.',
    ).details({ num });
  },
);

const e1 = MyAppException.new(
  'Using the default `new` constructor. "src" is set by default: {{src}}',
);

console.log(e1.toJSON());

const e2 = MyAppException.create(1);

console.log(e2.toJSON());

const MyServiceException = MyAppException.subclass('MyServiceException', {
  details() {
    return { value: { service: 'my-service' } };
  },
});

console.log(MyServiceException.create(123).toJSON());

const MySpecialException1 = MyServiceException.subclass('MySpecialException1', {
  details() {
    return { value: { scope: 'special-1' } };
  },
});

console.log(MySpecialException1.create(2345).toJSON());
