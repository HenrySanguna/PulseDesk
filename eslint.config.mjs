import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              // scope:web (agent-console, widget) may only reach shared,
              // frontend-safe code (contracts/sla-engine/ui). It must never
              // reach backend-only concerns (libs/db), even though db also
              // carries scope:shared.
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
              notDependOnLibsWithTags: ['type:data'],
            },
            {
              // apps/api depends only on shared backend libs.
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              // Pure libs (contracts, sla-engine) stay dependency-free.
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: [],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
  {
    // `Agent.passwordHash` must never be referenced outside `libs/db` (its
    // owning data layer) or `apps/api/src/auth` (the only module allowed to
    // verify it). Every other project overrides this back off for its own
    // allowed subtree — see libs/db/eslint.config.mjs and
    // apps/api/eslint.config.mjs.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='passwordHash']",
          message:
            'passwordHash must not be referenced outside libs/db or apps/api/src/auth. Use the PublicAgent projection (or AGENT_PUBLIC_SELECT) instead.',
        },
        {
          selector: "Literal[value='passwordHash']",
          message:
            'passwordHash must not be referenced outside libs/db or apps/api/src/auth. Use the PublicAgent projection (or AGENT_PUBLIC_SELECT) instead.',
        },
      ],
    },
  },
];
