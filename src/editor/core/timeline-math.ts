import { MICROSECONDS_PER_SECOND } from './time';

export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 10;
export const MAX_PIXELS_PER_SECOND = 240;
export const TIMELINE_ZOOM_STEP = 10;
export const SNAP_THRESHOLD_PX = 6;

export const timeUsToX = (timeUs: number, pixelsPerSecond: number) =>
  (Math.max(0, normalizeTimelineTimeUs(timeUs)) / MICROSECONDS_PER_SECOND) *
  pixelsPerSecond;

export const xToTimeUs = (x: number, pixelsPerSecond: number) =>
  normalizeTimelineTimeUs(
    (Math.max(0, x) / Math.max(1, pixelsPerSecond)) *
      MICROSECONDS_PER_SECOND,
  );

export const durationUsToWidth = (
  durationUs: number,
  pixelsPerSecond: number,
) =>
  (Math.max(0, normalizeTimelineTimeUs(durationUs)) /
    MICROSECONDS_PER_SECOND) *
  pixelsPerSecond;

export const normalizeTimelineTimeUs = (timeUs: number) => {
  if (!Number.isFinite(timeUs)) {
    throw new TypeError('时间线时间必须是有限数字');
  }
  const normalizedTimeUs = Math.round(timeUs);
  if (!Number.isSafeInteger(normalizedTimeUs)) {
    throw new RangeError('时间线时间超出安全整数范围');
  }
  return normalizedTimeUs;
};

/**
 * "Nice" interval candidates for major tick spacing (in seconds).
 * Sorted smallest → largest so we can pick the best-fit.
 */
const NICE_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

/** Target pixel spacing between two major ticks. */
const TARGET_MAJOR_TICK_PX = 100;
const DEFAULT_MINOR_DIVISIONS = 5;
const DENSE_MINOR_DIVISIONS = 10;
const DENSE_MINOR_THRESHOLD_PX = 120;

type TickScale = {
  /** Microseconds between two major ticks. */
  majorIntervalUs: number;
  /** How many minor ticks to draw between two major ticks. */
  minorDivisions: number;
};

/**
 * Choose the best major interval and minor division based on the current
 * pixelsPerSecond (zoom level).
 */
export const calcTickScale = (pixelsPerSecond: number): TickScale => {
  const safePixelsPerSecond = Math.max(1, pixelsPerSecond);
  const majorIntervalSeconds = NICE_INTERVALS.reduce((best, candidate) =>
    getTickSpacingScore(candidate, safePixelsPerSecond) <
    getTickSpacingScore(best, safePixelsPerSecond)
      ? candidate
      : best,
  );

  const minorDivisions =
    majorIntervalSeconds === 1 &&
    majorIntervalSeconds * safePixelsPerSecond >= DENSE_MINOR_THRESHOLD_PX
      ? DENSE_MINOR_DIVISIONS
      : DEFAULT_MINOR_DIVISIONS;

  return {
    majorIntervalUs: majorIntervalSeconds * MICROSECONDS_PER_SECOND,
    minorDivisions,
  };
};

const getTickSpacingScore = (interval: number, pixelsPerSecond: number) =>
  Math.abs(Math.log((interval * pixelsPerSecond) / TARGET_MAJOR_TICK_PX));
