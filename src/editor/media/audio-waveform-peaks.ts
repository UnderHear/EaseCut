export type DecodedAudioSample = {
  allocationSize(options: {
    format: 'f32-planar';
    planeIndex: number;
  }): number;
  copyTo(
    destination: AllowSharedBufferSource,
    options: {
      format: 'f32-planar';
      planeIndex: number;
    },
  ): void;
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  timestamp: number;
};

export const accumulateAudioSamplePeaks = (
  peaks: Float32Array,
  durationSeconds: number,
  sample: DecodedAudioSample,
) => {
  if (
    peaks.length === 0 ||
    durationSeconds <= 0 ||
    sample.numberOfChannels <= 0 ||
    sample.numberOfFrames <= 0 ||
    sample.sampleRate <= 0
  ) {
    return;
  }

  const options = {
    format: 'f32-planar' as const,
    planeIndex: 0,
  };
  const channelData = new Float32Array(
    sample.allocationSize(options) / Float32Array.BYTES_PER_ELEMENT,
  );

  for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
    sample.copyTo(channelData, { ...options, planeIndex: channel });
    for (let frame = 0; frame < sample.numberOfFrames; frame += 1) {
      const timestamp = sample.timestamp + frame / sample.sampleRate;
      if (timestamp < 0 || timestamp >= durationSeconds) continue;
      const bucket = Math.floor(
        (timestamp / durationSeconds) * peaks.length,
      );
      const value = channelData[frame] ?? 0;
      const peak = Number.isFinite(value) ? Math.abs(value) : 0;
      if (peak > (peaks[bucket] ?? 0)) peaks[bucket] = peak;
    }
  }
};

export const normalizeAudioPeaks = (peaks: Float32Array) => {
  let maxPeak = 0;
  for (const peak of peaks) maxPeak = Math.max(maxPeak, peak);
  if (maxPeak === 0) return peaks;
  for (let index = 0; index < peaks.length; index += 1) {
    peaks[index] = (peaks[index] ?? 0) / maxPeak;
  }
  return peaks;
};
