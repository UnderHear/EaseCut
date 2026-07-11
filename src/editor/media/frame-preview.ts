import type { VideoTimelineClip } from '../types';

export const FRAME_PREVIEW_WIDTH = 96;
export const FRAME_PREVIEW_HEIGHT = 48;

export type FramePreviewUrl = string | null;
export type FramePreviewSubscriber = (urls: FramePreviewUrl[]) => void;

type CachedFramePreview = {
  time: number;
  url: string;
};

type FramePreviewTiming = {
  frameTimes: number[];
  reuseTolerance: number;
};

type FramePreviewCacheEntry = {
  frameTimes: number[];
  promise: Promise<string[]>;
  reuseTolerance: number;
  src: string;
  subscribers: Set<FramePreviewSubscriber>;
  urls: FramePreviewUrl[];
};

const FRAME_PREVIEW_TIME_EPSILON = 0.001;

export const canGenerateFramePreviews = () =>
  typeof document !== 'undefined' &&
  (typeof navigator === 'undefined' ||
    !navigator.userAgent.toLowerCase().includes('jsdom'));

const getFramePreviewCacheKey = (
  clip: Pick<VideoTimelineClip, 'src' | 'trimEnd' | 'trimStart'>,
  frameCount: number,
) => [clip.src, clip.trimStart, clip.trimEnd, frameCount].join('\n');

const getFramePreviewTiming = (
  clip: Pick<VideoTimelineClip, 'trimEnd' | 'trimStart'>,
  frameCount: number,
  sourceDuration: number,
): FramePreviewTiming => {
  if (frameCount <= 0) {
    return { frameTimes: [], reuseTolerance: 0 };
  }

  const safeSourceDuration =
    Number.isFinite(sourceDuration) && sourceDuration > 0
      ? sourceDuration
      : clip.trimEnd;
  const start = Math.min(Math.max(0, clip.trimStart), safeSourceDuration);
  const end = Math.min(Math.max(start, clip.trimEnd), safeSourceDuration);
  const visibleDuration = end - start;
  if (visibleDuration <= 0) {
    return { frameTimes: [], reuseTolerance: 0 };
  }

  return {
    frameTimes: Array.from({ length: frameCount }, (_, index) =>
      Math.max(
        start,
        Math.min(
          end - 0.01,
          start + visibleDuration * ((index + 0.5) / frameCount),
        ),
      ),
    ),
    reuseTolerance: visibleDuration / frameCount / 2,
  };
};

const getProgressiveFramePreviewIndexes = (frameCount: number) => {
  const indexes: number[] = [];
  const seen = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= frameCount || seen.has(index)) return;
    seen.add(index);
    indexes.push(index);
  };
  const addMidpoints = (start: number, end: number) => {
    if (end - start <= 1) return;
    const middle = Math.floor((start + end) / 2);
    addIndex(middle);
    addMidpoints(start, middle);
    addMidpoints(middle, end);
  };

  addIndex(0);
  addIndex(frameCount - 1);
  addMidpoints(0, frameCount - 1);
  for (let index = 0; index < frameCount; index += 1) {
    addIndex(index);
  }
  return indexes;
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

const captureVideoFrame = (video: HTMLVideoElement) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || !video.videoWidth || !video.videoHeight) {
    throw new Error('无法读取视频帧');
  }

  canvas.width = FRAME_PREVIEW_WIDTH;
  canvas.height = FRAME_PREVIEW_HEIGHT;
  const scale = Math.max(
    canvas.width / video.videoWidth,
    canvas.height / video.videoHeight,
  );
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(
    video,
    (canvas.width - drawWidth) / 2,
    (canvas.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return canvas.toDataURL('image/jpeg', 0.72);
};

export const createFramePreviewCache = (
  getObjectUrl: (src: string) => Promise<string>,
  isDisposed: () => boolean,
) => {
  const entries = new Map<string, FramePreviewCacheEntry>();
  const framesBySource = new Map<string, CachedFramePreview[]>();
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

  const applyCachedUrls = (entry: FramePreviewCacheEntry) => {
    let changed = false;
    entry.frameTimes.forEach((time, index) => {
      if (entry.urls[index]) return;
      const url = findCachedUrl(entry.src, time, entry.reuseTolerance);
      if (!url) return;
      entry.urls[index] = url;
      changed = true;
    });
    return changed;
  };

  const emit = (entry: FramePreviewCacheEntry) => {
    const urls = [...entry.urls];
    entry.subscribers.forEach((subscriber) => subscriber(urls));
  };

  const cacheFrame = (src: string, time: number, url: string) => {
    const frames = framesBySource.get(src) ?? [];
    const existing = frames.find(
      (frame) => Math.abs(frame.time - time) <= FRAME_PREVIEW_TIME_EPSILON,
    );
    if (existing) {
      existing.url = url;
    } else {
      frames.push({ time, url });
      frames.sort((left, right) => left.time - right.time);
      framesBySource.set(src, frames);
    }
    entries.forEach((entry) => {
      if (entry.src === src && applyCachedUrls(entry)) emit(entry);
    });
  };

  const enqueue = <T,>(task: () => Promise<T>) => {
    const queuedTask = queue.then(task, task);
    queue = queuedTask.then(
      () => undefined,
      () => undefined,
    );
    return queuedTask;
  };

  const createUrls = async (
    clip: Pick<VideoTimelineClip, 'src' | 'trimEnd' | 'trimStart'>,
    frameCount: number,
    entry: FramePreviewCacheEntry,
  ) => {
    if (isDisposed()) {
      throw new DOMException('媒体运行时已销毁', 'AbortError');
    }
    const objectUrl = await getObjectUrl(clip.src);
    const video = document.createElement('video');
    try {
      await waitForVideoMetadata(video, objectUrl);
      const sourceDuration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : clip.trimEnd;
      const timing = getFramePreviewTiming(clip, frameCount, sourceDuration);
      entry.frameTimes = timing.frameTimes;
      entry.reuseTolerance = timing.reuseTolerance;
      if (applyCachedUrls(entry)) emit(entry);
      if (timing.frameTimes.length === 0) return [];

      const urls = new Array<string>(frameCount);
      for (const index of getProgressiveFramePreviewIndexes(frameCount)) {
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        const time = timing.frameTimes[index];
        const cachedUrl = findCachedUrl(
          clip.src,
          time,
          timing.reuseTolerance,
        );
        if (cachedUrl) {
          urls[index] = cachedUrl;
          entry.urls[index] = cachedUrl;
          emit(entry);
          continue;
        }
        await seekVideo(video, time);
        if (isDisposed()) {
          throw new DOMException('媒体运行时已销毁', 'AbortError');
        }
        const url = captureVideoFrame(video);
        urls[index] = url;
        entry.urls[index] = url;
        cacheFrame(clip.src, time, url);
        emit(entry);
      }
      return urls;
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  const getEntry = (
    clip: Pick<VideoTimelineClip, 'src' | 'trimEnd' | 'trimStart'>,
    frameCount: number,
  ) => {
    const safeFrameCount = Math.max(0, Math.floor(frameCount));
    const key = getFramePreviewCacheKey(clip, safeFrameCount);
    const cachedEntry = entries.get(key);
    if (cachedEntry) return cachedEntry;

    const estimatedTiming = getFramePreviewTiming(
      clip,
      safeFrameCount,
      clip.trimEnd,
    );
    const entry: FramePreviewCacheEntry = {
      frameTimes: estimatedTiming.frameTimes,
      promise: Promise.resolve([]),
      reuseTolerance: estimatedTiming.reuseTolerance,
      src: clip.src,
      subscribers: new Set(),
      urls: new Array<FramePreviewUrl>(safeFrameCount).fill(null),
    };
    applyCachedUrls(entry);
    entry.promise = enqueue(() => createUrls(clip, safeFrameCount, entry))
      .then((urls) => {
        if (urls.length === safeFrameCount) entry.urls = [...urls];
        emit(entry);
        entry.subscribers.clear();
        return urls;
      })
      .catch((error: unknown) => {
        entry.subscribers.clear();
        entries.delete(key);
        throw error;
      });
    entries.set(key, entry);
    return entry;
  };

  return {
    clear: () => {
      entries.forEach((entry) => entry.subscribers.clear());
      entries.clear();
      framesBySource.clear();
    },
    getUrls: (
      clip: Pick<VideoTimelineClip, 'src' | 'trimEnd' | 'trimStart'>,
      frameCount: number,
      subscriber?: FramePreviewSubscriber,
    ) => {
      if (!canGenerateFramePreviews()) return Promise.resolve([]);
      if (isDisposed()) {
        return Promise.reject(
          new DOMException('媒体运行时已销毁', 'AbortError'),
        );
      }
      const entry = getEntry(clip, frameCount);
      if (subscriber) {
        entry.subscribers.add(subscriber);
        subscriber([...entry.urls]);
      }
      return entry.promise;
    },
    unsubscribe: (
      clip: Pick<VideoTimelineClip, 'src' | 'trimEnd' | 'trimStart'>,
      frameCount: number,
      subscriber: FramePreviewSubscriber,
    ) => {
      const key = getFramePreviewCacheKey(
        clip,
        Math.max(0, Math.floor(frameCount)),
      );
      entries.get(key)?.subscribers.delete(subscriber);
    },
  };
};
