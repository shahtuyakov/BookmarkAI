import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        'content-script': resolve(__dirname, 'src/content/content.ts'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'callback': resolve(__dirname, 'src/auth/callback.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const name = chunkInfo.name;
          if (name === 'content-script') return 'content/content.js';
          if (name === 'service-worker') return 'background/service-worker.js';
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.html')) {
            if (name.includes('popup')) return 'popup/popup.html';
            if (name.includes('callback')) return 'auth/callback.html';
          }
          if (name.endsWith('.css')) {
            return 'styles/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    target: 'esnext',
    minify: false, // Disable for development, enable for production
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
}); 