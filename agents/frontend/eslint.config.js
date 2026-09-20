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
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Inherited from the stock Vite scaffold rather than chosen for this project. The
      // remaining violations are typing debt, not defects, so they stay visible as warnings
      // and get typed off over time instead of blocking every deploy.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Hot-reload ergonomics only — no runtime behaviour attached.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
