import {
  AppEx,
  ApplicationExceptionDefaultsProps,
  ApplicationExceptionStatic,
} from '../src';
import { format } from 'date-fns';
import localeUkraine from 'date-fns/locale/uk';

const MyAppException = AppEx.subclass(
  'MyAppException',
  {
    useClassNameAsCode: true,
    details: {
      src: 'my-app-api-server',
    },
    handlebarsHelpers: {
      'date-iso': function (...args: unknown[]): string {
        return new Date(args[0] as Date).toISOString();
      },
      'date-fmt': function (...args: unknown[]): string {
        return format(new Date(args[1] as Date), args[0] as string, {
          locale: localeUkraine,
        });
      },
    },
  },
  {
    defaults(
      this: ApplicationExceptionStatic,
    ): ApplicationExceptionDefaultsProps {
      return {
        details({ now }) {
          return {
            value: {
              ts_in_ukraine: format(now, 'd MMMM yyyy, HH:mm:ss', {
                locale: localeUkraine,
              }),
            },
          };
        },
      };
    },

    create(this: ApplicationExceptionStatic, num: number) {
      return this.new(
        '{{pad-end 20 self.constructor_name}} // ISO Date: {{date-iso self.timestamp}}; Formatted Date: {{date-fmt "d MMMM yyyy, HH:mm:ss" self.timestamp}}; num: {{num}}',
      ).details({ num });
    },
  },
);

const e = MyAppException.create(543231);

console.log(e.getMessage());
console.log(e.toJSON());

const MyServiceException = MyAppException.subclass(
  'MyServiceException',
  {
    details: {
      service: 'my-service',
    },
  },
  {
    create: MyAppException.create,
  },
);
const e1 = MyServiceException.create(3098);

console.log(e1.getMessage());
console.log(e1.toJSON());
