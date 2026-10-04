import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-electron/**', '**/node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // packages/postprocess (Technical Artist, @pixelforge/postprocess) es JS puro
    // sin build step: aca si hace falta declarar los globals de Node a mano,
    // a diferencia del resto del monorepo (TS, ya los resuelve via @types/node).
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
);
