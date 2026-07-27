const CENTISECONDS_PER_SECOND = 100;
const MICROSECONDS_PER_CENTISECOND = 10_000;
const SECONDS_PER_MINUTE = 60;

const formatSegment = (value: number) => value.toString().padStart(2, '0');

/** Formats microseconds as minutes, seconds, and centiseconds (MM:SS:CC). */
export const formatTimelineTime = (timeUs: number) => {
  const safeTimeUs = Number.isFinite(timeUs)
    ? Math.max(0, Math.round(timeUs))
    : 0;
  const totalCentiseconds = Math.floor(
    safeTimeUs / MICROSECONDS_PER_CENTISECOND,
  );
  const totalSeconds = Math.floor(
    totalCentiseconds / CENTISECONDS_PER_SECOND,
  );
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const remainingCentiseconds = totalCentiseconds % CENTISECONDS_PER_SECOND;

  return `${formatSegment(minutes)}:${formatSegment(seconds)}:${formatSegment(
    remainingCentiseconds,
  )}`;
};
