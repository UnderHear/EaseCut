/* eslint-disable react-refresh/only-export-components -- Provider 与实例 Hooks 共享同一个私有 Context。 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  VideoTimelineClip,
  VideoTimelineMediaLoader,
  VideoTimelineMediaMetadata,
  VideoTimelineSource,
} from '../types';
import { createAudioWaveformCache, isAbortError } from './audio-waveform';
import {
  createFramePreviewCache,
  type FramePreviewSubscriber,
  type FramePreviewUrl,
} from './frame-preview';

type MediaInput = string | VideoTimelineSource;
type FramePreviewClip = Pick<
  VideoTimelineClip,
  'src' | 'trimEnd' | 'trimStart'
>;

type BlobCacheEntry =
  | {
      controller: AbortController;
      promise: Promise<Blob>;
      status: 'pending';
    }
  | {
      blob: Blob;
      objectUrl?: string;
      status: 'ready';
    };

type MetadataCacheEntry =
  | {
      controller: AbortController;
      promise: Promise<VideoTimelineMediaMetadata | null>;
      status: 'pending';
    }
  | {
      metadata: VideoTimelineMediaMetadata | null;
      status: 'ready';
    };

const createAbortError = () =>
  new DOMException('媒体运行时已销毁', 'AbortError');

const hasPositiveNumber = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const getSourceMetadata = (
  source: VideoTimelineSource | undefined,
): VideoTimelineMediaMetadata | null => {
  if (!source) return null;
  const metadata: VideoTimelineMediaMetadata = {};
  if (hasPositiveNumber(source.durationSeconds)) {
    metadata.durationSeconds = source.durationSeconds;
  }
  if (hasPositiveNumber(source.height)) metadata.height = source.height;
  if (hasPositiveNumber(source.width)) metadata.width = source.width;
  return Object.keys(metadata).length > 0 ? metadata : null;
};

const mergeMetadata = (
  base: VideoTimelineMediaMetadata | null,
  next: VideoTimelineMediaMetadata | null,
) => {
  if (!base && !next) return null;
  const merged = { ...(base ?? {}), ...(next ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
};

const isMetadataComplete = (
  metadata: VideoTimelineMediaMetadata | null,
  source: VideoTimelineSource | undefined,
) =>
  Boolean(
    metadata &&
      hasPositiveNumber(metadata.durationSeconds) &&
      (source?.type === 'audio' ||
        (hasPositiveNumber(metadata.height) &&
          hasPositiveNumber(metadata.width))),
  );

const canReadMediaMetadata = () =>
  typeof document !== 'undefined' &&
  (typeof navigator === 'undefined' ||
    !navigator.userAgent.toLowerCase().includes('jsdom'));

const defaultMediaLoader: VideoTimelineMediaLoader = {
  async loadBlob(url, { signal }) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`媒体加载失败 (${response.status})`);
    }
    return response.blob();
  },
};

const readBrowserMetadata = (
  objectUrl: string,
  source: VideoTimelineSource | undefined,
  signal: AbortSignal,
) => {
  if (!canReadMediaMetadata()) {
    return Promise.resolve<VideoTimelineMediaMetadata | null>(null);
  }

  return new Promise<VideoTimelineMediaMetadata>((resolve, reject) => {
    const media = document.createElement(
      source?.type === 'audio' ? 'audio' : 'video',
    );
    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
      media.onloadedmetadata = null;
      media.onerror = null;
    };
    const release = () => {
      cleanup();
      media.pause();
      media.removeAttribute('src');
      media.load();
    };
    const handleAbort = () => {
      release();
      reject(createAbortError());
    };

    media.onloadedmetadata = () => {
      const metadata: VideoTimelineMediaMetadata = {};
      if (hasPositiveNumber(media.duration)) {
        metadata.durationSeconds = media.duration;
      }
      if (media instanceof HTMLVideoElement) {
        if (hasPositiveNumber(media.videoHeight)) {
          metadata.height = media.videoHeight;
        }
        if (hasPositiveNumber(media.videoWidth)) {
          metadata.width = media.videoWidth;
        }
      }
      release();
      resolve(metadata);
    };
    media.onerror = () => {
      release();
      reject(new Error('无法读取媒体元数据'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    media.preload = 'metadata';
    if (media instanceof HTMLVideoElement) {
      media.muted = true;
      media.playsInline = true;
    }
    media.src = objectUrl;
    media.load();
  });
};

export type MediaRuntime = {
  dispose(): void;
  getAudioWaveformSamples(
    input: MediaInput,
    sampleCount?: number,
  ): Promise<number[]>;
  getBlob(input: MediaInput): Promise<Blob>;
  getFramePreviewUrls(
    clip: FramePreviewClip,
    frameCount: number,
    subscriber?: FramePreviewSubscriber,
  ): Promise<string[]>;
  getMetadata(
    input: MediaInput,
  ): Promise<VideoTimelineMediaMetadata | null>;
  getObjectUrl(input: MediaInput): Promise<string>;
  isDisposed(): boolean;
  setSources(sources: VideoTimelineSource[]): void;
  unsubscribeFramePreviews(
    clip: FramePreviewClip,
    frameCount: number,
    subscriber: FramePreviewSubscriber,
  ): void;
};

export const createMediaRuntime = (
  mediaLoader: VideoTimelineMediaLoader = defaultMediaLoader,
  initialSources: VideoTimelineSource[] = [],
): MediaRuntime => {
  const blobs = new Map<string, BlobCacheEntry>();
  const metadataEntries = new Map<string, MetadataCacheEntry>();
  const sourcesBySrc = new Map<string, VideoTimelineSource>();
  let disposed = false;

  const setSources = (sources: VideoTimelineSource[]) => {
    if (disposed) return;
    for (const source of sources) {
      sourcesBySrc.set(source.src, source);
      if (source.waveformSrc) sourcesBySrc.set(source.waveformSrc, source);
    }
  };
  setSources(initialSources);

  const resolveInput = (input: MediaInput) => {
    if (typeof input === 'string') {
      return { source: sourcesBySrc.get(input), src: input };
    }
    sourcesBySrc.set(input.src, input);
    if (input.waveformSrc) sourcesBySrc.set(input.waveformSrc, input);
    return { source: input, src: input.src };
  };

  const getBlob = (input: MediaInput): Promise<Blob> => {
    if (disposed) return Promise.reject(createAbortError());
    const { source, src } = resolveInput(input);
    const cached = blobs.get(src);
    if (cached?.status === 'ready') return Promise.resolve(cached.blob);
    if (cached?.status === 'pending') return cached.promise;

    const controller = new AbortController();
    const entry: Extract<BlobCacheEntry, { status: 'pending' }> = {
      controller,
      promise: Promise.resolve(new Blob()),
      status: 'pending',
    };
    entry.promise = Promise.resolve()
      .then(() =>
        mediaLoader.loadBlob(src, {
          signal: controller.signal,
          ...(source ? { source } : {}),
        }),
      )
      .then((blob) => {
        if (disposed || controller.signal.aborted) throw createAbortError();
        blobs.set(src, { blob, status: 'ready' });
        return blob;
      })
      .catch((error: unknown) => {
        if (blobs.get(src) === entry) blobs.delete(src);
        throw error;
      });
    blobs.set(src, entry);
    return entry.promise;
  };

  const getObjectUrl = async (input: MediaInput) => {
    const { src } = resolveInput(input);
    const blob = await getBlob(input);
    if (disposed) throw createAbortError();
    const entry = blobs.get(src);
    if (!entry || entry.status !== 'ready') throw new Error('媒体加载失败');
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(blob);
    return entry.objectUrl;
  };

  const getMetadata = (
    input: MediaInput,
  ): Promise<VideoTimelineMediaMetadata | null> => {
    if (disposed) return Promise.reject(createAbortError());
    const { source, src } = resolveInput(input);
    const cached = metadataEntries.get(src);
    if (cached?.status === 'ready') return Promise.resolve(cached.metadata);
    if (cached?.status === 'pending') return cached.promise;

    const knownMetadata = getSourceMetadata(source);
    if (isMetadataComplete(knownMetadata, source)) {
      metadataEntries.set(src, { metadata: knownMetadata, status: 'ready' });
      return Promise.resolve(knownMetadata);
    }

    const controller = new AbortController();
    const entry: Extract<MetadataCacheEntry, { status: 'pending' }> = {
      controller,
      promise: Promise.resolve(null),
      status: 'pending',
    };
    entry.promise = Promise.resolve()
      .then(async () => {
        const loaded =
          source && mediaLoader.loadMetadata
            ? await mediaLoader.loadMetadata(source, {
                signal: controller.signal,
              })
            : null;
        const merged = mergeMetadata(knownMetadata, loaded);
        if (isMetadataComplete(merged, source)) return merged;
        const browserMetadata = await readBrowserMetadata(
          await getObjectUrl(input),
          source,
          controller.signal,
        );
        return mergeMetadata(merged, browserMetadata);
      })
      .then((metadata) => {
        if (disposed || controller.signal.aborted) throw createAbortError();
        metadataEntries.set(src, { metadata, status: 'ready' });
        return metadata;
      })
      .catch((error: unknown) => {
        if (metadataEntries.get(src) === entry) metadataEntries.delete(src);
        throw error;
      });
    metadataEntries.set(src, entry);
    return entry.promise;
  };

  const waveformCache = createAudioWaveformCache(
    (src) => getBlob(src),
    () => disposed,
  );
  const framePreviewCache = createFramePreviewCache(
    (src) => getObjectUrl(src),
    () => disposed,
  );

  const runtime: MediaRuntime = {
    dispose() {
      if (disposed) return;
      disposed = true;
      framePreviewCache.clear();
      waveformCache.clear();
      metadataEntries.forEach((entry) => {
        if (entry.status === 'pending') entry.controller.abort();
      });
      metadataEntries.clear();
      blobs.forEach((entry) => {
        if (entry.status === 'pending') entry.controller.abort();
        if (entry.status === 'ready' && entry.objectUrl) {
          URL.revokeObjectURL(entry.objectUrl);
        }
      });
      blobs.clear();
      sourcesBySrc.clear();
    },
    getAudioWaveformSamples(input, sampleCount) {
      const { src } = resolveInput(input);
      return waveformCache.getSamples(src, sampleCount);
    },
    getBlob,
    getFramePreviewUrls(clip, frameCount, subscriber) {
      return framePreviewCache.getUrls(clip, frameCount, subscriber);
    },
    getMetadata,
    getObjectUrl,
    isDisposed: () => disposed,
    setSources,
    unsubscribeFramePreviews(clip, frameCount, subscriber) {
      framePreviewCache.unsubscribe(clip, frameCount, subscriber);
    },
  };
  return runtime;
};

const MediaRuntimeContext = createContext<MediaRuntime | null>(null);

export type MediaRuntimeProviderProps = {
  children: ReactNode;
  mediaLoader?: VideoTimelineMediaLoader;
  sources: VideoTimelineSource[];
};

export function MediaRuntimeProvider({
  children,
  mediaLoader,
  sources,
}: MediaRuntimeProviderProps) {
  const runtime = useMemo(
    () => createMediaRuntime(mediaLoader, sources),
    // sources 由下方 effect 增量同步，避免素材列表更新时清空媒体缓存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaLoader],
  );
  const mountedRuntimeRef = useRef<MediaRuntime | null>(null);

  useEffect(() => {
    runtime.setSources(sources);
  }, [runtime, sources]);

  useEffect(() => {
    mountedRuntimeRef.current = runtime;
    return () => {
      if (mountedRuntimeRef.current === runtime) {
        mountedRuntimeRef.current = null;
      }
      void Promise.resolve().then(() => {
        if (mountedRuntimeRef.current !== runtime) {
          runtime.dispose();
        }
      });
    };
  }, [runtime]);

  return (
    <MediaRuntimeContext.Provider value={runtime}>
      {children}
    </MediaRuntimeContext.Provider>
  );
}

export const useMediaRuntime = () => {
  const runtime = useContext(MediaRuntimeContext);
  if (!runtime) {
    throw new Error('useMediaRuntime 必须在 MediaRuntimeProvider 内使用');
  }
  return runtime;
};

export const useMediaObjectUrl = (input: MediaInput, enabled = true) => {
  const runtime = useMediaRuntime();
  const src = typeof input === 'string' ? input : input.src;
  const [result, setResult] = useState<{ src: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled || !src) return undefined;
    let cancelled = false;
    void runtime
      .getObjectUrl(input)
      .then((url) => {
        if (!cancelled) setResult({ src, url });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, input, runtime, src]);

  return enabled && result?.src === src ? result.url : null;
};

export const useMediaMetadata = (input: MediaInput, enabled = true) => {
  const runtime = useMediaRuntime();
  const src = typeof input === 'string' ? input : input.src;
  const [result, setResult] = useState<{
    metadata: VideoTimelineMediaMetadata | null;
    src: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !src) return undefined;
    let cancelled = false;
    void runtime
      .getMetadata(input)
      .then((metadata) => {
        if (!cancelled) setResult({ metadata, src });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, input, runtime, src]);

  return enabled && result?.src === src ? result.metadata : null;
};

export const useAudioWaveformSamples = (
  input: MediaInput,
  enabled = true,
  sampleCount?: number,
) => {
  const runtime = useMediaRuntime();
  const src = typeof input === 'string' ? input : input.src;
  const [result, setResult] = useState<{
    samples: number[];
    src: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !src) return undefined;
    let cancelled = false;
    const load = (retryAfterAbort: boolean) => {
      void runtime
        .getAudioWaveformSamples(input, sampleCount)
        .then((samples) => {
          if (!cancelled) setResult({ samples, src });
        })
        .catch((error: unknown) => {
          if (!cancelled && retryAfterAbort && isAbortError(error)) {
            load(false);
          }
        });
    };
    load(true);
    return () => {
      cancelled = true;
    };
  }, [enabled, input, runtime, sampleCount, src]);

  return enabled && result?.src === src ? result.samples : [];
};

export const useFramePreviewUrls = (
  clip: FramePreviewClip,
  frameCount: number,
  enabled = true,
) => {
  const runtime = useMediaRuntime();
  const key = `${clip.src}\n${clip.trimStart}\n${clip.trimEnd}\n${frameCount}`;
  const [result, setResult] = useState<{
    key: string;
    urls: FramePreviewUrl[];
  } | null>(null);

  useEffect(() => {
    if (!enabled || !clip.src || frameCount <= 0) return undefined;
    let cancelled = false;
    const requestClip: FramePreviewClip = {
      src: clip.src,
      trimEnd: clip.trimEnd,
      trimStart: clip.trimStart,
    };
    const update = (urls: FramePreviewUrl[]) => {
      if (!cancelled) setResult({ key, urls });
    };
    void runtime
      .getFramePreviewUrls(requestClip, frameCount, update)
      .then((urls) => update(urls))
      .catch(() => update([]));
    return () => {
      cancelled = true;
      runtime.unsubscribeFramePreviews(requestClip, frameCount, update);
    };
  }, [
    clip.src,
    clip.trimEnd,
    clip.trimStart,
    enabled,
    frameCount,
    key,
    runtime,
  ]);

  return enabled && result?.key === key ? result.urls : [];
};

export const useGeneratedFramePreviewUrls = useFramePreviewUrls;
