import { defineException, TypedException } from '../src/typed';

interface InterfaceDetails {
  readonly operation: string;
}

const InterfaceFailure = defineException({
  tag: 'InterfaceFailure',
  message: ({ operation }: InterfaceDetails) => operation,
});
new InterfaceFailure({ details: { operation: 'search' } });

// @ts-expect-error arrays do not satisfy record-like detail semantics.
defineException({ tag: 'Invalid', message: (_details: string[]) => 'invalid' });

// @ts-expect-error functions do not satisfy record-like detail semantics.
defineException({
  tag: 'Invalid',
  message: (_details: () => void) => 'invalid',
});

// @ts-expect-error built-in class instances are not copied as detail records.
defineException({ tag: 'Invalid', message: (_details: Date) => 'invalid' });

// @ts-expect-error all built-in prototypes are rejected without an allowlist.
defineException({
  tag: 'Invalid',
  message: (_details: ArrayBuffer) => 'invalid',
});

class DataOnlyDetails {
  readonly operation = 'search';
}

class DetailsWithMethod {
  readonly operation = 'search';
  describe(): string {
    return this.operation;
  }
}

class DetailsWithFunctionField {
  readonly operation = 'search';
  readonly describe = () => this.operation;
}

// @ts-expect-error method-bearing shapes do not satisfy data-only details.
defineException({
  tag: 'Invalid',
  message: (_details: DetailsWithMethod) => 'invalid',
});

// @ts-expect-error own function fields do not satisfy data-only details.
defineException({
  tag: 'Invalid',
  message: (_details: DetailsWithFunctionField) => 'invalid',
});

const CustomFailure = defineException({
  tag: 'CustomFailure',
  message: ({ operation }: DataOnlyDetails) => operation,
});
const customFailure = new CustomFailure({ details: new DataOnlyDetails() });
const customOperation: string = customFailure.details.operation;
void customOperation;

const UserAlreadyExists = defineException({
  tag: 'UserAlreadyExists',
  message: ({ email }: { email: string }) => email,
});

const StorageUnavailable = defineException({
  tag: 'StorageUnavailable',
  message: ({ retryAfter }: { retryAfter: number }) => String(retryAfter),
});

const valid = new UserAlreadyExists({
  details: { email: 'ada@example.test' },
  cause: new Error('unique constraint'),
});

const literalTag: 'UserAlreadyExists' = valid._tag;
const email: string = valid.details.email;
void literalTag;
void email;

// @ts-expect-error complete details are required.
new UserAlreadyExists({});

// @ts-expect-error email is required by this error kind.
new UserAlreadyExists({ details: {} });

new UserAlreadyExists({
  // @ts-expect-error unknown fields are rejected for object literals.
  details: { email: 'ada@example.test', accountId: 123 },
});

// @ts-expect-error cause and causes are mutually exclusive.
new UserAlreadyExists({
  details: { email: 'ada@example.test' },
  cause: new Error('first'),
  causes: [new Error('second')],
});

type DomainError =
  | InstanceType<typeof UserAlreadyExists>
  | InstanceType<typeof StorageUnavailable>;

function handle(error: DomainError): string {
  switch (error._tag) {
    case 'UserAlreadyExists':
      return error.details.email;
    case 'StorageUnavailable':
      return String(error.details.retryAfter);
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

const asInterface: TypedException<'UserAlreadyExists', { email: string }> =
  valid;
void asInterface;
void handle;

const Unavailable = defineException({
  tag: 'app/Unavailable',
  message: 'Unavailable',
});
new Unavailable();
new Unavailable({ cause: undefined });
new Unavailable({ details: {} });
// @ts-expect-error constant definitions have no detail fields.
new Unavailable({ details: { unexpected: true } });
// @ts-expect-error renderer definitions require input.
new UserAlreadyExists();
// @ts-expect-error cause options remain mutually exclusive without details.
new Unavailable({ cause: undefined, causes: [] });
// @ts-expect-error causes must be an array.
new Unavailable({ causes: 'invalid' });
class SpecializedFailure extends UserAlreadyExists {
  readonly specialized = true;
}
// @ts-expect-error the factory does not claim arbitrary subclass instances.
const specialized: SpecializedFailure = new UserAlreadyExists({
  details: { email: 'a' },
});
void specialized;
import type {
  ExceptionInput,
  ExceptionDefinition,
  TypedExceptionClass,
} from '../src';
const noDetailsInput: ExceptionInput = { cause: undefined };
const noDetailsDefinition: ExceptionDefinition<'Unavailable'> = {
  tag: 'Unavailable',
  message: 'Unavailable',
};
const noDetailsClass: TypedExceptionClass<'app/Unavailable'> = Unavailable;
const noDetailsError: TypedException<'app/Unavailable'> = new noDetailsClass(
  noDetailsInput,
);
void noDetailsDefinition;
void noDetailsError;
// @ts-expect-error internal rendering state is not a public API.
import { getMessageRenderingError } from '../src';
void getMessageRenderingError;
