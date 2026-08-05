import {
  isTimelineTextClip,
  isTimelineVisualMediaClip,
  type TimelineCanvasPreset,
  type TimelineCanvasSelection,
  type TimelineCanvasSize,
  type TimelineClip,
  type TimelineClipTransform,
} from './model';

export const DEFAULT_COMPOSITION_CANVAS_SIZE: TimelineCanvasSize = {
  height: 720,
  width: 1280,
};

export const COMPOSITION_CANVAS_PRESET_NAMES = [
  '16:9',
  '4:3',
  '2:1',
  '9:16',
  '1:1',
  '3:4',
] as const satisfies readonly TimelineCanvasPreset[];

export const COMPOSITION_CANVAS_PRESETS = {
  '16:9': { height: 720, width: 1280 },
  '4:3': { height: 720, width: 960 },
  '2:1': { height: 720, width: 1440 },
  '9:16': { height: 1280, width: 720 },
  '1:1': { height: 720, width: 720 },
  '3:4': { height: 960, width: 720 },
} as const satisfies Record<TimelineCanvasPreset, TimelineCanvasSize>;

export type CompositionCanvasPreset = TimelineCanvasPreset;
export type CompositionCanvasSelection = TimelineCanvasSelection;

type CanvasSourceCandidate = {
  height?: number;
  type: string;
  width?: number;
};

const hasPositiveDimension = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const findOriginalCanvasSize = (
  sources: readonly CanvasSourceCandidate[],
): TimelineCanvasSize | null => {
  const source = sources.find(
    (candidate) =>
      (candidate.type === 'video' || candidate.type === 'image') &&
      hasPositiveDimension(candidate.height) &&
      hasPositiveDimension(candidate.width),
  );

  return source && source.height !== undefined && source.width !== undefined
    ? { height: source.height, width: source.width }
    : null;
};

export const getOriginalCanvasSize = (
  sources: readonly CanvasSourceCandidate[],
): TimelineCanvasSize =>
  findOriginalCanvasSize(sources) ?? { ...DEFAULT_COMPOSITION_CANVAS_SIZE };

export const areCanvasSizesEqual = (
  left: TimelineCanvasSize,
  right: TimelineCanvasSize,
) => left.height === right.height && left.width === right.width;

export const getCanvasSizeForSelection = (
  selection: CompositionCanvasSelection,
  originalCanvasSize: TimelineCanvasSize | null,
): TimelineCanvasSize =>
  selection === 'original'
    ? (originalCanvasSize ?? DEFAULT_COMPOSITION_CANVAS_SIZE)
    : COMPOSITION_CANVAS_PRESETS[selection];

export const findCanvasSelection = (
  canvasSize: TimelineCanvasSize,
  originalCanvasSize: TimelineCanvasSize | null,
): CompositionCanvasSelection | null => {
  if (
    originalCanvasSize &&
    areCanvasSizesEqual(canvasSize, originalCanvasSize)
  ) {
    return 'original';
  }

  return (
    COMPOSITION_CANVAS_PRESET_NAMES.find((preset) =>
      areCanvasSizesEqual(canvasSize, COMPOSITION_CANVAS_PRESETS[preset]),
    ) ?? null
  );
};

type CanvasProjection = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

const getCanvasProjection = (
  referenceSize: TimelineCanvasSize,
  targetSize: TimelineCanvasSize,
): CanvasProjection => {
  const scale = Math.min(
    targetSize.width / referenceSize.width,
    targetSize.height / referenceSize.height,
  );
  return {
    offsetX: (targetSize.width - referenceSize.width * scale) / 2,
    offsetY: (targetSize.height - referenceSize.height * scale) / 2,
    scale,
  };
};

const resizeTransform = (
  transform: TimelineClipTransform,
  currentProjection: CanvasProjection,
  nextProjection: CanvasProjection,
): TimelineClipTransform => {
  const scale = nextProjection.scale / currentProjection.scale;
  return {
    height: transform.height * scale,
    width: transform.width * scale,
    x:
      nextProjection.offsetX +
      (transform.x - currentProjection.offsetX) * scale,
    y:
      nextProjection.offsetY +
      (transform.y - currentProjection.offsetY) * scale,
  };
};

export const resizeClipsForCanvas = (
  clips: readonly TimelineClip[],
  referenceSize: TimelineCanvasSize,
  currentSize: TimelineCanvasSize,
  nextSize: TimelineCanvasSize,
): TimelineClip[] => {
  const currentProjection = getCanvasProjection(referenceSize, currentSize);
  const nextProjection = getCanvasProjection(referenceSize, nextSize);
  const scale = nextProjection.scale / currentProjection.scale;

  return clips.map((clip) => {
    if (isTimelineVisualMediaClip(clip)) {
      return {
        ...clip,
        transform: resizeTransform(
          clip.transform,
          currentProjection,
          nextProjection,
        ),
      };
    }
    if (!isTimelineTextClip(clip)) return clip;

    const transform = resizeTransform(
      {
        height: clip.layoutSize.height,
        width: clip.layoutSize.width,
        x: clip.position.x,
        y: clip.position.y,
      },
      currentProjection,
      nextProjection,
    );
    return {
      ...clip,
      fontSize: Math.max(1, Math.round(clip.fontSize * scale)),
      layoutSize: {
        height: Math.max(1, Math.round(transform.height)),
        width: Math.max(1, Math.round(transform.width)),
      },
      position: { x: transform.x, y: transform.y },
    };
  });
};
