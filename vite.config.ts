/// <reference types="vitest/config" />

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SOUND_TOUCH_PROCESSOR_MODULE_ID =
  'virtual:easecut-soundtouch-processor-url';
const RESOLVED_SOUND_TOUCH_PROCESSOR_MODULE_ID =
  `\0${SOUND_TOUCH_PROCESSOR_MODULE_ID}`;
const soundTouchProcessorPath = createRequire(import.meta.url).resolve(
  '@soundtouchjs/audio-worklet/processor',
);

const bundledFontAssets = [
  {
    fileName: 'alibaba-puhuiti-2-regular.woff2',
    mimeType: 'font/woff2',
  },
  {
    fileName: 'source-han-sans-cn-regular.otf',
    mimeType: 'font/otf',
  },
  {
    fileName: 'zcool-canger-yuyang-w03.ttf',
    mimeType: 'font/ttf',
  },
  {
    fileName: 'zcool-gaoduanhei.ttf',
    mimeType: 'font/ttf',
  },
  {
    fileName: 'zcool-kuaile.ttf',
    mimeType: 'font/ttf',
  },
  {
    fileName: 'zcool-kuhei.ttf',
    mimeType: 'font/ttf',
  },
  {
    fileName: 'zcool-wenyi.ttf',
    mimeType: 'font/ttf',
  },
  {
    fileName: 'zcool-xiaowei-logo.otf',
    mimeType: 'font/otf',
  },
] as const;

const bundledFontNotices = [
  'source-han-sans-OFL-1.1.txt',
  'zcool-gaoduanhei-usage-statement.txt',
] as const;

const createBundledFontAssetsPlugin = (): Plugin => {
  const emittedReferences = new Map<string, string>();
  const fontSources = new Map<string, Buffer>();

  return {
    name: 'easecut-bundled-font-assets',
    buildStart() {
      for (const asset of bundledFontAssets) {
        const source = readFileSync(
          new URL(
            `./src/editor/assets/fonts/${asset.fileName}`,
            import.meta.url,
          ),
        );
        fontSources.set(asset.fileName, source);
        emittedReferences.set(
          asset.fileName,
          this.emitFile({
            fileName: `assets/fonts/${asset.fileName}`,
            source,
            type: 'asset',
          }),
        );
      }
      for (const fileName of bundledFontNotices) {
        this.emitFile({
          fileName: `assets/fonts/licenses/${fileName}`,
          source: readFileSync(
            new URL(
              `./src/editor/assets/fonts/licenses/${fileName}`,
              import.meta.url,
            ),
          ),
          type: 'asset',
        });
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type !== 'asset' ||
          !output.fileName.endsWith('.css')
        ) {
          continue;
        }

        let cssSource =
          typeof output.source === 'string'
            ? output.source
            : Buffer.from(output.source).toString('utf8');

        // Vite library mode always inlines imported assets. Restore the font
        // URLs to emitted files so consumers only fetch the selected face.
        for (const asset of bundledFontAssets) {
          const source = fontSources.get(asset.fileName);
          const referenceId = emittedReferences.get(asset.fileName);
          if (!source || !referenceId) {
            throw new Error(`字体资源尚未初始化：${asset.fileName}`);
          }
          cssSource = cssSource.replaceAll(
            `data:${asset.mimeType};base64,${source.toString('base64')}`,
            `./${this.getFileName(referenceId)}`,
          );
        }
        output.source = cssSource;
      }
    },
  };
};

const createSoundTouchProcessorPlugin = (
  command: 'build' | 'serve',
): Plugin => {
  let processorReferenceId: string | null = null;

  return {
    name: 'easecut-soundtouch-processor',
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
  plugins: [
    react(),
    createSoundTouchProcessorPlugin(command),
    ...(mode === 'library' ? [createBundledFontAssetsPlugin()] : []),
  ],
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
