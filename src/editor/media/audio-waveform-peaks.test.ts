import { describe, expect, it } from 'vitest';

import {
  accumulateAudioSamplePeaks,
  normalizeAudioPeaks,
  type DecodedAudioSample,
} from './audio-waveform-peaks';
import { secondsToMicroseconds } from '../core/time';

const createSample = (
  channels: Float32Array[],
  options: { sampleRate?: number; timestamp?: number } = {},
): DecodedAudioSample => ({
  allocationSize: () =>
    (channels[0]?.length ?? 0) * Float32Array.BYTES_PER_ELEMENT,
  copyTo: (destination, { planeIndex }) => {
    (destination as Float32Array).set(channels[planeIndex]);
  },
  numberOfChannels: channels.length,
  numberOfFrames: channels[0]?.length ?? 0,
  sampleRate: options.sampleRate ?? 4,
  timestamp: options.timestamp ?? 0,
});

describe('audio waveform peaks', () => {
  it('accumulates absolute peaks across decoded samples and channels', () => {
    const peaks = new Float32Array(4);

    accumulateAudioSamplePeaks(
      peaks,
      secondsToMicroseconds(2),
      createSample([
        new Float32Array([0.1, -0.4, 0.2, 0.1]),
        new Float32Array([0.3, 0.2, -0.8, 0.1]),
      ]),
    );
    accumulateAudioSamplePeaks(
      peaks,
      secondsToMicroseconds(2),
      createSample([new Float32Array([0.5, 1, 0.25, 0])], {
        timestamp: 1,
      }),
    );

    expect(Array.from(peaks)).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.8),
      expect.closeTo(1),
      expect.closeTo(0.25),
    ]);
  });

  it('skips samples outside the presentation duration', () => {
    const peaks = new Float32Array(2);

    accumulateAudioSamplePeaks(
      peaks,
      secondsToMicroseconds(1),
      createSample([new Float32Array([1, 0.5, 0.25, 0.75])], {
        timestamp: -0.5,
      }),
    );
    accumulateAudioSamplePeaks(
      peaks,
      secondsToMicroseconds(1),
      createSample([new Float32Array([0.9])], { timestamp: 2 }),
    );

    expect(Array.from(peaks)).toEqual([
      expect.closeTo(0.75),
      0,
    ]);
  });

  it('normalizes peaks while preserving silence', () => {
    expect(Array.from(normalizeAudioPeaks(new Float32Array([0, 0])))).toEqual([
      0, 0,
    ]);
    expect(
      Array.from(normalizeAudioPeaks(new Float32Array([0.25, 0.5]))),
    ).toEqual([0.5, 1]);
  });
});
