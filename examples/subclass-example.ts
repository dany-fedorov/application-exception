import {
  AppEx,
  ApplicationExceptionStatic,
  ApplicationException,
} from '../src';

const MyAppException = AppEx.subclass(
  'MyAppException',
  {
    useClassNameAsCode: true,
    details: {
      src: 'my-app-api-server',
    },
  },
  {
    instance: {
      hhh(this: ApplicationException) {
        return 'hhh';
      },
    },
    static: {
      create(this: ApplicationExceptionStatic, num: number) {
        return this.new(
          'Creating from `create` static method. "num" is: {{num}}. Also "src" is set by default: {{src}}.',
        ).details({ num });
      },
    },
  },
);

const e1 = MyAppException.new(
  'Using the default `new` constructor. "src" is set by default: {{src}}',
);

const e1Json = e1.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e1Json.stack;

console.log(e1Json);

const e2 = MyAppException.create(1);

const e2Json = e2.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e2Json.stack;

console.log(e2Json);

const MyServiceException = MyAppException.subclass(
  'MyServiceException',
  {
    details: {
      scope: 'my-service',
    },
  },
  /**
   * This is required for TypeScript to understand that `create` is available on `MyServiceException`
   */
  {
    static: MyAppException._subclassStaticMethods,
    instance: {
      ...MyAppException._subclassInstanceMethods,
      MyServiceException_hey(this: InstanceType<typeof MyAppException>) {
        return this.getCode();
      },
    },
  },
);

const c = MyServiceException['create'];

const EE = MyServiceException.subclass(
  'HeyException',
  {},
  {
    // static: {},
    instance: {
      met() {
        return 'met';
      },
    },
  },
);

const EE2 = EE.staticMethods({
  hop(this: typeof EE): InstanceType<typeof EE> {
    return this.new('hey');
  },
});

EE2.hop().met();

class E extends MyServiceException {
  constructor(...props: any) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    super(...props);
  }
}

console.log(E.create(987).toJSON());

const e3 = MyServiceException.create(123);

type MyServiceException = InstanceType<typeof MyServiceException>;

const e4: MyServiceException = MyServiceException.new();

console.log(e4 instanceof MyServiceException);

e4.MyServiceException_hey();

const e3Json = e3.toJSON();
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
delete e3Json.stack;

console.log(e3Json);
