import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on mode (development, production)
  const env = loadEnv(mode, process.cwd(), ''); // Load all env vars

  // DEBUG: Log loaded environment variables during Vite config processing
  console.log('[DEBUG] Vite Mode:', mode);
  console.log('[DEBUG] Loaded env in vite.config.ts (all vars):', env);
  console.log('[DEBUG] VITE_OAUTH_AUTH_URL in vite.config.ts:', env.VITE_OAUTH_AUTH_URL);
  console.log('[DEBUG] VITE_API_BASE_URL in vite.config.ts:', env.VITE_API_BASE_URL);

  return {
    plugins: [
      react(),
    ],
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          'content': resolve(__dirname, 'src/content/content.ts'),
          'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
          'popup-script': resolve(__dirname, 'src/popup/popup.tsx'),
          'callback-script': resolve(__dirname, 'src/auth/callback.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            const name = chunkInfo.name;
            if (name === 'content') return 'content/content.js';
            if (name === 'service-worker') return 'background/service-worker.js';
            if (name === 'popup-script') return 'popup/popup.js';
            if (name === 'callback-script') return 'auth/callback.js';
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
        },
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