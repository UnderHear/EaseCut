export const AUDIO_WAVEFORM_BAR_SPACING_PIXELS = 2;

const AUDIO_WAVEFORM_BAR_WIDTH_PIXELS = 1;

export type AudioWaveformBar = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type AudioWaveformRenderWindow = Readonly<{
  left: number;
  sourceStart: number;
  width: number;
}>;

export type AudioWaveformBitmapSize = Readonly<{
  height: number;
  pixelRatio: number;
  width: number;
}>;

type AudioWaveformBarOptions = Readonly<{
  height: number;
  pixelsPerSecond: number;
  sourceDuration: number;
  sourceStart: number;
  volume: number;
  width: number;
}>;

type AudioWaveformRenderWindowOptions = Readonly<{
  clipDuration: number;
  pixelsPerSecond: number;
  timelineStart: number;
  trimStart: number;
  visibleTimeEnd: number;
  visibleTimeStart: number;
}>;

const clampUnit = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export const getAudioWaveformBitmapSize = (
  width: number,
  height: number,
  devicePixelRatio: number,
): AudioWaveformBitmapSize => {
  const pixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, Math.min(2, devicePixelRatio))
    : 1;
  return {
    height: Math.max(0, Math.round(height * pixelRatio)),
    pixelRatio,
    width: Math.max(0, Math.round(width * pixelRatio)),
  };
};

const interpolatePeak = (samples: readonly number[], samplePosition: number) => {
  const safePosition = Math.min(
    samples.length - 1,
    Math.max(0, samplePosition),
  );
  const leftIndex = Math.floor(safePosition);
  const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
  const ratio = safePosition - leftIndex;
  const left = clampUnit(samples[leftIndex] ?? 0);
  const right = clampUnit(samples[rightIndex] ?? left);
  return left + (right - left) * ratio;
};

const getSourceRangePeak = (
  samples: readonly number[],
  sourceDuration: number,
  sourceRangeStart: number,
  sourceRangeEnd: number,
) => {
  const safeStart = Math.min(
    sourceDuration,
    Math.max(0, sourceRangeStart),
  );
  const safeEnd = Math.min(
    sourceDuration,
    Math.max(safeStart, sourceRangeEnd),
  );
  const sampleRangeStart = (safeStart / sourceDuration) * samples.length;
  const sampleRangeEnd = (safeEnd / sourceDuration) * samples.length;

  if (sampleRangeEnd - sampleRangeStart < 1) {
    const center = ((safeStart + safeEnd) / 2 / sourceDuration) *
      Math.max(0, samples.length - 1);
    return interpolatePeak(samples, center);
  }

  const startIndex = Math.max(0, Math.floor(sampleRangeStart));
  const endIndex = Math.min(samples.length, Math.ceil(sampleRangeEnd));
  let peak = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    peak = Math.max(peak, clampUnit(samples[index] ?? 0));
  }
  return peak;
};

/**
 * Keeps the canvas bounded to the visible clip intersection. One bar of
 * overscan prevents a partially visible edge bar from blinking while scrolling.
 */
export const getAudioWaveformRenderWindow = ({
  clipDuration,
  pixelsPerSecond,
  timelineStart,
  trimStart,
  visibleTimeEnd,
  visibleTimeStart,
}: AudioWaveformRenderWindowOptions): AudioWaveformRenderWindow | null => {
  if (
    ![
      clipDuration,
      pixelsPerSecond,
      timelineStart,
      trimStart,
      visibleTimeEnd,
      visibleTimeStart,
    ].every(Number.isFinite) ||
    clipDuration <= 0 ||
    pixelsPerSecond <= 0 ||
    visibleTimeEnd <= visibleTimeStart
  ) {
    return null;
  }

  const visibleClipStart = Math.max(timelineStart, visibleTimeStart);
  const visibleClipEnd = Math.min(
    timelineStart + clipDuration,
    visibleTimeEnd,
  );
  if (visibleClipEnd <= visibleClipStart) return null;

  const clipWidth = clipDuration * pixelsPerSecond;
  const left = Math.max(
    0,
    (visibleClipStart - timelineStart) * pixelsPerSecond -
      AUDIO_WAVEFORM_BAR_SPACING_PIXELS,
  );
  const right = Math.min(
    clipWidth,
    (visibleClipEnd - timelineStart) * pixelsPerSecond +
      AUDIO_WAVEFORM_BAR_SPACING_PIXELS,
  );

  return {
    left,
    sourceStart: trimStart + left / pixelsPerSecond,
    width: Math.max(0, right - left),
  };
};

/**
 * Draws a fixed two-pixel bar grid anchored at source time zero. Trimming only
 * changes the viewport into this grid, so overlapping source content is stable.
 */
export const getAudioWaveformBars = (
  samples: readonly number[],
  {
    height,
    pixelsPerSecond,
    sourceDuration,
    sourceStart,
    volume,
    width,
  }: AudioWaveformBarOptions,
): AudioWaveformBar[] => {
  if (
    samples.length === 0 ||
    ![height, pixelsPerSecond, sourceDuration, sourceStart, width].every(
      Number.isFinite,
    ) ||
    height <= 0 ||
    pixelsPerSecond <= 0 ||
    sourceDuration <= 0 ||
    width <= 0
  ) {
    return [];
  }

  const sourceStartPixels = sourceStart * pixelsPerSecond;
  const firstBarIndex =
    Math.floor(sourceStartPixels / AUDIO_WAVEFORM_BAR_SPACING_PIXELS) - 1;
  const lastBarIndex =
    Math.ceil(
      (sourceStartPixels + width) / AUDIO_WAVEFORM_BAR_SPACING_PIXELS,
    ) + 1;
  const baseline = Math.max(0, height - 1);
  const maxBarHeight = Math.max(0, baseline - 1);
  const gain = clampUnit(volume);
  const bars: AudioWaveformBar[] = [];

  for (let barIndex = firstBarIndex; barIndex <= lastBarIndex; barIndex += 1) {
    const sourceRangeStart =
      (barIndex * AUDIO_WAVEFORM_BAR_SPACING_PIXELS) / pixelsPerSecond;
    const sourceRangeEnd =
      ((barIndex + 1) * AUDIO_WAVEFORM_BAR_SPACING_PIXELS) /
      pixelsPerSecond;
    if (sourceRangeEnd <= 0 || sourceRangeStart >= sourceDuration) continue;

    const peak = getSourceRangePeak(
      samples,
      sourceDuration,
      sourceRangeStart,
      sourceRangeEnd,
    );
    const barHeight = peak * gain * maxBarHeight;
    bars.push({
      height: barHeight,
      width: AUDIO_WAVEFORM_BAR_WIDTH_PIXELS,
      x:
        barIndex * AUDIO_WAVEFORM_BAR_SPACING_PIXELS - sourceStartPixels,
      y: baseline - barHeight,
    });
  }

  return bars;
};
