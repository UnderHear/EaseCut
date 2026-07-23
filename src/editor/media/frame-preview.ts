export const FRAME_PREVIEW_CHUNK_DURATION_SECONDS = 5;

const FRAME_PREVIEW_CAPTURE_HEIGHT = 48;

export type FramePreviewFrame = {
  index: number;
  url: string;
};

export type FramePreviewStrip = {
  frameWidth: number;
  frames: FramePreviewFrame[];
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

const FRAME_PREVIEW_TIME_EPSILON = 0.001;

const EMPTY_FRAME_PREVIEW_STRIP: FramePreviewStrip = {
  frameWidth: 0,
  frames: [],
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

const waitForVideoMetadata = (video: HTMLVideoElement, src: string) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };
    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频帧'));
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = src;
    video.load();
  });

const seekVideo = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onseeked = null;
      video.onerror = null;
    };
    video.onseeked = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频帧'));
    };
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

  const createFrames = async (entry: FramePreviewCacheEntry) => {
    if (isDisposed()) {
      throw new DOMException('媒体运行时已销毁', 'AbortError');
    }
    const objectUrl = await getObjectUrl(entry.src);
    const video = document.createElement('video');
    try {
      await waitForVideoMetadata(video, objectUrl);
      entry.frameWidth = Math.max(
        1,
        Math.round(
          FRAME_PREVIEW_CAPTURE_HEIGHT *
            (video.videoWidth / video.videoHeight),
        ),
      );
      entry.totalFrames = Math.ceil(
        (entry.sourceDuration * entry.pixelsPerSecond) / entry.frameWidth,
      );
      emit(entry);

      const indexes = getRequestedIndexes(entry);
      const frameDuration = entry.frameWidth / entry.pixelsPerSecond;
      for (const index of indexes) {
        if (entry.urls.has(index)) continue;
        const time = Math.min(
          Math.max(0, video.duration - 0.01),
          (index + 0.5) * frameDuration,
        );
        const cachedUrl = findCachedUrl(
          entry.src,
          time,
          frameDuration / 2,
        );
        if (cachedUrl) entry.urls.set(index, cachedUrl);
      }
      emit(entry);

      const missingIndexes = getProgressiveFramePreviewIndexes(
        getRequestedIndexes(entry).filter((index) => !entry.urls.has(index)),
      );
      for (const index of missingIndexes) {
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        const frameDuration = entry.frameWidth / entry.pixelsPerSecond;
        const time = Math.min(
          Math.max(0, video.duration - 0.01),
          (index + 0.5) * frameDuration,
        );
        const cachedUrl = findCachedUrl(
          entry.src,
          time,
          frameDuration / 2,
        );
        if (cachedUrl) {
          entry.urls.set(index, cachedUrl);
          emit(entry);
          continue;
        }
        await seekVideo(video, time);
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        const url = await captureVideoFrame(video, entry.frameWidth);
        if (isDisposed()) {
          URL.revokeObjectURL(url);
          throw new DOMException('媒体运行时已销毁', 'AbortError');
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

  const schedule = (entry: FramePreviewCacheEntry) => {
    if (entry.task || !hasMissingFrames(entry)) return;
    entry.task = enqueue(() => createFrames(entry))
      .catch(() => {
        if (entries.get(entry.key) === entry) entries.delete(entry.key);
        entry.subscribers.clear();
      })
      .finally(() => {
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
      entries.forEach((entry) => entry.subscribers.clear());
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
      };
    },
  };
};
