/**
 * Phase A: ESLint 10 flat config + @eslint/js + typescript-eslint `recommended`
 * (no type-checked rules yet). React rules without react-hooks "compiler" extras
 * (those require broader refactors).
 *
 * eslint-plugin-react-hooks stays authoritative for hooks rules; @eslint-react's own
 * hooks-adjacent rules are turned off below to avoid double-reporting the same issue.
 *
 * Note: ESLint only applies this config under `client/`; `shared/` is covered by `tsc`.
 */
import eslint from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
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
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintReact.configs['recommended-typescript'],
  {
    rules: {
      // Uncalibrated for this codebase: fires on ~120 idiomatic setState-in-effect
      // call sites (batched updates, imperative reset callbacks) with no real signal.
      '@eslint-react/set-state-in-effect': 'off',
      // Pure naming-style preferences, not correctness.
      '@eslint-react/naming-convention-ref-name': 'off',
      '@eslint-react/use-state': 'off',
      // Real bug classes for this app's realtime/audio/DOM surface (leaked
      // listeners/timers, impure renders, injection risk) — promoted to error so
      // they gate rather than get lost in the warning list above.
      '@eslint-react/purity': 'error',
      '@eslint-react/web-api-no-leaked-event-listener': 'error',
      '@eslint-react/web-api-no-leaked-fetch': 'error',
      '@eslint-react/web-api-no-leaked-intersection-observer': 'error',
      '@eslint-react/web-api-no-leaked-interval': 'error',
      '@eslint-react/web-api-no-leaked-resize-observer': 'error',
      '@eslint-react/web-api-no-leaked-timeout': 'error',
      '@eslint-react/dom-no-dangerously-set-innerhtml': 'error',
      '@eslint-react/dom-no-script-url': 'error',
      '@eslint-react/dom-no-unsafe-iframe-sandbox': 'error',
    },
  },
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
      // Redundant with eslint-plugin-react-hooks above.
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/exhaustive-deps': 'off',
    },
  },
  {
    files: ['playwright.config.ts', 'scripts/**/*.mjs'],
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
    files: ['tests/**/*.{js,jsx,ts,tsx}', 'tests/unit/setupTests.js'],
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
      // Snapshots mirror implementation and break opaquely on cosmetic refactors
      // (see TESTING.md); .only left in a commit silently disables the rest of
      // the suite with no CI to catch it.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name="toMatchSnapshot"]',
          message: 'Avoid toMatchSnapshot — assert the specific behavior/values instead (see TESTING.md).',
        },
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="only"][callee.object.name=/^(it|test|describe)$/]',
          message: 'Remove .only before committing — it silently skips the rest of the suite.',
        },
      ],
    },
  },
);
