/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const libraryExternals = [
  'konva',
  'lucide-react',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-konva',
  'zustand',
  'zustand/react',
  'zustand/vanilla',
];

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build:
    mode === 'library'
      ? {
          cssCodeSplit: true,
          lib: {
            entry: 'src/library-entry.ts',
            formats: ['es'],
            fileName: 'index',
            cssFileName: 'styles',
          },
          outDir: 'dist',
          rollupOptions: {
            external: libraryExternals,
            output: {
              assetFileNames: (assetInfo) =>
                assetInfo.names.some((name) => name.endsWith('.css'))
                  ? 'styles.css'
                  : 'assets/[name]-[hash][extname]',
            },
          },
        }
      : {
          outDir: 'demo-dist',
        },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
