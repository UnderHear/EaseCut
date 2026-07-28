import {
  isValidClipSpeed,
  scaleTimelineOffsetToSourceUs,
} from './clip-speed';
import type { TimelineClipSpeed } from './model';
import { MICROSECONDS_PER_SECOND } from './time';

export const AUDIO_WAVEFORM_BAR_SPACING_PIXELS = 2;
export const AUDIO_WAVEFORM_TILE_WIDTH_PIXELS = 1_024;

const AUDIO_WAVEFORM_BAR_WIDTH_PIXELS = 1;

export type AudioWaveformBar = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type AudioWaveformTile = Readonly<{
  index: number;
  left: number;
  sourceStartUs: number;
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
  sourceDurationUs: number;
  sourceStartUs: number;
  volume: number;
  width: number;
}>;

type AudioWaveformTileOptions = Readonly<{
  clipDurationUs: number;
  pixelsPerSecond: number;
  speed: TimelineClipSpeed;
  timelineStartUs: number;
  trimStartUs: number;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
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
  sourceDurationUs: number,
  sourceRangeStartUs: number,
  sourceRangeEndUs: number,
) => {
  const safeStartUs = Math.min(
    sourceDurationUs,
    Math.max(0, sourceRangeStartUs),
  );
  const safeEndUs = Math.min(
    sourceDurationUs,
    Math.max(safeStartUs, sourceRangeEndUs),
  );
  const sampleRangeStart =
    (safeStartUs / sourceDurationUs) * samples.length;
  const sampleRangeEnd = (safeEndUs / sourceDurationUs) * samples.length;

  if (sampleRangeEnd - sampleRangeStart < 1) {
    const center =
      ((safeStartUs + safeEndUs) / 2 / sourceDurationUs) *
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
 * Returns fixed, clip-anchored canvases for the visible range. Stable tile
 * geometry lets native scrolling move existing bitmaps without resizing them.
 */
export const getAudioWaveformTiles = ({
  clipDurationUs,
  pixelsPerSecond,
  speed,
  timelineStartUs,
  trimStartUs,
  visibleTimeEndUs,
  visibleTimeStartUs,
}: AudioWaveformTileOptions): AudioWaveformTile[] => {
  if (
    ![
      clipDurationUs,
      pixelsPerSecond,
      speed,
      timelineStartUs,
      trimStartUs,
      visibleTimeEndUs,
      visibleTimeStartUs,
    ].every(Number.isFinite) ||
    clipDurationUs <= 0 ||
    pixelsPerSecond <= 0 ||
    !isValidClipSpeed(speed) ||
    visibleTimeEndUs <= visibleTimeStartUs
  ) {
    return [];
  }

  const visibleClipStartUs = Math.max(timelineStartUs, visibleTimeStartUs);
  const visibleClipEndUs = Math.min(
    timelineStartUs + clipDurationUs,
    visibleTimeEndUs,
  );
  if (visibleClipEndUs <= visibleClipStartUs) return [];

  const clipWidth =
    (clipDurationUs / MICROSECONDS_PER_SECOND) * pixelsPerSecond;
  const visibleClipStart =
    ((visibleClipStartUs - timelineStartUs) / MICROSECONDS_PER_SECOND) *
    pixelsPerSecond;
  const visibleClipEnd =
    ((visibleClipEndUs - timelineStartUs) / MICROSECONDS_PER_SECOND) *
    pixelsPerSecond;
  const tileCount = Math.ceil(
    clipWidth / AUDIO_WAVEFORM_TILE_WIDTH_PIXELS,
  );
  const firstVisibleTile = Math.floor(
    visibleClipStart / AUDIO_WAVEFORM_TILE_WIDTH_PIXELS,
  );
  const lastVisibleTile = Math.max(
    firstVisibleTile,
    Math.ceil(visibleClipEnd / AUDIO_WAVEFORM_TILE_WIDTH_PIXELS) - 1,
  );
  const firstTile = Math.max(0, firstVisibleTile - 1);
  const lastTile = Math.min(tileCount - 1, lastVisibleTile + 1);
  const tiles: AudioWaveformTile[] = [];

  for (let index = firstTile; index <= lastTile; index += 1) {
    const left = index * AUDIO_WAVEFORM_TILE_WIDTH_PIXELS;
    const width = Math.min(
      AUDIO_WAVEFORM_TILE_WIDTH_PIXELS,
      clipWidth - left,
    );
    if (width <= 0) continue;

    tiles.push({
      index,
      left,
      sourceStartUs:
        trimStartUs +
        scaleTimelineOffsetToSourceUs(
          (left / pixelsPerSecond) * MICROSECONDS_PER_SECOND,
          speed,
        ),
      width,
    });
  }

  return tiles;
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
    sourceDurationUs,
    sourceStartUs,
    volume,
    width,
  }: AudioWaveformBarOptions,
): AudioWaveformBar[] => {
  if (
    samples.length === 0 ||
    ![height, pixelsPerSecond, sourceDurationUs, sourceStartUs, width].every(
      Number.isFinite,
    ) ||
    height <= 0 ||
    pixelsPerSecond <= 0 ||
    sourceDurationUs <= 0 ||
    width <= 0
  ) {
    return [];
  }

  const sourceStartPixels =
    (sourceStartUs / MICROSECONDS_PER_SECOND) * pixelsPerSecond;
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
    const sourceRangeStartUs =
      ((barIndex * AUDIO_WAVEFORM_BAR_SPACING_PIXELS) / pixelsPerSecond) *
      MICROSECONDS_PER_SECOND;
    const sourceRangeEndUs =
      ((barIndex + 1) * AUDIO_WAVEFORM_BAR_SPACING_PIXELS) /
      pixelsPerSecond *
      MICROSECONDS_PER_SECOND;
    if (sourceRangeEndUs <= 0 || sourceRangeStartUs >= sourceDurationUs) {
      continue;
    }

    const peak = getSourceRangePeak(
      samples,
      sourceDurationUs,
      sourceRangeStartUs,
      sourceRangeEndUs,
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
