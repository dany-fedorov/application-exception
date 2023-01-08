import { AppEx } from '../src';

const e = AppEx.new();

console.log('id:'.padEnd(10), e.getId());
console.log('timestamp:'.padEnd(10), e.getTimestamp());
console.log('message:'.padEnd(10), e.getMessage());
