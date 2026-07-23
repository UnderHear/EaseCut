import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canUseWebCodecsFramePreview,
  createWebCodecsFramePreviewExtractor,
} from './webcodecs-frame-preview';
import {
  isFramePreviewWorkerRequest,
  isFramePreviewWorkerResponse,
} from '../workers/frame-preview-protocol';

class FakeWorker {
  messages: unknown[] = [];
  onerror: Worker['onerror'] = null;
  onmessage: Worker['onmessage'] = null;
  terminated = false;

  emitMessage(data: unknown) {
    if (typeof this.onmessage === 'function') {
      this.onmessage.call(
        this as unknown as Worker,
        new MessageEvent('message', { data }),
      );
    }
  }

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const installWebCodecsGlobals = () => {
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal('OffscreenCanvas', class {});
  vi.stubGlobal('VideoDecoder', class {});
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WebCodecs frame preview extractor', () => {
  it('reports capability only when Worker, OffscreenCanvas, and VideoDecoder exist', () => {
    expect(canUseWebCodecsFramePreview()).toBe(false);

    installWebCodecsGlobals();

    expect(canUseWebCodecsFramePreview()).toBe(true);
  });

  it('publishes validated worker frames and completes the extraction', async () => {
    installWebCodecsGlobals();
    const worker = new FakeWorker();
    const extractor = createWebCodecsFramePreviewExtractor(
      () => worker as unknown as Worker,
    );
    const onFrame = vi.fn();
    const controller = new AbortController();

    const extraction = extractor?.extract(
      new Blob(['video']),
      48,
      [{ index: 2, time: 1.5 }],
      controller.signal,
      onFrame,
    );

    expect(worker.messages).toEqual([
      {
        blob: expect.any(Blob),
        captureHeight: 48,
        frames: [{ index: 2, time: 1.5 }],
        requestId: 1,
        type: 'extract',
      },
    ]);
    worker.emitMessage({ requestId: 1, type: 'frame' });
    expect(onFrame).not.toHaveBeenCalled();
    const frameBlob = new Blob(['frame'], { type: 'image/jpeg' });
    worker.emitMessage({
      blob: frameBlob,
      index: 2,
      requestId: 1,
      type: 'frame',
    });
    worker.emitMessage({ requestId: 1, type: 'complete' });

    await expect(extraction).resolves.toBeUndefined();
    expect(onFrame).toHaveBeenCalledWith(2, frameBlob);
  });

  it('sends cancellation to the worker and rejects with AbortError', async () => {
    installWebCodecsGlobals();
    const worker = new FakeWorker();
    const extractor = createWebCodecsFramePreviewExtractor(
      () => worker as unknown as Worker,
    );
    const controller = new AbortController();
    const extraction = extractor?.extract(
      new Blob(['video']),
      48,
      [{ index: 0, time: 0 }],
      controller.signal,
      vi.fn(),
    );

    controller.abort();

    await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.messages.at(-1)).toEqual({
      requestId: 1,
      type: 'cancel',
    });
  });

  it('terminates the worker and rejects pending work when disposed', async () => {
    installWebCodecsGlobals();
    const worker = new FakeWorker();
    const extractor = createWebCodecsFramePreviewExtractor(
      () => worker as unknown as Worker,
    );
    const extraction = extractor?.extract(
      new Blob(['video']),
      48,
      [{ index: 0, time: 0 }],
      new AbortController().signal,
      vi.fn(),
    );

    extractor?.dispose();

    await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });
});

describe('frame preview worker protocol validation', () => {
  it('accepts valid requests and rejects malformed requests', () => {
    expect(
      isFramePreviewWorkerRequest({
        blob: new Blob(['video']),
        captureHeight: 48,
        frames: [{ index: 0, time: 0 }],
        requestId: 1,
        type: 'extract',
      }),
    ).toBe(true);
    expect(
      isFramePreviewWorkerRequest({
        captureHeight: 48,
        frames: [{ index: -1, time: 0 }],
        requestId: 1,
        type: 'extract',
      }),
    ).toBe(false);
  });

  it('accepts valid responses and rejects malformed responses', () => {
    expect(
      isFramePreviewWorkerResponse({
        blob: new Blob(['frame']),
        index: 0,
        requestId: 1,
        type: 'frame',
      }),
    ).toBe(true);
    expect(
      isFramePreviewWorkerResponse({
        index: 0,
        requestId: 1,
        type: 'frame',
      }),
    ).toBe(false);
  });
});
