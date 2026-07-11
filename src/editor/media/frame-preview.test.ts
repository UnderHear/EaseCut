import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFramePreviewCache } from './frame-preview';

const installMediaElementMocks = () => {
  let frameIndex = 0;
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        height: 0,
        toDataURL: vi.fn(
          () => `data:image/jpeg;base64,frame-${(frameIndex += 1)}`,
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
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frame preview cache', () => {
  it('deduplicates an extraction and publishes progressive results', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    installMediaElementMocks();
    const getObjectUrl = vi.fn().mockResolvedValue('blob:video');
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const clip = { src: '/video.mp4', trimEnd: 5, trimStart: 0 };
    const updates: Array<Array<string | null>> = [];

    const first = cache.getUrls(clip, 3, (urls) => updates.push(urls));
    const duplicate = cache.getUrls(clip, 3);

    expect(duplicate).toBe(first);
    await expect(first).resolves.toEqual([
      'data:image/jpeg;base64,frame-1',
      'data:image/jpeg;base64,frame-3',
      'data:image/jpeg;base64,frame-2',
    ]);
    expect(getObjectUrl).toHaveBeenCalledTimes(1);
    expect(updates.some((urls) => urls.some(Boolean))).toBe(true);
  });

  it('keeps frame caches isolated between runtime instances', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    installMediaElementMocks();
    const getObjectUrl = vi.fn().mockResolvedValue('blob:video');
    const first = createFramePreviewCache(getObjectUrl, () => false);
    const second = createFramePreviewCache(getObjectUrl, () => false);
    const clip = { src: '/video.mp4', trimEnd: 5, trimStart: 0 };

    await first.getUrls(clip, 1);
    await second.getUrls(clip, 1);

    expect(getObjectUrl).toHaveBeenCalledTimes(2);
  });

  it('drops a failed extraction entry so a later request can retry', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    installMediaElementMocks();
    const getObjectUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('blob:video');
    const cache = createFramePreviewCache(getObjectUrl, () => false);
    const clip = { src: '/video.mp4', trimEnd: 5, trimStart: 0 };

    await expect(cache.getUrls(clip, 1)).rejects.toThrow('temporary failure');
    await expect(cache.getUrls(clip, 1)).resolves.toEqual([
      'data:image/jpeg;base64,frame-1',
    ]);
    expect(getObjectUrl).toHaveBeenCalledTimes(2);
  });

  it('stops publishing progressive frames after a subscriber is removed', async () => {
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
    const clip = { src: '/video.mp4', trimEnd: 5, trimStart: 0 };
    const subscriber = vi.fn();
    const request = cache.getUrls(clip, 1, subscriber);
    cache.unsubscribe(clip, 1, subscriber);
    await Promise.resolve();
    await Promise.resolve();

    resolveObjectUrl('blob:video');
    await expect(request).resolves.toEqual([
      'data:image/jpeg;base64,frame-1',
    ]);
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledWith([null]);
  });
});
