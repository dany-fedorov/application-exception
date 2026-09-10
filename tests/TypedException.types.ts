import { defineException, TypedException } from '../src/typed';

interface InterfaceDetails {
  readonly operation: string;
}

const InterfaceFailure = defineException<InterfaceDetails>()({
  tag: 'InterfaceFailure',
  message: ({ operation }) => operation,
});
new InterfaceFailure({ details: { operation: 'search' } });

// @ts-expect-error arrays do not satisfy record-like detail semantics.
defineException<string[]>();

// @ts-expect-error functions do not satisfy record-like detail semantics.
defineException<() => void>();

// @ts-expect-error built-in class instances are not copied as detail records.
defineException<Date>();

// @ts-expect-error all built-in prototypes are rejected without an allowlist.
defineException<ArrayBuffer>();

class DataOnlyDetails {
  readonly operation = 'search';
}

class DetailsWithMethod {
  readonly operation = 'search';
  describe(): string {
    return this.operation;
  }
}

// @ts-expect-error method-bearing shapes do not satisfy data-only details.
defineException<DetailsWithMethod>();

const CustomFailure = defineException<DataOnlyDetails>()({
  tag: 'CustomFailure',
  message: ({ operation }) => operation,
});
const customFailure = new CustomFailure({ details: new DataOnlyDetails() });
const customOperation: string = customFailure.details.operation;
void customOperation;

const UserAlreadyExists = defineException<{ email: string }>()({
  tag: 'UserAlreadyExists',
  message: ({ email }) => email,
});

const StorageUnavailable = defineException<{ retryAfter: number }>()({
  tag: 'StorageUnavailable',
  message: ({ retryAfter }) => String(retryAfter),
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
