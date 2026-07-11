import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  calcTickScale,
} from './timeline-math';
import { createTimelineStore } from '../store/timeline-store';

const timelineStore = createTimelineStore();

describe('timeline zoom scale', () => {
  beforeEach(() => {
    timelineStore.setState({ pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND });
  });

  it('keeps the major tick interval at least one second at max zoom', () => {
    const scale = calcTickScale(240);
    const labels = [0, 1, 2].map(scale.formatTick);

    expect(scale.majorInterval).toBe(1);
    expect(labels).toEqual(['00:00', '00:01', '00:02']);
  });

  it('keeps major tick cadence stable around previous zoom jump points', () => {
    expect(calcTickScale(65).majorInterval).toBe(
      calcTickScale(66).majorInterval,
    );
    expect(calcTickScale(130).majorInterval).toBe(
      calcTickScale(131).majorInterval,
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
