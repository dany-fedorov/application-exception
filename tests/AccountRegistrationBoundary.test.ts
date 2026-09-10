import {
  handleAccountRecoveryFailure,
  handleRegistration,
  registerUser,
  Storage,
  UniqueEmailConstraintError,
  UserAlreadyExists,
} from '../examples/account-registration-boundary';

describe('account registration boundary example', () => {
  test('translates only the recognized storage failure and retains its cause', () => {
    const storageCause = new UniqueEmailConstraintError('ada@example.test');
    const storage: Storage = {
      insert() {
        throw storageCause;
      },
    };

    const result = registerUser(storage, 'ada@example.test');

    expect(result).toBeInstanceOf(UserAlreadyExists);
    expect(result?.cause).toBe(storageCause);
  });

  test('correlates the diagnostic and intentionally selected public response', () => {
    const storage: Storage = {
      insert() {
        throw new UniqueEmailConstraintError('ada@example.test');
      },
    };

    const response = handleRegistration(storage, 'ada@example.test', 'req-123');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'ACCOUNT_ALREADY_EXISTS',
      message: 'An account with this email already exists.',
    });
    expect(response.diagnostic?.reference).toBe(response.body.reference);
    expect(response.diagnostic?.context).toEqual({
      operation: 'registerUser',
      requestId: 'req-123',
    });
  });

  test('uses a generic presentation for the same kind at a recovery boundary', () => {
    const error = new UserAlreadyExists({
      details: { email: 'ada@example.test' },
    });

    const response = handleAccountRecoveryFailure(error, 'req-456');

    expect(response.status).toBe(202);
    expect(response.body.code).toBe('REQUEST_ACCEPTED');
    expect(response.body.message).toBe(
      'If the account exists, recovery instructions will be sent.',
    );
    expect(JSON.stringify(response.body)).not.toContain('ada@example.test');
    expect(response.diagnostic.reference).toBe(response.body.reference);
  });

  test('keeps unexpected defects generic at the outer boundary', () => {
    const storage: Storage = {
      insert() {
        throw new TypeError('cannot read database response');
      },
    };

    const response = handleRegistration(storage, 'ada@example.test', 'req-789');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(response.body.message).toBe('Something went wrong');
    expect(response.diagnostic?.name).toBe('TypeError');
    expect(JSON.stringify(response.body)).not.toContain('database response');
  });

  test('returns an ordinary success response when storage succeeds', () => {
    const storage: Storage = { insert() {} };

    expect(
      handleRegistration(storage, 'ada@example.test', 'req-success'),
    ).toEqual({ status: 201, body: { created: true } });
  });
});
