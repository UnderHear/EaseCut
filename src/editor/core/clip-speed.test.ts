import { describe, expect, it } from 'vitest';

import {
  getSpeedAdjustedDurationUs,
  getSpeedAdjustedPixelsPerSecond,
  isValidClipSpeed,
  scaleTimelineOffsetToSourceUs,
  sourceTimeToSpeedAdjustedTimeUs,
  timelineTimeToClipSourceTimeUs,
} from './clip-speed';
import { secondsToMicroseconds } from './time';

describe('clip speed time mapping', () => {
  it('accepts the inclusive speed range and rejects invalid values', () => {
    expect(isValidClipSpeed(0.1)).toBe(true);
    expect(isValidClipSpeed(1.37)).toBe(true);
    expect(isValidClipSpeed(4)).toBe(true);
    expect(isValidClipSpeed(0.09)).toBe(false);
    expect(isValidClipSpeed(4.01)).toBe(false);
    expect(isValidClipSpeed(Number.NaN)).toBe(false);
  });

  it('scales source endpoints before subtracting their timeline duration', () => {
    const trimStartUs = 500_001;
    const splitSourceTimeUs = 1_734_567;
    const trimEndUs = 2_500_003;
    const speed = 1.3;
    const durationUs = getSpeedAdjustedDurationUs(
      trimStartUs,
      trimEndUs,
      speed,
    );
    const leftDurationUs = getSpeedAdjustedDurationUs(
      trimStartUs,
      splitSourceTimeUs,
      speed,
    );
    const rightDurationUs = getSpeedAdjustedDurationUs(
      splitSourceTimeUs,
      trimEndUs,
      speed,
    );

    expect(durationUs).toBe(
      sourceTimeToSpeedAdjustedTimeUs(trimEndUs, speed) -
        sourceTimeToSpeedAdjustedTimeUs(trimStartUs, speed),
    );
    expect(leftDurationUs + rightDurationUs).toBe(durationUs);
  });

  it('maps timeline offsets, source positions and visual density by speed', () => {
    const clip = {
      durationUs: secondsToMicroseconds(2),
      speed: 2,
      startUs: secondsToMicroseconds(3),
      trimEndUs: secondsToMicroseconds(5),
      trimStartUs: secondsToMicroseconds(1),
    };

    expect(scaleTimelineOffsetToSourceUs(750_000, clip.speed)).toBe(
      1_500_000,
    );
    expect(
      timelineTimeToClipSourceTimeUs(
        clip,
        secondsToMicroseconds(3.75),
      ),
    ).toBe(secondsToMicroseconds(2.5));
    expect(getSpeedAdjustedPixelsPerSecond(80, clip.speed)).toBe(40);
  });

  it('keeps active source times inside the trimmed end boundary', () => {
    const clip = {
      durationUs: 1,
      speed: 4,
      startUs: 0,
      trimEndUs: 4,
      trimStartUs: 0,
    };

    expect(timelineTimeToClipSourceTimeUs(clip, 0)).toBe(0);
    expect(timelineTimeToClipSourceTimeUs(clip, 1)).toBe(4);
  });
});
