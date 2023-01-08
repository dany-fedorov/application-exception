import { AppEx } from '../src';

const e = AppEx.new('Bad thing happened')
  .displayMessageLines(
    'a - {{a}}',
    'b - {{b}}',
    '---',
    'self.id - {{self.id}}',
    'self.timestamp - {{self.timestamp}}',
    'self.code - {{self.code}}',
    'self.numCode - {{self.numCode}}',
    'self.details - {{{json self.details}}}',
    'self.details indented - {{{json self.details 2}}}',
  )
  .details({
    a: 12345,
    b: 'b-field',
  });

console.log(e.getDisplayMessage());
