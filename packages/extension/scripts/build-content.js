import { build } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Build content script as IIFE
async function buildContentScript() {
  await build({
    configFile: false,
    build: {
      outDir: resolve(__dirname, '../dist/content'),
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, '../src/content/content.ts'),
        name: 'BookmarkAIContent',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        external: [],
        output: {
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        'webextension-polyfill': resolve(__dirname, '../node_modules/webextension-polyfill/dist/browser-polyfill.js'),
      },
    },
  });
}

buildContentScript().catch(console.error);