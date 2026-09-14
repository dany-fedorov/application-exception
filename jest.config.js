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
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};

module.exports = config;
