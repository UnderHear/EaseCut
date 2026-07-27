import {
  MICROSECONDS_PER_SECOND,
  normalizeTimeUs,
} from '../core/time';
import {
  canUseMediabunnyFramePreviewWorker,
  createMediabunnyFramePreviewSource,
  type MediabunnyFramePreviewSourceFactory,
} from './mediabunny-frame-preview';

export const FRAME_PREVIEW_CHUNK_DURATION_US = 5 * MICROSECONDS_PER_SECOND;

export type FramePreviewFrame = {
  index: number;
  url: string;
};

export type FramePreviewStrip = {
  frameWidth: number;
  frames: FramePreviewFrame[];
  pixelsPerSecond: number;
};

export type FramePreviewRequest = {
  pixelsPerSecond: number;
  rangeEndUs: number;
  rangeStartUs: number;
  sourceDurationUs: number;
  src: string;
};

export type FramePreviewSubscriber = (strip: FramePreviewStrip) => void;

type CachedFramePreview = {
  timeUs: number;
  url: string;
};

type FramePreviewRange = Pick<FramePreviewRequest, 'rangeEndUs' | 'rangeStartUs'>;

type FramePreviewCacheEntry = {
  controller: AbortController | null;
  frameWidth: number | null;
  key: string;
  pixelsPerSecond: number;
  sourceDurationUs: number;
  src: string;
  subscribers: Map<FramePreviewSubscriber, FramePreviewRange>;
  task: Promise<void> | null;
  totalFrames: number;
  urls: Map<number, string>;
};

const FRAME_PREVIEW_TIME_EPSILON_US = 1_000;

const EMPTY_FRAME_PREVIEW_STRIP: FramePreviewStrip = {
  frameWidth: 0,
  frames: [],
  pixelsPerSecond: 0,
};

export const canGenerateFramePreviews = () =>
  typeof document !== 'undefined' &&
  canUseMediabunnyFramePreviewWorker() &&
  (typeof navigator === 'undefined' ||
    !navigator.userAgent.toLowerCase().includes('jsdom'));

const normalizeRequest = (
  request: FramePreviewRequest,
): FramePreviewRequest => {
  const sourceDurationUs = normalizeTimeUs(request.sourceDurationUs);
  const rangeStartUs = Math.min(
    sourceDurationUs,
    normalizeTimeUs(request.rangeStartUs),
  );
  const rangeEndUs = Math.min(
    sourceDurationUs,
    Math.max(rangeStartUs, normalizeTimeUs(request.rangeEndUs)),
  );

  return {
    pixelsPerSecond: Math.max(1, request.pixelsPerSecond),
    rangeEndUs,
    rangeStartUs,
    sourceDurationUs,
    src: request.src,
  };
};

const getFramePreviewCacheKey = (request: FramePreviewRequest) =>
  [request.src, request.sourceDurationUs, request.pixelsPerSecond].join('\n');

const createAbortError = () =>
  new DOMException('预览帧任务已取消', 'AbortError');

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw createAbortError();
};

const getRangeIndexes = (
  entry: FramePreviewCacheEntry,
  range: FramePreviewRange,
) => {
  if (!entry.frameWidth || entry.totalFrames <= 0) return [];
  const firstIndex = Math.max(
    0,
    Math.floor(
      ((range.rangeStartUs / MICROSECONDS_PER_SECOND) *
        entry.pixelsPerSecond) /
        entry.frameWidth,
    ),
  );
  const lastIndex = Math.min(
    entry.totalFrames - 1,
    Math.ceil(
      ((range.rangeEndUs / MICROSECONDS_PER_SECOND) *
        entry.pixelsPerSecond) /
        entry.frameWidth,
    ) - 1,
  );
  if (lastIndex < firstIndex) return [];
  return Array.from(
    { length: lastIndex - firstIndex + 1 },
    (_, index) => firstIndex + index,
  );
};

export const createFramePreviewCache = (
  getBlob: (src: string) => Promise<Blob>,
  isDisposed: () => boolean,
  customCreateSource?: MediabunnyFramePreviewSourceFactory,
) => {
  const createSource =
    customCreateSource ?? createMediabunnyFramePreviewSource;
  const canCreatePreviews =
    customCreateSource !== undefined || canGenerateFramePreviews();
  const entries = new Map<string, FramePreviewCacheEntry>();
  const framesBySource = new Map<string, CachedFramePreview[]>();
  const generatedUrls = new Set<string>();
  let queue = Promise.resolve();

  const findCachedUrl = (
    src: string,
    timeUs: number,
    reuseToleranceUs: number,
  ) => {
    const frames = framesBySource.get(src);
    if (!frames) return null;
    const maxDistance = Math.max(
      reuseToleranceUs,
      FRAME_PREVIEW_TIME_EPSILON_US,
    );
    let nearest: CachedFramePreview | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const frame of frames) {
      const distance = Math.abs(frame.timeUs - timeUs);
      if (distance < maxDistance && distance < nearestDistance) {
        nearest = frame;
        nearestDistance = distance;
      }
    }
    return nearest?.url ?? null;
  };

  const cacheFrame = (src: string, timeUs: number, url: string) => {
    const frames = framesBySource.get(src) ?? [];
    frames.push({ timeUs, url });
    frames.sort((left, right) => left.timeUs - right.timeUs);
    framesBySource.set(src, frames);
  };

  const getSnapshot = (
    entry: FramePreviewCacheEntry,
    range: FramePreviewRange,
  ): FramePreviewStrip => {
    if (!entry.frameWidth) return EMPTY_FRAME_PREVIEW_STRIP;
    return {
      frameWidth: entry.frameWidth,
      frames: getRangeIndexes(entry, range).flatMap((index) => {
        const url = entry.urls.get(index);
        return url ? [{ index, url }] : [];
      }),
      pixelsPerSecond: entry.pixelsPerSecond,
    };
  };

  const emit = (entry: FramePreviewCacheEntry) => {
    entry.subscribers.forEach((range, subscriber) => {
      subscriber(getSnapshot(entry, range));
    });
  };

  const getRequestedIndexes = (entry: FramePreviewCacheEntry) => [
    ...new Set(
      [...entry.subscribers.values()].flatMap((range) =>
        getRangeIndexes(entry, range),
      ),
    ),
  ].sort((left, right) => left - right);

  const hasMissingFrames = (entry: FramePreviewCacheEntry) => {
    if (entry.subscribers.size === 0) return false;
    if (!entry.frameWidth) return true;
    return getRequestedIndexes(entry).some((index) => !entry.urls.has(index));
  };

  const enqueue = <T,>(task: () => Promise<T>) => {
    const queuedTask = queue.then(task, task);
    queue = queuedTask.then(
      () => undefined,
      () => undefined,
    );
    return queuedTask;
  };

  const getFrameTimeUs = (
    entry: FramePreviewCacheEntry,
    index: number,
    mediaDurationUs: number,
  ) => {
    if (!entry.frameWidth) return 0;
    const frameDurationUs = normalizeTimeUs(
      (entry.frameWidth / entry.pixelsPerSecond) * MICROSECONDS_PER_SECOND,
    );
    return normalizeTimeUs(
      Math.min(
        Math.max(0, mediaDurationUs - 10_000),
        (index + 0.5) * frameDurationUs,
      ),
    );
  };

  const initializeEntry = (
    entry: FramePreviewCacheEntry,
    frameWidth: number,
    mediaDurationUs: number,
  ) => {
    entry.frameWidth = Math.max(1, Math.round(frameWidth));
    entry.totalFrames = Math.ceil(
      ((entry.sourceDurationUs / MICROSECONDS_PER_SECOND) *
        entry.pixelsPerSecond) /
        entry.frameWidth,
    );
    emit(entry);

    const frameDurationUs = normalizeTimeUs(
      (entry.frameWidth / entry.pixelsPerSecond) * MICROSECONDS_PER_SECOND,
    );
    for (const index of getRequestedIndexes(entry)) {
      if (entry.urls.has(index)) continue;
      const cachedUrl = findCachedUrl(
        entry.src,
        getFrameTimeUs(entry, index, mediaDurationUs),
        Math.round(frameDurationUs / 2),
      );
      if (cachedUrl) entry.urls.set(index, cachedUrl);
    }
    emit(entry);
  };

  const createMediabunnyFrames = async (
    entry: FramePreviewCacheEntry,
    signal: AbortSignal,
  ) => {
    throwIfAborted(signal);
    if (isDisposed()) {
      throw new DOMException('媒体运行时已销毁', 'AbortError');
    }
    if (entry.subscribers.size === 0) return;
    const blob = await getBlob(entry.src);
    throwIfAborted(signal);
    if (entry.subscribers.size === 0) return;
    const source = await createSource(blob, signal);
    try {
      throwIfAborted(signal);
      if (entry.subscribers.size === 0) return;
      initializeEntry(
        entry,
        source.frameWidth,
        source.mediaDurationUs,
      );

      const requestedIndexes = new Set(getRequestedIndexes(entry));
      const missingFrames = [...requestedIndexes]
        .filter((index) => !entry.urls.has(index))
        .map((index) => ({
          index,
          timeUs: getFrameTimeUs(
            entry,
            index,
            source.mediaDurationUs,
          ),
        }));
      await source.extract(missingFrames, ({ blob: frameBlob, index, timeUs }) => {
        if (
          isDisposed() ||
          signal.aborted ||
          entry.subscribers.size === 0 ||
          !requestedIndexes.has(index)
        ) {
          return;
        }
        const url = URL.createObjectURL(frameBlob);
        if (isDisposed() || signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        generatedUrls.add(url);
        entry.urls.set(index, url);
        cacheFrame(entry.src, timeUs, url);
        emit(entry);
      });
    } finally {
      source.dispose();
    }
  };

  const schedule = (entry: FramePreviewCacheEntry) => {
    if (entry.task || !hasMissingFrames(entry)) return;
    const controller = new AbortController();
    entry.controller = controller;
    entry.task = enqueue(() => createMediabunnyFrames(entry, controller.signal))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        if (entries.get(entry.key) === entry) entries.delete(entry.key);
        entry.subscribers.clear();
      })
      .finally(() => {
        if (entry.controller === controller) entry.controller = null;
        entry.task = null;
        if (entries.get(entry.key) === entry && hasMissingFrames(entry)) {
          schedule(entry);
        }
      });
  };

  const getEntry = (request: FramePreviewRequest) => {
    const key = getFramePreviewCacheKey(request);
    const cachedEntry = entries.get(key);
    if (cachedEntry) return cachedEntry;

    const entry: FramePreviewCacheEntry = {
      controller: null,
      frameWidth: null,
      key,
      pixelsPerSecond: request.pixelsPerSecond,
      sourceDurationUs: request.sourceDurationUs,
      src: request.src,
      subscribers: new Map(),
      task: null,
      totalFrames: 0,
      urls: new Map(),
    };
    entries.set(key, entry);
    return entry;
  };

  return {
    clear: () => {
      entries.forEach((entry) => {
        entry.controller?.abort();
        entry.subscribers.clear();
      });
      entries.clear();
      framesBySource.clear();
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
      generatedUrls.clear();
    },
    subscribe: (
      rawRequest: FramePreviewRequest,
      subscriber: FramePreviewSubscriber,
    ) => {
      if (!canCreatePreviews || isDisposed()) {
        subscriber(EMPTY_FRAME_PREVIEW_STRIP);
        return () => undefined;
      }
      const request = normalizeRequest(rawRequest);
      if (!request.src || request.rangeEndUs <= request.rangeStartUs) {
        subscriber(EMPTY_FRAME_PREVIEW_STRIP);
        return () => undefined;
      }
      const entry = getEntry(request);
      entry.subscribers.set(subscriber, {
        rangeEndUs: request.rangeEndUs,
        rangeStartUs: request.rangeStartUs,
      });
      subscriber(
        getSnapshot(entry, {
          rangeEndUs: request.rangeEndUs,
          rangeStartUs: request.rangeStartUs,
        }),
      );
      schedule(entry);
      return () => {
        entry.subscribers.delete(subscriber);
        if (entry.subscribers.size === 0) entry.controller?.abort();
      };
    },
  };
};
