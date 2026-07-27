import { afterEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  createFramePreviewCache,
  type FramePreviewRequest,
  type FramePreviewStrip,
} from './frame-preview';

const createRequest = (
  patch: Partial<FramePreviewRequest> = {},
): FramePreviewRequest => ({
  pixelsPerSecond: 80,
  rangeEndUs: secondsToMicroseconds(3),
  rangeStartUs: secondsToMicroseconds(0),
  sourceDurationUs: secondsToMicroseconds(10),
  src: '/video.mp4',
  ...patch,
});

const installMediaElementMocks = () => {
  let frameIndex = 0;
  const drawImage = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  const createObjectUrl = vi.fn(
    () => `blob:frame-${(frameIndex += 1)}`,
  );
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: createObjectUrl,
    revokeObjectURL: revokeObjectUrl,
  });
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => ({ drawImage })),
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
          if (src) {
            queueMicrotask(() =>
              video.onloadedmetadata?.(new Event('loadedmetadata')),
            );
          }
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

  return { createObjectUrl, drawImage, revokeObjectUrl };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frame preview cache', () => {
  it('deduplicates source-range extraction and publishes fixed frames progressively', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { createObjectUrl, drawImage } = installMediaElementMocks();
    const getObjectUrl = vi.fn().mockResolvedValue('blob:video');
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const firstUpdates: FramePreviewStrip[] = [];
    const secondUpdates: FramePreviewStrip[] = [];

    cache.subscribe(createRequest(), (strip) => firstUpdates.push(strip));
    cache.subscribe(createRequest(), (strip) => secondUpdates.push(strip));

    await vi.waitFor(() => {
      expect(firstUpdates.at(-1)?.frames).toHaveLength(3);
      expect(secondUpdates.at(-1)?.frames).toHaveLength(3);
    });
    expect(getObjectUrl).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    expect(firstUpdates.at(-1)).toEqual({
      frameWidth: 85,
      frames: [
        { index: 0, url: 'blob:frame-1' },
        { index: 1, url: 'blob:frame-3' },
        { index: 2, url: 'blob:frame-2' },
      ],
      pixelsPerSecond: 80,
    });
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      85,
      48,
    );
  });

  it('keeps frame caches isolated between runtime instances', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    installMediaElementMocks();
    const getObjectUrl = vi.fn().mockResolvedValue('blob:video');
    const first = createFramePreviewCache(getObjectUrl, () => false);
    const second = createFramePreviewCache(getObjectUrl, () => false);
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();

    first.subscribe(
      createRequest({ rangeEndUs: secondsToMicroseconds(1) }),
      firstSubscriber,
    );
    second.subscribe(
      createRequest({ rangeEndUs: secondsToMicroseconds(1) }),
      secondSubscriber,
    );

    await vi.waitFor(() => {
      expect(firstSubscriber).toHaveBeenLastCalledWith(
        expect.objectContaining({
          frames: [expect.objectContaining({ index: 0 })],
        }),
      );
      expect(secondSubscriber).toHaveBeenLastCalledWith(
        expect.objectContaining({
          frames: [expect.objectContaining({ index: 0 })],
        }),
      );
    });
    expect(getObjectUrl).toHaveBeenCalledTimes(2);
  });

  it('loads later source chunks without regenerating cached frame indexes', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { createObjectUrl } = installMediaElementMocks();
    const getObjectUrl = vi.fn().mockResolvedValue('blob:video');
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const firstSubscriber = vi.fn();
    const unsubscribe = cache.subscribe(
      createRequest({ rangeEndUs: secondsToMicroseconds(3) }),
      firstSubscriber,
    );

    await vi.waitFor(() =>
      expect(firstSubscriber).toHaveBeenLastCalledWith(
        expect.objectContaining({ frames: expect.any(Array) }),
      ),
    );
    await vi.waitFor(() =>
      expect(
        (firstSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(3),
    );
    const cachedUrls = (
      firstSubscriber.mock.lastCall?.[0] as FramePreviewStrip
    ).frames.map((frame) => frame.url);
    unsubscribe();

    const secondSubscriber = vi.fn();
    cache.subscribe(
      createRequest({
        rangeEndUs: secondsToMicroseconds(6),
        rangeStartUs: secondsToMicroseconds(2),
      }),
      secondSubscriber,
    );
    await vi.waitFor(() =>
      expect(
        (secondSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(5),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(6);
    expect(
      (secondSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames[0],
    ).toEqual({ index: 1, url: cachedUrls[1] });
  });

  it('reuses denser cached source frames after zooming out', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { createObjectUrl } = installMediaElementMocks();
    const cache = createFramePreviewCache(
      vi.fn().mockResolvedValue('blob:video'),
      () => false,
    );
    const denseSubscriber = vi.fn();
    const unsubscribe = cache.subscribe(
      createRequest({ pixelsPerSecond: 160 }),
      denseSubscriber,
    );
    await vi.waitFor(() =>
      expect(
        (denseSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(6),
    );
    unsubscribe();

    const sparseSubscriber = vi.fn();
    cache.subscribe(createRequest(), sparseSubscriber);
    await vi.waitFor(() =>
      expect(
        (sparseSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(3),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(6);
  });

  it('stops extracting a pending range after its subscriber is removed', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { createObjectUrl } = installMediaElementMocks();
    let resolveObjectUrl!: (url: string) => void;
    const getObjectUrl = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveObjectUrl = resolve;
        }),
    );
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const subscriber = vi.fn();
    const unsubscribe = cache.subscribe(createRequest(), subscriber);
    await vi.waitFor(() => expect(getObjectUrl).toHaveBeenCalledOnce());
    unsubscribe();

    resolveObjectUrl('blob:video');
    await Promise.resolve();
    await Promise.resolve();

    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith({
      frameWidth: 0,
      frames: [],
      pixelsPerSecond: 0,
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('skips a queued zoom request after its subscriber is removed', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    installMediaElementMocks();
    let resolveObjectUrl!: (url: string) => void;
    const getObjectUrl = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveObjectUrl = resolve;
        }),
    );
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const activeSubscriber = vi.fn();
    const staleSubscriber = vi.fn();

    cache.subscribe(createRequest(), activeSubscriber);
    const unsubscribeStale = cache.subscribe(
      createRequest({ pixelsPerSecond: 160 }),
      staleSubscriber,
    );
    unsubscribeStale();

    await vi.waitFor(() => expect(getObjectUrl).toHaveBeenCalledOnce());
    resolveObjectUrl('blob:video');
    await vi.waitFor(() =>
      expect(
        (activeSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(3),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(getObjectUrl).toHaveBeenCalledOnce();
    expect(staleSubscriber).toHaveBeenCalledOnce();
  });

  it('revokes generated frame URLs when the cache is cleared', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const { revokeObjectUrl } = installMediaElementMocks();
    const cache = createFramePreviewCache(
      vi.fn().mockResolvedValue('blob:video'),
      () => false,
    );
    const subscriber = vi.fn();
    cache.subscribe(
      createRequest({ rangeEndUs: secondsToMicroseconds(1) }),
      subscriber,
    );
    await vi.waitFor(() =>
      expect(
        (subscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(1),
    );

    cache.clear();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:frame-1');
  });
});
