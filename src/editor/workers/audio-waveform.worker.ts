/// <reference lib="webworker" />

import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  Input,
  InputDisposedError,
  UnsupportedInputFormatError,
} from 'mediabunny';

import {
  accumulateAudioSamplePeaks,
  normalizeAudioPeaks,
} from '../media/audio-waveform-peaks';
import { secondsToMicroseconds } from '../core/time';
import {
  isAudioWaveformWorkerRequest,
  type AudioWaveformWorkerRequest,
  type AudioWaveformWorkerResponse,
} from './audio-waveform-protocol';

const cancelledRequests = new Set<number>();
const activeInputs = new Map<number, Input>();
const queuedRequests = new Set<number>();
let queue = Promise.resolve();

const postResponse = (
  response: AudioWaveformWorkerResponse,
  transfer?: Transferable[],
) => {
  self.postMessage(response, transfer ?? []);
};

const getErrorResponse = (
  requestId: number,
  error: unknown,
): AudioWaveformWorkerResponse => {
  if (error instanceof UnsupportedInputFormatError) {
    return {
      code: 'invalid-media',
      message: 'Mediabunny 无法解析该音频容器',
      requestId,
      type: 'error',
    };
  }
  return {
    code: 'decode',
    message:
      error instanceof Error
        ? `Mediabunny 音频解码失败：${error.message}`
        : 'Mediabunny 音频解码失败',
    requestId,
    type: 'error',
  };
};

const extractWaveform = async (
  request: Extract<AudioWaveformWorkerRequest, { type: 'extract' }>,
) => {
  queuedRequests.delete(request.requestId);
  if (cancelledRequests.delete(request.requestId)) return;

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(request.blob),
  });
  activeInputs.set(request.requestId, input);

  try {
    if (request.sampleCount === 0) {
      const samples = new Float32Array();
      postResponse(
        {
          requestId: request.requestId,
          samples,
          type: 'complete',
        },
        [samples.buffer],
      );
      return;
    }

    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) {
      postResponse({
        code: 'unsupported',
        message: '当前浏览器不支持该音频编码格式的 WebCodecs 解码',
        requestId: request.requestId,
        type: 'error',
      });
      return;
    }

    const durationSeconds = await track.computeDuration();
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('无法读取有效的音频时长');
    }
    const durationUs = secondsToMicroseconds(durationSeconds);

    const peaks = new Float32Array(request.sampleCount);
    const sink = new AudioSampleSink(track);
    for await (const sample of sink.samples()) {
      try {
        if (cancelledRequests.has(request.requestId)) return;
        accumulateAudioSamplePeaks(peaks, durationUs, sample);
      } finally {
        sample.close();
      }
    }

    if (cancelledRequests.has(request.requestId)) return;
    normalizeAudioPeaks(peaks);
    postResponse(
      {
        requestId: request.requestId,
        samples: peaks,
        type: 'complete',
      },
      [peaks.buffer],
    );
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
  if (!isAudioWaveformWorkerRequest(event.data)) return;
  if (event.data.type === 'cancel') {
    if (
      !queuedRequests.has(event.data.requestId) &&
      !activeInputs.has(event.data.requestId)
    ) {
      return;
    }
    cancelledRequests.add(event.data.requestId);
    activeInputs.get(event.data.requestId)?.dispose();
    return;
  }

  const request = event.data;
  queuedRequests.add(request.requestId);
  queue = queue.then(
    () => extractWaveform(request),
    () => extractWaveform(request),
  );
});
