/// <reference lib="webworker" />

import {
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
  Input,
  InputDisposedError,
  UnsupportedInputFormatError,
} from 'mediabunny';

import {
  microsecondsToSeconds,
  secondsToMicroseconds,
} from '../core/time';
import {
  isFramePreviewWorkerRequest,
  type FramePreviewWorkerFrame,
  type FramePreviewWorkerResponse,
} from './frame-preview-protocol';

let input: Input | null = null;
let sink: CanvasSink | null = null;
let firstTimestamp = 0;
let disposed = false;
let extracting = false;

const postResponse = (response: FramePreviewWorkerResponse) => {
  self.postMessage(response);
};

const canvasToJpegBlob = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> => {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({
      quality: 0.72,
      type: 'image/jpeg',
    });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Mediabunny 无法编码视频缩略图'));
        }
      },
      'image/jpeg',
      0.72,
    );
  });
};

const dispose = () => {
  if (disposed) return;
  disposed = true;
  input?.dispose();
  input = null;
  sink = null;
};

const getErrorResponse = (error: unknown): FramePreviewWorkerResponse => {
  if (error instanceof UnsupportedInputFormatError) {
    return {
      code: 'invalid-media',
      message: 'Mediabunny 无法解析该视频容器',
      type: 'error',
    };
  }
  return {
    code: 'decode',
    message:
      error instanceof Error
        ? `Mediabunny 视频缩略图解码失败：${error.message}`
        : 'Mediabunny 视频缩略图解码失败',
    type: 'error',
  };
};

const openInput = async (blob: Blob, outputHeight: number) => {
  input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      postResponse({
        code: 'invalid-media',
        message: 'Mediabunny 未找到可用的视频轨道',
        type: 'error',
      });
      dispose();
      return;
    }
    if (!(await track.canDecode())) {
      postResponse({
        code: 'unsupported',
        message: '当前浏览器不支持该视频编码格式的 WebCodecs 解码',
        type: 'error',
      });
      dispose();
      return;
    }

    const [
      displayHeight,
      displayWidth,
      trackFirstTimestamp,
      endTimestamp,
    ] = await Promise.all([
      track.getDisplayHeight(),
      track.getDisplayWidth(),
      track.getFirstTimestamp(),
      track.computeDuration(),
    ]);
    if (
      !Number.isFinite(displayHeight) ||
      displayHeight <= 0 ||
      !Number.isFinite(displayWidth) ||
      displayWidth <= 0
    ) {
      throw new Error('Mediabunny 返回了无效的视频帧尺寸');
    }
    if (
      !Number.isFinite(trackFirstTimestamp) ||
      !Number.isFinite(endTimestamp) ||
      endTimestamp <= trackFirstTimestamp
    ) {
      throw new Error('Mediabunny 返回了无效的视频时长');
    }
    if (disposed) return;

    firstTimestamp = trackFirstTimestamp;
    sink = new CanvasSink(track, {
      height: outputHeight,
      poolSize: 1,
    });
    postResponse({
      frameWidth: Math.max(
        1,
        Math.round(
          outputHeight * (displayWidth / displayHeight),
        ),
      ),
      mediaDurationUs: secondsToMicroseconds(
        endTimestamp - trackFirstTimestamp,
      ),
      type: 'ready',
    });
  } catch (error) {
    if (disposed || error instanceof InputDisposedError) return;
    postResponse(getErrorResponse(error));
    dispose();
  }
};

const extractFrames = async (frames: readonly FramePreviewWorkerFrame[]) => {
  if (!sink || extracting) {
    postResponse({
      code: 'decode',
      message: 'Mediabunny 视频缩略图提取状态无效',
      type: 'error',
    });
    return;
  }
  extracting = true;
  const orderedFrames = [...frames].sort(
    (left, right) =>
      left.timeUs - right.timeUs || left.index - right.index,
  );
  const timestamps = orderedFrames.map(
    (frame) =>
      firstTimestamp + microsecondsToSeconds(frame.timeUs),
  );
  let resultIndex = 0;

  try {
    for await (const result of sink.canvasesAtTimestamps(timestamps)) {
      const frame = orderedFrames[resultIndex];
      resultIndex += 1;
      if (!frame || !result || disposed) continue;

      const blob = await canvasToJpegBlob(result.canvas);
      if (disposed) return;
      postResponse({ ...frame, blob, type: 'frame' });
    }
    if (!disposed) postResponse({ type: 'complete' });
  } catch (error) {
    if (disposed || error instanceof InputDisposedError) return;
    postResponse(getErrorResponse(error));
  } finally {
    extracting = false;
  }
};

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isFramePreviewWorkerRequest(event.data) || disposed) return;
  if (event.data.type === 'dispose') {
    dispose();
    postResponse({ type: 'disposed' });
    self.close();
    return;
  }
  if (event.data.type === 'open') {
    if (input) {
      postResponse({
        code: 'decode',
        message: 'Mediabunny 视频缩略图输入已打开',
        type: 'error',
      });
      return;
    }
    void openInput(event.data.blob, event.data.outputHeight);
    return;
  }
  void extractFrames(event.data.frames);
});
