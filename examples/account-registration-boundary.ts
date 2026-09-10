import {
  defineException,
  DiagnosticReport,
  PublicReport,
  toDiagnosticReport,
  toPublicReport,
} from '../src';

export interface Storage {
  insert(email: string): void;
}

export class UniqueEmailConstraintError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`Unique email constraint rejected ${email}`);
    this.name = 'UniqueEmailConstraintError';
    this.email = email;
  }
}

export const UserAlreadyExists = defineException<{ email: string }>()({
  tag: 'accounts/UserAlreadyExists',
  message: ({ email }) => `An account already exists for ${email}`,
});

type CreatedBody = {
  readonly created: true;
  readonly reference?: never;
  readonly code?: never;
  readonly message?: never;
};

export type BoundaryResponse = {
  readonly status: number;
  readonly body: PublicReport | CreatedBody;
  readonly diagnostic?: DiagnosticReport;
};

export function registerUser(
  storage: Storage,
  email: string,
): InstanceType<typeof UserAlreadyExists> | undefined {
  try {
    storage.insert(email);
    return undefined;
  } catch (caught: unknown) {
    if (caught instanceof UniqueEmailConstraintError) {
      return new UserAlreadyExists({ details: { email }, cause: caught });
    }
    throw caught;
  }
}

export function handleRegistration(
  storage: Storage,
  email: string,
  requestId: string,
): BoundaryResponse {
  try {
    const failure = registerUser(storage, email);
    if (!failure) {
      return { status: 201, body: { created: true } };
    }
    const diagnostic = toDiagnosticReport(failure, {
      context: { operation: 'registerUser', requestId },
    });
    return {
      status: 409,
      diagnostic,
      body: toPublicReport(diagnostic, {
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: 'An account with this email already exists.',
      }),
    };
  } catch (caught: unknown) {
    const diagnostic = toDiagnosticReport(caught, {
      context: { operation: 'registerUser', requestId },
    });
    return {
      status: 500,
      diagnostic,
      body: toPublicReport(diagnostic),
    };
  }
}

export function handleAccountRecoveryFailure(
  error: InstanceType<typeof UserAlreadyExists>,
  requestId: string,
): Required<Pick<BoundaryResponse, 'status' | 'body' | 'diagnostic'>> {
  const diagnostic = toDiagnosticReport(error, {
    context: { operation: 'recoverAccount', requestId },
  });
  return {
    status: 202,
    diagnostic,
    body: toPublicReport(diagnostic, {
      code: 'REQUEST_ACCEPTED',
      message: 'If the account exists, recovery instructions will be sent.',
    }),
  };
}

if (require.main === module) {
  const storage: Storage = {
    insert(email) {
      throw new UniqueEmailConstraintError(email);
    },
  };
  process.stdout.write(
    `${JSON.stringify(
      handleRegistration(storage, 'ada@example.test', 'req-example'),
      null,
      2,
    )}\n`,
  );
}
