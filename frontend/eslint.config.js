import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Ambient declarations describe the untyped JS boundary (zustand stores,
    // axios wrappers). `any` is the honest type there.
    files: ['src/types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Loading data on mount necessarily flips a loading flag inside the effect.
    // Without a data-fetching library that pattern is correct, not a smell.
    files: ['src/pages/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
