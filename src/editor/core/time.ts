export const MICROSECONDS_PER_MILLISECOND = 1_000;
export const MICROSECONDS_PER_SECOND = 1_000_000;

export type RationalFrameRate = Readonly<{
  denominator: number;
  numerator: number;
}>;

const assertNonNegativeFiniteNumber = (value: number, name: string) => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} 必须是有限数字`);
  }

  if (value < 0) {
    throw new RangeError(`${name} 不能为负数`);
  }
};

export const isValidTimeUs = (timeUs: number) =>
  Number.isSafeInteger(timeUs) && timeUs >= 0;

export const normalizeTimeUs = (timeUs: number) => {
  assertNonNegativeFiniteNumber(timeUs, 'timeUs');

  const normalizedTimeUs = Math.round(timeUs);
  if (!Number.isSafeInteger(normalizedTimeUs)) {
    throw new RangeError('timeUs 超出安全整数范围');
  }

  return normalizedTimeUs;
};

export const secondsToMicroseconds = (seconds: number) => {
  assertNonNegativeFiniteNumber(seconds, 'seconds');
  return normalizeTimeUs(seconds * MICROSECONDS_PER_SECOND);
};

export const millisecondsToMicroseconds = (milliseconds: number) => {
  assertNonNegativeFiniteNumber(milliseconds, 'milliseconds');
  return normalizeTimeUs(milliseconds * MICROSECONDS_PER_MILLISECOND);
};

export const microsecondsToSeconds = (timeUs: number) => {
  if (!isValidTimeUs(timeUs)) {
    throw new RangeError('timeUs 必须是非负安全整数');
  }

  return timeUs / MICROSECONDS_PER_SECOND;
};

export const microsecondsToMilliseconds = (timeUs: number) => {
  if (!isValidTimeUs(timeUs)) {
    throw new RangeError('timeUs 必须是非负安全整数');
  }

  return Math.round(timeUs / MICROSECONDS_PER_MILLISECOND);
};

const validateFrameRate = (frameRate: RationalFrameRate) => {
  if (
    !Number.isSafeInteger(frameRate.numerator) ||
    frameRate.numerator <= 0 ||
    !Number.isSafeInteger(frameRate.denominator) ||
    frameRate.denominator <= 0
  ) {
    throw new RangeError('帧率分子和分母必须是正安全整数');
  }
};

export const frameIndexToTimeUs = (
  frameIndex: number,
  frameRate: RationalFrameRate,
) => {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('frameIndex 必须是非负安全整数');
  }
  validateFrameRate(frameRate);
  const timeUs =
    (BigInt(frameIndex) *
      BigInt(frameRate.denominator) *
      BigInt(MICROSECONDS_PER_SECOND)) /
    BigInt(frameRate.numerator);
  const result = Number(timeUs);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('帧时间超出安全整数范围');
  }
  return result;
};

export const timeUsToFrameIndex = (
  timeUs: number,
  frameRate: RationalFrameRate,
) => {
  if (!isValidTimeUs(timeUs)) {
    throw new RangeError('timeUs 必须是非负安全整数');
  }
  validateFrameRate(frameRate);
  const frameIndex =
    (BigInt(timeUs) * BigInt(frameRate.numerator)) /
    (BigInt(frameRate.denominator) * BigInt(MICROSECONDS_PER_SECOND));
  const result = Number(frameIndex);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('帧序号超出安全整数范围');
  }
  return result;
};
