import { AppEx } from '../src/ApplicationException';

// const e = AppEx.new('123');

const MyAppException = AppEx.subclass(
  'MyAppException',
  class MyAppExceptionDefaults {
    id() {
      return { value: '123' };
    }

    // code() {
    //   return { value: 'default code' };
    // }

    details() {
      return { value: { defaultDetail: 112323 } };
    }

    useClassNameAsCode() {
      return {
        value: true,
      };
    }
  },
);

// class KeepException extends AppEx {
//   constructor(icfg: AppExIcfg) {
//     super(icfg);
//   }
// }

const ee = MyAppException.plines(
  'prefix',
  'line1',
  '- prop a: {{a}}',
  '- prop b: {{b}}',
)
  .details({
    a: 12345,
    b: 'b-string',
  })
  .displayMessage('dmsg dmsg {{{json self.details 2}}}');
// .code('codecode');

console.log('- displayMessage');
console.log(ee.getDisplayMessage());
console.log('- message');
console.log(ee.getMessage());
console.log('---');

console.log(ee);
