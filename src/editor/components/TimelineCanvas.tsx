import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type Konva from 'konva';
import { Layer, Line, Rect, Stage } from 'react-konva';

import {
  getClipSnapCandidates,
  getInsertionIndex,
  getPreservedGapInsertionLayout,
  getTimelineDuration,
  getTrackClips,
  snapClipMoveToCandidates,
  snapTimeToCandidates,
} from '../core/collision';
import {
  SNAP_THRESHOLD_PX,
  durationToWidth,
  roundTimelineTime,
  timeToX,
  TIMELINE_ZOOM_STEP,
  xToTime,
} from '../core/timeline-math';
import {
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
  getTrimmedClip,
  getTrimmedTimelineClips,
  getVisibleTimelineTracks,
  normalizeTimelineClips,
  shouldCompactMainVideoTrackAfterDrop,
  type PendingTimelineTrack,
} from '../store/timeline-store';
import { useTimelineStore, useTimelineStoreApi } from '../store/timeline-store-context';
import type {
  TimelineClip,
  TimelineClipTrimEdge,
  TimelineTrack,
} from '../types';
import {
  TIMELINE_RULER_HEIGHT,
  getTimelineClipHeight,
  getTimelineClipY,
  getTimelineTrackHeight,
  getTimelineTrackY,
  getTimelineTracksHeight,
} from '../core/timeline-layout';
import { ClipNode } from './ClipNode';
import { DragGhost } from './DragGhost';
import { Playhead } from './Playhead';
import { TimelineRuler } from './TimelineRuler';

type ClipDragState = {
  clipId: string;
  ghostHeight: number;
  ghostWidth: number;
  insertionIndex: number;
  placeholderX: number;
  placeholderY: number;
  snapLineX: number | null;
  sourceIndex: number;
  sourceTrackId: string;
  targetTrackInsertIndex: number | null;
  targetTrackId: string;
  usesFreeStart: boolean;
  x: number;
  y: number;
};

type ClipDragCalculation = {
  dragState: ClipDragState;
  pendingTrack: PendingTimelineTrack | null;
};

type ClipTrimState = {
  clipId: string;
  edge: TimelineClipTrimEdge;
  initialPointerX: number;
  initialTrimEnd: number;
  initialTrimStart: number;
  trimEnd: number;
  trimStart: number;
};

type TimelineCursor =
  'default' | 'ew-resize' | 'grabbing' | 'ns-resize' | 'pointer';
type TimelineCursorSource =
  'clip' | 'clip-drag' | 'playhead' | 'trim' | 'volume';
type TimelineCursorState = {
  cursor: TimelineCursor;
  source: TimelineCursorSource | null;
};

type TimelineCanvasProps = {
  onPendingTrackChange?: (pendingTrack: PendingTimelineTrack | null) => void;
  pendingTrack?: PendingTimelineTrack | null;
  verticalScrollContainer?: HTMLDivElement | null;
  visibleTracks?: TimelineTrack[];
};

type StickyTimelineLayerProps = {
  currentTime: number;
  duration: number;
  height: number;
  maxX: number;
  onCursorChange: (source: 'playhead', cursor: 'default' | 'ew-resize') => void;
  onPlayheadDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  pixelsPerSecond: number;
  timelineWidth: number;
  verticalScrollContainer?: HTMLDivElement | null;
};

const TIMELINE_STAGE_PADDING_X = 12;
const timelineCursorPriority: Record<TimelineCursorSource, number> = {
  clip: 1,
  playhead: 2,
  volume: 3,
  trim: 4,
  'clip-drag': 5,
};
const defaultTimelineCursorState: TimelineCursorState = {
  cursor: 'default',
  source: null,
};
const timelineToStageX = (value: number) => value + TIMELINE_STAGE_PADDING_X;
const stageToTimelineX = (value: number) =>
  Math.max(0, value - TIMELINE_STAGE_PADDING_X);
const stageToTrimTimelineX = (value: number) =>
  value - TIMELINE_STAGE_PADDING_X;

const getTrackAtY = (tracks: TimelineTrack[], y: number) => {
  let trackY = TIMELINE_RULER_HEIGHT;

  return (
    tracks.find((track) => {
      const trackBottom = trackY + getTimelineTrackHeight(track);
      const isInside = y >= trackY && y < trackBottom;
      trackY = trackBottom;
      return isInside;
    }) ?? null
  );
};

const getTrackIndex = (tracks: TimelineTrack[], trackId: string) =>
  Math.max(
    0,
    tracks.findIndex((track) => track.id === trackId),
  );

const canUseKonvaCanvas = () => {
  if (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('jsdom')
  ) {
    return false;
  }

  return typeof document !== 'undefined';
};

function StickyTimelineLayer({
  currentTime,
  duration,
  height,
  maxX,
  onCursorChange,
  onPlayheadDragMove,
  pixelsPerSecond,
  timelineWidth,
  verticalScrollContainer,
}: StickyTimelineLayerProps) {
  const subscribeToScroll = useCallback(
    (onStoreChange: () => void) => {
      if (!verticalScrollContainer) return () => undefined;

      verticalScrollContainer.addEventListener('scroll', onStoreChange, {
        passive: true,
      });
      return () =>
        verticalScrollContainer.removeEventListener('scroll', onStoreChange);
    },
    [verticalScrollContainer],
  );
  const getScrollTop = useCallback(
    () => verticalScrollContainer?.scrollTop ?? 0,
    [verticalScrollContainer],
  );
  const scrollTop = useSyncExternalStore(
    subscribeToScroll,
    getScrollTop,
    () => 0,
  );

  return (
    <Layer name='overlayLayer' y={scrollTop}>
      <TimelineRuler
        duration={Math.max(duration, 12)}
        height={TIMELINE_RULER_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        width={timelineWidth}
        x={TIMELINE_STAGE_PADDING_X}
      />
      <Playhead
        dragY={scrollTop}
        height={height}
        maxX={maxX}
        minX={TIMELINE_STAGE_PADDING_X}
        onCursorChange={onCursorChange}
        onDragMove={onPlayheadDragMove}
        x={timelineToStageX(timeToX(currentTime, pixelsPerSecond))}
      />
    </Layer>
  );
}

const getClipDragTarget = (
  baseTracks: TimelineTrack[],
  renderedTracks: TimelineTrack[],
  clip: TimelineClip,
  pointerY: number,
) => {
  const trackAtPointer = getTrackAtY(renderedTracks, pointerY);
  const videoTrackCount = baseTracks.filter(
    (track) => track.type === 'video',
  ).length;
  const createPendingTarget = (pendingTrack: PendingTimelineTrack) => {
    const visibleTracks = getVisibleTimelineTracks(baseTracks, pendingTrack);
    const pendingTrackId =
      pendingTrack.type === 'video'
        ? NEW_VIDEO_TRACK_DROP_ID
        : NEW_AUDIO_TRACK_DROP_ID;

    return {
      pendingTrack,
      targetTrack:
        visibleTracks.find((track) => track.id === pendingTrackId) ?? null,
      visibleTracks,
    };
  };

  if (
    trackAtPointer?.id === NEW_VIDEO_TRACK_DROP_ID ||
    trackAtPointer?.id === NEW_AUDIO_TRACK_DROP_ID
  ) {
    return {
      pendingTrack: {
        index: getTrackIndex(renderedTracks, trackAtPointer.id),
        type: trackAtPointer.type,
      },
      targetTrack: trackAtPointer,
      visibleTracks: renderedTracks,
    };
  }

  if (trackAtPointer?.type === clip.type) {
    return {
      pendingTrack: null,
      targetTrack: trackAtPointer,
      visibleTracks: baseTracks,
    };
  }

  const trackAreaBottom =
    TIMELINE_RULER_HEIGHT + getTimelineTracksHeight(renderedTracks);
  if (clip.type === 'video' && pointerY < TIMELINE_RULER_HEIGHT) {
    return createPendingTarget({ index: 0, type: 'video' });
  }

  if (
    clip.type === 'video' &&
    (trackAtPointer?.type === 'audio' || pointerY >= trackAreaBottom)
  ) {
    return createPendingTarget({ index: videoTrackCount, type: 'video' });
  }

  if (
    clip.type === 'audio' &&
    (trackAtPointer?.type === 'video' || pointerY < TIMELINE_RULER_HEIGHT)
  ) {
    return createPendingTarget({ index: videoTrackCount, type: 'audio' });
  }

  if (clip.type === 'audio' && pointerY >= trackAreaBottom) {
    return createPendingTarget({ index: baseTracks.length, type: 'audio' });
  }

  return {
    pendingTrack: null,
    targetTrack: baseTracks.find((track) => track.id === clip.trackId) ?? null,
    visibleTracks: baseTracks,
  };
};

const getBoundClipY = (
  baseTracks: TimelineTrack[],
  renderedTracks: TimelineTrack[],
  clip: TimelineClip,
  candidateY: number,
) => {
  const { targetTrack, visibleTracks } = getClipDragTarget(
    baseTracks,
    renderedTracks,
    clip,
    candidateY + getTimelineClipHeight(clip.type) / 2,
  );
  const targetTrackIndex = getTrackIndex(
    visibleTracks,
    targetTrack?.id ?? clip.trackId,
  );

  return getTimelineClipY(visibleTracks, targetTrackIndex);
};

export function TimelineCanvas({
  onPendingTrackChange,
  pendingTrack = null,
  verticalScrollContainer,
  visibleTracks: controlledVisibleTracks,
}: TimelineCanvasProps = {}) {
  const clips = useTimelineStore((state) => state.clips);
  const currentTime = useTimelineStore((state) => state.currentTime);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const tracks = useTimelineStore((state) => state.tracks);
  const timelineStoreApi = useTimelineStoreApi();
  const visibleTracks =
    controlledVisibleTracks ?? getVisibleTimelineTracks(tracks, pendingTrack);
  const commitClipDrop = useTimelineStore((state) => state.commitClipDrop);
  const commitClipTrim = useTimelineStore((state) => state.commitClipTrim);
  const commitTrackVolume = useTimelineStore(
    (state) => state.commitTrackVolume,
  );
  const selectClip = useTimelineStore((state) => state.selectClip);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const setTrackVolume = useTimelineStore((state) => state.setTrackVolume);
  const [dragState, setDragState] = useState<ClipDragState | null>(null);
  const [trimState, setTrimState] = useState<ClipTrimState | null>(null);
  const [cursorState, setCursorState] = useState<TimelineCursorState>(
    defaultTimelineCursorState,
  );
  const [viewportWidth, setViewportWidth] = useState(900);
  const dragStateRef = useRef<ClipDragState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const displayClips = useMemo(() => {
    if (!trimState) return clips;
    if (trimState.edge === 'start') {
      return normalizeTimelineClips(
        clips.map((clip) =>
          clip.id === trimState.clipId
            ? getTrimmedClip(
                clip,
                trimState.edge,
                trimState.trimStart,
                trimState.trimEnd,
              )
            : clip,
        ),
      );
    }

    return getTrimmedTimelineClips(
      clips,
      tracks,
      trimState.clipId,
      trimState.edge,
      trimState.trimStart,
      trimState.trimEnd,
    );
  }, [clips, tracks, trimState]);
  const duration = getTimelineDuration(displayClips);
  const stageHeight =
    TIMELINE_RULER_HEIGHT + getTimelineTracksHeight(visibleTracks);
  const timelineWidth = Math.max(
    viewportWidth,
    durationToWidth(Math.max(duration + 2, 12), pixelsPerSecond),
  );
  const stageWidth = timelineWidth + TIMELINE_STAGE_PADDING_X * 2;

  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const shouldRenderKonva = canUseKonvaCanvas();
  const requestCursor = useCallback(
    (source: TimelineCursorSource, cursor: TimelineCursor) => {
      setCursorState((current) => {
        if (cursor === 'default') {
          return current.source === source
            ? defaultTimelineCursorState
            : current;
        }

        if (
          current.source &&
          timelineCursorPriority[current.source] >
            timelineCursorPriority[source]
        ) {
          return current;
        }

        return { cursor, source };
      });
    },
    [],
  );
  const resetCursor = useCallback(() => {
    setCursorState(defaultTimelineCursorState);
  }, []);
  const getEventTrimTimelineX = (event: Konva.KonvaEventObject<DragEvent>) => {
    const pointer = event.target.getStage()?.getPointerPosition();
    return stageToTrimTimelineX(pointer?.x ?? event.target.x());
  };
  const getTrimStateAtEvent = (
    current: ClipTrimState,
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ): ClipTrimState => {
    const deltaPx = getEventTrimTimelineX(event) - current.initialPointerX;
    const delta = roundTimelineTime(deltaPx / pixelsPerSecond);
    const nextTrimStart =
      current.edge === 'start'
        ? roundTimelineTime(current.initialTrimStart + delta)
        : current.initialTrimStart;
    const nextTrimEnd =
      current.edge === 'end'
        ? roundTimelineTime(current.initialTrimEnd + delta)
        : current.initialTrimEnd;
    const nextClip = getTrimmedClip(
      clip,
      current.edge,
      nextTrimStart,
      nextTrimEnd,
    );

    return {
      ...current,
      trimEnd: nextClip.trimEnd,
      trimStart: nextClip.trimStart,
    };
  };

  useLayoutEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    container.style.cursor = cursorState.cursor;
  }, [cursorState.cursor]);

  useEffect(
    () => () => {
      const container = stageRef.current?.container();
      if (container) container.style.cursor = 'default';
    },
    [],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateWidth = () => setViewportWidth(element.clientWidth || 900);
    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // 鼠标滚轮水平滚动时间轴（隐藏原生滚动条），Ctrl+滚轮缩放时间线。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const state = timelineStoreApi.getState();
        const zoomDelta =
          e.deltaY < 0 ? TIMELINE_ZOOM_STEP : -TIMELINE_ZOOM_STEP;
        state.setPixelsPerSecond(state.pixelsPerSecond + zoomDelta);
        return;
      }

      // Meta 缩放由编辑器外层统一阻止浏览器原生缩放。
      if (e.metaKey) return;

      e.preventDefault();
      element.scrollLeft += e.deltaY + e.deltaX;
    };

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => element.removeEventListener('wheel', handleWheel);
  }, [timelineStoreApi]);

  useEffect(() => {
    if (!isPlaying) return;

    const element = scrollRef.current;
    if (!element) return;

    const playheadX = timelineToStageX(timeToX(currentTime, pixelsPerSecond));
    const rightEdge = element.scrollLeft + element.clientWidth;

    if (playheadX > rightEdge - 72) {
      element.scrollLeft = Math.max(0, playheadX - element.clientWidth + 120);
    } else if (playheadX < element.scrollLeft + 24) {
      element.scrollLeft = Math.max(0, playheadX - 80);
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  const getSnappedTime = (time: number, draggedClipId?: string) => {
    if (!snappingEnabled) {
      return { snappedTime: time, snappedTo: null };
    }

    return snapTimeToCandidates(
      time,
      [...getClipSnapCandidates(clips, draggedClipId), currentTime],
      pixelsPerSecond,
      SNAP_THRESHOLD_PX,
    );
  };

  const getSnappedClipMove = (
    start: number,
    duration: number,
    draggedClipId: string,
  ) => {
    if (!snappingEnabled) {
      return { snappedStart: start, snappedTo: null };
    }

    return snapClipMoveToCandidates(
      start,
      duration,
      [...getClipSnapCandidates(clips, draggedClipId), currentTime],
      pixelsPerSecond,
      SNAP_THRESHOLD_PX,
    );
  };

  const setNextDragState = (nextDragState: ClipDragState | null) => {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const getDragStateAtEvent = (
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
    initialState: ClipDragState,
  ): ClipDragCalculation | null => {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const pointerY =
      pointer?.y ?? event.target.y() + getTimelineClipHeight(clip.type) / 2;
    const {
      pendingTrack: nextPendingTrack,
      targetTrack,
      visibleTracks: nextVisibleTracks,
    } = getClipDragTarget(tracks, visibleTracks, clip, pointerY);
    if (!targetTrack) return null;

    const targetTrackIndex = getTrackIndex(nextVisibleTracks, targetTrack.id);
    const targetTrackClips =
      targetTrack.id === NEW_VIDEO_TRACK_DROP_ID ||
      targetTrack.id === NEW_AUDIO_TRACK_DROP_ID
        ? []
        : getTrackClips(clips, targetTrack.id);
    const draggedX = stageToTimelineX(event.target.x());
    const { snappedStart, snappedTo } = getSnappedClipMove(
      xToTime(draggedX, pixelsPerSecond),
      clip.duration,
      clip.id,
    );
    const insertionIndex = getInsertionIndex(
      targetTrackClips,
      clip.id,
      draggedX,
      initialState.ghostWidth,
      pixelsPerSecond,
    );
    const trailingSlotIndex = targetTrackClips.filter(
      (candidate) => candidate.id !== clip.id,
    ).length;
    const locksTrailingSlot =
      insertionIndex >= trailingSlotIndex &&
      shouldCompactMainVideoTrackAfterDrop(
        tracks,
        clips,
        clip.id,
        targetTrack.id,
      );
    const insertionLayout = getPreservedGapInsertionLayout(
      targetTrackClips,
      { ...clip, trackId: targetTrack.id },
      insertionIndex,
      snappedStart,
      { allowTrailingFreeStart: !locksTrailingSlot },
    );

    return {
      dragState: {
        ...initialState,
        insertionIndex,
        snapLineX:
          snappedTo === null ||
          insertionLayout.insertedStart !== snappedStart ||
          insertionLayout.shiftedClipIds.length > 0
            ? null
            : timeToX(snappedTo, pixelsPerSecond),
        targetTrackInsertIndex: nextPendingTrack?.index ?? null,
        targetTrackId: targetTrack.id,
        usesFreeStart: true,
        x: timeToX(insertionLayout.insertedStart, pixelsPerSecond),
        y: getTimelineClipY(nextVisibleTracks, targetTrackIndex),
      },
      pendingTrack: nextPendingTrack,
    };
  };

  const updateDragState = (
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
    initialState: ClipDragState,
  ) => {
    const calculation = getDragStateAtEvent(event, clip, initialState);
    if (!calculation) return;

    onPendingTrackChange?.(calculation.pendingTrack);
    setNextDragState(calculation.dragState);
  };

  const handleClipDragStart = (
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ) => {
    selectClip(clip.id);
    event.target.moveToTop();
    const sourceTrackClips = getTrackClips(clips, clip.trackId);
    const sourceIndex = sourceTrackClips.findIndex(
      (candidate) => candidate.id === clip.id,
    );
    const sourceTrackIndex = getTrackIndex(tracks, clip.trackId);
    const clipHeight = getTimelineClipHeight(clip.type);
    const initialState: ClipDragState = {
      clipId: clip.id,
      ghostHeight: clipHeight,
      ghostWidth: durationToWidth(clip.duration, pixelsPerSecond),
      insertionIndex: Math.max(0, sourceIndex),
      placeholderX: timeToX(clip.start, pixelsPerSecond),
      placeholderY: getTimelineClipY(tracks, sourceTrackIndex),
      snapLineX: null,
      sourceIndex: Math.max(0, sourceIndex),
      sourceTrackId: clip.trackId,
      targetTrackInsertIndex: null,
      targetTrackId: clip.trackId,
      usesFreeStart: false,
      x: timeToX(clip.start, pixelsPerSecond),
      y: getTimelineClipY(tracks, sourceTrackIndex),
    };

    setNextDragState(initialState);
    updateDragState(event, clip, initialState);
  };

  const handleClipTrimDragStart = (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ) => {
    selectClip(clip.id);
    setTrimState({
      clipId: clip.id,
      edge,
      initialPointerX: getEventTrimTimelineX(event),
      initialTrimEnd: clip.trimEnd,
      initialTrimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      trimStart: clip.trimStart,
    });
  };

  const handleClipTrimDragMove = (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ) => {
    setTrimState((current) => {
      if (!current || current.clipId !== clip.id || current.edge !== edge) {
        return current;
      }

      return getTrimStateAtEvent(current, event, clip);
    });
  };

  const handleClipTrimDragEnd = (
    edge: TimelineClipTrimEdge,
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ) => {
    const currentTrimState = trimState;
    setTrimState(null);
    if (
      !currentTrimState ||
      currentTrimState.clipId !== clip.id ||
      currentTrimState.edge !== edge
    ) {
      return;
    }

    const nextTrimState = getTrimStateAtEvent(currentTrimState, event, clip);
    commitClipTrim({
      clipId: nextTrimState.clipId,
      edge: nextTrimState.edge,
      trimEnd: nextTrimState.trimEnd,
      trimStart: nextTrimState.trimStart,
    });
  };

  const handleClipDragEnd = (
    event: Konva.KonvaEventObject<DragEvent>,
    clip: TimelineClip,
  ) => {
    const currentDragState = dragStateRef.current;
    if (!currentDragState || currentDragState.clipId !== clip.id) return;

    const nextDragState =
      getDragStateAtEvent(event, clip, currentDragState)?.dragState ??
      currentDragState;

    event.target.position({
      x: timelineToStageX(nextDragState.x),
      y: nextDragState.y,
    });
    commitClipDrop({
      clipId: nextDragState.clipId,
      freeStart: nextDragState.usesFreeStart
        ? xToTime(nextDragState.x, pixelsPerSecond)
        : undefined,
      insertionIndex: nextDragState.insertionIndex,
      targetTrackId: nextDragState.targetTrackId,
      targetTrackInsertIndex:
        nextDragState.targetTrackId === NEW_VIDEO_TRACK_DROP_ID ||
        nextDragState.targetTrackId === NEW_AUDIO_TRACK_DROP_ID
          ? (nextDragState.targetTrackInsertIndex ?? undefined)
          : undefined,
    });
    setNextDragState(null);
    onPendingTrackChange?.(null);
  };

  const handlePlayheadDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    const { snappedTime } = getSnappedTime(
      xToTime(stageToTimelineX(event.target.x()), pixelsPerSecond),
    );
    setCurrentTime(snappedTime);
  };

  const handleStagePointerDown = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const targetName = event.target.name();
    if (
      !targetName.includes('timeline-hit') &&
      event.target !== event.target.getStage()
    ) {
      return;
    }

    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const { snappedTime } = getSnappedTime(
      xToTime(stageToTimelineX(pointer.x), pixelsPerSecond),
    );
    resetCursor();
    selectClip(null);
    setCurrentTime(snappedTime);
  };

  if (!shouldRenderKonva) {
    return (
      <div
        aria-label='Canvas 时间轴'
        className='oc-timeline-canvas oc-timeline-canvas--fallback'
        role='img'
      >
        Canvas timeline
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      aria-label='时间线轨道区域'
      className='oc-timeline-canvas'
    >
      <Stage
        ref={stageRef}
        height={stageHeight}
        onMouseDown={handleStagePointerDown}
        onTouchStart={handleStagePointerDown}
        width={stageWidth}
      >
        <Layer name='backgroundLayer'>
          <Rect
            fill='#171717'
            height={stageHeight}
            name='timeline-hit'
            width={stageWidth}
          />
          {visibleTracks.map((track, index) => {
            const y = getTimelineTrackY(visibleTracks, index);

            return (
              <Rect
                key={track.id}
                fill={index % 2 === 0 ? '#1d1d1d' : '#191919'}
                height={getTimelineTrackHeight(track)}
                name='timeline-hit'
                width={stageWidth}
                x={0}
                y={y}
              />
            );
          })}
        </Layer>
        <Layer name='clipsLayer'>
          {[...displayClips]
            .sort((a) => (a.id === selectedClipId ? 1 : -1))
            .map((clip) => {
              const track = trackById.get(clip.trackId);
              if (!track) return null;

              const trackIndex = getTrackIndex(visibleTracks, clip.trackId);
              const clipWidth = durationToWidth(clip.duration, pixelsPerSecond);
              const clipHeight = getTimelineClipHeight(clip.type);

              return (
                <ClipNode
                  key={clip.id}
                  clip={clip}
                  dragBoundFunc={(position) => ({
                    x: Math.max(TIMELINE_STAGE_PADDING_X, position.x),
                    y: getBoundClipY(tracks, visibleTracks, clip, position.y),
                  })}
                  height={clipHeight}
                  isDragging={dragState?.clipId === clip.id}
                  isSelected={selectedClipId === clip.id}
                  onCursorChange={requestCursor}
                  onDragEnd={(event) => handleClipDragEnd(event, clip)}
                  onDragMove={(event) => {
                    if (!dragState || dragState.clipId !== clip.id) return;
                    updateDragState(event, clip, dragState);
                  }}
                  onDragStart={(event) => handleClipDragStart(event, clip)}
                  onSelect={selectClip}
                  onTrackVolumeChange={(volume) =>
                    setTrackVolume(track.id, volume)
                  }
                  onTrackVolumeCommit={(previousVolume, volume) =>
                    commitTrackVolume(track.id, previousVolume, volume)
                  }
                  onTrimDragEnd={(edge, event) =>
                    handleClipTrimDragEnd(edge, event, clip)
                  }
                  onTrimDragMove={(edge, event) =>
                    handleClipTrimDragMove(edge, event, clip)
                  }
                  onTrimDragStart={(edge, event) =>
                    handleClipTrimDragStart(edge, event, clip)
                  }
                  width={clipWidth}
                  trackVolume={track.volume}
                  x={timelineToStageX(timeToX(clip.start, pixelsPerSecond))}
                  y={getTimelineClipY(visibleTracks, trackIndex)}
                />
              );
            })}
        </Layer>
        <Layer name='interactionLayer'>
          {dragState && (
            <DragGhost
              height={dragState.ghostHeight}
              placeholderX={timelineToStageX(dragState.placeholderX)}
              placeholderY={dragState.placeholderY}
              width={dragState.ghostWidth}
              x={timelineToStageX(dragState.x)}
              y={dragState.y}
            />
          )}
          {dragState?.snapLineX !== null &&
            dragState?.snapLineX !== undefined && (
              <Line
                dash={[4, 4]}
                listening={false}
                points={[
                  timelineToStageX(dragState.snapLineX),
                  0,
                  timelineToStageX(dragState.snapLineX),
                  stageHeight,
                ]}
                stroke='#f0abfc'
                strokeWidth={1.5}
              />
            )}
        </Layer>
        <StickyTimelineLayer
          currentTime={currentTime}
          duration={duration}
          height={stageHeight}
          maxX={timelineToStageX(timeToX(duration, pixelsPerSecond))}
          onCursorChange={requestCursor}
          onPlayheadDragMove={handlePlayheadDragMove}
          pixelsPerSecond={pixelsPerSecond}
          timelineWidth={timelineWidth}
          verticalScrollContainer={verticalScrollContainer}
        />
      </Stage>
    </div>
  );
}


