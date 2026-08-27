import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // apps/api/src/auth is the only apps/api subtree allowed to reference
    // Agent.passwordHash (see the root eslint.config.mjs rule this
    // overrides) — it owns login/logout password verification.
    files: ['src/auth/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
