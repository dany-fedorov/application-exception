import { AppEx } from '../src';

const req = {
  headers: {
    'Content-Type': 'application/json',
  },
};

const res = {
  status: 500,
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * `lines` joins all string arguments with '\n'
 */
const e1 = AppEx.lines(
  'Could not fetch user from ThirdParty',
  `- HTTP             - GET https://example.org/api/v1`,
  `- Request headers  - {{{json req.headers}}}`,
  `- Response status  - {{{json res.status}}}`,
  `- Response headers - {{{json res.headers}}}`,
).details({ req, res });

console.log('"ApplicationException.lines" constructor');
console.log();
console.log(e1.getMessage());

/**
 * Same as `lines`, but adds a prefix to all line arguments.
 */
const e2 = AppEx.prefixedLines(
  'UserService.getUser',
  'Could not fetch user from ThirdParty',
  `- HTTP             - GET https://example.org/api/v1`,
  `- Request headers  - {{{json req.headers}}}`,
  `- Response status  - {{{json res.status}}}`,
  `- Response headers - {{{json res.headers}}}`,
).details({ req, res });

console.log();
console.log(
  '"ApplicationException.prefixedLines" or "ApplicationException.plines" constructor',
);
console.log();
console.log(e2.getMessage());
