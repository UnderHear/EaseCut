import {
  isFramePreviewWorkerResponse,
  type FramePreviewWorkerFrame,
  type FramePreviewWorkerRequest,
} from '../workers/frame-preview-protocol';

type PendingExtraction = {
  abortListener: () => void;
  onFrame: (index: number, blob: Blob) => void;
  reject: (reason: unknown) => void;
  resolve: () => void;
  signal: AbortSignal;
};

export type FramePreviewExtractor = {
  dispose(): void;
  extract(
    blob: Blob,
    captureHeight: number,
    frames: readonly FramePreviewWorkerFrame[],
    signal: AbortSignal,
    onFrame: (index: number, blob: Blob) => void,
  ): Promise<void>;
};

export type FramePreviewWorkerFactory = () => Worker;

const createAbortError = () =>
  new DOMException('预览帧任务已取消', 'AbortError');

export const canUseWebCodecsFramePreview = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  'VideoDecoder' in globalThis;

const defaultWorkerFactory: FramePreviewWorkerFactory = () =>
  new Worker(
    new URL('../workers/frame-preview.worker.ts', import.meta.url),
    { type: 'module' },
  );

export const createWebCodecsFramePreviewExtractor = (
  workerFactory: FramePreviewWorkerFactory = defaultWorkerFactory,
): FramePreviewExtractor | null => {
  if (!canUseWebCodecsFramePreview()) return null;

  const pending = new Map<number, PendingExtraction>();
  let disposed = false;
  let nextRequestId = 1;
  let worker: Worker | null = null;

  const rejectAll = (error: Error) => {
    pending.forEach(({ abortListener, reject, signal }) => {
      signal.removeEventListener('abort', abortListener);
      reject(error);
    });
    pending.clear();
  };

  const ensureWorker = () => {
    if (worker) return worker;
    const nextWorker = workerFactory();
    nextWorker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isFramePreviewWorkerResponse(event.data)) return;
      const extraction = pending.get(event.data.requestId);
      if (!extraction) return;

      if (event.data.type === 'frame') {
        extraction.onFrame(event.data.index, event.data.blob);
        return;
      }

      pending.delete(event.data.requestId);
      extraction.signal.removeEventListener(
        'abort',
        extraction.abortListener,
      );
      if (event.data.type === 'complete') {
        extraction.resolve();
      } else {
        extraction.reject(new Error(event.data.message));
      }
    };
    nextWorker.onerror = () => {
      rejectAll(new Error('WebCodecs 预览帧 Worker 运行失败'));
      nextWorker.terminate();
      if (worker === nextWorker) worker = null;
    };
    worker = nextWorker;
    return nextWorker;
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll(createAbortError());
      worker?.terminate();
      worker = null;
    },
    extract(blob, captureHeight, frames, signal, onFrame) {
      if (disposed || signal.aborted) {
        return Promise.reject(createAbortError());
      }
      if (frames.length === 0) return Promise.resolve();

      const activeWorker = ensureWorker();
      const requestId = nextRequestId;
      nextRequestId += 1;

      return new Promise<void>((resolve, reject) => {
        const handleAbort = () => {
          pending.delete(requestId);
          const request: FramePreviewWorkerRequest = {
            requestId,
            type: 'cancel',
          };
          try {
            activeWorker.postMessage(request);
          } catch {
            activeWorker.terminate();
            if (worker === activeWorker) worker = null;
          }
          reject(createAbortError());
        };
        pending.set(requestId, {
          abortListener: handleAbort,
          onFrame,
          reject,
          resolve,
          signal,
        });
        signal.addEventListener('abort', handleAbort, { once: true });
        if (signal.aborted) {
          handleAbort();
          return;
        }
        const request: FramePreviewWorkerRequest = {
          blob,
          captureHeight,
          frames: [...frames],
          requestId,
          type: 'extract',
        };
        try {
          activeWorker.postMessage(request);
        } catch (error) {
          pending.delete(requestId);
          signal.removeEventListener('abort', handleAbort);
          reject(error);
        }
      });
    },
  };
};
