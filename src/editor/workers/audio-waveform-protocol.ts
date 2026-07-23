export const MAX_AUDIO_WAVEFORM_SAMPLE_COUNT = 16_384;

export const normalizeAudioWaveformSampleCount = (value: number) =>
  Number.isFinite(value)
    ? Math.min(
        MAX_AUDIO_WAVEFORM_SAMPLE_COUNT,
        Math.max(0, Math.floor(value)),
      )
    : 0;

export type AudioWaveformWorkerRequest =
  | {
      blob: Blob;
      requestId: number;
      sampleCount: number;
      type: 'extract';
    }
  | {
      requestId: number;
      type: 'cancel';
    };

export type AudioWaveformWorkerResponse =
  | {
      requestId: number;
      samples: Float32Array;
      type: 'complete';
    }
  | {
      code: 'decode' | 'invalid-media' | 'unsupported';
      message: string;
      requestId: number;
      type: 'error';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= 0;

const isAudioWaveformSampleCount = (value: unknown): value is number =>
  isNonNegativeInteger(value) &&
  value <= MAX_AUDIO_WAVEFORM_SAMPLE_COUNT;

export const isAudioWaveformWorkerRequest = (
  value: unknown,
): value is AudioWaveformWorkerRequest => {
  if (!isRecord(value) || !isNonNegativeInteger(value.requestId)) return false;
  if (value.type === 'cancel') return true;
  return (
    value.type === 'extract' &&
    value.blob instanceof Blob &&
    isAudioWaveformSampleCount(value.sampleCount)
  );
};

export const isAudioWaveformWorkerResponse = (
  value: unknown,
): value is AudioWaveformWorkerResponse => {
  if (!isRecord(value) || !isNonNegativeInteger(value.requestId)) return false;
  if (value.type === 'complete') {
    return value.samples instanceof Float32Array;
  }
  return (
    value.type === 'error' &&
    (value.code === 'decode' ||
      value.code === 'invalid-media' ||
      value.code === 'unsupported') &&
    typeof value.message === 'string'
  );
};
