import {
  isFramePreviewWorkerResponse,
  type FramePreviewWorkerFrame,
  type FramePreviewWorkerRequest,
} from '../workers/frame-preview-protocol';
import { createAbortError as createDomAbortError } from '../util/abort-error';

export type FramePreviewExtractionFrame = FramePreviewWorkerFrame;

export type ExtractedFramePreview = FramePreviewExtractionFrame & {
  blob: Blob;
};

export type FramePreviewDecodeErrorCode =
  | 'decode'
  | 'invalid-media'
  | 'unsupported';

export class FramePreviewDecodeError extends Error {
  readonly code: FramePreviewDecodeErrorCode;

  constructor(code: FramePreviewDecodeErrorCode, message: string) {
    super(message);
    this.name = 'FramePreviewDecodeError';
    this.code = code;
  }
}

export type MediabunnyFramePreviewSource = {
  dispose(): void;
  extract(
    frames: readonly FramePreviewExtractionFrame[],
    onFrame: (frame: ExtractedFramePreview) => void,
  ): Promise<void>;
  frameWidth: number;
  mediaDurationUs: number;
};

export type MediabunnyFramePreviewSourceFactory = (
  blob: Blob,
  signal: AbortSignal,
  outputHeight?: number,
) => Promise<MediabunnyFramePreviewSource>;

export type FramePreviewWorkerFactory = () => Worker;

type PendingExtraction = {
  onFrame: (frame: ExtractedFramePreview) => void;
  reject: (reason: unknown) => void;
  resolve: () => void;
};

const createAbortError = () =>
  createDomAbortError('预览帧任务已取消');

const defaultWorkerFactory: FramePreviewWorkerFactory = () =>
  new Worker(
    new URL('../workers/frame-preview.worker.ts', import.meta.url),
    { type: 'module' },
  );

export const canUseMediabunnyFramePreviewWorker = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof VideoDecoder !== 'undefined';

export const createMediabunnyFramePreviewSource = (
  blob: Blob,
  signal: AbortSignal,
  outputHeight = 48,
  workerFactory: FramePreviewWorkerFactory = defaultWorkerFactory,
): Promise<MediabunnyFramePreviewSource> => {
  if (signal.aborted) return Promise.reject(createAbortError());
  if (
    workerFactory === defaultWorkerFactory &&
    !canUseMediabunnyFramePreviewWorker()
  ) {
    return Promise.reject(
      new Error(
        '当前浏览器不支持 Worker、OffscreenCanvas 或 WebCodecs 视频缩略图解码',
      ),
    );
  }

  return new Promise<MediabunnyFramePreviewSource>((resolve, reject) => {
    const worker = workerFactory();
    let disposed = false;
    let opened = false;
    let pendingExtraction: PendingExtraction | null = null;

    const rejectPending = (error: unknown) => {
      if (!opened) reject(error);
      pendingExtraction?.reject(error);
      pendingExtraction = null;
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener('abort', handleAbort);
      rejectPending(createAbortError());
      const request: FramePreviewWorkerRequest = { type: 'dispose' };
      try {
        worker.postMessage(request);
      } catch (error) {
        rejectPending(error);
        worker.terminate();
      }
    };
    const handleAbort = () => {
      dispose();
    };

    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isFramePreviewWorkerResponse(event.data)) return;
      if (event.data.type === 'disposed') {
        worker.terminate();
        return;
      }
      if (disposed) return;
      if (event.data.type === 'ready') {
        if (opened) return;
        opened = true;
        resolve({
          dispose,
          extract(frames, onFrame) {
            if (disposed || signal.aborted) {
              return Promise.reject(createAbortError());
            }
            if (pendingExtraction) {
              return Promise.reject(
                new Error('已有视频缩略图提取任务正在执行'),
              );
            }
            if (frames.length === 0) return Promise.resolve();

            return new Promise<void>((resolveExtraction, rejectExtraction) => {
              pendingExtraction = {
                onFrame,
                reject: rejectExtraction,
                resolve: resolveExtraction,
              };
              const request: FramePreviewWorkerRequest = {
                frames: [...frames],
                type: 'extract',
              };
              try {
                worker.postMessage(request);
              } catch (error) {
                pendingExtraction = null;
                rejectExtraction(error);
              }
            });
          },
          frameWidth: event.data.frameWidth,
          mediaDurationUs: event.data.mediaDurationUs,
        });
        return;
      }
      if (event.data.type === 'frame') {
        pendingExtraction?.onFrame({
          blob: event.data.blob,
          index: event.data.index,
          timeUs: event.data.timeUs,
        });
        return;
      }
      if (event.data.type === 'complete') {
        const extraction = pendingExtraction;
        pendingExtraction = null;
        extraction?.resolve();
        return;
      }

      const error = new FramePreviewDecodeError(
        event.data.code,
        event.data.message,
      );
      if (!opened) {
        reject(error);
        disposed = true;
        signal.removeEventListener('abort', handleAbort);
        worker.terminate();
      } else {
        const extraction = pendingExtraction;
        pendingExtraction = null;
        extraction?.reject(error);
      }
    };
    worker.onerror = () => {
      const error = new FramePreviewDecodeError(
        'decode',
        'Mediabunny 视频缩略图 Worker 运行失败',
      );
      rejectPending(error);
      if (!opened) reject(error);
      disposed = true;
      signal.removeEventListener('abort', handleAbort);
      worker.terminate();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    const request: FramePreviewWorkerRequest = {
      blob,
      outputHeight,
      type: 'open',
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      reject(error);
      opened = true;
      dispose();
    }
  });
};
