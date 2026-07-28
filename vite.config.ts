/// <reference types="vitest/config" />

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SOUND_TOUCH_PROCESSOR_MODULE_ID =
  'virtual:opencut-soundtouch-processor-url';
const RESOLVED_SOUND_TOUCH_PROCESSOR_MODULE_ID =
  `\0${SOUND_TOUCH_PROCESSOR_MODULE_ID}`;
const soundTouchProcessorPath = createRequire(import.meta.url).resolve(
  '@soundtouchjs/audio-worklet/processor',
);

const createSoundTouchProcessorPlugin = (
  command: 'build' | 'serve',
): Plugin => {
  let processorReferenceId: string | null = null;

  return {
    name: 'opencut-soundtouch-processor',
    buildStart() {
      if (command !== 'build') return;
      processorReferenceId = this.emitFile({
        type: 'asset',
        name: 'soundtouch-processor.js',
        source: readFileSync(soundTouchProcessorPath),
      });
    },
    load(id) {
      if (id !== RESOLVED_SOUND_TOUCH_PROCESSOR_MODULE_ID) return null;
      if (command === 'serve') {
        return [
          "import url from '@soundtouchjs/audio-worklet/processor?url';",
          'export default url;',
        ].join('\n');
      }
      if (!processorReferenceId) {
        throw new Error('SoundTouch processor 资源尚未初始化');
      }
      return `export default import.meta.ROLLUP_FILE_URL_${processorReferenceId};`;
    },
    resolveId(id) {
      return id === SOUND_TOUCH_PROCESSOR_MODULE_ID
        ? RESOLVED_SOUND_TOUCH_PROCESSOR_MODULE_ID
        : null;
    },
  };
};

const libraryExternals = [
  'lucide-react',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'zustand',
  'zustand/react',
  'zustand/vanilla',
];

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), createSoundTouchProcessorPlugin(command)],
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
