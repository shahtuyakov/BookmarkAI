import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // We'll use tsc for declarations
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  external: ['react-native'],
  esbuildOptions(options) {
    options.footer = {
      js: '// BookmarkAI SDK - Generated from TypeScript source',
    };
  },
});