import {
  useCallback,
  useEffect,
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
import { timelineTimeToClipSourceTimeUs } from '../core/clip-speed';
import {
  microsecondsToSeconds,
  secondsToMicroseconds,
} from '../core/time';
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
  TimelineTrack,
} from '../types';
import { useMediaRuntime } from '../media';
import {
  PreviewAudioEngine,
  type PreviewAudioConfiguration,
} from '../media/preview-audio-engine';
import { FloatingInspector } from './FloatingInspector';

const PREVIEW_HANDLE_SIZE = 12;
const PREVIEW_HANDLE_HIT_PADDING = 8;
const PREVIEW_GUIDE_COLOR = '#00cae0';
const HAVE_METADATA_READY_STATE = 1;
const HAVE_CURRENT_DATA_READY_STATE = 2;
const PREVIEW_PRELOAD_LOOKAHEAD_US = secondsToMicroseconds(5);
const MAX_PRELOADED_MEDIA_CLIPS = 4;

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
  transform: TimelineClipTransform;
};
type PreviewCursor = 'default' | 'move' | 'nesw-resize' | 'nwse-resize';

type PreviewPanelProps = {
  clipTimingPreview?: TimelineClipTimingPreview | null;
  previewRef: RefObject<HTMLDivElement | null>;
};

const previewResizeHandles: PreviewResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

const canUseMediaElement = () =>
  typeof navigator === 'undefined' ||
  !navigator.userAgent.toLowerCase().includes('jsdom');

type PreviewClipIndex = ReadonlyMap<string, readonly TimelineClip[]>;

const comparePreviewClipOrder = (
  left: TimelineClip,
  right: TimelineClip,
) => left.startUs - right.startUs || left.id.localeCompare(right.id);

const createPreviewClipIndex = (
  clips: TimelineClip[],
): PreviewClipIndex => {
  const clipsByTrack = new Map<string, TimelineClip[]>();

  for (const clip of clips) {
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

const findNextClip = (
  clips: readonly TimelineClip[],
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
  return clips[lower];
};

const getPreviewMediaClips = (
  clipIndex: PreviewClipIndex,
  activeClips: TimelineClip[],
  currentTimeUs: number,
) => {
  const preloadEndUs = currentTimeUs + PREVIEW_PRELOAD_LOOKAHEAD_US;
  const preloadCandidates: TimelineClip[] = [];

  for (const trackClips of clipIndex.values()) {
    const nextClip = findNextClip(trackClips, currentTimeUs);
    if (nextClip && nextClip.startUs <= preloadEndUs) {
      preloadCandidates.push(nextClip);
    }
  }
  preloadCandidates.sort(comparePreviewClipOrder);

  return [
    ...activeClips,
    ...preloadCandidates.slice(0, MAX_PRELOADED_MEDIA_CLIPS),
  ];
};

const getClipMediaTimeSeconds = (
  clip: TimelineClip,
  timelineTimeUs: number,
) =>
  microsecondsToSeconds(
    timelineTimeToClipSourceTimeUs(clip, timelineTimeUs),
  );

type PreviewMediaElementProps = {
  clip: TimelineClip;
  isActive: boolean;
  muted: boolean;
  onElementChange: (
    clipId: string,
    element: HTMLMediaElement | null,
  ) => void;
  onLoadedMetadata: (
    clip: TimelineClip,
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

const getPreviewAudioConfiguration = (
  clip: TimelineClip,
  tracksById: ReadonlyMap<string, TimelineTrack>,
  forceMuted = false,
): PreviewAudioConfiguration => ({
  muted:
    forceMuted ||
    Boolean(tracksById.get(clip.trackId)?.muted) ||
    clip.volume === 0,
  speed: clip.speed,
  volume: clip.volume,
});

const getPreviewDrawKey = (
  canvas: HTMLCanvasElement,
  clips: TimelineClip[],
  previewFrame: PreviewFrame,
  selectedClipId: string | null,
) =>
  [
    canvas.width,
    canvas.height,
    previewFrame.offsetX,
    previewFrame.offsetY,
    previewFrame.width,
    previewFrame.height,
    selectedClipId ?? '',
    ...clips.map((clip) =>
      [
        clip.id,
        clip.transform.x,
        clip.transform.y,
        clip.transform.width,
        clip.transform.height,
      ].join(':'),
    ),
  ].join('|');

const hasPendingPreviewMedia = (
  clips: TimelineClip[],
  previewObjectUrls: Record<string, string>,
  mediaElements: Map<string, HTMLMediaElement>,
) =>
  clips.some((clip) => {
    if (!previewObjectUrls[clip.src]) return true;

    const media = mediaElements.get(clip.id);
    return !media || media.readyState < HAVE_CURRENT_DATA_READY_STATE;
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
    if (isPointInTransform(point, clip.transform)) {
      return clip;
    }
  }

  return null;
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
  const commitClipTransform = useTimelineStore(
    (state) => state.commitClipTransform,
  );
  const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const selectClip = useTimelineStore((state) => state.selectClip);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const tracks = useTimelineStore((state) => state.tracks);
  const mediaRuntime = useMediaRuntime();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<PreviewInteractionState | null>(null);
  const lastPreviewDrawKeyRef = useRef<string | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
  const mediaElementsRef = useRef(new Map<string, HTMLMediaElement>());
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
  const activeClipIds = useMemo(
    () => new Set(activeClips.map((clip) => clip.id)),
    [activeClips],
  );
  const previewClipIndex = useMemo(
    () => createPreviewClipIndex(clips),
    [clips],
  );
  const previewMediaClips = useMemo(
    () =>
      getPreviewMediaClips(
        previewClipIndex,
        activeClips,
        currentTimeUs,
      ),
    [activeClips, currentTimeUs, previewClipIndex],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const previewSourcesKey = useMemo(
    () =>
      Array.from(new Set(previewMediaClips.map((clip) => clip.src))).join(
        '\n',
      ),
    [previewMediaClips],
  );
  const activeClipIdsKey = activeClips.map((clip) => clip.id).join('\n');
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
  const activeSeekConfigurationKey = activeClips
    .map((clip) =>
      [
        clip.id,
        clip.durationUs,
        clip.speed,
        clip.startUs,
        clip.trimEndUs,
        clip.trimStartUs,
      ].join(':'),
    )
    .join('\n');
  const activeVideoVisualConfigurationKey = activeVideoClips
    .map((clip) =>
      [
        clip.id,
        clip.transform.height,
        clip.transform.width,
        clip.transform.x,
        clip.transform.y,
      ].join(':'),
    )
    .join('\n');
  const activeClipsRef = useRef(activeClips);
  const currentTimeUsRef = useRef(currentTimeUs);
  const drawPreviewRef = useRef<
    (interaction?: PreviewInteractionState | null) => void
  >(() => undefined);
  const isPlayingRef = useRef(isPlaying);
  const previewMediaClipsRef = useRef(previewMediaClips);
  const trackByIdRef = useRef(trackById);
  useEffect(() => {
    activeClipsRef.current = activeClips;
    currentTimeUsRef.current = currentTimeUs;
    isPlayingRef.current = isPlaying;
    previewMediaClipsRef.current = previewMediaClips;
    trackByIdRef.current = trackById;
  }, [
    activeClips,
    currentTimeUs,
    isPlaying,
    previewMediaClips,
    trackById,
  ]);
  const selectedActiveClip =
    activeVideoClips.find((clip) => clip.id === selectedClipId) ?? null;
  const previewCanvasSize = previewContainerSize ?? canvasSize;
  const previewFrame = useMemo(
    () => getPreviewFrame(canvasSize, previewCanvasSize),
    [canvasSize, previewCanvasSize],
  );

  const setClipMediaElement = useCallback(
    (clipId: string, element: HTMLMediaElement | null) => {
      const current = mediaElementsRef.current.get(clipId);
      if (element) {
        if (current && current !== element) {
          previewAudioEngineRef.current?.release(current);
        }
        mediaElementsRef.current.set(clipId, element);
        return;
      }

      if (current) previewAudioEngineRef.current?.release(current);
      mediaElementsRef.current.delete(clipId);
    },
    [],
  );
  const drawCurrentPreview = useCallback(() => {
    drawPreviewRef.current(interactionRef.current);
  }, []);
  const handleLoadedMediaMetadata = useCallback(
    (
      clip: TimelineClip,
      isActive: boolean,
      element: HTMLMediaElement,
    ) => {
      if (!isActive) return;
      element.currentTime = getClipMediaTimeSeconds(
        clip,
        currentTimeUsRef.current,
      );
      drawPreviewRef.current(interactionRef.current);
    },
    [],
  );

  const drawPreview = useCallback(
    (interaction?: PreviewInteractionState | null) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      const selectedDrawClipId = interaction?.clipId ?? selectedClipId;
      const previewDrawKey = getPreviewDrawKey(
        canvas,
        activeVideoClips,
        previewFrame,
        selectedDrawClipId,
      );
      if (
        !interaction &&
        lastPreviewDrawKeyRef.current === previewDrawKey &&
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

      context.save();
      context.beginPath();
      context.rect(
        previewFrame.offsetX,
        previewFrame.offsetY,
        previewFrame.width,
        previewFrame.height,
      );
      context.clip();

      for (const clip of activeVideoClips) {
        const video = mediaElementsRef.current.get(clip.id) as
          HTMLVideoElement | undefined;
        const objectUrl = previewObjectUrls[clip.src];
        const transform =
          interaction?.clipId === clip.id
            ? interaction.transform
            : clip.transform;
        const previewTransform = toPreviewTransform(transform, previewFrame);

        if (
          video &&
          objectUrl &&
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

        if (clip.id === selectedDrawClipId) {
          selectedTransform = transform;
        }
      }

      context.restore();

      drawPreviewGuides(
        context,
        interaction?.guides ?? [],
        previewFrame,
      );

      if (selectedTransform) {
        drawSelectedClipFrame(context, selectedTransform, previewFrame);
      }
      lastPreviewDrawKeyRef.current = previewDrawKey;
    },
    [activeVideoClips, previewFrame, previewObjectUrls, selectedClipId],
  );
  useEffect(() => {
    drawPreviewRef.current = drawPreview;
  }, [drawPreview]);

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

  useEffect(() => {
    drawPreviewRef.current(interactionRef.current);
  }, [
    activeVideoVisualConfigurationKey,
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

  useEffect(() => {
    if (!canUseMediaElement()) return undefined;

    let cancelled = false;
    const previewSources = previewSourcesKey
      ? previewSourcesKey.split('\n')
      : [];

    if (previewSources.length === 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setPreviewObjectUrls({});
          setMediaError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all(
      previewSources.map((src) =>
        mediaRuntime
          .getObjectUrl(src)
          .then((objectUrl) => [src, objectUrl] as const),
      ),
    )
      .then((entries) => {
        if (cancelled) return;

        setPreviewObjectUrls(Object.fromEntries(entries));
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

  const syncActiveMediaToTime = useCallback((timelineTimeUs: number) => {
    for (const clip of activeClipsRef.current) {
      const media = mediaElementsRef.current.get(clip.id);
      if (!media || media.readyState < HAVE_METADATA_READY_STATE) continue;

      const targetTime = getClipMediaTimeSeconds(clip, timelineTimeUs);
      if (Math.abs(media.currentTime - targetTime) > 0.001) {
        media.currentTime = targetTime;
      }
    }
    drawPreviewRef.current(interactionRef.current);
  }, []);

  useEffect(() => {
    if (!canUseMediaElement()) return undefined;

    if (!isPlaying) syncActiveMediaToTime(currentTimeUs);
    return undefined;
  }, [
    activeClipIdsKey,
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
        activeClipsRef.current.map((clip) => clip.id),
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

  useEffect(() => {
    if (!canUseMediaElement()) return undefined;

    let cancelled = false;
    const activeIds = new Set(
      activeClipsRef.current.map((clip) => clip.id),
    );
    for (const [clipId, media] of mediaElementsRef.current) {
      if (!isPlaying || !activeIds.has(clipId)) {
        media.pause();
      }
    }

    if (!isPlaying) return undefined;

    const startActiveMedia = async () => {
      const engine = previewAudioEngineRef.current;
      const clipsToStart = activeClipsRef.current;
      if (engine) {
        await Promise.all(
          clipsToStart.map(async (clip) => {
            const media = mediaElementsRef.current.get(clip.id);
            if (!media || !previewObjectUrls[clip.src]) return;
            const configuration = getPreviewAudioConfiguration(
              clip,
              trackByIdRef.current,
            );
            if (clip.speed === 1) {
              engine.configure(media, configuration);
              return;
            }
            await engine.prepare(
              media,
              configuration,
            );
          }),
        );
        await engine.resume();
      }

      if (cancelled || !isPlayingRef.current) return;
      syncActiveMediaToTime(currentTimeUsRef.current);

      await Promise.all(
        clipsToStart.map(async (clip) => {
          const media = mediaElementsRef.current.get(clip.id);
          if (!media || !previewObjectUrls[clip.src]) return;
          await media.play();
        }),
      );
    };
    void startActiveMedia().catch((error: unknown) => {
      if (!cancelled) {
        setPlaybackWarning(
          error instanceof Error ? error.message : '媒体播放启动失败',
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeClipIdsKey,
    previewMediaConfigurationKey,
    isPlaying,
    previewObjectUrls,
    syncActiveMediaToTime,
  ]);

  useEffect(() => {
    drawPreviewRef.current(interactionRef.current);
    if (!isPlaying || !canUseMediaElement()) return undefined;

    const videos = activeClipsRef.current.flatMap((clip) => {
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
    const resizeHandle = selectedActiveClip
      ? getResizeHandleAtPoint(
          point,
          selectedActiveClip.transform,
          previewFrame.scale,
        )
      : null;
    const targetClip = resizeHandle
      ? selectedActiveClip
      : (getVisibleClipAtPoint(point, activeVideoClips, canvasSize) ??
        (selectedActiveClip &&
        isPointInTransform(point, selectedActiveClip.transform)
          ? selectedActiveClip
          : null));
    if (!targetClip) return;

    const mode: PreviewInteractionMode = resizeHandle ?? 'move';

    event.preventDefault();
    selectClip(targetClip.id);
    canvas.style.cursor =
      mode === 'move' ? 'move' : getResizeHandleCursor(mode);
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      clipId: targetClip.id,
      guides: [],
      initialPointer: point,
      initialTransform: targetClip.transform,
      mode,
      transform: targetClip.transform,
    };
    setLiveTransform({
      clipId: targetClip.id,
      transform: targetClip.transform,
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
        ? getPreviewCursor(
            point,
            selectedActiveClip.transform,
            previewFrame.scale,
          )
        : 'default';
      const visibleClip = getVisibleClipAtPoint(
        point,
        activeVideoClips,
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
      targetTransforms: activeVideoClips
        .filter((clip) => clip.id !== interaction.clipId)
        .map((clip) => clip.transform),
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
    event.currentTarget.style.cursor = getPreviewCursor(
      getCanvasPoint(event.currentTarget, event, previewFrame),
      interaction.transform,
      previewFrame.scale,
    );
    drawPreview({ ...interaction, guides: [] });
    commitClipTransform({
      clipId: interaction.clipId,
      transform: interaction.transform,
    });
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
          {(mediaError || playbackWarning) && (
            <p className='ec-preview-panel__error' role='status'>
              {mediaError
                ? `无法加载部分媒体：${mediaError}`
                : playbackWarning}
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
          </div>
        </div>
      </div>
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
