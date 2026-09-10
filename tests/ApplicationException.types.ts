import { ApplicationException } from '../src';

class RegistrationException extends ApplicationException {}

const existing = ApplicationException.new('existing');
const wrapped = RegistrationException.wrap(existing);

if (wrapped instanceof RegistrationException) {
  const registrationException: RegistrationException = wrapped;
  void registrationException;
}

// A preserved base instance cannot truthfully be requested as a subclass.
// @ts-expect-error RegistrationException is an instance, not a static receiver.
RegistrationException.wrap<RegistrationException>(existing);
