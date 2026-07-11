const DEFAULT_AUDIO_WAVEFORM_SAMPLE_COUNT = 512;

type AudioWaveformEntry =
  | {
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

export const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(
        error &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'AbortError',
      );

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
) => {
  const entries = new Map<string, AudioWaveformEntry>();

  const decode = async (src: string, sampleCount: number) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      throw new Error('当前浏览器不支持音频波形解析');
    }

    const audioContext = new AudioContextConstructor();
    try {
      const blob = await getBlob(src);
      const audioBuffer = await audioContext.decodeAudioData(
        await blob.arrayBuffer(),
      );
      if (isDisposed()) {
        throw new DOMException('媒体运行时已销毁', 'AbortError');
      }
      return sampleAudioBuffer(audioBuffer, sampleCount);
    } finally {
      await audioContext.close();
    }
  };

  const getSamples = (
    src: string,
    sampleCount = DEFAULT_AUDIO_WAVEFORM_SAMPLE_COUNT,
  ) => {
    if (isDisposed()) {
      return Promise.reject(new DOMException('媒体运行时已销毁', 'AbortError'));
    }

    const safeSampleCount = Math.max(0, Math.floor(sampleCount));
    const key = `${src}\n${safeSampleCount}`;
    const cachedEntry = entries.get(key);
    if (cachedEntry?.status === 'ready') {
      return Promise.resolve(cachedEntry.samples);
    }
    if (cachedEntry?.status === 'pending') {
      return cachedEntry.promise;
    }

    const promise = decode(src, safeSampleCount)
      .then((samples) => {
        entries.set(key, { samples, status: 'ready' });
        return samples;
      })
      .catch((error: unknown) => {
        entries.delete(key);
        if (isAbortError(error)) {
          throw error;
        }

        console.warn('音频波形解析失败', { error, src });
        return [];
      });

    entries.set(key, { promise, status: 'pending' });
    return promise;
  };

  return {
    clear: () => entries.clear(),
    getSamples,
  };
};

