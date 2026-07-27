import { describe, expect, it } from 'vitest';

import {
  AUDIO_WAVEFORM_BAR_SPACING_PIXELS,
  getAudioWaveformBitmapSize,
  getAudioWaveformBars,
  getAudioWaveformRenderWindow,
} from './audio-waveform-bars';
import { secondsToMicroseconds } from './time';

const samples = [0.1, 0.8, 0.2, 0.4, 1, 0.3, 0.6, 0.2];

const getVisibleBars = (
  bars: ReturnType<typeof getAudioWaveformBars>,
  width: number,
) => bars.filter((bar) => bar.x >= 0 && bar.x < width);

describe('audio waveform bars', () => {
  it('keeps bars tightly spaced at different zoom levels', () => {
    for (const pixelsPerSecond of [40, 160]) {
      const width = 4 * pixelsPerSecond;
      const bars = getVisibleBars(
        getAudioWaveformBars(samples, {
          height: 20,
          pixelsPerSecond,
          sourceDurationUs: secondsToMicroseconds(8),
          sourceStartUs: 0,
          volume: 1,
          width,
        }),
        width,
      );

      expect(bars.length).toBe(Math.ceil(width / 2));
      for (let index = 1; index < bars.length; index += 1) {
        expect((bars[index]?.x ?? 0) - (bars[index - 1]?.x ?? 0)).toBe(
          AUDIO_WAVEFORM_BAR_SPACING_PIXELS,
        );
      }
    }
  });

  it('preserves overlapping source bars after trimming the start', () => {
    const pixelsPerSecond = 10;
    const full = getAudioWaveformBars(samples, {
      height: 20,
      pixelsPerSecond,
      sourceDurationUs: secondsToMicroseconds(8),
      sourceStartUs: 0,
      volume: 1,
      width: 80,
    });
    const trimmed = getVisibleBars(
      getAudioWaveformBars(samples, {
        height: 20,
        pixelsPerSecond,
        sourceDurationUs: secondsToMicroseconds(8),
        sourceStartUs: secondsToMicroseconds(2),
        volume: 1,
        width: 60,
      }),
      60,
    );
    const fullBySourcePixel = new Map(
      full.map((bar) => [bar.x, bar.height]),
    );

    for (const bar of trimmed) {
      expect(fullBySourcePixel.get(bar.x + 20)).toBeCloseTo(bar.height);
    }
  });

  it('only removes trailing bars after trimming the end', () => {
    const options = {
      height: 20,
      pixelsPerSecond: 10,
      sourceDurationUs: secondsToMicroseconds(8),
      sourceStartUs: 0,
      volume: 1,
    } as const;
    const full = getVisibleBars(
      getAudioWaveformBars(samples, { ...options, width: 80 }),
      80,
    );
    const shortened = getVisibleBars(
      getAudioWaveformBars(samples, { ...options, width: 40 }),
      40,
    );

    expect(shortened).toEqual(full.slice(0, shortened.length));
  });

  it('scales only bar heights with the track volume', () => {
    const options = {
      height: 20,
      pixelsPerSecond: 10,
      sourceDurationUs: secondsToMicroseconds(8),
      sourceStartUs: 0,
      width: 40,
    } as const;
    const fullVolume = getAudioWaveformBars(samples, {
      ...options,
      volume: 1,
    });
    const halfVolume = getAudioWaveformBars(samples, {
      ...options,
      volume: 0.5,
    });
    const muted = getAudioWaveformBars(samples, { ...options, volume: 0 });

    expect(halfVolume).toHaveLength(fullVolume.length);
    halfVolume.forEach((bar, index) => {
      const fullBar = fullVolume[index];
      expect(bar.x).toBe(fullBar?.x);
      expect(bar.width).toBe(fullBar?.width);
      expect(bar.height).toBe((fullBar?.height ?? 0) / 2);
    });
    expect(muted.every((bar) => bar.height === 0)).toBe(true);
  });

  it('bounds the canvas to the visible clip intersection with edge overscan', () => {
    expect(
      getAudioWaveformRenderWindow({
        clipDurationUs: secondsToMicroseconds(100),
        pixelsPerSecond: 80,
        timelineStartUs: secondsToMicroseconds(10),
        trimStartUs: secondsToMicroseconds(5),
        visibleTimeEndUs: secondsToMicroseconds(22),
        visibleTimeStartUs: secondsToMicroseconds(20),
      }),
    ).toEqual({
      left: 798,
      sourceStartUs: secondsToMicroseconds(14.975),
      width: 164,
    });
  });

  it('keeps long, highly zoomed assets bounded to the visible window', () => {
    expect(
      getAudioWaveformRenderWindow({
        clipDurationUs: secondsToMicroseconds(21_600),
        pixelsPerSecond: 2_000,
        timelineStartUs: 0,
        trimStartUs: secondsToMicroseconds(7_200),
        visibleTimeEndUs: secondsToMicroseconds(10_000.6),
        visibleTimeStartUs: secondsToMicroseconds(10_000),
      }),
    ).toEqual({
      left: 19_999_998,
      sourceStartUs: secondsToMicroseconds(17_199.999),
      width: 1_204,
    });
  });

  it('draws finite bars for an extremely short visible source range', () => {
    const bars = getAudioWaveformBars([0.25, 1], {
      height: 20,
      pixelsPerSecond: 2_000,
      sourceDurationUs: secondsToMicroseconds(0.001),
      sourceStartUs: 0,
      volume: 1,
      width: 2,
    });

    expect(bars.length).toBeGreaterThan(0);
    expect(
      bars.every((bar) =>
        [bar.height, bar.width, bar.x, bar.y].every(Number.isFinite),
      ),
    ).toBe(true);
  });

  it('caps high-DPR bitmap allocation while preserving CSS geometry', () => {
    expect(getAudioWaveformBitmapSize(320.4, 36, 3)).toEqual({
      height: 72,
      pixelRatio: 2,
      width: 641,
    });
  });

  it('returns no output for empty samples or invalid geometry', () => {
    const options = {
      height: 20,
      pixelsPerSecond: 80,
      sourceDurationUs: secondsToMicroseconds(8),
      sourceStartUs: 0,
      volume: 1,
      width: 40,
    } as const;
    expect(getAudioWaveformBars([], options)).toEqual([]);
    expect(
      getAudioWaveformBars([1], { ...options, sourceDurationUs: Number.NaN }),
    ).toEqual([]);
    expect(
      getAudioWaveformRenderWindow({
        clipDurationUs: secondsToMicroseconds(1),
        pixelsPerSecond: 80,
        timelineStartUs: 0,
        trimStartUs: 0,
        visibleTimeEndUs: secondsToMicroseconds(2),
        visibleTimeStartUs: secondsToMicroseconds(2),
      }),
    ).toBeNull();
  });
});
