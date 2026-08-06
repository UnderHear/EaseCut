import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';

import {
  createCompositionSnapshot,
  getCompositionActiveClips,
} from '../core/composition';
import {
  getTimelineClipTransform,
  isTimelineTimedMediaClip,
} from '../core/model';
import { getTimelineTextFontPreset } from '../core/text-fonts';
import { secondsToMicroseconds } from '../core/time';
import {
  getPreviewInteractionUpdate,
  type PreviewInteractionMode,
  type PreviewResizeHandle,
  type PreviewSnapGuide,
} from '../core/preview-snapping';
import { MIN_CLIP_TRANSFORM_SIZE } from '../core/timeline-commands';
import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipTimingPreview,
  TimelineClipTransform,
  TimelineImageClip,
  TimelineMediaClip,
  TimelineTextClip,
  TimelineTimedMediaClip,
} from '../types';
import { isJsdomEnvironment } from '../util/browser';
import { createTextCanvasFont } from '../util/format-canvas-font';
import { formatHexRgbaColor } from '../util/format-text-color';
import { isNonNegativeFiniteNumber } from '../util/number';
import { areStringRecordsEqual } from '../util/value';
import {
  useMediaRuntime,
  type MediaObjectUrlLease,
} from '../media';
import { PreviewAudioEngine } from '../media/preview-audio-engine';
import {
  getPreviewAudioConfiguration,
  getPreviewMediaTimingKey,
  PreviewPlaybackController,
  seekPreviewMediaToTimelineTime,
} from '../media/preview-playback-controller';
import { FloatingInspector } from './FloatingInspector';
import { CanvasRatioPanel } from './CanvasRatioPanel';

const PREVIEW_HANDLE_SIZE = 12;
const PREVIEW_HANDLE_HIT_PADDING = 8;
const PREVIEW_GUIDE_COLOR = '#00cae0';
const HAVE_METADATA_READY_STATE = 1;
const HAVE_CURRENT_DATA_READY_STATE = 2;
const PREVIEW_PRELOAD_LOOKAHEAD_US = secondsToMicroseconds(5);
const MAX_PRELOADED_MEDIA_CLIPS = 4;
const TEXT_UNDERLINE_FALLBACK_DESCENT_RATIO = 0.25;
const TEXT_UNDERLINE_OFFSET_RATIO = 0.15;
const TEXT_UNDERLINE_THICKNESS_RATIO = 0.06;

type PreviewFontLoadStatus = 'failed' | 'ready';

type PreviewPoint = {
  x: number;
  y: number;
};
type PreviewFrame = {
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
};
type PreviewInteractionState = {
  clipId: string;
  guides: PreviewSnapGuide[];
  initialPointer: PreviewPoint;
  initialTransform: TimelineClipTransform;
  mode: PreviewInteractionMode;
  resizable: boolean;
  transform: TimelineClipTransform;
};
type PreviewCursor = 'default' | 'move' | 'nesw-resize' | 'nwse-resize';

type PreviewPanelProps = {
  clipTimingPreview?: TimelineClipTimingPreview | null;
  previewRef: RefObject<HTMLDivElement | null>;
};

const previewResizeHandles: PreviewResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

const canUseMediaElement = () =>
  !isJsdomEnvironment();

type PreviewClipIndex = ReadonlyMap<string, readonly TimelineMediaClip[]>;

const comparePreviewClipOrder = (
  left: Pick<TimelineClip, 'id' | 'startUs'>,
  right: Pick<TimelineClip, 'id' | 'startUs'>,
) => left.startUs - right.startUs || left.id.localeCompare(right.id);

const createPreviewClipIndex = (
  clips: TimelineClip[],
): PreviewClipIndex => {
  const clipsByTrack = new Map<string, TimelineMediaClip[]>();

  for (const clip of clips) {
    if (clip.type === 'text' || clip.hidden) continue;
    const trackClips = clipsByTrack.get(clip.trackId);
    if (trackClips) {
      trackClips.push(clip);
    } else {
      clipsByTrack.set(clip.trackId, [clip]);
    }
  }
  for (const trackClips of clipsByTrack.values()) {
    trackClips.sort(comparePreviewClipOrder);
  }

  return clipsByTrack;
};

const findNextClipIndex = <Clip extends Pick<TimelineClip, 'startUs'>>(
  clips: readonly Clip[],
  currentTimeUs: number,
) => {
  let lower = 0;
  let upper = clips.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const clip = clips[middle];
    if (clip && clip.startUs <= currentTimeUs) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  return lower;
};

const findNextClip = <Clip extends Pick<TimelineClip, 'startUs'>>(
  clips: readonly Clip[],
  currentTimeUs: number,
) => clips[findNextClipIndex(clips, currentTimeUs)];

const createPreviewTextClipIndex = (
  clips: TimelineClip[],
): readonly TimelineTextClip[] =>
  clips
    .filter(
      (clip): clip is TimelineTextClip =>
        clip.type === 'text' && !clip.hidden,
    )
    .sort(comparePreviewClipOrder);

const getPreviewTextClips = (
  textClips: readonly TimelineTextClip[],
  activeTextClips: TimelineTextClip[],
  currentTimeUs: number,
) => {
  const preloadEndUs = currentTimeUs + PREVIEW_PRELOAD_LOOKAHEAD_US;
  const previewClips = [...activeTextClips];
  let nextIndex = findNextClipIndex(textClips, currentTimeUs);
  let nextClip = textClips[nextIndex];

  while (nextClip && nextClip.startUs <= preloadEndUs) {
    previewClips.push(nextClip);
    nextIndex += 1;
    nextClip = textClips[nextIndex];
  }

  return previewClips;
};

const getPreviewMediaClips = (
  clipIndex: PreviewClipIndex,
  activeClips: TimelineMediaClip[],
  currentTimeUs: number,
) => {
  const preloadEndUs = currentTimeUs + PREVIEW_PRELOAD_LOOKAHEAD_US;
  const preloadCandidates: TimelineMediaClip[] = [];

  for (const trackClips of clipIndex.values()) {
    const nextClip = findNextClip(trackClips, currentTimeUs);
    if (nextClip && nextClip.startUs <= preloadEndUs) {
      preloadCandidates.push(nextClip);
    }
  }
  preloadCandidates.sort(comparePreviewClipOrder);

  // 活动状态变化不能改变已挂载媒体的相对顺序，否则浏览器可能中断
  // 被 React 移动的媒体节点及其音频输出。
  return [
    ...activeClips,
    ...preloadCandidates.slice(0, MAX_PRELOADED_MEDIA_CLIPS),
  ].sort(comparePreviewClipOrder);
};

type PreviewMediaElementProps = {
  clip: TimelineTimedMediaClip;
  isActive: boolean;
  muted: boolean;
  onElementChange: (
    clipId: string,
    element: HTMLMediaElement | null,
  ) => void;
  onLoadedMetadata: (
    clip: TimelineTimedMediaClip,
    isActive: boolean,
    element: HTMLMediaElement,
  ) => void;
  onVisualChange: () => void;
  src: string | undefined;
};

function PreviewMediaElement({
  clip,
  isActive,
  muted,
  onElementChange,
  onLoadedMetadata,
  onVisualChange,
  src,
}: PreviewMediaElementProps) {
  const elementRef = useCallback(
    (element: HTMLMediaElement | null) => {
      onElementChange(clip.id, element);
    },
    [clip.id, onElementChange],
  );
  const commonProps = {
    muted,
    onLoadedData: onVisualChange,
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      onLoadedMetadata(clip, isActive, event.currentTarget);
    },
    onSeeked: onVisualChange,
    preload: 'auto' as const,
    src,
  };

  return clip.type === 'video' ? (
    <video {...commonProps} ref={elementRef} playsInline />
  ) : (
    <audio {...commonProps} ref={elementRef} />
  );
}

type PreviewImageElementProps = {
  clip: TimelineImageClip;
  onDecodeError: () => void;
  onElementChange: (
    clipId: string,
    element: HTMLImageElement | null,
  ) => void;
  onVisualChange: () => void;
  src: string | undefined;
};

function PreviewImageElement({
  clip,
  onDecodeError,
  onElementChange,
  onVisualChange,
  src,
}: PreviewImageElementProps) {
  const elementRef = useCallback(
    (element: HTMLImageElement | null) => {
      onElementChange(clip.id, element);
    },
    [clip.id, onElementChange],
  );

  return (
    <img
      ref={elementRef}
      alt=''
      decoding='async'
      onError={() => {
        onDecodeError();
        onVisualChange();
      }}
      onLoad={onVisualChange}
      src={src}
    />
  );
}

const hasPendingPreviewMedia = (
  clips: TimelineMediaClip[],
  previewObjectUrls: Record<string, string>,
  mediaElements: Map<string, HTMLMediaElement>,
) =>
  clips.some((clip) => {
    if (!previewObjectUrls[clip.src]) return true;

    const media = mediaElements.get(clip.id);
    return (
      !media ||
      media.seeking ||
      media.readyState < HAVE_CURRENT_DATA_READY_STATE
    );
  });

const getCanvasPoint = (
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
  previewFrame: PreviewFrame,
): PreviewPoint => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

  return {
    x: (x - previewFrame.offsetX) / previewFrame.scale,
    y: (y - previewFrame.offsetY) / previewFrame.scale,
  };
};

const getPreviewFrame = (
  canvasSize: TimelineCanvasSize,
  previewCanvasSize: TimelineCanvasSize,
): PreviewFrame => {
  const scale = Math.min(
    previewCanvasSize.width / canvasSize.width,
    previewCanvasSize.height / canvasSize.height,
  );
  const width = canvasSize.width * scale;
  const height = canvasSize.height * scale;

  return {
    height,
    offsetX: (previewCanvasSize.width - width) / 2,
    offsetY: (previewCanvasSize.height - height) / 2,
    scale,
    width,
  };
};

const toPreviewTransform = (
  transform: TimelineClipTransform,
  previewFrame: PreviewFrame,
): TimelineClipTransform => ({
  height: transform.height * previewFrame.scale,
  width: transform.width * previewFrame.scale,
  x: previewFrame.offsetX + transform.x * previewFrame.scale,
  y: previewFrame.offsetY + transform.y * previewFrame.scale,
});

const toPreviewPoint = (
  point: PreviewPoint,
  previewFrame: PreviewFrame,
): PreviewPoint => ({
  x: previewFrame.offsetX + point.x * previewFrame.scale,
  y: previewFrame.offsetY + point.y * previewFrame.scale,
});

const isPointInTransform = (
  point: PreviewPoint,
  transform: TimelineClipTransform,
) =>
  point.x >= transform.x &&
  point.x <= transform.x + transform.width &&
  point.y >= transform.y &&
  point.y <= transform.y + transform.height;

const isPointInCompositionCanvas = (
  point: PreviewPoint,
  canvasSize: TimelineCanvasSize,
) =>
  point.x >= 0 &&
  point.x <= canvasSize.width &&
  point.y >= 0 &&
  point.y <= canvasSize.height;

const getVisibleClipAtPoint = (
  point: PreviewPoint,
  clips: TimelineClip[],
  canvasSize: TimelineCanvasSize,
): TimelineClip | null => {
  if (!isPointInCompositionCanvas(point, canvasSize)) return null;

  for (let index = clips.length - 1; index >= 0; index -= 1) {
    const clip = clips[index];
    if (clip && isPointInTransform(point, getTimelineClipTransform(clip))) {
      return clip;
    }
  }

  return null;
};

const drawTextClip = (
  context: CanvasRenderingContext2D,
  clip: Extract<TimelineClip, { type: 'text' }>,
  fontColor: string,
  fontFamily: string,
  transform: TimelineClipTransform,
  previewFrame: PreviewFrame,
) => {
  const previewTransform = toPreviewTransform(transform, previewFrame);
  const scaledFontSize = clip.fontSize * previewFrame.scale;
  const textBaselineY =
    previewTransform.y + previewTransform.height / 2;

  context.save();
  context.fillStyle = formatHexRgbaColor(fontColor);
  context.font = createTextCanvasFont(
    {
      bold: clip.bold,
      fontSize: scaledFontSize,
      italic: clip.italic,
    },
    fontFamily,
  );
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(
    clip.text,
    previewTransform.x,
    textBaselineY,
  );
  if (clip.underline) {
    const measuredDescent =
      context.measureText(clip.text).actualBoundingBoxDescent;
    const glyphDescent =
      isNonNegativeFiniteNumber(measuredDescent)
        ? measuredDescent
        : scaledFontSize * TEXT_UNDERLINE_FALLBACK_DESCENT_RATIO;
    const offset = scaledFontSize * TEXT_UNDERLINE_OFFSET_RATIO;
    const thickness = Math.min(
      previewTransform.height,
      Math.max(1, scaledFontSize * TEXT_UNDERLINE_THICKNESS_RATIO),
    );
    const underlineY = Math.max(
      previewTransform.y,
      Math.min(
        previewTransform.y + previewTransform.height - thickness,
        textBaselineY + glyphDescent + offset,
      ),
    );
    context.fillRect(
      previewTransform.x,
      underlineY,
      previewTransform.width,
      thickness,
    );
  }
  context.restore();
};

const getResizeHandlePosition = (
  transform: TimelineClipTransform,
  handle: PreviewResizeHandle,
): PreviewPoint => ({
  x: handle.endsWith('w') ? transform.x : transform.x + transform.width,
  y: handle.startsWith('n') ? transform.y : transform.y + transform.height,
});

const getResizeHandleAtPoint = (
  point: PreviewPoint,
  transform: TimelineClipTransform,
  previewScale = 1,
): PreviewResizeHandle | null => {
  const hitSize =
    (PREVIEW_HANDLE_SIZE / 2 + PREVIEW_HANDLE_HIT_PADDING) / previewScale;

  return (
    previewResizeHandles.find((handle) => {
      const position = getResizeHandlePosition(transform, handle);
      return (
        Math.abs(point.x - position.x) <= hitSize &&
        Math.abs(point.y - position.y) <= hitSize
      );
    }) ?? null
  );
};

const getResizeHandleCursor = (handle: PreviewResizeHandle): PreviewCursor =>
  handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';

const getPreviewCursor = (
  point: PreviewPoint,
  transform: TimelineClipTransform,
  previewScale: number,
): PreviewCursor => {
  const resizeHandle = getResizeHandleAtPoint(point, transform, previewScale);
  if (resizeHandle) return getResizeHandleCursor(resizeHandle);

  return isPointInTransform(point, transform) ? 'move' : 'default';
};

const drawSelectedClipFrame = (
  context: CanvasRenderingContext2D,
  transform: TimelineClipTransform,
  previewFrame: PreviewFrame,
  resizable: boolean,
) => {
  const previewTransform = toPreviewTransform(transform, previewFrame);

  context.save();
  context.strokeStyle = '#00cae0';
  context.lineWidth = 2;
  context.setLineDash([]);
  context.strokeRect(
    previewTransform.x,
    previewTransform.y,
    previewTransform.width,
    previewTransform.height,
  );
  if (!resizable) {
    context.restore();
    return;
  }

  context.setLineDash([]);
  context.fillStyle = '#00cae0';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;

  for (const handle of previewResizeHandles) {
    const position = toPreviewPoint(
      getResizeHandlePosition(transform, handle),
      previewFrame,
    );

    // 将手柄位置向选区中心偏移 2px，使其看起来嵌入边缘内侧
    const centerX = previewTransform.x + previewTransform.width / 2;
    const centerY = previewTransform.y + previewTransform.height / 2;
    const dx = centerX - position.x;
    const dy = centerY - position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;

    const handleX = position.x + nx * 2 - PREVIEW_HANDLE_SIZE / 2;
    const handleY = position.y + ny * 2 - PREVIEW_HANDLE_SIZE / 2;
    context.beginPath();
    context.roundRect(
      handleX,
      handleY,
      PREVIEW_HANDLE_SIZE,
      PREVIEW_HANDLE_SIZE,
      10,
    );
    context.fill();
    context.stroke();
  }

  context.restore();
};

const drawPreviewGuides = (
  context: CanvasRenderingContext2D,
  guides: PreviewSnapGuide[],
  previewFrame: PreviewFrame,
) => {
  if (guides.length === 0) return;

  context.save();
  context.strokeStyle = PREVIEW_GUIDE_COLOR;
  context.lineWidth = 1;
  context.setLineDash([]);
  context.beginPath();

  const getStrokeCoordinate = (
    position: number,
    start: number,
    end: number,
  ) => {
    if (position <= start) return Math.round(start) + 0.5;
    if (position >= end) return Math.round(end) - 0.5;
    return Math.round(position) + 0.5;
  };

  for (const guide of guides) {
    if (guide.axis === 'x') {
      const x = getStrokeCoordinate(
        previewFrame.offsetX + guide.position * previewFrame.scale,
        previewFrame.offsetX,
        previewFrame.offsetX + previewFrame.width,
      );
      context.moveTo(x, previewFrame.offsetY);
      context.lineTo(x, previewFrame.offsetY + previewFrame.height);
      continue;
    }

    const y = getStrokeCoordinate(
      previewFrame.offsetY + guide.position * previewFrame.scale,
      previewFrame.offsetY,
      previewFrame.offsetY + previewFrame.height,
    );
    context.moveTo(previewFrame.offsetX, y);
    context.lineTo(previewFrame.offsetX + previewFrame.width, y);
  }

  context.stroke();
  context.restore();
};

export function PreviewPanel({
  clipTimingPreview = null,
  previewRef,
}: PreviewPanelProps) {
  const canvasSnappingEnabled = useTimelineStore(
    (state) => state.canvasSnappingEnabled,
  );
  const canvasSize = useTimelineStore((state) => state.canvasSize);
  const clips = useTimelineStore((state) => state.clips);
  const textStyleEdit = useTimelineStore((state) =>
    state.continuousEdit?.kind === 'text-style' &&
    state.continuousEdit.phase === 'active'
      ? state.continuousEdit
      : null,
  );
  const commitClipPosition = useTimelineStore(
    (state) => state.commitClipPosition,
  );
  const commitMediaClipTransform = useTimelineStore(
    (state) => state.commitMediaClipTransform,
  );
  const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const selectClip = useTimelineStore((state) => state.selectClip);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const tracks = useTimelineStore((state) => state.tracks);
  const mediaRuntime = useMediaRuntime();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<PreviewInteractionState | null>(null);
  const lastPreviewCanvasSizeRef = useRef<TimelineCanvasSize | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
  const previewPlaybackControllerRef = useRef(
    new PreviewPlaybackController(),
  );
  const mediaElementsRef = useRef(new Map<string, HTMLMediaElement>());
  const imageElementsRef = useRef(new Map<string, HTMLImageElement>());
  const previewObjectUrlLeasesRef = useRef(
    new Map<string, MediaObjectUrlLease>(),
  );
  const [previewObjectUrls, setPreviewObjectUrls] = useState<
    Record<string, string>
  >({});
  const [liveTransform, setLiveTransform] = useState<{
    clipId: string;
    transform: TimelineClipTransform;
  } | null>(null);
  const [previewContainerSize, setPreviewContainerSize] =
    useState<TimelineCanvasSize | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [fontLoadState, setFontLoadState] = useState<{
    key: string;
    warning: string | null;
  } | null>(null);
  const fontLoadStatusByTypeRef = useRef(
    new Map<string, PreviewFontLoadStatus>(),
  );
  const pendingFontLoadsByTypeRef = useRef(
    new Map<string, Promise<PreviewFontLoadStatus>>(),
  );
  const renderedFontTypeByClipIdRef = useRef(new Map<string, string>());
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(
    null,
  );
  const compositionSnapshot = useMemo(
    () => createCompositionSnapshot({ canvasSize, clips, tracks }),
    [canvasSize, clips, tracks],
  );
  const activeClips = useMemo(
    () => getCompositionActiveClips(compositionSnapshot, currentTimeUs),
    [compositionSnapshot, currentTimeUs],
  );
  const activeVideoClips = useMemo(
    () => activeClips.filter((clip) => clip.type === 'video'),
    [activeClips],
  );
  const activeMediaClips = useMemo(
    () => activeClips.filter(isTimelineTimedMediaClip),
    [activeClips],
  );
  const activeSourceClips = useMemo(
    () => activeClips.filter((clip) => clip.type !== 'text'),
    [activeClips],
  );
  const activeTextClips = useMemo(
    () =>
      activeClips.filter(
        (clip): clip is TimelineTextClip => clip.type === 'text',
      ),
    [activeClips],
  );
  const activeVisualClips = useMemo(
    () => activeClips.filter((clip) => clip.type !== 'audio'),
    [activeClips],
  );
  const activeClipIds = useMemo(
    () => new Set(activeClips.map((clip) => clip.id)),
    [activeClips],
  );
  const previewClipIndex = useMemo(
    () => createPreviewClipIndex(clips),
    [clips],
  );
  const previewSourceClips = useMemo(
    () =>
      getPreviewMediaClips(
        previewClipIndex,
        activeSourceClips,
        currentTimeUs,
      ),
    [activeSourceClips, currentTimeUs, previewClipIndex],
  );
  const previewMediaClips = useMemo(
    () => previewSourceClips.filter(isTimelineTimedMediaClip),
    [previewSourceClips],
  );
  const previewImageClips = useMemo(
    () =>
      previewSourceClips.filter(
        (clip): clip is TimelineImageClip => clip.type === 'image',
      ),
    [previewSourceClips],
  );
  const previewTextClipIndex = useMemo(
    () => createPreviewTextClipIndex(clips),
    [clips],
  );
  const previewTextClips = useMemo(
    () =>
      getPreviewTextClips(
        previewTextClipIndex,
        activeTextClips,
        currentTimeUs,
      ),
    [activeTextClips, currentTimeUs, previewTextClipIndex],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const selectedTextClip = useMemo(
    () =>
      clips.find(
        (clip): clip is TimelineTextClip =>
          clip.id === selectedClipId &&
          clip.type === 'text' &&
          !clip.hidden,
      ) ?? null,
    [clips, selectedClipId],
  );
  const selectedFontKey = selectedTextClip
    ? selectedTextClip.fontType
    : null;
  const previewFontTypesKey = Array.from(
    new Set([
      ...previewTextClips.map((clip) => clip.fontType),
      ...(selectedFontKey ? [selectedFontKey] : []),
    ]),
  )
    .sort()
    .join('\n');
  const fontWarning =
    fontLoadState?.key === selectedFontKey
      ? fontLoadState.warning
      : null;
  const previewSourcesKey = useMemo(
    () =>
      Array.from(
        new Map(
          previewSourceClips.map((clip) => [
            clip.src,
            `${clip.type}\t${clip.src}`,
          ]),
        ).values(),
      ).join('\n'),
    [previewSourceClips],
  );
  const activeMediaClipIdsKey = activeMediaClips
    .map((clip) => clip.id)
    .join('\n');
  const activeVideoClipIdsKey = activeVideoClips
    .map((clip) => clip.id)
    .join('\n');
  const previewMediaConfigurationKey = previewMediaClips
    .map((clip) => {
      const trackMuted = trackById.get(clip.trackId)?.muted ?? false;
      return [
        clip.id,
        activeClipIds.has(clip.id) ? 1 : 0,
        clip.speed,
        clip.volume,
        trackMuted ? 1 : 0,
      ].join(':');
    })
    .join('\n');
  const activeSeekConfigurationKey = activeMediaClips
    .map((clip) => `${clip.id}:${getPreviewMediaTimingKey(clip)}`)
    .join('\n');
  const previewSeekConfigurationKey = previewMediaClips
    .map((clip) =>
      [
        clip.id,
        activeClipIds.has(clip.id) ? 1 : 0,
        clip.durationUs,
        clip.speed,
        clip.startUs,
        clip.trimEndUs,
        clip.trimStartUs,
      ].join(':'),
    )
    .join('\n');
  const activeVisualConfigurationKey = activeVisualClips
    .map((clip) => {
      const transform = getTimelineClipTransform(clip);
      return [
        clip.id,
        clip.type === 'text'
          ? [
              clip.text,
              clip.fontType,
              clip.fontSize,
              textStyleEdit?.clipId === clip.id
                ? textStyleEdit.preview.fontColor
                : clip.fontColor,
            ].join(':')
          : '',
        transform.height,
        transform.width,
        transform.x,
        transform.y,
      ].join(':');
    })
    .join('\n');
  const activeMediaClipsRef = useRef(activeMediaClips);
  const currentTimeUsRef = useRef(currentTimeUs);
  const drawPreviewRef = useRef<
    (interaction?: PreviewInteractionState | null) => void
  >(() => undefined);
  const isPlayingRef = useRef(isPlaying);
  const previewMediaClipsRef = useRef(previewMediaClips);
  const trackByIdRef = useRef(trackById);
  useLayoutEffect(() => {
    activeMediaClipsRef.current = activeMediaClips;
    currentTimeUsRef.current = currentTimeUs;
    isPlayingRef.current = isPlaying;
    previewMediaClipsRef.current = previewMediaClips;
    trackByIdRef.current = trackById;
  }, [
    activeMediaClips,
    currentTimeUs,
    isPlaying,
    previewMediaClips,
    trackById,
  ]);
  const selectedActiveClip =
    activeVisualClips.find((clip) => clip.id === selectedClipId) ?? null;
  const previewCanvasSize = previewContainerSize ?? canvasSize;
  const previewFrame = useMemo(
    () => getPreviewFrame(canvasSize, previewCanvasSize),
    [canvasSize, previewCanvasSize],
  );

  const setClipMediaElement = useCallback(
    (clipId: string, element: HTMLMediaElement | null) => {
      const current = mediaElementsRef.current.get(clipId);
      const releaseCurrent = () => {
        if (!current) return;
        previewPlaybackControllerRef.current.release(clipId, current);
        current.pause();
        previewAudioEngineRef.current?.release(current);
      };
      if (element) {
        if (current && current !== element) {
          releaseCurrent();
        }
        mediaElementsRef.current.set(clipId, element);
        return;
      }

      releaseCurrent();
      mediaElementsRef.current.delete(clipId);
    },
    [],
  );
  const setClipImageElement = useCallback(
    (clipId: string, element: HTMLImageElement | null) => {
      if (element) {
        imageElementsRef.current.set(clipId, element);
      } else {
        imageElementsRef.current.delete(clipId);
      }
    },
    [],
  );
  const handleImageDecodeError = useCallback(() => {
    setMediaError(
      '图片解码失败，请确认文件未损坏且为 PNG、JPEG 或 JPG 格式',
    );
  }, []);
  const drawCurrentPreview = useCallback(() => {
    drawPreviewRef.current(interactionRef.current);
  }, []);
  const ensurePreviewFontLoaded = useCallback(
    (clip: TimelineTextClip): Promise<PreviewFontLoadStatus> => {
      const loadedStatus = fontLoadStatusByTypeRef.current.get(clip.fontType);
      if (loadedStatus) return Promise.resolve(loadedStatus);

      const pendingLoad = pendingFontLoadsByTypeRef.current.get(clip.fontType);
      if (pendingLoad) return pendingLoad;

      const load = mediaRuntime
        .measureTextLayout({
          bold: clip.bold,
          fontSize: clip.fontSize,
          fontType: clip.fontType,
          italic: clip.italic,
          text: clip.text,
        })
        .then<PreviewFontLoadStatus>(() => 'ready')
        .catch<PreviewFontLoadStatus>(() => 'failed')
        .then((status) => {
          fontLoadStatusByTypeRef.current.set(clip.fontType, status);
          pendingFontLoadsByTypeRef.current.delete(clip.fontType);
          return status;
        });
      pendingFontLoadsByTypeRef.current.set(clip.fontType, load);
      return load;
    },
    [mediaRuntime],
  );
  const handleLoadedMediaMetadata = useCallback(
    (
      clip: TimelineTimedMediaClip,
      isActive: boolean,
      element: HTMLMediaElement,
    ) => {
      seekPreviewMediaToTimelineTime(
        element,
        clip,
        isActive ? currentTimeUsRef.current : clip.startUs,
      );
      if (isActive) {
        drawPreviewRef.current(interactionRef.current);
      }
    },
    [],
  );

  const drawPreview = useCallback(
    (interaction?: PreviewInteractionState | null) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      const selectedDrawClipId = interaction?.clipId ?? selectedClipId;
      const lastCanvasSize = lastPreviewCanvasSizeRef.current;
      if (
        !interaction &&
        lastCanvasSize?.height === canvas.height &&
        lastCanvasSize.width === canvas.width &&
        hasPendingPreviewMedia(
          activeVideoClips,
          previewObjectUrls,
          mediaElementsRef.current,
        )
      ) {
        return;
      }

      context.fillStyle = '#1f1f1f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000000';
      context.fillRect(
        previewFrame.offsetX,
        previewFrame.offsetY,
        previewFrame.width,
        previewFrame.height,
      );

      let selectedTransform: TimelineClipTransform | null = null;
      let selectedTransformResizable = false;

      context.save();
      context.beginPath();
      context.rect(
        previewFrame.offsetX,
        previewFrame.offsetY,
        previewFrame.width,
        previewFrame.height,
      );
      context.clip();

      for (const clip of activeVisualClips) {
        const transform =
          interaction?.clipId === clip.id
            ? interaction.transform
            : getTimelineClipTransform(clip);
        if (clip.type === 'text') {
          const preset = getTimelineTextFontPreset(clip.fontType);
          const fontLoadStatus = fontLoadStatusByTypeRef.current.get(
            clip.fontType,
          );
          const renderedFontType =
            renderedFontTypeByClipIdRef.current.get(clip.id);
          const renderedFontPreset = renderedFontType
            ? getTimelineTextFontPreset(renderedFontType)
            : null;
          const fallbackFontFamily =
            renderedFontPreset?.family ?? 'Microsoft YaHei';
          const fontFamily =
            fontLoadStatus === 'ready'
              ? (preset?.family ?? fallbackFontFamily)
              : fallbackFontFamily;

          drawTextClip(
            context,
            clip,
            textStyleEdit?.clipId === clip.id
              ? textStyleEdit.preview.fontColor
              : clip.fontColor,
            fontFamily,
            transform,
            previewFrame,
          );
          if (fontLoadStatus === 'ready') {
            renderedFontTypeByClipIdRef.current.set(clip.id, clip.fontType);
          }
        } else if (clip.type === 'image') {
          const image = imageElementsRef.current.get(clip.id);
          const objectUrl = previewObjectUrls[clip.src];
          const previewTransform = toPreviewTransform(
            transform,
            previewFrame,
          );
          if (
            image &&
            objectUrl &&
            image.complete &&
            image.naturalHeight > 0 &&
            image.naturalWidth > 0
          ) {
            context.drawImage(
              image,
              previewTransform.x,
              previewTransform.y,
              previewTransform.width,
              previewTransform.height,
            );
          }
        } else {
          const video = mediaElementsRef.current.get(clip.id);
          const objectUrl = previewObjectUrls[clip.src];
          const previewTransform = toPreviewTransform(
            transform,
            previewFrame,
          );
          if (
            video instanceof HTMLVideoElement &&
            objectUrl &&
            !video.seeking &&
            video.readyState >= HAVE_CURRENT_DATA_READY_STATE
          ) {
            context.drawImage(
              video,
              previewTransform.x,
              previewTransform.y,
              previewTransform.width,
              previewTransform.height,
            );
          }
        }

        if (clip.id === selectedDrawClipId) {
          selectedTransform = transform;
          selectedTransformResizable = clip.type !== 'text';
        }
      }

      context.restore();

      drawPreviewGuides(
        context,
        interaction?.guides ?? [],
        previewFrame,
      );

      if (selectedTransform) {
        drawSelectedClipFrame(
          context,
          selectedTransform,
          previewFrame,
          selectedTransformResizable,
        );
      }
      lastPreviewCanvasSizeRef.current = {
        height: canvas.height,
        width: canvas.width,
      };
    },
    [
      activeVideoClips,
      activeVisualClips,
      previewFrame,
      previewObjectUrls,
      selectedClipId,
      textStyleEdit,
    ],
  );
  useLayoutEffect(() => {
    drawPreviewRef.current = drawPreview;
  }, [drawPreview]);

  useEffect(() => {
    const clipIds = new Set(clips.map((clip) => clip.id));
    for (const clipId of renderedFontTypeByClipIdRef.current.keys()) {
      if (!clipIds.has(clipId)) {
        renderedFontTypeByClipIdRef.current.delete(clipId);
      }
    }
  }, [clips]);

  useEffect(() => {
    let cancelled = false;
    const fontTypes = previewFontTypesKey
      ? previewFontTypesKey.split('\n')
      : [];
    for (const fontType of fontTypes) {
      const clip = clips.find(
        (candidate): candidate is TimelineTextClip =>
          candidate.type === 'text' && candidate.fontType === fontType,
      );
      if (!clip) continue;
      const preset = getTimelineTextFontPreset(clip.fontType);
      if (!preset) continue;

      void ensurePreviewFontLoaded(clip).then((status) => {
        if (cancelled) return;
        if (clip.fontType === selectedFontKey) {
          setFontLoadState({
            key: selectedFontKey,
            warning:
              status === 'failed'
                ? `${preset.label}加载失败，预览已使用系统字体回退`
                : null,
          });
        }
        drawPreviewRef.current(interactionRef.current);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    clips,
    ensurePreviewFontLoaded,
    previewFontTypesKey,
    selectedFontKey,
  ]);

  useEffect(() => {
    const engine = new PreviewAudioEngine();
    previewAudioEngineRef.current = engine;

    return () => {
      if (previewAudioEngineRef.current === engine) {
        previewAudioEngineRef.current = null;
      }
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const interaction = interactionRef.current;
    if (
      canvasSnappingEnabled ||
      !interaction ||
      interaction.guides.length === 0
    ) {
      return;
    }

    interactionRef.current = { ...interaction, guides: [] };
    drawPreview(interactionRef.current);
  }, [canvasSnappingEnabled, drawPreview]);

  useLayoutEffect(() => {
    drawPreviewRef.current(interactionRef.current);
  }, [
    activeVisualConfigurationKey,
    previewCanvasSize.height,
    previewCanvasSize.width,
    previewObjectUrls,
    selectedClipId,
  ]);

  useEffect(() => {
    const element = previewContainerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;

      const height = Math.round(entry.contentRect.height);
      const width = Math.round(entry.contentRect.width);
      if (height <= 0 || width <= 0) return;

      setPreviewContainerSize((current) =>
        current?.height === height && current.width === width
          ? current
          : { height, width },
      );
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      for (const lease of previewObjectUrlLeasesRef.current.values()) {
        lease.release();
      }
      previewObjectUrlLeasesRef.current.clear();
    },
    [mediaRuntime],
  );

  useEffect(() => {
    if (!canUseMediaElement()) return undefined;

    let cancelled = false;
    const previewSources = previewSourcesKey
      ? previewSourcesKey.split('\n').map((entry) => {
          const separatorIndex = entry.indexOf('\t');
          return {
            src: entry.slice(separatorIndex + 1),
            type: entry.slice(0, separatorIndex) as TimelineMediaClip['type'],
          };
        })
      : [];
    const requestedSources = new Set(previewSources.map(({ src }) => src));
    const leases = previewObjectUrlLeasesRef.current;

    for (const [src, lease] of leases) {
      if (requestedSources.has(src)) continue;
      lease.release();
      leases.delete(src);
    }
    for (const { src, type } of previewSources) {
      if (!leases.has(src)) {
        leases.set(
          src,
          mediaRuntime.acquireObjectUrl(
            type === 'image' ? { src, type } : src,
          ),
        );
      }
    }

    if (previewSources.length === 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setPreviewObjectUrls((current) =>
            Object.keys(current).length === 0 ? current : {},
          );
          setMediaError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all(
      previewSources.map(({ src }) => {
        const lease = leases.get(src);
        if (!lease) throw new Error(`媒体 ${src} 的预览资源未初始化`);
        return lease.url.then((objectUrl) => [src, objectUrl] as const);
      }),
    )
      .then((entries) => {
        if (cancelled) return;

        const nextObjectUrls = Object.fromEntries(entries);
        setPreviewObjectUrls((current) =>
          areStringRecordsEqual(current, nextObjectUrls)
            ? current
            : nextObjectUrls,
        );
        setMediaError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMediaError(
          error instanceof Error ? error.message : '媒体加载失败',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [mediaRuntime, previewSourcesKey]);

  const primePreloadedMedia = useCallback(() => {
    const activeIds = new Set(
      activeMediaClipsRef.current.map((clip) => clip.id),
    );
    for (const clip of previewMediaClipsRef.current) {
      if (activeIds.has(clip.id) || !previewObjectUrls[clip.src]) continue;

      const media = mediaElementsRef.current.get(clip.id);
      if (!media || media.readyState < HAVE_METADATA_READY_STATE) continue;

      seekPreviewMediaToTimelineTime(media, clip, clip.startUs);
    }
  }, [previewObjectUrls]);

  useLayoutEffect(() => {
    if (!canUseMediaElement()) return undefined;

    primePreloadedMedia();
    return undefined;
  }, [previewSeekConfigurationKey, primePreloadedMedia]);

  const syncActiveMediaToTime = useCallback(
    (timelineTimeUs: number) => {
      for (const clip of activeMediaClipsRef.current) {
        const media = mediaElementsRef.current.get(clip.id);
        if (!media || media.readyState < HAVE_METADATA_READY_STATE) {
          continue;
        }

        seekPreviewMediaToTimelineTime(
          media,
          clip,
          timelineTimeUs,
        );
      }
      drawPreviewRef.current(interactionRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!canUseMediaElement()) return undefined;

    if (!isPlaying) syncActiveMediaToTime(currentTimeUs);
    return undefined;
  }, [
    activeMediaClipIdsKey,
    activeSeekConfigurationKey,
    currentTimeUs,
    isPlaying,
    previewObjectUrls,
    syncActiveMediaToTime,
  ]);

  useEffect(() => {
    if (!canUseMediaElement()) return undefined;

    let cancelled = false;
    const prepareAudio = async () => {
      const engine = previewAudioEngineRef.current;
      if (!engine) return;

      let hasDegradedRetime = false;
      const activeIds = new Set(
        activeMediaClipsRef.current.map((clip) => clip.id),
      );
      for (const clip of previewMediaClipsRef.current) {
        const media = mediaElementsRef.current.get(clip.id);
        if (!media || !previewObjectUrls[clip.src]) continue;

        const configuration = getPreviewAudioConfiguration(
          clip,
          trackByIdRef.current,
          !activeIds.has(clip.id),
        );
        if (clip.speed === 1) {
          engine.configure(media, configuration);
          continue;
        }
        const enhanced = await engine.prepare(
          media,
          configuration,
        );
        if (!enhanced) hasDegradedRetime = true;
      }

      if (!cancelled) {
        setPlaybackWarning(
          hasDegradedRetime
            ? '高质量变速音频不可用，已使用浏览器兼容模式'
            : null,
        );
      }
    };
    void prepareAudio().catch((error: unknown) => {
      if (!cancelled) {
        setPlaybackWarning(
          error instanceof Error ? error.message : '音频预览初始化失败',
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    previewMediaConfigurationKey,
    previewObjectUrls,
  ]);

  useLayoutEffect(() => {
    if (!canUseMediaElement()) return undefined;

    let cancelled = false;
    const reportPlaybackFailure = (error: unknown) => {
      if (!cancelled) {
        setPlaybackWarning(
          error instanceof Error ? error.message : '媒体播放启动失败',
        );
      }
    };

    try {
      const result = previewPlaybackControllerRef.current.update({
        activeClips: activeMediaClipsRef.current,
        audioEngine: previewAudioEngineRef.current,
        currentTimeUs: currentTimeUsRef.current,
        isPlaying,
        mediaElements: mediaElementsRef.current,
        objectUrls: previewObjectUrls,
        tracksById: trackByIdRef.current,
      });
      if (result.didSynchronize) {
        drawPreviewRef.current(interactionRef.current);
      }
      if (result.startPromise) {
        void result.startPromise.catch(reportPlaybackFailure);
      }
    } catch (error: unknown) {
      reportPlaybackFailure(error);
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeMediaClipIdsKey,
    activeSeekConfigurationKey,
    previewMediaConfigurationKey,
    isPlaying,
    previewObjectUrls,
  ]);

  useEffect(() => {
    drawPreviewRef.current(interactionRef.current);
    if (!isPlaying || !canUseMediaElement()) return undefined;

    const videos = activeMediaClipsRef.current.flatMap((clip) => {
      if (clip.type !== 'video') return [];
      const media = mediaElementsRef.current.get(clip.id);
      return media instanceof HTMLVideoElement ? [media] : [];
    });
    if (videos.length === 0) return undefined;

    const frameCallbacks = new Map<HTMLVideoElement, number>();
    const canUseVideoFrameCallbacks = videos.every(
      (video) =>
        typeof video.requestVideoFrameCallback === 'function' &&
        typeof video.cancelVideoFrameCallback === 'function',
    );

    if (canUseVideoFrameCallbacks) {
      const scheduleDraw = (video: HTMLVideoElement) => {
        const callbackId = video.requestVideoFrameCallback(() => {
          drawPreviewRef.current(interactionRef.current);
          if (isPlayingRef.current) scheduleDraw(video);
        });
        frameCallbacks.set(video, callbackId);
      };
      for (const video of videos) scheduleDraw(video);

      return () => {
        for (const [video, callbackId] of frameCallbacks) {
          video.cancelVideoFrameCallback(callbackId);
        }
      };
    }

    let animationFrame = 0;
    const drawFrame = () => {
      drawPreviewRef.current(interactionRef.current);
      animationFrame = requestAnimationFrame(drawFrame);
    };
    animationFrame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationFrame);
  }, [activeVideoClipIdsKey, isPlaying]);

  const startPreviewInteraction = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(canvas, event, previewFrame);
    const selectedTransform = selectedActiveClip
      ? getTimelineClipTransform(selectedActiveClip)
      : null;
    const resizeHandle =
      selectedActiveClip?.type !== 'text' && selectedTransform
      ? getResizeHandleAtPoint(
          point,
          selectedTransform,
          previewFrame.scale,
        )
      : null;
    const targetClip = resizeHandle
      ? selectedActiveClip
      : (getVisibleClipAtPoint(point, activeVisualClips, canvasSize) ??
        (selectedActiveClip &&
        selectedTransform &&
        isPointInTransform(point, selectedTransform)
          ? selectedActiveClip
          : null));
    if (!targetClip) {
      canvas.style.cursor = 'default';
      selectClip(null);
      return;
    }

    const mode: PreviewInteractionMode = resizeHandle ?? 'move';

    event.preventDefault();
    selectClip(targetClip.id);
    canvas.style.cursor =
      mode === 'move' ? 'move' : getResizeHandleCursor(mode);
    event.currentTarget.setPointerCapture(event.pointerId);
    const targetTransform = getTimelineClipTransform(targetClip);
    interactionRef.current = {
      clipId: targetClip.id,
      guides: [],
      initialPointer: point,
      initialTransform: targetTransform,
      mode,
      resizable: targetClip.type !== 'text',
      transform: targetTransform,
    };
    setLiveTransform({
      clipId: targetClip.id,
      transform: targetTransform,
    });
    drawPreview(interactionRef.current);
  };

  const movePreviewInteraction = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!interaction) {
      const point = getCanvasPoint(canvas, event, previewFrame);
      const selectedCursor = selectedActiveClip
        ? selectedActiveClip.type === 'text'
          ? isPointInTransform(
              point,
              getTimelineClipTransform(selectedActiveClip),
            )
            ? 'move'
            : 'default'
          : getPreviewCursor(
              point,
              selectedActiveClip.transform,
              previewFrame.scale,
            )
        : 'default';
      const visibleClip = getVisibleClipAtPoint(
        point,
        activeVisualClips,
        canvasSize,
      );
      canvas.style.cursor =
        selectedCursor !== 'default'
          ? selectedCursor
          : visibleClip
            ? 'move'
            : 'default';
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(canvas, event, previewFrame);
    const deltaX = point.x - interaction.initialPointer.x;
    const deltaY = point.y - interaction.initialPointer.y;
    const { guides, transform } = getPreviewInteractionUpdate({
      canvasSize,
      deltaX,
      deltaY,
      initialTransform: interaction.initialTransform,
      keepAspectRatio: event.shiftKey,
      minimumSize: MIN_CLIP_TRANSFORM_SIZE,
      mode: interaction.mode,
      previewScale: previewFrame.scale,
      snappingEnabled: canvasSnappingEnabled,
      targetTransforms: activeVisualClips
        .filter((clip) => clip.id !== interaction.clipId)
        .map(getTimelineClipTransform),
    });

    interactionRef.current = {
      ...interaction,
      guides,
      transform,
    };
    setLiveTransform({ clipId: interaction.clipId, transform });
    drawPreview(interactionRef.current);
  };

  const endPreviewInteraction = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);
    interactionRef.current = null;
    const endPoint = getCanvasPoint(event.currentTarget, event, previewFrame);
    event.currentTarget.style.cursor = interaction.resizable
      ? getPreviewCursor(endPoint, interaction.transform, previewFrame.scale)
      : isPointInTransform(endPoint, interaction.transform)
        ? 'move'
        : 'default';
    drawPreview({ ...interaction, guides: [] });
    if (interaction.mode === 'move') {
      commitClipPosition({
        clipId: interaction.clipId,
        position: {
          x: interaction.transform.x,
          y: interaction.transform.y,
        },
      });
    } else if (interaction.resizable) {
      commitMediaClipTransform({
        clipId: interaction.clipId,
        transform: interaction.transform,
      });
    }
    setLiveTransform(null);
  };

  const cancelPreviewInteraction = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!interactionRef.current) return;

    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);
    interactionRef.current = null;
    setLiveTransform(null);
    event.currentTarget.style.cursor = 'default';
    drawPreview();
  };

  const resetPreviewCursor = () => {
    if (!interactionRef.current && canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  };

  return (
    <section className='ec-preview-panel'>
      <div ref={previewRef} className='ec-preview-panel__viewport'>
        <div
          ref={previewContainerRef}
          className='ec-preview-panel__canvas-wrap'
        >
          <canvas
            ref={canvasRef}
            aria-label='视频预览'
            className='ec-preview-panel__canvas'
            height={Math.round(previewCanvasSize.height)}
            onPointerCancel={cancelPreviewInteraction}
            onPointerDown={startPreviewInteraction}
            onPointerLeave={resetPreviewCursor}
            onPointerMove={movePreviewInteraction}
            onPointerUp={endPreviewInteraction}
            width={Math.round(previewCanvasSize.width)}
          />
          {(mediaError || playbackWarning || fontWarning) && (
            <p className='ec-preview-panel__error' role='status'>
              {mediaError
                ? `无法加载部分媒体：${mediaError}`
                : (playbackWarning ?? fontWarning)}
            </p>
          )}
          <div aria-hidden className='ec-preview-panel__media'>
            {previewMediaClips.map((clip) => {
              const isActive = activeClipIds.has(clip.id);
              return (
                <PreviewMediaElement
                  key={clip.id}
                  clip={clip}
                  isActive={isActive}
                  muted={
                    !isActive ||
                    Boolean(trackById.get(clip.trackId)?.muted) ||
                    clip.volume === 0
                  }
                  onElementChange={setClipMediaElement}
                  onLoadedMetadata={handleLoadedMediaMetadata}
                  onVisualChange={drawCurrentPreview}
                  src={previewObjectUrls[clip.src]}
                />
              );
            })}
            {previewImageClips.map((clip) => (
              <PreviewImageElement
                key={clip.id}
                clip={clip}
                onDecodeError={handleImageDecodeError}
                onElementChange={setClipImageElement}
                onVisualChange={drawCurrentPreview}
                src={previewObjectUrls[clip.src]}
              />
            ))}
          </div>
        </div>
      </div>
      <CanvasRatioPanel />
      {selectedClipId !== null && (
        <FloatingInspector
          key={selectedClipId}
          previewTiming={clipTimingPreview}
          previewTransform={liveTransform}
        />
      )}
    </section>
  );
}
