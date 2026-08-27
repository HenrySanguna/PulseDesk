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
];
