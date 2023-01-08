import { AppEx } from '../src';

const EMAIL_1 = 'firstname.lastname.1@example.org';
const EMAIL_2 = 'firstname.lastname.2@example.org';

/**
 * For the purpose of this example, imagine you do not control this code.
 */
function storeUser(email: string): void {
  if (email === EMAIL_1) {
    throw new Error('User already exists');
  }
}

function addUser(email: string): void {
  try {
    storeUser(email);
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'User already exists') {
      throw AppEx.new(`User with this email already exists - ${email}`)
        .displayMessage(
          'We already have a user with this email in the system, maybe you signed up earlier?',
        )
        .code('USER_ALREADY_EXISTS')
        .numCode(400)
        .causedBy(caught)
        .details({
          email,
        });
    } else {
      throw AppEx.new('Could not create user')
        .displayMessage('Something went wrong, please visit help center')
        .numCode(500)
        .causedBy(caught)
        .details({ email });
    }
  }
}

try {
  addUser(EMAIL_1);
  addUser(EMAIL_2);
} catch (caught) {
  console.log('Caught creating users:', JSON.stringify(caught, null, 2));
}
