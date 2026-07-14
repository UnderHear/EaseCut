export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 10;
export const MAX_PIXELS_PER_SECOND = 240;
export const TIMELINE_ZOOM_STEP = 10;
export const SNAP_THRESHOLD_PX = 6;

export const timeToX = (time: number, pixelsPerSecond: number) =>
  Math.max(0, time) * pixelsPerSecond;

export const xToTime = (x: number, pixelsPerSecond: number) =>
  Math.max(0, x) / pixelsPerSecond;

export const durationToWidth = (duration: number, pixelsPerSecond: number) =>
  Math.max(0, duration) * pixelsPerSecond;

export const roundTimelineTime = (time: number) =>
  Math.round(time * 1000) / 1000;
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
  /** Seconds between two major ticks. */
  majorInterval: number;
  /** How many minor ticks to draw between two major ticks. */
  minorDivisions: number;
  /** Time formatter suitable for the current zoom level. */
  formatTick: (seconds: number) => string;
};

/**
 * Choose the best major-interval / minor-division / label-format based on
 * the current pixelsPerSecond (zoom level).
 */
export const calcTickScale = (pixelsPerSecond: number): TickScale => {
  const safePixelsPerSecond = Math.max(1, pixelsPerSecond);
  const majorInterval = NICE_INTERVALS.reduce((best, candidate) =>
    getTickSpacingScore(candidate, safePixelsPerSecond) <
    getTickSpacingScore(best, safePixelsPerSecond)
      ? candidate
      : best,
  );

  const minorDivisions =
    majorInterval === 1 &&
    majorInterval * safePixelsPerSecond >= DENSE_MINOR_THRESHOLD_PX
      ? DENSE_MINOR_DIVISIONS
      : DEFAULT_MINOR_DIVISIONS;
  const formatTick = formatTickTime;

  return { majorInterval, minorDivisions, formatTick };
};

const getTickSpacingScore = (interval: number, pixelsPerSecond: number) =>
  Math.abs(Math.log((interval * pixelsPerSecond) / TARGET_MAJOR_TICK_PX));

const formatTickTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const totalSeconds = Math.floor(safe);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsInMinute = totalSeconds % 60;
  const secondsText = secondsInMinute.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secondsText}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secondsText}`;
};
