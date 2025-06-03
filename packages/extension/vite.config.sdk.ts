import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// This is the SDK-enabled build configuration
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  console.log('[SDK Build] Using SDK-enabled components');

  return {
    plugins: [
      react({
        jsxRuntime: 'classic',
      }),
    ],
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          'content': resolve(__dirname, 'src/content/content-bundled.ts'),
          'service-worker': resolve(__dirname, 'src/background/service-worker-sdk.ts'), // SDK version
          'popup-script': resolve(__dirname, 'src/popup/popup-sdk.tsx'), // SDK version
        },
        output: [
          {
            entryFileNames: (chunkInfo) => {
              const name = chunkInfo.name;
              if (name === 'content') return 'content/content.js';
              if (name === 'service-worker') return 'background/service-worker.js';
              if (name === 'popup-script') return 'popup/popup.js';
              return 'assets/[name]-[hash].js';
            },
            chunkFileNames: 'chunks/[name]-[hash].js',
            assetFileNames: (assetInfo) => {
              const fileName = assetInfo.names?.[0] || 'unknown';
              if (fileName.endsWith('.html')) {
                return '[name]/[name].[ext]';
              }
              if (fileName === 'manifest.json') {
                return 'manifest.json';
              }
              return 'assets/[name]-[hash].[ext]';
            },
          }
        ],
      },
      target: 'esnext',
      minify: false,
      sourcemap: mode === 'development' ? 'inline' : false,
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '~': resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      ...Object.keys(env).reduce((prev, key) => {
        if (key.startsWith('VITE_')) {
          prev[`process.env.${key}`] = JSON.stringify(env[key]);
        }
        return prev;
      }, {} as Record<string, string>),
    },
  };
});