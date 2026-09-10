/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  verbose: true,
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  testRegex: '/(tests|src)/.*.test(\\..+)?\\.ts$',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['json-summary', 'text', 'lcov'],
};

module.exports = config;
