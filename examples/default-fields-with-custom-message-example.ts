import { AppEx } from '../src';

const e = AppEx.new(`I'm an error message`);

console.log('message:'.padEnd(10), e.getMessage());
