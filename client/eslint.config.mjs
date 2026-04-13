/**
 * Phase A: ESLint 9 flat config + @eslint/js + typescript-eslint `recommended`
 * (no type-checked rules yet). React rules without react-hooks "compiler" extras
 * (those require broader refactors).
 *
 * Note: ESLint only applies this config under `client/`; `shared/` is covered by `tsc`.
 */
import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'coverage/**',
      // Generated font bundle
      'src/Tinos.ts',
      // Vendored library (built UMD/ES bundles are not authored here)
      'react-audio-visualize-master/**',
      // Node prebuild scripts (console, process)
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['src/**/*.{ts,tsx,js,jsx}', 'tests/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Intentionally off: many effects use stable props/refs; re-enabling is a Phase B cleanup.
      'react-hooks/exhaustive-deps': 'off',
      // Props are typed with TypeScript, not runtime propTypes.
      'react/prop-types': 'off',
    },
  },
  {
    files: ['playwright.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/prefer-as-const': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    files: [
      'tests/**/*.{js,jsx,ts,tsx}',
      'tests/unit/setupTests.js',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        global: 'readonly',
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'react/display-name': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Tests use loose mocks; type-safety is enforced in src + tsc.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/prefer-as-const': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    settings: {
      react: { version: '19.2' },
    },
  },
);
