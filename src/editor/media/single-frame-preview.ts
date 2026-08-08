import { normalizeTimeUs } from '../core/time';
import { isAbortError } from '../util/abort-error';
import { canGenerateFramePreviews } from './frame-preview';
import {
  createMediabunnyFramePreviewSource,
  FramePreviewDecodeError,
  type MediabunnyFramePreviewSource,
  type MediabunnyFramePreviewSourceFactory,
} from './mediabunny-frame-preview';

export const TRIM_FRAME_PREVIEW_HEIGHT = 104;
export const SINGLE_FRAME_PREVIEW_CACHE_LIMIT = 32;

export type SingleFramePreviewRequest = {
  height: number;
  sourceDurationUs: number;
  src: string;
};

export type SingleFramePreviewResult =
  | { status: 'loading' }
  | {
      height: number;
      status: 'ready';
      timeUs: number;
      url: string;
      width: number;
    }
  | {
      message: string;
      status: 'error' | 'unsupported';
    };

export type SingleFramePreviewSession = {
  dispose(): void;
  request(timeUs: number): void;
};

export type SingleFramePreviewSubscriber = (
  result: SingleFramePreviewResult,
) => void;

type CachedSingleFrame = Extract<
  SingleFramePreviewResult,
  { status: 'ready' }
>;

type ScheduledWork = {
  cancel(): void;
};

const scheduleOnAnimationFrame = (callback: () => void): ScheduledWork => {
  if (typeof requestAnimationFrame === 'function') {
    const frameId = requestAnimationFrame(callback);
    return { cancel: () => cancelAnimationFrame(frameId) };
  }

  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) callback();
  });
  return { cancel: () => { cancelled = true; } };
};

const getCacheKey = (
  request: SingleFramePreviewRequest,
  timeUs: number,
) => [
  request.src,
  request.sourceDurationUs,
  request.height,
  timeUs,
].join('\n');

const normalizeRequest = (
  request: SingleFramePreviewRequest,
): SingleFramePreviewRequest => ({
  height: Math.min(256, Math.max(1, Math.round(request.height))),
  sourceDurationUs: normalizeTimeUs(request.sourceDurationUs),
  src: request.src,
});

const getFailureResult = (error: unknown): SingleFramePreviewResult => {
  if (
    error instanceof FramePreviewDecodeError &&
    error.code === 'unsupported'
  ) {
    return { message: error.message, status: 'unsupported' };
  }
  return {
    message:
      error instanceof Error
        ? error.message
        : '无法生成裁剪位置的帧预览',
    status: 'error',
  };
};

export const createSingleFramePreviewRuntime = (
  getBlob: (src: string) => Promise<Blob>,
  isDisposed: () => boolean,
  customCreateSource?: MediabunnyFramePreviewSourceFactory,
) => {
  const createSource =
    customCreateSource ?? createMediabunnyFramePreviewSource;
  const canCreatePreviews =
    customCreateSource !== undefined || canGenerateFramePreviews();
  const cache = new Map<string, CachedSingleFrame>();
  const generatedUrls = new Set<string>();
  const sessions = new Set<SingleFramePreviewSession>();

  const getCachedFrame = (key: string) => {
    const cached = cache.get(key);
    if (!cached) return null;
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  };

  const cacheFrame = (key: string, frame: CachedSingleFrame) => {
    const previous = cache.get(key);
    if (previous && previous.url !== frame.url) {
      generatedUrls.delete(previous.url);
      URL.revokeObjectURL(previous.url);
    }
    cache.delete(key);
    cache.set(key, frame);
    generatedUrls.add(frame.url);

    while (cache.size > SINGLE_FRAME_PREVIEW_CACHE_LIMIT) {
      const oldest = cache.entries().next().value;
      if (!oldest) break;
      const [oldestKey, oldestFrame] = oldest;
      cache.delete(oldestKey);
      generatedUrls.delete(oldestFrame.url);
      URL.revokeObjectURL(oldestFrame.url);
    }
  };

  const createSession = (
    rawRequest: SingleFramePreviewRequest,
    subscriber: SingleFramePreviewSubscriber,
  ): SingleFramePreviewSession => {
    const request = normalizeRequest(rawRequest);
    if (!canCreatePreviews) {
      subscriber({
        message: '当前浏览器不支持 Worker、OffscreenCanvas 或 WebCodecs 帧预览',
        status: 'unsupported',
      });
      return { dispose: () => undefined, request: () => undefined };
    }

    const controller = new AbortController();
    let disposed = false;
    let extracting = false;
    let hasReadyFrame = false;
    let latestTimeUs: number | null = null;
    let latestToken = 0;
    let pending: { cacheKey: string; timeUs: number; token: number } | null =
      null;
    let scheduledWork: ScheduledWork | null = null;
    let source: MediabunnyFramePreviewSource | null = null;
    let sourcePromise: Promise<MediabunnyFramePreviewSource> | null = null;

    const getSource = () => {
      if (source) return Promise.resolve(source);
      if (sourcePromise) return sourcePromise;
      sourcePromise = getBlob(request.src)
        .then((blob) => createSource(blob, controller.signal, request.height))
        .then((createdSource) => {
          if (disposed || isDisposed()) {
            createdSource.dispose();
            throw new DOMException('帧预览会话已取消', 'AbortError');
          }
          source = createdSource;
          return createdSource;
        });
      return sourcePromise;
    };

    const schedule = () => {
      if (disposed || extracting || scheduledWork || !pending) return;
      scheduledWork = scheduleOnAnimationFrame(() => {
        scheduledWork = null;
        void extractLatest();
      });
    };

    const extractLatest = async () => {
      if (disposed || extracting || !pending) return;
      const target = pending;
      pending = null;
      extracting = true;

      try {
        const activeSource = await getSource();
        if (disposed || target.token !== latestToken) return;
        const decodeTimeUs = Math.min(
          Math.max(0, activeSource.mediaDurationUs - 10_000),
          target.timeUs,
        );
        let frameBlob: Blob | null = null;
        await activeSource.extract(
          [{ index: 0, timeUs: decodeTimeUs }],
          ({ blob }) => {
            frameBlob = blob;
          },
        );
        if (!frameBlob) {
          throw new Error('视频解码器没有返回裁剪位置的画面');
        }
        const url = URL.createObjectURL(frameBlob);
        if (disposed || isDisposed()) {
          URL.revokeObjectURL(url);
          return;
        }
        const frame: CachedSingleFrame = {
          height: request.height,
          status: 'ready',
          timeUs: target.timeUs,
          url,
          width: activeSource.frameWidth,
        };
        cacheFrame(target.cacheKey, frame);
        if (target.token === latestToken) {
          hasReadyFrame = true;
          subscriber(frame);
        }
      } catch (error) {
        if (
          !disposed &&
          !isDisposed() &&
          target.token === latestToken &&
          !isAbortError(error)
        ) {
          subscriber(getFailureResult(error));
        }
      } finally {
        extracting = false;
        if (!disposed && pending) schedule();
      }
    };

    const session: SingleFramePreviewSession = {
      dispose() {
        if (disposed) return;
        disposed = true;
        pending = null;
        scheduledWork?.cancel();
        scheduledWork = null;
        controller.abort();
        source?.dispose();
        source = null;
        sessions.delete(session);
      },
      request(timeUs) {
        if (disposed || isDisposed()) return;
        const normalizedTimeUs = Math.min(
          request.sourceDurationUs,
          normalizeTimeUs(timeUs),
        );
        if (latestTimeUs === normalizedTimeUs) return;
        latestTimeUs = normalizedTimeUs;
        latestToken += 1;
        const cacheKey = getCacheKey(request, normalizedTimeUs);
        const cached = getCachedFrame(cacheKey);
        if (cached) {
          pending = null;
          hasReadyFrame = true;
          subscriber(cached);
          return;
        }
        pending = { cacheKey, timeUs: normalizedTimeUs, token: latestToken };
        if (!hasReadyFrame) subscriber({ status: 'loading' });
        schedule();
      },
    };
    sessions.add(session);
    return session;
  };

  return {
    clear() {
      [...sessions].forEach((session) => session.dispose());
      cache.clear();
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
      generatedUrls.clear();
    },
    createSession,
  };
};
