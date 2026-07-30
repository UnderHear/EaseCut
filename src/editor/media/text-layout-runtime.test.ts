import { describe, expect, it, vi } from 'vitest';

import {
  createTextLayoutRuntime,
  type TextLayoutRequest,
} from './text-layout-runtime';

const defaultRequest: TextLayoutRequest = {
  bold: false,
  fontSize: 40,
  fontType: 'SY_Black',
  italic: false,
  text: '自然尺寸',
};

const createFontFaceSet = (
  load: () => Promise<FontFace[]> = () =>
    Promise.resolve([{} as FontFace]),
) => ({
  load: vi.fn(load),
});

const createMetrics = (
  metrics: Partial<TextMetrics>,
): TextMetrics => metrics as TextMetrics;

const createContext = (measureText: (text: string) => TextMetrics) => ({
  font: '',
  measureText: vi.fn(measureText),
  textAlign: 'start' as CanvasTextAlign,
  textBaseline: 'alphabetic' as CanvasTextBaseline,
});

const createDeferred = <Value,>() => {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: Value) {
      if (!resolvePromise) throw new Error('Deferred resolver is unavailable');
      resolvePromise(value);
    },
  };
};

describe('text layout runtime', () => {
  it('loads the font and rounds the larger advance and glyph dimensions up', async () => {
    const fontFaceSet = createFontFaceSet();
    const context = createContext(() =>
      createMetrics({
        actualBoundingBoxLeft: 20.2,
        actualBoundingBoxRight: 21.1,
        fontBoundingBoxAscent: 50.2,
        fontBoundingBoxDescent: 20.2,
        width: 40.1,
      }),
    );
    const runtime = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet,
    });

    await expect(runtime.measure(defaultRequest)).resolves.toEqual({
      height: 71,
      width: 42,
    });
    expect(fontFaceSet.load).toHaveBeenCalledWith(
      '16px "Source Han Sans SC"',
    );
    expect(context.font).toBe('40px "Source Han Sans SC", sans-serif');
    expect(context.textAlign).toBe('left');
    expect(context.textBaseline).toBe('alphabetic');
  });

  it('measures bold and italic with distinct canvas descriptors and cache keys', async () => {
    const context = createContext(() =>
      createMetrics({
        fontBoundingBoxAscent: 30,
        fontBoundingBoxDescent: 10,
        width: 80,
      }),
    );
    const runtime = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: createFontFaceSet(),
    });

    await runtime.measure({ ...defaultRequest, bold: true });
    expect(context.font).toBe('700 40px "Source Han Sans SC", sans-serif');

    await runtime.measure({ ...defaultRequest, bold: true, italic: true });
    expect(context.font).toBe(
      'italic 700 40px "Source Han Sans SC", sans-serif',
    );

    await runtime.measure({ ...defaultRequest, italic: true });
    expect(context.font).toBe(
      'italic 40px "Source Han Sans SC", sans-serif',
    );
    expect(context.measureText).toHaveBeenCalledTimes(3);
  });

  it('falls back from font bounds to glyph bounds and then a line-height ratio', async () => {
    const fontFaceSet = createFontFaceSet();
    const measureText = vi
      .fn<(text: string) => TextMetrics>()
      .mockReturnValueOnce(
        createMetrics({
          actualBoundingBoxAscent: 35.1,
          actualBoundingBoxDescent: 10.1,
          width: 80,
        }),
      )
      .mockReturnValueOnce(createMetrics({ width: 20 }));
    const runtime = createTextLayoutRuntime({
      createContext: () => ({
        font: '',
        measureText,
        textAlign: 'start',
        textBaseline: 'alphabetic',
      }),
      fontFaceSet,
    });

    await expect(runtime.measure(defaultRequest)).resolves.toEqual({
      height: 46,
      width: 80,
    });
    await expect(
      runtime.measure({ ...defaultRequest, fontSize: 12 }),
    ).resolves.toEqual({
      height: 15,
      width: 20,
    });
  });

  it('returns structured failures for unavailable font loading and rejected fonts', async () => {
    const context = createContext(() => createMetrics({ width: 20 }));
    const unsupported = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: null,
    });
    const failed = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: createFontFaceSet(() => Promise.resolve([])),
    });

    await expect(unsupported.measure(defaultRequest)).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(failed.measure(defaultRequest)).rejects.toMatchObject({
      code: 'font-load-failed',
    });
  });

  it('rejects multiline content before loading a font', async () => {
    const fontFaceSet = createFontFaceSet();
    const runtime = createTextLayoutRuntime({ fontFaceSet });

    await expect(
      runtime.measure({ ...defaultRequest, text: '第一行\n第二行' }),
    ).rejects.toMatchObject({ code: 'measurement-failed' });
    expect(fontFaceSet.load).not.toHaveBeenCalled();
  });

  it('drops an aborted request after asynchronous font loading', async () => {
    const fontLoad = createDeferred<FontFace[]>();
    const context = createContext(() => createMetrics({ width: 20 }));
    const runtime = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: createFontFaceSet(() => fontLoad.promise),
    });
    const controller = new AbortController();
    const measurement = runtime.measure(defaultRequest, controller.signal);

    controller.abort();
    fontLoad.resolve([{} as FontFace]);

    await expect(measurement).rejects.toMatchObject({ code: 'cancelled' });
    expect(context.measureText).not.toHaveBeenCalled();
  });

  it('keeps a bounded LRU cache and returns isolated cached values', async () => {
    const context = createContext((text) =>
      createMetrics({
        fontBoundingBoxAscent: 30,
        fontBoundingBoxDescent: 10,
        width: text.length * 10,
      }),
    );
    const runtime = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: createFontFaceSet(),
      maxEntries: 2,
    });

    const first = await runtime.measure({ ...defaultRequest, text: '甲' });
    first.width = 999;
    await expect(
      runtime.measure({ ...defaultRequest, text: '甲' }),
    ).resolves.toEqual({ height: 40, width: 10 });
    await runtime.measure({ ...defaultRequest, text: '乙' });
    await runtime.measure({ ...defaultRequest, text: '丙' });
    await runtime.measure({ ...defaultRequest, text: '甲' });

    expect(context.measureText).toHaveBeenCalledTimes(4);
  });

  it('rejects later work after disposal and clears reusable state', async () => {
    const context = createContext(() => createMetrics({ width: 20 }));
    const runtime = createTextLayoutRuntime({
      createContext: () => context,
      fontFaceSet: createFontFaceSet(),
    });

    await runtime.measure(defaultRequest);
    runtime.dispose();

    await expect(runtime.measure(defaultRequest)).rejects.toMatchObject({
      code: 'cancelled',
    });
  });
});
