import { AppEx, ApplicationExceptionStatic } from '../src';

const MyAppException = AppEx.subclass(
  'MyAppException',
  {
    details() {
      return { value: { src: 'my-app-api-server' } };
    },
    useClassNameAsCode() {
      return { value: true };
    },
  },
  function (this: ApplicationExceptionStatic, num: number) {
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
