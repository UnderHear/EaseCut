import { StrictMode, useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  VideoTimelineMediaLoader,
  VideoTimelineSource,
} from '../types';
import {
  MediaRuntimeProvider,
  createMediaRuntime,
  useFramePreviewStrip,
  useMediaRuntime,
} from './media-runtime';
import type { FramePreviewRequest } from './frame-preview';

const source: VideoTimelineSource = {
  fileName: 'example.mp4',
  id: 'source-1',
  src: '/example.mp4',
  type: 'video',
};

const installFramePreviewElementMocks = () => {
  let metadataLoadCount = 0;
  let resolveNextMetadata: (() => void) | null = null;
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        height: 0,
        toBlob: vi.fn((callback: BlobCallback) =>
          callback(new Blob(['frame'], { type: 'image/jpeg' })),
        ),
        width: 0,
      } as unknown as HTMLCanvasElement;
    }
    if (tagName === 'video') {
      let src = '';
      let currentTime = 0;
      const video = {
        duration: 10,
        load: vi.fn(() => {
          if (!src) return;
          metadataLoadCount += 1;
          if (metadataLoadCount === 1) {
            queueMicrotask(() =>
              video.onloadedmetadata?.(new Event('loadedmetadata')),
            );
            return;
          }
          resolveNextMetadata = () =>
            video.onloadedmetadata?.(new Event('loadedmetadata'));
        }),
        muted: false,
        onerror: null as ((event: Event) => void) | null,
        onloadedmetadata: null as ((event: Event) => void) | null,
        onseeked: null as ((event: Event) => void) | null,
        pause: vi.fn(),
        playsInline: false,
        preload: '',
        removeAttribute: vi.fn((name: string) => {
          if (name === 'src') src = '';
        }),
        videoHeight: 1080,
        videoWidth: 1920,
        get currentTime() {
          return currentTime;
        },
        set currentTime(value: number) {
          currentTime = value;
          queueMicrotask(() => video.onseeked?.(new Event('seeked')));
        },
        get src() {
          return src;
        },
        set src(value: string) {
          src = value;
        },
      };
      return video as unknown as HTMLVideoElement;
    }
    return originalCreateElement(tagName);
  });

  return {
    getMetadataLoadCount: () => metadataLoadCount,
    resolveNextMetadata: () => resolveNextMetadata?.(),
  };
};

describe('MediaRuntime', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:opencut-1');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses an unauthenticated fetch and deduplicates blob and object URL loads', async () => {
    const blob = new Blob(['video']);
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(blob),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createMediaRuntime();

    const first = runtime.getObjectUrl(source.src);
    const second = runtime.getObjectUrl(source.src);

    await expect(first).resolves.toBe('blob:opencut-1');
    await expect(second).resolves.toBe('blob:opencut-1');
    await expect(runtime.getBlob(source.src)).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(source.src, {
      signal: expect.any(AbortSignal),
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    runtime.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:opencut-1');
  });

  it('passes source context to a custom loader and keeps instances isolated', async () => {
    const firstLoader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob(['first'])),
    };
    const secondLoader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob(['second'])),
    };
    const first = createMediaRuntime(firstLoader, [source]);
    const second = createMediaRuntime(secondLoader, [source]);

    await first.getBlob(source.src);
    await first.getBlob(source.src);
    await second.getBlob(source.src);

    expect(firstLoader.loadBlob).toHaveBeenCalledTimes(1);
    expect(firstLoader.loadBlob).toHaveBeenCalledWith(source.src, {
      signal: expect.any(AbortSignal),
      source,
    });
    expect(secondLoader.loadBlob).toHaveBeenCalledTimes(1);
  });

  it('drops a failed blob entry so the source can be retried', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValue(new Blob(['video'])),
        ok: true,
        status: 200,
      });
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createMediaRuntime();

    await expect(runtime.getBlob(source.src)).rejects.toThrow(
      '媒体加载失败 (503)',
    );
    await expect(runtime.getBlob(source.src)).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates custom metadata loads', async () => {
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn(),
      loadMetadata: vi.fn().mockResolvedValue({
        durationSeconds: 12,
        height: 1080,
        width: 1920,
      }),
    };
    const runtime = createMediaRuntime(loader, [source]);

    const first = runtime.getMetadata(source.src);
    const second = runtime.getMetadata(source.src);

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({
      durationSeconds: 12,
      height: 1080,
      width: 1920,
    });
    expect(loader.loadMetadata).toHaveBeenCalledTimes(1);
    expect(loader.loadMetadata).toHaveBeenCalledWith(source, {
      signal: expect.any(AbortSignal),
    });
    expect(loader.loadBlob).not.toHaveBeenCalled();
  });

  it('uses complete source metadata without calling either loader hook', async () => {
    const completeSource: VideoTimelineSource = {
      ...source,
      durationSeconds: 12,
      height: 1080,
      width: 1920,
    };
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn(),
      loadMetadata: vi.fn(),
    };
    const runtime = createMediaRuntime(loader, [completeSource]);

    await expect(runtime.getMetadata(completeSource.src)).resolves.toEqual({
      durationSeconds: 12,
      height: 1080,
      width: 1920,
    });
    expect(loader.loadMetadata).not.toHaveBeenCalled();
    expect(loader.loadBlob).not.toHaveBeenCalled();
  });

  it('drops a failed metadata entry so it can be retried', async () => {
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn(),
      loadMetadata: vi
        .fn()
        .mockRejectedValueOnce(new Error('metadata unavailable'))
        .mockResolvedValueOnce({
          durationSeconds: 12,
          height: 1080,
          width: 1920,
        }),
    };
    const runtime = createMediaRuntime(loader, [source]);

    await expect(runtime.getMetadata(source.src)).rejects.toThrow(
      'metadata unavailable',
    );
    await expect(runtime.getMetadata(source.src)).resolves.toEqual({
      durationSeconds: 12,
      height: 1080,
      width: 1920,
    });
    expect(loader.loadMetadata).toHaveBeenCalledTimes(2);
  });

  it('revokes a created object URL only once when disposal is repeated', async () => {
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob(['video'])),
    };
    const runtime = createMediaRuntime(loader, [source]);
    await runtime.getObjectUrl(source.src);

    runtime.dispose();
    runtime.dispose();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:opencut-1');
  });

  it('aborts pending loads and rejects new work after disposal', async () => {
    let requestSignal: AbortSignal | undefined;
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn((_url, { signal }) => {
        requestSignal = signal;
        return new Promise<Blob>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    };
    const runtime = createMediaRuntime(loader, [source]);
    const request = runtime.getBlob(source.src);
    await Promise.resolve();

    runtime.dispose();

    expect(requestSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await expect(runtime.getBlob('/next.mp4')).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('keeps one runtime alive across StrictMode effect replay and disposes on unmount', async () => {
    const loader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob(['video'])),
    };

    function Consumer() {
      const runtime = useMediaRuntime();
      useEffect(() => {
        void runtime.getObjectUrl(source.src);
      }, [runtime]);
      return null;
    }

    const view = render(
      <StrictMode>
        <MediaRuntimeProvider mediaLoader={loader} sources={[source]}>
          <Consumer />
        </MediaRuntimeProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(loader.loadBlob).toHaveBeenCalledTimes(1));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:opencut-1'),
    );
  });

  it('keeps the previous frame strip visible while a new zoom density loads', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { getMetadataLoadCount, resolveNextMetadata } =
      installFramePreviewElementMocks();
    let frameUrlIndex = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${frameUrlIndex++}`);
    const mediaLoader: VideoTimelineMediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob(['video'])),
    };
    const createRequest = (pixelsPerSecond: number): FramePreviewRequest => ({
      pixelsPerSecond,
      rangeEnd: 3,
      rangeStart: 0,
      sourceDuration: 10,
      src: source.src,
    });

    function Consumer({ request }: { request: FramePreviewRequest }) {
      const strip = useFramePreviewStrip(request);
      return (
        <output>
          {strip
            ? `${strip.pixelsPerSecond}:${strip.frames.length}`
            : 'empty'}
        </output>
      );
    }

    const view = render(
      <MediaRuntimeProvider mediaLoader={mediaLoader} sources={[source]}>
        <Consumer request={createRequest(80)} />
      </MediaRuntimeProvider>,
    );
    await waitFor(() =>
      expect(view.getByText('80:3')).toBeInTheDocument(),
    );

    view.rerender(
      <MediaRuntimeProvider mediaLoader={mediaLoader} sources={[source]}>
        <Consumer request={createRequest(160)} />
      </MediaRuntimeProvider>,
    );

    expect(view.getByText('80:3')).toBeInTheDocument();
    await waitFor(() => expect(getMetadataLoadCount()).toBe(2));
    resolveNextMetadata();
    await waitFor(() =>
      expect(view.getByText('160:6')).toBeInTheDocument(),
    );
  });
});
