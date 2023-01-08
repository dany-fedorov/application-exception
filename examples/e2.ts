import { AppExIcfg, ApplicationException } from '../src';

class MyAppException extends ApplicationException {
  constructor(icfg: AppExIcfg) {
    super(icfg);
  }

  override setDetails(d: { b: number }): this {
    return super.setDetails(d);
  }

  static create(b: number): MyAppException {
    return (
      this.createDefaultInstance({
        message: 'Hey b is {{b}}',
      }) as MyAppException
    )
      .details({
        b,
      })
      .details({ b: 123456 });
    // const self = new MyAppException({
    //   ...this.normalizeInstanceConfig({}),
    //   message: `Hey b is {{b}}`,
    // });
    // return self.details({
    //   b,
    // });
    // return ApplicationException.new() as MyAppException;
  }
}

// const NoSuchResource = MyAppExeption.subclass('NoSuchResource', {
//   disp
// })

// const MyAppExeption = AppEx.subclass('MyAppExeption', {
//   useClassNameAsCode() {
//     return { value: Math.random() > 0.5 };
//   },
// });

const e = MyAppException.create(123);
console.log(e.toJSON());

// for (let i = 0; i < 10; i++) {
//   const e = MyAppExeption.plines(
//     'secion-1',
//     'I do not care man',
//     `num - ${i}`,
//   ).details({ i });
//   console.log(JSON.stringify(e.toJSON(), null, 2));
// }
