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
  VideoTimelineMediaLoader,
  VideoTimelineMediaMetadata,
  VideoTimelineSource,
} from '../types';
import { isValidTimeUs, secondsToMicroseconds } from '../core/time';
import { createAudioWaveformCache, isAbortError } from './audio-waveform';
import {
  createFramePreviewCache,
  type FramePreviewRequest,
  type FramePreviewStrip,
  type FramePreviewSubscriber,
} from './frame-preview';
import { createMediabunnyAudioWaveformExtractor } from './mediabunny-audio-waveform';
import {
  createTextLayoutRuntime,
  type TextLayoutRequest,
} from './text-layout-runtime';

type MediaInput = string | VideoTimelineSource;

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

const hasPositiveNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const hasPositiveTimeUs = (value: number | undefined): value is number =>
  typeof value === 'number' && isValidTimeUs(value) && value > 0;

const getSourceMetadata = (
  source: VideoTimelineSource | undefined,
): VideoTimelineMediaMetadata | null => {
  if (!source) return null;
  const metadata: VideoTimelineMediaMetadata = {};
  if (hasPositiveTimeUs(source.durationUs)) {
    metadata.durationUs = source.durationUs;
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

const validateLoadedMetadata = (
  metadata: VideoTimelineMediaMetadata | null,
) => {
  if (!metadata) return null;
  if (
    metadata.durationUs !== undefined &&
    !hasPositiveTimeUs(metadata.durationUs)
  ) {
    throw new RangeError('媒体加载器返回的 durationUs 必须是正安全整数');
  }
  if (
    metadata.height !== undefined &&
    !hasPositiveNumber(metadata.height)
  ) {
    throw new RangeError('媒体加载器返回的 height 必须是正有限数字');
  }
  if (
    metadata.width !== undefined &&
    !hasPositiveNumber(metadata.width)
  ) {
    throw new RangeError('媒体加载器返回的 width 必须是正有限数字');
  }
  return metadata;
};

const isMetadataComplete = (
  metadata: VideoTimelineMediaMetadata | null,
  source: VideoTimelineSource | undefined,
) =>
  Boolean(
    metadata &&
      hasPositiveTimeUs(metadata.durationUs) &&
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
        metadata.durationUs = secondsToMicroseconds(media.duration);
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
  getMetadata(
    input: MediaInput,
  ): Promise<VideoTimelineMediaMetadata | null>;
  getObjectUrl(input: MediaInput): Promise<string>;
  isDisposed(): boolean;
  measureTextLayout(
    request: TextLayoutRequest,
    signal?: AbortSignal,
  ): Promise<{ height: number; width: number }>;
  setSources(sources: VideoTimelineSource[]): void;
  subscribeFramePreviews(
    request: FramePreviewRequest,
    subscriber: FramePreviewSubscriber,
  ): () => void;
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
        const loaded = validateLoadedMetadata(
          source && mediaLoader.loadMetadata
            ? await mediaLoader.loadMetadata(source, {
                signal: controller.signal,
              })
            : null,
        );
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

  const audioWaveformExtractor = createMediabunnyAudioWaveformExtractor();
  const waveformCache = createAudioWaveformCache(
    (src) => getBlob(src),
    () => disposed,
    audioWaveformExtractor,
  );
  const framePreviewCache = createFramePreviewCache(
    (src) => getBlob(src),
    () => disposed,
  );
  const textLayoutRuntime = createTextLayoutRuntime();

  const runtime: MediaRuntime = {
    dispose() {
      if (disposed) return;
      disposed = true;
      framePreviewCache.clear();
      waveformCache.clear();
      audioWaveformExtractor?.dispose();
      textLayoutRuntime.dispose();
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
    getMetadata,
    getObjectUrl,
    isDisposed: () => disposed,
    measureTextLayout: (request, signal) =>
      textLayoutRuntime.measure(request, signal),
    setSources,
    subscribeFramePreviews(request, subscriber) {
      return framePreviewCache.subscribe(request, subscriber);
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

export const useFramePreviewStrip = (request: FramePreviewRequest | null) => {
  const runtime = useMediaRuntime();
  const pixelsPerSecond = request?.pixelsPerSecond ?? 0;
  const rangeEndUs = request?.rangeEndUs ?? 0;
  const rangeStartUs = request?.rangeStartUs ?? 0;
  const sourceDurationUs = request?.sourceDurationUs ?? 0;
  const src = request?.src ?? '';
  const key = src
    ? [
        src,
        sourceDurationUs,
        pixelsPerSecond,
        rangeStartUs,
        rangeEndUs,
      ].join('\n')
    : '';
  const sourceKey = src ? [src, sourceDurationUs].join('\n') : '';
  const [result, setResult] = useState<{
    sourceKey: string;
    strip: FramePreviewStrip;
  } | null>(null);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const update = (strip: FramePreviewStrip) => {
      if (cancelled) return;
      setResult((current) => {
        if (
          strip.frames.length === 0 &&
          current?.sourceKey === sourceKey &&
          current.strip.frames.length > 0
        ) {
          return current;
        }
        return { sourceKey, strip };
      });
    };
    const unsubscribe = runtime.subscribeFramePreviews(
      { pixelsPerSecond, rangeEndUs, rangeStartUs, sourceDurationUs, src },
      update,
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    key,
    pixelsPerSecond,
    rangeEndUs,
    rangeStartUs,
    runtime,
    sourceDurationUs,
    sourceKey,
    src,
  ]);

  return result?.sourceKey === sourceKey ? result.strip : null;
};
