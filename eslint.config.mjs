import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // The project uses intentional state synchronization and refs in effects
      // throughout its interactive canvas components.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react/purity': 'off',
      'react-hooks/purity': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prefer-const': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'node_modules/**',
    'public/uploads/**',
    'next-env.d.ts',
  ]),
])
