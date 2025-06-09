import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on mode (development, production)
  const env = loadEnv(mode, process.cwd(), ''); // Load all env vars

  // Load environment variables for Vite config processing
  // Debug logging removed for production build

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
          'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
          'popup-script': resolve(__dirname, 'src/popup/popup.tsx'),
        },
        external: [
          'react-native',
          '@react-native',
          'react-native/**',
        ],
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
              if (assetInfo.name?.endsWith('.html')) {
                return '[name]/[name].[ext]';
              }
              if (assetInfo.name === 'manifest.json') {
                return 'manifest.json';
              }
              return 'assets/[name]-[hash].[ext]';
            },
          }
        ],
      },
      target: 'esnext',
      minify: false, // Disable for development, enable for production
      sourcemap: mode === 'development' ? 'inline' : false, // Use mode for sourcemap
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