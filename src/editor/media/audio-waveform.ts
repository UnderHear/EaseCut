import type { AudioWaveformExtractor } from './mediabunny-audio-waveform';
import {
  MAX_AUDIO_WAVEFORM_SAMPLE_COUNT,
  normalizeAudioWaveformSampleCount,
} from '../workers/audio-waveform-protocol';
import {
  createAbortError as createDomAbortError,
  isAbortError,
} from '../util/abort-error';

const DEFAULT_AUDIO_WAVEFORM_SAMPLE_COUNT = 512;
export const HIGH_RESOLUTION_AUDIO_WAVEFORM_SAMPLE_COUNT =
  MAX_AUDIO_WAVEFORM_SAMPLE_COUNT;

type AudioWaveformEntry =
  | {
      controller: AbortController;
      promise: Promise<number[]>;
      status: 'pending';
    }
  | {
      samples: number[];
      status: 'ready';
    };

const getAudioContextConstructor = () =>
  globalThis.AudioContext ??
  (
    globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).webkitAudioContext;

const createAbortError = () =>
  createDomAbortError('媒体运行时已销毁');

export const sampleAudioBuffer = (
  audioBuffer: Pick<
    AudioBuffer,
    'getChannelData' | 'length' | 'numberOfChannels'
  >,
  sampleCount = DEFAULT_AUDIO_WAVEFORM_SAMPLE_COUNT,
) => {
  if (
    audioBuffer.length === 0 ||
    audioBuffer.numberOfChannels === 0 ||
    sampleCount <= 0
  ) {
    return [];
  }

  const bucketSize = Math.max(1, Math.ceil(audioBuffer.length / sampleCount));
  const samples = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const start = sampleIndex * bucketSize;
    const end = Math.min(audioBuffer.length, start + bucketSize);
    let peak = 0;

    for (
      let channel = 0;
      channel < audioBuffer.numberOfChannels;
      channel += 1
    ) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(channelData[index] ?? 0));
      }
    }

    return peak;
  });
  const maxPeak = Math.max(...samples, 0);

  return maxPeak > 0 ? samples.map((sample) => sample / maxPeak) : samples;
};

export const createAudioWaveformCache = (
  getBlob: (src: string) => Promise<Blob>,
  isDisposed: () => boolean,
  extractor: AudioWaveformExtractor | null = null,
) => {
  const entries = new Map<string, AudioWaveformEntry>();

  const decodeWithAudioContext = async (
    blob: Blob,
    sampleCount: number,
    signal: AbortSignal,
  ) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      throw new Error('当前浏览器不支持音频波形解析');
    }

    const audioContext = new AudioContextConstructor();
    try {
      const audioBuffer = await audioContext.decodeAudioData(
        await blob.arrayBuffer(),
      );
      if (isDisposed() || signal.aborted) {
        throw createAbortError();
      }
      return sampleAudioBuffer(audioBuffer, sampleCount);
    } finally {
      await audioContext.close();
    }
  };

  const decode = async (
    src: string,
    sampleCount: number,
    signal: AbortSignal,
  ) => {
    if (sampleCount === 0) return [];
    const blob = await getBlob(src);
    if (isDisposed() || signal.aborted) {
      throw createAbortError();
    }

    if (extractor) {
      try {
        const samples = await extractor.extract(blob, sampleCount, signal);
        if (isDisposed() || signal.aborted) {
          throw createAbortError();
        }
        return samples;
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (signal.aborted || isDisposed()) throw createAbortError();
      }
    }

    return decodeWithAudioContext(blob, sampleCount, signal);
  };

  const getSamples = (
    src: string,
    sampleCount = DEFAULT_AUDIO_WAVEFORM_SAMPLE_COUNT,
  ) => {
    if (isDisposed()) {
      return Promise.reject(createAbortError());
    }

    const safeSampleCount = normalizeAudioWaveformSampleCount(sampleCount);
    const key = `${src}\n${safeSampleCount}`;
    const cachedEntry = entries.get(key);
    if (cachedEntry?.status === 'ready') {
      return Promise.resolve(cachedEntry.samples);
    }
    if (cachedEntry?.status === 'pending') {
      return cachedEntry.promise;
    }

    const controller = new AbortController();
    const entry: Extract<AudioWaveformEntry, { status: 'pending' }> = {
      controller,
      promise: Promise.resolve([]),
      status: 'pending',
    };
    entry.promise = decode(src, safeSampleCount, controller.signal)
      .then((samples) => {
        if (entries.get(key) === entry) {
          entries.set(key, { samples, status: 'ready' });
        }
        return samples;
      })
      .catch((error: unknown) => {
        if (entries.get(key) === entry) entries.delete(key);
        if (isAbortError(error)) {
          throw error;
        }

        console.warn('音频波形解析失败', { error, src });
        return [];
      });

    entries.set(key, entry);
    return entry.promise;
  };

  return {
    clear: () => {
      entries.forEach((entry) => {
        if (entry.status === 'pending') entry.controller.abort();
      });
      entries.clear();
    },
    getSamples,
  };
};
