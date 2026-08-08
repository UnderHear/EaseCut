import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  createMediabunnyFramePreviewSource,
  type FramePreviewWorkerFactory,
} from './mediabunny-frame-preview';

type WorkerMock = {
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

const createWorkerMock = (): WorkerMock => ({
  onerror: null,
  onmessage: null,
  postMessage: vi.fn(),
  terminate: vi.fn(),
});

const createWorkerFactory = (worker: WorkerMock): FramePreviewWorkerFactory =>
  () => worker as unknown as Worker;

beforeEach(() => {
  vi.stubGlobal('Worker', class Worker {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Mediabunny frame preview source', () => {
  it('opens a worker source and streams extracted JPEG frames', async () => {
    const worker = createWorkerMock();
    const blob = new Blob(['video']);
    const sourcePromise = createMediabunnyFramePreviewSource(
      blob,
      new AbortController().signal,
      48,
      createWorkerFactory(worker),
    );
    expect(worker.postMessage).toHaveBeenCalledWith({
      blob,
      outputHeight: 48,
      type: 'open',
    });

    worker.onmessage?.({
      data: {
        frameWidth: 85,
        mediaDurationUs: secondsToMicroseconds(10),
        type: 'ready',
      },
    } as MessageEvent);
    const source = await sourcePromise;
    const receivedFrames: Array<{
      blob: Blob;
      index: number;
      timeUs: number;
    }> = [];
    const extraction = source.extract(
      [
        {
          index: 2,
          timeUs: secondsToMicroseconds(2.5),
        },
        {
          index: 0,
          timeUs: secondsToMicroseconds(0.5),
        },
      ],
      (frame) => receivedFrames.push(frame),
    );
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      frames: [
        {
          index: 2,
          timeUs: secondsToMicroseconds(2.5),
        },
        {
          index: 0,
          timeUs: secondsToMicroseconds(0.5),
        },
      ],
      type: 'extract',
    });

    const frameBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });
    worker.onmessage?.({
      data: {
        blob: frameBlob,
        index: 0,
        timeUs: secondsToMicroseconds(0.5),
        type: 'frame',
      },
    } as MessageEvent);
    worker.onmessage?.({
      data: { type: 'complete' },
    } as MessageEvent);

    await expect(extraction).resolves.toBeUndefined();
    expect(source.frameWidth).toBe(85);
    expect(source.mediaDurationUs).toBe(secondsToMicroseconds(10));
    expect(receivedFrames).toEqual([
      {
        blob: frameBlob,
        index: 0,
        timeUs: secondsToMicroseconds(0.5),
      },
    ]);

    source.dispose();
    source.dispose();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'dispose',
    });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.onmessage?.({
      data: { type: 'disposed' },
    } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('cancels active extraction and terminates its worker', async () => {
    const worker = createWorkerMock();
    const controller = new AbortController();
    const sourcePromise = createMediabunnyFramePreviewSource(
      new Blob(['video']),
      controller.signal,
      48,
      createWorkerFactory(worker),
    );
    worker.onmessage?.({
      data: {
        frameWidth: 85,
        mediaDurationUs: secondsToMicroseconds(10),
        type: 'ready',
      },
    } as MessageEvent);
    const source = await sourcePromise;
    const extraction = source.extract(
      [{ index: 0, timeUs: 0 }],
      vi.fn(),
    );

    controller.abort();

    await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'dispose',
    });
    worker.onmessage?.({
      data: { type: 'disposed' },
    } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(
      source.extract([{ index: 1, timeUs: 1 }], vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves worker capability errors during source opening', async () => {
    const worker = createWorkerMock();
    const sourcePromise = createMediabunnyFramePreviewSource(
      new Blob(['video']),
      new AbortController().signal,
      48,
      createWorkerFactory(worker),
    );

    worker.onmessage?.({
      data: {
        code: 'unsupported',
        message: '当前浏览器不支持该编码',
        type: 'error',
      },
    } as MessageEvent);

    await expect(sourcePromise).rejects.toThrow(
      '当前浏览器不支持该编码',
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects active work after a worker failure', async () => {
    const worker = createWorkerMock();
    const sourcePromise = createMediabunnyFramePreviewSource(
      new Blob(['video']),
      new AbortController().signal,
      48,
      createWorkerFactory(worker),
    );
    worker.onmessage?.({
      data: {
        frameWidth: 85,
        mediaDurationUs: secondsToMicroseconds(10),
        type: 'ready',
      },
    } as MessageEvent);
    const source = await sourcePromise;
    const extraction = source.extract(
      [{ index: 0, timeUs: 0 }],
      vi.fn(),
    );

    worker.onerror?.(new ErrorEvent('error'));

    await expect(extraction).rejects.toThrow('Worker 运行失败');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects before opening resources when cancellation already happened', async () => {
    const worker = createWorkerMock();
    const controller = new AbortController();
    controller.abort();

    await expect(
      createMediabunnyFramePreviewSource(
        new Blob(['video']),
        controller.signal,
        48,
        createWorkerFactory(worker),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});
