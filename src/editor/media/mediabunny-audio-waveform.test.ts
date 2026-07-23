import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canUseMediabunnyAudioWaveform,
  createMediabunnyAudioWaveformExtractor,
} from './mediabunny-audio-waveform';

type WorkerMock = {
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

const installWorkerGlobal = () => {
  vi.stubGlobal('Worker', class Worker {});
};

const createWorkerMock = (): WorkerMock => ({
  onerror: null,
  onmessage: null,
  postMessage: vi.fn(),
  terminate: vi.fn(),
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Mediabunny audio waveform extractor', () => {
  it('only requires Worker support on the main thread', () => {
    vi.stubGlobal('Worker', undefined);
    expect(canUseMediabunnyAudioWaveform()).toBe(false);
    installWorkerGlobal();
    expect(canUseMediabunnyAudioWaveform()).toBe(true);
  });

  it('resolves samples returned by the worker', async () => {
    installWorkerGlobal();
    const worker = createWorkerMock();
    const extractor = createMediabunnyAudioWaveformExtractor(
      () => worker as unknown as Worker,
    );
    expect(extractor).not.toBeNull();

    const request = extractor!.extract(
      new Blob(['audio']),
      2,
      new AbortController().signal,
    );
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 1,
        sampleCount: 2,
        type: 'extract',
      }),
    );

    worker.onmessage?.({
      data: {
        requestId: 1,
        samples: new Float32Array([0.25, 1]),
        type: 'complete',
      },
    } as MessageEvent);

    await expect(request).resolves.toEqual([0.25, 1]);
  });

  it('cancels an active extraction through the worker', async () => {
    installWorkerGlobal();
    const worker = createWorkerMock();
    const extractor = createMediabunnyAudioWaveformExtractor(
      () => worker as unknown as Worker,
    )!;
    const controller = new AbortController();
    const request = extractor.extract(new Blob(['audio']), 512, controller.signal);

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      requestId: 1,
      type: 'cancel',
    });
  });

  it('rejects malformed worker samples', async () => {
    installWorkerGlobal();
    const worker = createWorkerMock();
    const extractor = createMediabunnyAudioWaveformExtractor(
      () => worker as unknown as Worker,
    )!;
    const request = extractor.extract(
      new Blob(['audio']),
      2,
      new AbortController().signal,
    );

    worker.onmessage?.({
      data: {
        requestId: 1,
        samples: new Float32Array([1]),
        type: 'complete',
      },
    } as MessageEvent);

    await expect(request).rejects.toThrow('返回了无效数据');
  });

  it('rejects pending work and terminates the worker on disposal', async () => {
    installWorkerGlobal();
    const worker = createWorkerMock();
    const extractor = createMediabunnyAudioWaveformExtractor(
      () => worker as unknown as Worker,
    )!;
    const request = extractor.extract(
      new Blob(['audio']),
      512,
      new AbortController().signal,
    );

    extractor.dispose();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(
      extractor.extract(
        new Blob(['audio']),
        512,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects all pending work after a worker failure', async () => {
    installWorkerGlobal();
    const firstWorker = createWorkerMock();
    const secondWorker = createWorkerMock();
    const workerFactory = vi
      .fn()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(secondWorker);
    const extractor = createMediabunnyAudioWaveformExtractor(
      workerFactory,
    )!;
    const first = extractor.extract(
      new Blob(['first']),
      512,
      new AbortController().signal,
    );
    const second = extractor.extract(
      new Blob(['second']),
      512,
      new AbortController().signal,
    );

    firstWorker.onerror?.(new ErrorEvent('error'));

    await expect(first).rejects.toThrow('Worker 运行失败');
    await expect(second).rejects.toThrow('Worker 运行失败');
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const third = extractor.extract(
      new Blob(['third']),
      512,
      new AbortController().signal,
    );
    expect(workerFactory).toHaveBeenCalledTimes(2);
    extractor.dispose();
    await expect(third).rejects.toMatchObject({ name: 'AbortError' });
  });
});
