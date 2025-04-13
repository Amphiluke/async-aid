import {defineConfig} from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';

export default defineConfig([
  {
    files: [
      'src/**/*.{js,mjs,cjs}',
      'eslint.config.mjs',
      'rollup.config.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {js},
    extends: ['js/recommended'],
  },
]);
