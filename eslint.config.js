import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const commonRules = {
  ...reactHooks.configs.recommended.rules,
  'react/jsx-uses-react': 'error',
  'react/jsx-uses-vars': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  {
    ignores: [
      'node_modules/**',
      '.cache/**',
      'project/.cache/**',
      'project/pages/dist/**',
      'labs/*/dist/**',
      'labs/*/dist-preview/**',
      'release/**',
    ],
  },
  { ...js.configs.recommended, files: ['**/*.{js,jsx,mjs,cjs}'] },
  {
    files: ['labs/**/*.{js,jsx,mjs}', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...commonRules,
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['labs/**/*.{ts,tsx}'],
  })),
  {
    files: ['labs/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...commonRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-namespace': 'off',
    },
  },
];
