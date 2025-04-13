import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.mjs',
  output: [
    {
      file: 'dist/async-aid.mjs',
      format: 'es',
    },
    {
      file: 'dist/async-aid.min.mjs',
      format: 'es',
      plugins: [terser()],
    },
  ],
};
