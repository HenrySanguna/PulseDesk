import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['**/out-tsc'],
  },
  {
    // libs/db is the owning data layer for Agent.passwordHash — allowed to
    // reference it (see the root eslint.config.mjs rule this overrides).
    files: ['**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
