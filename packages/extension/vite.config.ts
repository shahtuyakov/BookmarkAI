import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/content/content.ts'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'popup-script': resolve(__dirname, 'src/popup/popup.tsx'),
        'callback-script': resolve(__dirname, 'src/auth/callback.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const name = chunkInfo.name;
          if (name === 'content-script') return 'content/content.js';
          if (name === 'service-worker') return 'background/service-worker.js';
          if (name === 'popup-script') return 'popup/popup.js';
          if (name === 'callback-script') return 'auth/callback.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]', 
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