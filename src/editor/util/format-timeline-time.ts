const CENTISECONDS_PER_SECOND = 100;
const SECONDS_PER_MINUTE = 60;

const formatSegment = (value: number) => value.toString().padStart(2, '0');

/** Formats seconds as minutes, seconds, and truncated centiseconds (MM:SS:CC). */
export const formatTimelineTime = (time: number) => {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const centiseconds = safeTime * CENTISECONDS_PER_SECOND;
  const totalCentiseconds = Math.floor(
    centiseconds + Number.EPSILON * Math.max(1, centiseconds),
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
