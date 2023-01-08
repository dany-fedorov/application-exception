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

const e1 = AppEx.lines(
  'Could not fetch user from ThirdParty',
  `- HTTP: GET https://example.org/api/v1`,
  `- Request headers: ${JSON.stringify(req.headers)}`,
  `- Response status: ${JSON.stringify(res.status)}`,
  `- Response headers: ${JSON.stringify(res.headers)}`,
);

console.log('"ApplicationException.lines" constructor');
console.log();
console.log(e1.getMessage());

const e2 = AppEx.prefixedLines(
  'UserService.getUser',
  'Could not fetch user from ThirdParty',
  ['- HTTP'.padEnd(20), 'GET https://example.org/api/v1'].join(' - '),
  ['- Request headers'.padEnd(20), JSON.stringify(req.headers)].join(' - '),
  ['- Response status'.padEnd(20), JSON.stringify(res.status)].join(' - '),
  ['- Response headers'.padEnd(20), JSON.stringify(res.headers)].join(' - '),
);

console.log();
console.log(
  '"ApplicationException.prefixedLines" or "ApplicationException.plines" constructor',
);
console.log();
console.log(e2.getMessage());
