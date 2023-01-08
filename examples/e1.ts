// import { AppEx } from '../src/ApplicationException';
// import { makeCaughtObjectReportJson } from 'caught-object-report-json';
//
// // const e = AppEx.new('123');
//
// const MyAppException = AppEx.subclass('MyAppException', {
//   // id() {
//   //   return { value: '123' };
//   // }
//
//   // code() {
//   //   return { value: 'default code' };
//   // }
//
//   // details() {
//   //   return { value: { defaultDetail: 112323 } };
//   // },
//   //
//
//   useClassNameAsCode() {
//     return {
//       value: true,
//     };
//   },
// });
//
// // class KeepException extends AppEx {
// //   constructor(icfg: AppExIcfg) {
// //     super(icfg);
// //   }
// // }
//
// const ee = MyAppException.plines(
//   'prefix',
//   'line1',
//   '- prop a: {{a}}',
//   '- prop b: {{b}}',
// )
//   .details({
//     a: 12345,
//     b: 'b-string',
//   })
//   .displayMessage('dmsg dmsg {{{json self.details 2}}}')
//   .causes([new Error('im err')]);
// // .code('codecode');
//
// // console.log('- displayMessage');
// // console.log(ee.getDisplayMessage());
// // console.log('- message');
// // console.log(ee.getMessage());
// // console.log('---');
// //
// // console.log(ee);
//
// // console.log(ee.toJSON());
// // console.log(ee.name)
// console.log(jsonStringifySafe(makeCaughtObjectReportJson(ee), 2));

import { AppEx } from '../src';

const e = AppEx.createDefaultInstance({});

console.log(e);
console.log(e.constructor.name);
console.log(Object.getPrototypeOf(e));
console.log(Object.getPrototypeOf(Object.getPrototypeOf(e)));
console.log(e.getId());
