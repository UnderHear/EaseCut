import type { FramePreviewExtractor } from './webcodecs-frame-preview';

export const FRAME_PREVIEW_CHUNK_DURATION_SECONDS = 5;

const FRAME_PREVIEW_CAPTURE_HEIGHT = 48;

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
  rangeEnd: number;
  rangeStart: number;
  sourceDuration: number;
  src: string;
};

export type FramePreviewSubscriber = (strip: FramePreviewStrip) => void;

type CachedFramePreview = {
  time: number;
  url: string;
};

type FramePreviewRange = Pick<FramePreviewRequest, 'rangeEnd' | 'rangeStart'>;

type FramePreviewCacheEntry = {
  controller: AbortController | null;
  frameWidth: number | null;
  key: string;
  pixelsPerSecond: number;
  sourceDuration: number;
  src: string;
  subscribers: Map<FramePreviewSubscriber, FramePreviewRange>;
  task: Promise<void> | null;
  totalFrames: number;
  urls: Map<number, string>;
};

type FramePreviewAcceleration = {
  extractor: FramePreviewExtractor;
  getBlob: (src: string) => Promise<Blob>;
  getDimensions: (
    src: string,
  ) => Promise<{ height: number; width: number } | null>;
};

const FRAME_PREVIEW_TIME_EPSILON = 0.001;

const EMPTY_FRAME_PREVIEW_STRIP: FramePreviewStrip = {
  frameWidth: 0,
  frames: [],
  pixelsPerSecond: 0,
};

export const canGenerateFramePreviews = () =>
  typeof document !== 'undefined' &&
  (typeof navigator === 'undefined' ||
    !navigator.userAgent.toLowerCase().includes('jsdom'));

const normalizeRequest = (
  request: FramePreviewRequest,
): FramePreviewRequest => {
  const sourceDuration = Math.max(0, request.sourceDuration);
  const rangeStart = Math.min(
    sourceDuration,
    Math.max(0, request.rangeStart),
  );
  const rangeEnd = Math.min(
    sourceDuration,
    Math.max(rangeStart, request.rangeEnd),
  );

  return {
    pixelsPerSecond: Math.max(1, request.pixelsPerSecond),
    rangeEnd,
    rangeStart,
    sourceDuration,
    src: request.src,
  };
};

const getFramePreviewCacheKey = (request: FramePreviewRequest) =>
  [request.src, request.sourceDuration, request.pixelsPerSecond].join('\n');

const getProgressiveFramePreviewIndexes = (indexes: readonly number[]) => {
  const ordered: number[] = [];
  const addRange = (start: number, end: number) => {
    if (start > end) return;
    ordered.push(indexes[start]!);
    if (start === end) return;
    ordered.push(indexes[end]!);
    const middle = Math.floor((start + end) / 2);
    if (middle !== start && middle !== end) ordered.push(indexes[middle]!);
    addRange(start + 1, middle - 1);
    addRange(middle + 1, end - 1);
  };

  addRange(0, indexes.length - 1);
  return [...new Set(ordered)];
};

const createAbortError = () =>
  new DOMException('预览帧任务已取消', 'AbortError');

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw createAbortError();
};

const waitForVideoMetadata = (
  video: HTMLVideoElement,
  src: string,
  signal: AbortSignal,
) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
      video.onloadedmetadata = null;
      video.onerror = null;
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频帧'));
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener('abort', handleAbort, { once: true });
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = src;
    video.load();
  });

const seekVideo = (
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
      video.onseeked = null;
      video.onerror = null;
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    video.onseeked = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频帧'));
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener('abort', handleAbort, { once: true });
    try {
      video.currentTime = time;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

const captureVideoFrame = (
  video: HTMLVideoElement,
  frameWidth: number,
) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || !video.videoWidth || !video.videoHeight) {
    return Promise.reject(new Error('无法读取视频帧'));
  }

  canvas.width = frameWidth;
  canvas.height = FRAME_PREVIEW_CAPTURE_HEIGHT;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('无法读取视频帧'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.72,
    );
  });
};

const getRangeIndexes = (
  entry: FramePreviewCacheEntry,
  range: FramePreviewRange,
) => {
  if (!entry.frameWidth || entry.totalFrames <= 0) return [];
  const firstIndex = Math.max(
    0,
    Math.floor(
      (range.rangeStart * entry.pixelsPerSecond) / entry.frameWidth,
    ),
  );
  const lastIndex = Math.min(
    entry.totalFrames - 1,
    Math.ceil((range.rangeEnd * entry.pixelsPerSecond) / entry.frameWidth) - 1,
  );
  if (lastIndex < firstIndex) return [];
  return Array.from(
    { length: lastIndex - firstIndex + 1 },
    (_, index) => firstIndex + index,
  );
};

export const createFramePreviewCache = (
  getObjectUrl: (src: string) => Promise<string>,
  isDisposed: () => boolean,
  acceleration: FramePreviewAcceleration | null = null,
) => {
  const entries = new Map<string, FramePreviewCacheEntry>();
  const framesBySource = new Map<string, CachedFramePreview[]>();
  const generatedUrls = new Set<string>();
  let queue = Promise.resolve();

  const findCachedUrl = (
    src: string,
    time: number,
    reuseTolerance: number,
  ) => {
    const frames = framesBySource.get(src);
    if (!frames) return null;
    const maxDistance = Math.max(
      reuseTolerance,
      FRAME_PREVIEW_TIME_EPSILON,
    );
    let nearest: CachedFramePreview | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const frame of frames) {
      const distance = Math.abs(frame.time - time);
      if (distance < maxDistance && distance < nearestDistance) {
        nearest = frame;
        nearestDistance = distance;
      }
    }
    return nearest?.url ?? null;
  };

  const cacheFrame = (src: string, time: number, url: string) => {
    const frames = framesBySource.get(src) ?? [];
    frames.push({ time, url });
    frames.sort((left, right) => left.time - right.time);
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

  const getFrameTime = (
    entry: FramePreviewCacheEntry,
    index: number,
    mediaDuration: number,
  ) => {
    if (!entry.frameWidth) return 0;
    const frameDuration = entry.frameWidth / entry.pixelsPerSecond;
    return Math.min(
      Math.max(0, mediaDuration - 0.01),
      (index + 0.5) * frameDuration,
    );
  };

  const initializeEntry = (
    entry: FramePreviewCacheEntry,
    frameWidth: number,
    mediaDuration: number,
  ) => {
    entry.frameWidth = Math.max(1, Math.round(frameWidth));
    entry.totalFrames = Math.ceil(
      (entry.sourceDuration * entry.pixelsPerSecond) / entry.frameWidth,
    );
    emit(entry);

    const frameDuration = entry.frameWidth / entry.pixelsPerSecond;
    for (const index of getRequestedIndexes(entry)) {
      if (entry.urls.has(index)) continue;
      const cachedUrl = findCachedUrl(
        entry.src,
        getFrameTime(entry, index, mediaDuration),
        frameDuration / 2,
      );
      if (cachedUrl) entry.urls.set(index, cachedUrl);
    }
    emit(entry);
  };

  const createAcceleratedFrames = async (
    entry: FramePreviewCacheEntry,
    signal: AbortSignal,
  ) => {
    if (!acceleration) throw new Error('WebCodecs 预览帧后端不可用');
    const [blob, dimensions] = await Promise.all([
      acceleration.getBlob(entry.src),
      acceleration.getDimensions(entry.src),
    ]);
    throwIfAborted(signal);
    if (!dimensions || dimensions.height <= 0 || dimensions.width <= 0) {
      throw new Error('无法读取 WebCodecs 预览帧尺寸');
    }

    initializeEntry(
      entry,
      FRAME_PREVIEW_CAPTURE_HEIGHT *
        (dimensions.width / dimensions.height),
      entry.sourceDuration,
    );
    const missingFrames = getRequestedIndexes(entry)
      .filter((index) => !entry.urls.has(index))
      .map((index) => ({
        index,
        time: getFrameTime(entry, index, entry.sourceDuration),
      }));

    await acceleration.extractor.extract(
      blob,
      FRAME_PREVIEW_CAPTURE_HEIGHT,
      missingFrames,
      signal,
      (index, frameBlob) => {
        if (
          signal.aborted ||
          entry.urls.has(index) ||
          !getRequestedIndexes(entry).includes(index)
        ) {
          return;
        }
        const url = URL.createObjectURL(frameBlob);
        generatedUrls.add(url);
        entry.urls.set(index, url);
        cacheFrame(
          entry.src,
          getFrameTime(entry, index, entry.sourceDuration),
          url,
        );
        emit(entry);
      },
    );
  };

  const createMediaElementFrames = async (
    entry: FramePreviewCacheEntry,
    signal: AbortSignal,
  ) => {
    throwIfAborted(signal);
    if (isDisposed()) {
      throw new DOMException('媒体运行时已销毁', 'AbortError');
    }
    if (entry.subscribers.size === 0) return;
    const objectUrl = await getObjectUrl(entry.src);
    throwIfAborted(signal);
    if (entry.subscribers.size === 0) return;
    const video = document.createElement('video');
    try {
      await waitForVideoMetadata(video, objectUrl, signal);
      throwIfAborted(signal);
      if (entry.subscribers.size === 0) return;
      initializeEntry(
        entry,
        FRAME_PREVIEW_CAPTURE_HEIGHT *
          (video.videoWidth / video.videoHeight),
        video.duration,
      );

      const missingIndexes = getProgressiveFramePreviewIndexes(
        getRequestedIndexes(entry).filter((index) => !entry.urls.has(index)),
      );
      for (const index of missingIndexes) {
        throwIfAborted(signal);
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        if (
          entry.subscribers.size === 0 ||
          !getRequestedIndexes(entry).includes(index)
        ) {
          continue;
        }
        const time = getFrameTime(entry, index, video.duration);
        await seekVideo(video, time, signal);
        throwIfAborted(signal);
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        const frameWidth = entry.frameWidth;
        if (!frameWidth) throw new Error('无法读取视频帧尺寸');
        const url = await captureVideoFrame(video, frameWidth);
        if (isDisposed() || signal.aborted) {
          URL.revokeObjectURL(url);
          throw createAbortError();
        }
        generatedUrls.add(url);
        entry.urls.set(index, url);
        cacheFrame(entry.src, time, url);
        emit(entry);
      }
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  const createFrames = async (
    entry: FramePreviewCacheEntry,
    signal: AbortSignal,
  ) => {
    if (acceleration) {
      try {
        await createAcceleratedFrames(entry, signal);
        return;
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }
    await createMediaElementFrames(entry, signal);
  };

  const schedule = (entry: FramePreviewCacheEntry) => {
    if (entry.task || !hasMissingFrames(entry)) return;
    const controller = new AbortController();
    entry.controller = controller;
    entry.task = enqueue(() => createFrames(entry, controller.signal))
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
      sourceDuration: request.sourceDuration,
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
      if (!canGenerateFramePreviews() || isDisposed()) {
        subscriber(EMPTY_FRAME_PREVIEW_STRIP);
        return () => undefined;
      }
      const request = normalizeRequest(rawRequest);
      if (!request.src || request.rangeEnd <= request.rangeStart) {
        subscriber(EMPTY_FRAME_PREVIEW_STRIP);
        return () => undefined;
      }
      const entry = getEntry(request);
      entry.subscribers.set(subscriber, {
        rangeEnd: request.rangeEnd,
        rangeStart: request.rangeStart,
      });
      subscriber(
        getSnapshot(entry, {
          rangeEnd: request.rangeEnd,
          rangeStart: request.rangeStart,
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
