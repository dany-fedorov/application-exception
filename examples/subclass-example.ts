import { AppEx } from '../src';

const MyAppException = AppEx.subclass('MyAppException', {
  details() {
    return { value: { src: 'my-app-api-server' } };
  },
  useClassNameAsCode() {
    return { value: true };
  },
});

const e = MyAppException.new('Bad thing');

console.log(e);
