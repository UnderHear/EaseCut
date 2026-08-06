import {
  isAudioWaveformWorkerResponse,
  normalizeAudioWaveformSampleCount,
  type AudioWaveformWorkerRequest,
} from '../workers/audio-waveform-protocol';
import { createAbortError as createDomAbortError } from '../util/abort-error';

type PendingExtraction = {
  abortListener: () => void;
  reject: (reason: unknown) => void;
  resolve: (samples: number[]) => void;
  sampleCount: number;
  signal: AbortSignal;
};

export type AudioWaveformExtractor = {
  dispose(): void;
  extract(
    blob: Blob,
    sampleCount: number,
    signal: AbortSignal,
  ): Promise<number[]>;
};

export type AudioWaveformWorkerFactory = () => Worker;

const createAbortError = () =>
  createDomAbortError('音频波形任务已取消');

export const canUseMediabunnyAudioWaveform = () =>
  typeof Worker !== 'undefined';

const defaultWorkerFactory: AudioWaveformWorkerFactory = () =>
  new Worker(
    new URL('../workers/audio-waveform.worker.ts', import.meta.url),
    { type: 'module' },
  );

export const createMediabunnyAudioWaveformExtractor = (
  workerFactory: AudioWaveformWorkerFactory = defaultWorkerFactory,
): AudioWaveformExtractor | null => {
  if (!canUseMediabunnyAudioWaveform()) return null;

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
      if (!isAudioWaveformWorkerResponse(event.data)) return;
      const extraction = pending.get(event.data.requestId);
      if (!extraction) return;

      pending.delete(event.data.requestId);
      extraction.signal.removeEventListener(
        'abort',
        extraction.abortListener,
      );
      if (event.data.type === 'complete') {
        if (
          event.data.samples.length !== extraction.sampleCount ||
          !event.data.samples.every(Number.isFinite)
        ) {
          extraction.reject(
            new Error('Mediabunny 音频波形 Worker 返回了无效数据'),
          );
        } else {
          extraction.resolve(Array.from(event.data.samples));
        }
      } else {
        extraction.reject(new Error(event.data.message));
      }
    };
    nextWorker.onerror = () => {
      rejectAll(new Error('Mediabunny 音频波形 Worker 运行失败'));
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
    extract(blob, sampleCount, signal) {
      if (disposed || signal.aborted) {
        return Promise.reject(createAbortError());
      }
      const safeSampleCount = normalizeAudioWaveformSampleCount(sampleCount);
      if (safeSampleCount === 0) return Promise.resolve([]);

      const activeWorker = ensureWorker();
      const requestId = nextRequestId;
      nextRequestId += 1;

      return new Promise<number[]>((resolve, reject) => {
        const handleAbort = () => {
          pending.delete(requestId);
          const request: AudioWaveformWorkerRequest = {
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
          reject,
          resolve,
          sampleCount: safeSampleCount,
          signal,
        });
        signal.addEventListener('abort', handleAbort, { once: true });
        if (signal.aborted) {
          handleAbort();
          return;
        }
        const request: AudioWaveformWorkerRequest = {
          blob,
          requestId,
          sampleCount: safeSampleCount,
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
