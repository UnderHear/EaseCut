import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  createFramePreviewCache,
  type FramePreviewRequest,
  type FramePreviewStrip,
} from './frame-preview';
import type {
  FramePreviewExtractionFrame,
  MediabunnyFramePreviewSourceFactory,
} from './mediabunny-frame-preview';

const createRequest = (
  patch: Partial<FramePreviewRequest> = {},
): FramePreviewRequest => ({
  pixelsPerSecond: 80,
  rangeEndUs: secondsToMicroseconds(3),
  rangeStartUs: 0,
  sourceDurationUs: secondsToMicroseconds(10),
  src: '/video.mp4',
  ...patch,
});

const createFakeSourceFactory = () => {
  const dispose = vi.fn();
  const extract = vi.fn(
    async (
      frames: readonly FramePreviewExtractionFrame[],
      onFrame: (frame: FramePreviewExtractionFrame & { blob: Blob }) => void,
    ) => {
      for (const frame of frames) {
        onFrame({
          ...frame,
          blob: new Blob([`frame-${frame.index}`], {
            type: 'image/jpeg',
          }),
        });
        await Promise.resolve();
      }
    },
  );
  const factory = vi.fn(async () => ({
    dispose,
    extract,
    frameWidth: 85,
    mediaDurationUs: secondsToMicroseconds(10),
  })) satisfies MediabunnyFramePreviewSourceFactory;

  return { dispose, extract, factory };
};

const installObjectUrlMocks = () => {
  let frameIndex = 0;
  const createObjectUrl = vi.fn(
    () => `blob:frame-${(frameIndex += 1)}`,
  );
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: createObjectUrl,
    revokeObjectURL: revokeObjectUrl,
  });
  return { createObjectUrl, revokeObjectUrl };
};

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: 'Chrome' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frame preview cache', () => {
  it('deduplicates source extraction and publishes fixed frames progressively', async () => {
    const { createObjectUrl } = installObjectUrlMocks();
    const { extract, factory } = createFakeSourceFactory();
    const getBlob = vi.fn().mockResolvedValue(new Blob(['video']));
    const cache = createFramePreviewCache(getBlob, () => false, factory);
    const firstUpdates: FramePreviewStrip[] = [];
    const secondUpdates: FramePreviewStrip[] = [];

    cache.subscribe(createRequest(), (strip) => firstUpdates.push(strip));
    cache.subscribe(createRequest(), (strip) => secondUpdates.push(strip));

    await vi.waitFor(() => {
      expect(firstUpdates.at(-1)?.frames).toHaveLength(3);
      expect(secondUpdates.at(-1)?.frames).toHaveLength(3);
    });
    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    expect(firstUpdates.map((strip) => strip.frames.length)).toEqual(
      expect.arrayContaining([0, 1, 2, 3]),
    );
    expect(firstUpdates.at(-1)).toEqual({
      frameWidth: 85,
      frames: [
        { index: 0, url: 'blob:frame-1' },
        { index: 1, url: 'blob:frame-2' },
        { index: 2, url: 'blob:frame-3' },
      ],
      pixelsPerSecond: 80,
    });
    expect(extract).toHaveBeenCalledWith(
      [
        { index: 0, timeUs: 531_250 },
        { index: 1, timeUs: 1_593_750 },
        { index: 2, timeUs: 2_656_250 },
      ],
      expect.any(Function),
    );
  });

  it('keeps frame caches isolated between runtime instances', async () => {
    installObjectUrlMocks();
    const getBlob = vi.fn().mockResolvedValue(new Blob(['video']));
    const firstFactory = createFakeSourceFactory().factory;
    const secondFactory = createFakeSourceFactory().factory;
    const first = createFramePreviewCache(
      getBlob,
      () => false,
      firstFactory,
    );
    const second = createFramePreviewCache(
      getBlob,
      () => false,
      secondFactory,
    );
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
    expect(getBlob).toHaveBeenCalledTimes(2);
    expect(firstFactory).toHaveBeenCalledTimes(1);
    expect(secondFactory).toHaveBeenCalledTimes(1);
  });

  it('loads later source chunks without regenerating cached frame indexes', async () => {
    const { createObjectUrl } = installObjectUrlMocks();
    const { factory } = createFakeSourceFactory();
    const cache = createFramePreviewCache(
      vi.fn().mockResolvedValue(new Blob(['video'])),
      () => false,
      factory,
    );
    const firstSubscriber = vi.fn();
    const unsubscribe = cache.subscribe(
      createRequest({ rangeEndUs: secondsToMicroseconds(3) }),
      firstSubscriber,
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
    const { createObjectUrl } = installObjectUrlMocks();
    const { factory } = createFakeSourceFactory();
    const cache = createFramePreviewCache(
      vi.fn().mockResolvedValue(new Blob(['video'])),
      () => false,
      factory,
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
    const { createObjectUrl } = installObjectUrlMocks();
    const { factory } = createFakeSourceFactory();
    let resolveBlob!: (blob: Blob) => void;
    const getBlob = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveBlob = resolve;
        }),
    );
    const cache = createFramePreviewCache(getBlob, () => false, factory);
    const subscriber = vi.fn();
    const unsubscribe = cache.subscribe(createRequest(), subscriber);
    await vi.waitFor(() => expect(getBlob).toHaveBeenCalledOnce());
    unsubscribe();

    resolveBlob(new Blob(['video']));
    await Promise.resolve();
    await Promise.resolve();

    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith({
      frameWidth: 0,
      frames: [],
      pixelsPerSecond: 0,
    });
    expect(factory).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('skips a queued zoom request after its subscriber is removed', async () => {
    installObjectUrlMocks();
    const { factory } = createFakeSourceFactory();
    let resolveBlob!: (blob: Blob) => void;
    const getBlob = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveBlob = resolve;
        }),
    );
    const cache = createFramePreviewCache(getBlob, () => false, factory);
    const activeSubscriber = vi.fn();
    const staleSubscriber = vi.fn();

    cache.subscribe(createRequest(), activeSubscriber);
    const unsubscribeStale = cache.subscribe(
      createRequest({ pixelsPerSecond: 160 }),
      staleSubscriber,
    );
    unsubscribeStale();

    await vi.waitFor(() => expect(getBlob).toHaveBeenCalledOnce());
    resolveBlob(new Blob(['video']));
    await vi.waitFor(() =>
      expect(
        (activeSubscriber.mock.lastCall?.[0] as FramePreviewStrip).frames,
      ).toHaveLength(3),
    );
    await Promise.resolve();

    expect(getBlob).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
    expect(staleSubscriber).toHaveBeenCalledOnce();
  });

  it('revokes generated frame URLs when the cache is cleared', async () => {
    const { revokeObjectUrl } = installObjectUrlMocks();
    const { factory } = createFakeSourceFactory();
    const cache = createFramePreviewCache(
      vi.fn().mockResolvedValue(new Blob(['video'])),
      () => false,
      factory,
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
