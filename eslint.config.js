import tseslint from 'typescript-eslint';

const rules = {
  'no-console': ['warn', { allow: ['error', 'warn'] }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-floating-promises': 'error',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
);
