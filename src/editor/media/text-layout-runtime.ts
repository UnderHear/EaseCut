import type { TimelineTextLayoutSize } from '../core/model';
import {
  getTimelineTextFontPreset,
  type TimelineTextFontType,
} from '../core/text-fonts';

const DEFAULT_TEXT_LAYOUT_CACHE_SIZE = 256;
const FALLBACK_LINE_HEIGHT_RATIO = 1.2;

export type TextLayoutErrorCode =
  | 'cancelled'
  | 'font-load-failed'
  | 'measurement-failed'
  | 'unsupported';

export class TextLayoutError extends Error {
  readonly code: TextLayoutErrorCode;

  constructor(code: TextLayoutErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TextLayoutError';
    this.code = code;
  }
}

export type TextLayoutRequest = Readonly<{
  bold: boolean;
  fontSize: number;
  fontType: TimelineTextFontType;
  italic: boolean;
  text: string;
}>;

export type TextLayoutRuntime = {
  dispose(): void;
  measure(
    request: TextLayoutRequest,
    signal?: AbortSignal,
  ): Promise<TimelineTextLayoutSize>;
};

type TextMeasurementContext = Pick<
  CanvasRenderingContext2D,
  'font' | 'measureText' | 'textAlign' | 'textBaseline'
>;

type CreateTextLayoutRuntimeOptions = {
  createContext?: () => TextMeasurementContext | null;
  fontFaceSet?: Pick<FontFaceSet, 'load'> | null;
  maxEntries?: number;
};

const createAbortError = () =>
  new TextLayoutError('cancelled', '文字尺寸测量已取消');

const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw createAbortError();
};

const getDefaultFontFaceSet = () =>
  typeof document === 'undefined' || !document.fonts ? null : document.fonts;

const createDefaultContext = (): TextMeasurementContext | null => {
  if (typeof document === 'undefined') return null;
  return document.createElement('canvas').getContext('2d');
};

const getFiniteNonNegativeMetric = (value: number) =>
  Number.isFinite(value) && value >= 0 ? value : 0;

export const createTextCanvasFont = (
  request: Pick<TextLayoutRequest, 'bold' | 'fontSize' | 'italic'>,
  fontFamily: string,
) =>
  `${request.italic ? 'italic ' : ''}${request.bold ? '700 ' : ''}${request.fontSize}px "${fontFamily}", sans-serif`;

const measureLayoutSize = (
  context: TextMeasurementContext,
  request: TextLayoutRequest,
  fontFamily: string,
): TimelineTextLayoutSize => {
  context.font = createTextCanvasFont(request, fontFamily);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const metrics = context.measureText(request.text);
  const actualWidth =
    getFiniteNonNegativeMetric(metrics.actualBoundingBoxLeft) +
    getFiniteNonNegativeMetric(metrics.actualBoundingBoxRight);
  const width = Math.ceil(
    Math.max(1, getFiniteNonNegativeMetric(metrics.width), actualWidth),
  );
  const fontHeight =
    getFiniteNonNegativeMetric(metrics.fontBoundingBoxAscent) +
    getFiniteNonNegativeMetric(metrics.fontBoundingBoxDescent);
  const actualHeight =
    getFiniteNonNegativeMetric(metrics.actualBoundingBoxAscent) +
    getFiniteNonNegativeMetric(metrics.actualBoundingBoxDescent);
  const measuredHeight =
    fontHeight > 0
      ? fontHeight
      : actualHeight > 0
        ? actualHeight
        : request.fontSize * FALLBACK_LINE_HEIGHT_RATIO;
  const height = Math.ceil(
    Math.max(1, measuredHeight),
  );

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new TextLayoutError(
      'measurement-failed',
      '浏览器返回了无效的文字尺寸',
    );
  }

  return { height, width };
};

export const createTextLayoutRuntime = (
  options: CreateTextLayoutRuntimeOptions = {},
): TextLayoutRuntime => {
  const fontFaceSet =
    options.fontFaceSet === undefined
      ? getDefaultFontFaceSet()
      : options.fontFaceSet;
  const createContext = options.createContext ?? createDefaultContext;
  const maxEntries = Math.max(
    1,
    Math.floor(options.maxEntries ?? DEFAULT_TEXT_LAYOUT_CACHE_SIZE),
  );
  const cache = new Map<string, TimelineTextLayoutSize>();
  const pendingFontLoads = new Map<TimelineTextFontType, Promise<void>>();
  let context: TextMeasurementContext | null = null;
  let disposed = false;

  const ensureFontLoaded = (
    fontType: TimelineTextFontType,
    fontFamily: string,
  ) => {
    if (!fontFaceSet) {
      return Promise.reject(
        new TextLayoutError(
          'unsupported',
          '当前浏览器不支持字体加载检测，无法可靠计算文字尺寸',
        ),
      );
    }
    const pending = pendingFontLoads.get(fontType);
    if (pending) return pending;

    const load = Promise.resolve()
      .then(() => fontFaceSet.load(`16px "${fontFamily}"`))
      .then((faces) => {
        if (faces.length === 0) {
          throw new TextLayoutError(
            'font-load-failed',
            '字体资源加载失败，无法计算文字尺寸',
          );
        }
      })
      .catch((error: unknown) => {
        pendingFontLoads.delete(fontType);
        if (error instanceof TextLayoutError) throw error;
        throw new TextLayoutError(
          'font-load-failed',
          '字体资源加载失败，无法计算文字尺寸',
          { cause: error },
        );
      });
    pendingFontLoads.set(fontType, load);
    return load;
  };

  const getCached = (key: string) => {
    const cached = cache.get(key);
    if (!cached) return null;
    cache.delete(key);
    cache.set(key, cached);
    return { ...cached };
  };

  const setCached = (key: string, value: TimelineTextLayoutSize) => {
    cache.set(key, { ...value });
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      cache.delete(oldestKey);
    }
  };

  return {
    dispose() {
      disposed = true;
      cache.clear();
      pendingFontLoads.clear();
      context = null;
    },
    async measure(request, signal) {
      if (disposed) {
        throw new TextLayoutError(
          'cancelled',
          '文字尺寸测量服务已销毁',
        );
      }
      throwIfAborted(signal);
      if (
        request.text.trim() === '' ||
        /[\r\n]/.test(request.text) ||
        typeof request.bold !== 'boolean' ||
        !Number.isInteger(request.fontSize) ||
        request.fontSize <= 0 ||
        typeof request.italic !== 'boolean'
      ) {
        throw new TextLayoutError(
          'measurement-failed',
          '文字内容或字号无效，无法计算尺寸',
        );
      }
      const preset = getTimelineTextFontPreset(request.fontType);
      if (!preset) {
        throw new TextLayoutError(
          'measurement-failed',
          '文字字体无效，无法计算尺寸',
        );
      }
      const key = `${request.fontType}\n${request.fontSize}\n${request.bold ? 1 : 0}\n${request.italic ? 1 : 0}\n${request.text}`;
      const cached = getCached(key);
      if (cached) return cached;

      await ensureFontLoaded(request.fontType, preset.family);
      throwIfAborted(signal);
      if (disposed) throw createAbortError();
      context ??= createContext();
      if (!context) {
        throw new TextLayoutError(
          'unsupported',
          '当前浏览器不支持 Canvas 文字测量',
        );
      }

      try {
        const layoutSize = measureLayoutSize(context, request, preset.family);
        setCached(key, layoutSize);
        return { ...layoutSize };
      } catch (error: unknown) {
        if (error instanceof TextLayoutError) throw error;
        throw new TextLayoutError(
          'measurement-failed',
          '文字尺寸测量失败，请重试',
          { cause: error },
        );
      }
    },
  };
};
