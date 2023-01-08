import { AppEx } from '../src';

const e = AppEx.new('Bad thing happened').displayMessage(
  'Something went wrong, please visit help center and provide this id {{self.id}}',
);

console.log(e.getDisplayMessage())
