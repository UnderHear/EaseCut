import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  FramePreviewDecodeError,
  type ExtractedFramePreview,
  type FramePreviewExtractionFrame,
  type MediabunnyFramePreviewSource,
  type MediabunnyFramePreviewSourceFactory,
} from './mediabunny-frame-preview';
import {
  createSingleFramePreviewRuntime,
  SINGLE_FRAME_PREVIEW_CACHE_LIMIT,
  type SingleFramePreviewResult,
} from './single-frame-preview';

type DeferredExtraction = {
  frames: readonly FramePreviewExtractionFrame[];
  onFrame: (frame: ExtractedFramePreview) => void;
  resolve(): void;
};

describe('single frame preview runtime', () => {
  const animationFrames = new Map<number, FrameRequestCallback>();
  let nextAnimationFrameId = 1;
  let nextObjectUrlId = 1;

  const settleAsyncWork = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  const flushAnimationFrame = async () => {
    const callbacks = [...animationFrames.values()];
    animationFrames.clear();
    callbacks.forEach((callback) => callback(0));
    await settleAsyncWork();
  };

  beforeEach(() => {
    animationFrames.clear();
    nextAnimationFrameId = 1;
    nextObjectUrlId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextAnimationFrameId;
        nextAnimationFrameId += 1;
        animationFrames.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => animationFrames.delete(id)),
    );
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:single-frame-${nextObjectUrlId++}`,
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createImmediateSource = () => {
    const source: MediabunnyFramePreviewSource = {
      dispose: vi.fn(),
      extract: vi.fn(async (frames, onFrame) => {
        const frame = frames[0];
        if (frame) onFrame({ ...frame, blob: new Blob(['frame']) });
      }),
      frameWidth: 160,
      mediaDurationUs: secondsToMicroseconds(10),
    };
    const factory: MediabunnyFramePreviewSourceFactory = vi.fn(
      async () => source,
    );
    return { factory, source };
  };

  it('coalesces requests in one animation frame and decodes only the latest time', async () => {
    const { factory, source } = createImmediateSource();
    const results: SingleFramePreviewResult[] = [];
    const runtime = createSingleFramePreviewRuntime(
      async () => new Blob(['video']),
      () => false,
      factory,
    );
    const session = runtime.createSession(
      {
        height: 90,
        sourceDurationUs: secondsToMicroseconds(10),
        src: '/video.mp4',
      },
      (result) => results.push(result),
    );

    session.request(secondsToMicroseconds(1));
    session.request(secondsToMicroseconds(2));
    session.request(secondsToMicroseconds(3));
    await flushAnimationFrame();

    expect(factory).toHaveBeenCalledWith(expect.any(Blob), expect.any(AbortSignal), 90);
    expect(source.extract).toHaveBeenCalledTimes(1);
    expect(source.extract).toHaveBeenCalledWith(
      [{ index: 0, timeUs: secondsToMicroseconds(3) }],
      expect.any(Function),
    );
    expect(results.at(-1)).toEqual({
      height: 90,
      status: 'ready',
      timeUs: secondsToMicroseconds(3),
      url: 'blob:single-frame-1',
      width: 160,
    });
  });

  it('drops a stale extraction result and skips intermediate queued times', async () => {
    const extractions: DeferredExtraction[] = [];
    const source: MediabunnyFramePreviewSource = {
      dispose: vi.fn(),
      extract: vi.fn(
        (frames, onFrame) =>
          new Promise<void>((resolve) => {
            extractions.push({ frames, onFrame, resolve });
          }),
      ),
      frameWidth: 160,
      mediaDurationUs: secondsToMicroseconds(10),
    };
    const results: SingleFramePreviewResult[] = [];
    const runtime = createSingleFramePreviewRuntime(
      async () => new Blob(['video']),
      () => false,
      async () => source,
    );
    const session = runtime.createSession(
      {
        height: 90,
        sourceDurationUs: secondsToMicroseconds(10),
        src: '/video.mp4',
      },
      (result) => results.push(result),
    );

    session.request(secondsToMicroseconds(1));
    await flushAnimationFrame();
    session.request(secondsToMicroseconds(2));
    session.request(secondsToMicroseconds(3));
    const first = extractions[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('Expected the first extraction');
    first.onFrame({ ...first.frames[0], blob: new Blob(['old']) });
    first.resolve();
    await settleAsyncWork();

    expect(results.filter(({ status }) => status === 'ready')).toHaveLength(0);
    await flushAnimationFrame();
    const second = extractions[1];
    expect(second?.frames).toEqual([
      { index: 0, timeUs: secondsToMicroseconds(3) },
    ]);
    if (!second || !second.frames[0]) {
      throw new Error('Expected the latest extraction');
    }
    second.onFrame({ ...second.frames[0], blob: new Blob(['latest']) });
    second.resolve();
    await settleAsyncWork();

    expect(results.filter(({ status }) => status === 'ready')).toEqual([
      expect.objectContaining({
        status: 'ready',
        timeUs: secondsToMicroseconds(3),
      }),
    ]);
  });

  it('reuses exact cached frames and revokes the least recently used frame', async () => {
    const { factory, source } = createImmediateSource();
    const runtime = createSingleFramePreviewRuntime(
      async () => new Blob(['video']),
      () => false,
      factory,
    );
    const request = {
      height: 90,
      sourceDurationUs: secondsToMicroseconds(60),
      src: '/video.mp4',
    };
    const session = runtime.createSession(request, () => undefined);

    for (let index = 0; index <= SINGLE_FRAME_PREVIEW_CACHE_LIMIT; index += 1) {
      session.request(secondsToMicroseconds(index));
      await flushAnimationFrame();
    }
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:single-frame-1');
    expect(source.extract).toHaveBeenCalledTimes(
      SINGLE_FRAME_PREVIEW_CACHE_LIMIT + 1,
    );

    session.request(secondsToMicroseconds(1));
    expect(source.extract).toHaveBeenCalledTimes(
      SINGLE_FRAME_PREVIEW_CACHE_LIMIT + 1,
    );
    session.dispose();
    runtime.clear();
    expect(source.dispose).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:single-frame-2');
  });

  it('reports unavailable browser capabilities without starting extraction', () => {
    const results: SingleFramePreviewResult[] = [];
    const runtime = createSingleFramePreviewRuntime(
      async () => new Blob(['video']),
      () => false,
    );
    runtime.createSession(
      { height: 90, sourceDurationUs: 1_000_000, src: '/video.mp4' },
      (result) => results.push(result),
    );

    expect(results).toEqual([
      expect.objectContaining({ status: 'unsupported' }),
    ]);
  });

  it('preserves structured unsupported decoder failures', async () => {
    const results: SingleFramePreviewResult[] = [];
    const runtime = createSingleFramePreviewRuntime(
      async () => new Blob(['video']),
      () => false,
      async () => {
        throw new FramePreviewDecodeError('unsupported', '编码格式不可用');
      },
    );
    const session = runtime.createSession(
      { height: 90, sourceDurationUs: 1_000_000, src: '/video.mp4' },
      (result) => results.push(result),
    );
    session.request(500_000);
    await flushAnimationFrame();

    expect(results.at(-1)).toEqual({
      message: '编码格式不可用',
      status: 'unsupported',
    });
  });
});
