import type { TimelineTimedMediaClip, TimelineClipSpeed } from './model';
import { isValidTimeUs, normalizeTimeUs } from './time';

export const DEFAULT_CLIP_SPEED: TimelineClipSpeed = 1;
export const MIN_CLIP_SPEED: TimelineClipSpeed = 0.1;
export const MAX_CLIP_SPEED: TimelineClipSpeed = 4;

export const isValidClipSpeed = (
  speed: number,
): speed is TimelineClipSpeed =>
  Number.isFinite(speed) &&
  speed >= MIN_CLIP_SPEED &&
  speed <= MAX_CLIP_SPEED;

export const sourceTimeToSpeedAdjustedTimeUs = (
  sourceTimeUs: number,
  speed: TimelineClipSpeed,
) => {
  if (!isValidTimeUs(sourceTimeUs)) {
    throw new RangeError('源时间必须是非负安全整数');
  }
  if (!isValidClipSpeed(speed)) {
    throw new RangeError('片段倍速必须在 0.1 到 4 之间');
  }

  return normalizeTimeUs(sourceTimeUs / speed);
};

export const getSpeedAdjustedDurationUs = (
  trimStartUs: number,
  trimEndUs: number,
  speed: TimelineClipSpeed,
) => {
  if (
    !isValidTimeUs(trimStartUs) ||
    !isValidTimeUs(trimEndUs) ||
    trimEndUs < trimStartUs
  ) {
    throw new RangeError('裁剪时间范围无效');
  }

  return (
    sourceTimeToSpeedAdjustedTimeUs(trimEndUs, speed) -
    sourceTimeToSpeedAdjustedTimeUs(trimStartUs, speed)
  );
};

export const scaleTimelineOffsetToSourceUs = (
  timelineOffsetUs: number,
  speed: TimelineClipSpeed,
) => {
  if (!Number.isFinite(timelineOffsetUs)) {
    throw new TypeError('时间线偏移必须是有限数字');
  }
  if (!isValidClipSpeed(speed)) {
    throw new RangeError('片段倍速必须在 0.1 到 4 之间');
  }

  const sourceOffsetUs = Math.round(timelineOffsetUs * speed);
  if (!Number.isSafeInteger(sourceOffsetUs)) {
    throw new RangeError('源时间偏移超出安全整数范围');
  }
  return sourceOffsetUs;
};

export const timelineTimeToClipSourceTimeUs = (
  clip: Pick<
    TimelineTimedMediaClip,
    | 'durationUs'
    | 'speed'
    | 'startUs'
    | 'trimEndUs'
    | 'trimStartUs'
  >,
  timelineTimeUs: number,
) => {
  if (!isValidTimeUs(timelineTimeUs)) {
    throw new RangeError('时间线时间必须是非负安全整数');
  }

  const timelineOffsetUs = Math.max(0, timelineTimeUs - clip.startUs);
  const sourceTimeUs =
    clip.trimStartUs +
    scaleTimelineOffsetToSourceUs(timelineOffsetUs, clip.speed);
  const isInsideClip =
    timelineTimeUs < clip.startUs + clip.durationUs;
  const maximumSourceTimeUs = isInsideClip
    ? Math.max(clip.trimStartUs, clip.trimEndUs - 1)
    : clip.trimEndUs;

  return Math.min(
    maximumSourceTimeUs,
    Math.max(clip.trimStartUs, sourceTimeUs),
  );
};

export const getSpeedAdjustedPixelsPerSecond = (
  pixelsPerSecond: number,
  speed: TimelineClipSpeed,
) => {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    throw new RangeError('pixelsPerSecond 必须是正有限数字');
  }
  if (!isValidClipSpeed(speed)) {
    throw new RangeError('片段倍速必须在 0.1 到 4 之间');
  }

  return pixelsPerSecond / speed;
};
