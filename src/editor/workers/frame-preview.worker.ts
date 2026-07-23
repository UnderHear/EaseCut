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
  isFramePreviewWorkerRequest,
  type FramePreviewWorkerRequest,
  type FramePreviewWorkerResponse,
} from './frame-preview-protocol';

const cancelledRequests = new Set<number>();
const activeInputs = new Map<number, Input>();
let queue = Promise.resolve();

const postResponse = (response: FramePreviewWorkerResponse) => {
  self.postMessage(response);
};

const getErrorResponse = (
  requestId: number,
  error: unknown,
): FramePreviewWorkerResponse => {
  if (error instanceof UnsupportedInputFormatError) {
    return {
      code: 'invalid-media',
      message: 'WebCodecs 后端无法解析该媒体容器',
      requestId,
      type: 'error',
    };
  }
  return {
    code: 'decode',
    message:
      error instanceof Error
        ? `WebCodecs 预览帧解码失败：${error.message}`
        : 'WebCodecs 预览帧解码失败',
    requestId,
    type: 'error',
  };
};

const extractFrames = async (
  request: Extract<FramePreviewWorkerRequest, { type: 'extract' }>,
) => {
  if (cancelledRequests.delete(request.requestId)) return;

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(request.blob),
  });
  activeInputs.set(request.requestId, input);

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      postResponse({
        code: 'unsupported',
        message: '当前浏览器不支持该视频编码格式的 WebCodecs 解码',
        requestId: request.requestId,
        type: 'error',
      });
      return;
    }

    const sink = new CanvasSink(track, {
      height: request.captureHeight,
      poolSize: 2,
    });
    const timestamps = request.frames.map(({ time }) => time);
    let resultIndex = 0;

    for await (const result of sink.canvasesAtTimestamps(timestamps)) {
      if (cancelledRequests.has(request.requestId)) return;
      const frame = request.frames[resultIndex];
      resultIndex += 1;
      if (!frame || !result) continue;
      if (!(result.canvas instanceof OffscreenCanvas)) {
        throw new Error('Worker 未提供 OffscreenCanvas');
      }
      const blob = await result.canvas.convertToBlob({
        quality: 0.72,
        type: 'image/jpeg',
      });
      if (cancelledRequests.has(request.requestId)) return;
      postResponse({
        blob,
        index: frame.index,
        requestId: request.requestId,
        type: 'frame',
      });
    }

    postResponse({
      requestId: request.requestId,
      type: 'complete',
    });
  } catch (error) {
    if (
      cancelledRequests.has(request.requestId) ||
      error instanceof InputDisposedError
    ) {
      return;
    }
    postResponse(getErrorResponse(request.requestId, error));
  } finally {
    activeInputs.delete(request.requestId);
    cancelledRequests.delete(request.requestId);
    input.dispose();
  }
};

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isFramePreviewWorkerRequest(event.data)) return;
  if (event.data.type === 'cancel') {
    cancelledRequests.add(event.data.requestId);
    activeInputs.get(event.data.requestId)?.dispose();
    return;
  }

  const request = event.data;
  queue = queue.then(
    () => extractFrames(request),
    () => extractFrames(request),
  );
});
