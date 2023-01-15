import { ApplicationException } from '../src';

type Details = {
  firstName: string;
  lastName: string;
};

class MyAppException extends ApplicationException {
  override setDetails(d: Details): this {
    return super.setDetails(d);
  }

  static create(): MyAppException {
    return new MyAppException(
      this.normalizeInstanceConfig({
        message: 'Hey, {{firstName}} {{lastName}}! You got a new exception!',
      }),
    );
  }
}

const e = MyAppException.create().code('HEY').details({
  firstName: 'Isaac',

});

console.log(e.getMessage());
