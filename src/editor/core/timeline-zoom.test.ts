import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  calcTickScale,
  durationUsToWidth,
  normalizeTimelineTimeUs,
  timeUsToX,
  xToTimeUs,
} from './timeline-math';
import { secondsToMicroseconds } from './time';
import { createTimelineStore } from '../store/timeline-store';

const timelineStore = createTimelineStore();

describe('timeline zoom scale', () => {
  beforeEach(() => {
    timelineStore.setState({ pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND });
  });

  it('keeps the major tick interval at least one second at max zoom', () => {
    const scale = calcTickScale(240);

    expect(scale.majorIntervalUs).toBe(secondsToMicroseconds(1));
  });

  it('keeps major tick cadence stable around previous zoom jump points', () => {
    expect(calcTickScale(65).majorIntervalUs).toBe(
      calcTickScale(66).majorIntervalUs,
    );
    expect(calcTickScale(130).majorIntervalUs).toBe(
      calcTickScale(131).majorIntervalUs,
    );
  });

  it('uses denser minor divisions when one-second major ticks have enough space', () => {
    expect(calcTickScale(80).minorDivisions).toBe(5);
    expect(calcTickScale(240).minorDivisions).toBe(10);
  });

  it('clamps the store zoom minimum to 10 pixels per second', () => {
    timelineStore.getState().setPixelsPerSecond(5);

    expect(MIN_PIXELS_PER_SECOND).toBe(10);
    expect(timelineStore.getState().pixelsPerSecond).toBe(10);
  });
});

describe('timeline coordinates', () => {
  it('converts integer microseconds at the pixels-per-second boundary', () => {
    const timeUs = secondsToMicroseconds(2.5);

    expect(timeUsToX(timeUs, 80)).toBe(200);
    expect(durationUsToWidth(timeUs, 80)).toBe(200);
    expect(xToTimeUs(200, 80)).toBe(timeUs);
  });

  it('keeps long timeline coordinates based on absolute time', () => {
    const sixHoursUs = secondsToMicroseconds(6 * 60 * 60);
    const x = timeUsToX(sixHoursUs, 240);

    expect(xToTimeUs(x, 240)).toBe(sixHoursUs);
  });

  it('rejects invalid timeline times instead of silently resetting them', () => {
    expect(() => normalizeTimelineTimeUs(Number.NaN)).toThrow(TypeError);
    expect(() =>
      normalizeTimelineTimeUs(Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(RangeError);
  });
});
