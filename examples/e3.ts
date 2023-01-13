// import { ApplicationException } from '../src';

// class A {
//   constructor() {
//     return this;
//   }
//
//   a() {
//     return 123;
//   }
// }
//
// class B extends A {
//   constructor() {
//     super();
//   }
//
//   b() {
//     return this.a();
//   }
// }
//
// console.log(new B().b());

// class E extends Error {
//   constructor(msg: string) {
//     super(msg);
//   }
//
//   getget() {
//     return 123;
//   }
// }
//
// const err = new E('asdf');
// console.log(err);
// console.log(err.getget());

import { ApplicationException } from '../src';

// const e = AppEx.createDefaultInstance({});
const e = new ApplicationException({
  idPrefix: 'ID_PREFIX_',
  idBody: 'test-id',
  message: 'test message',
  timestamp: new Date(),
  mergeDetails: (d0, d1) => ({ ...d0, ...d1 }),
  useMessageAsDisplayMessage: false,
  useClassNameAsCode: false,
});

console.log(e);
// console.log(e.getId());
// console.log(e.toJSON());
