import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import {
  getClipSnapCandidates,
  snapTimeToCandidates,
} from '../core/collision';
import {
  getTimelineClipHeight,
  getTimelineClipY,
} from '../core/timeline-layout';
import {
  SNAP_THRESHOLD_PX,
  roundTimelineTime,
  xToTime,
} from '../core/timeline-math';
import {
  getTrimmedClip,
  getTrimmedTimelineClips,
} from '../store/timeline-store';
import {
  useTimelineStore,
  useTimelineStoreApi,
} from '../store/timeline-store-context';
import type {
  TimelineClip,
  TimelineClipTrimEdge,
} from '../types';
import {
  DRAG_ACTIVATION_DISTANCE,
  getContentPoint,
  getVolumeAtPointer,
  planClipDrop,
  type ClipDropPreview,
  type TimelineGesture,
  type TrimPreview,
  type VolumeGesture,
} from './timeline-interaction';

type TimelineControllerOptions = {
  gridRef: RefObject<HTMLDivElement | null>;
};

const DOUBLE_CLICK_INTERVAL_MS = 500;

type CompletedClipClick = {
  clipId: string;
  timeStamp: number;
};

export function useTimelineController({
  gridRef,
}: TimelineControllerOptions) {
  const clips = useTimelineStore((state) => state.clips);
  const currentTime = useTimelineStore((state) => state.currentTime);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const tracks = useTimelineStore((state) => state.tracks);
  const store = useTimelineStoreApi();
  const [gesture, setGesture] = useState<TimelineGesture | null>(null);
  const [dropPreview, setDropPreview] = useState<ClipDropPreview | null>(null);
  const [trimPreview, setTrimPreview] = useState<TrimPreview | null>(null);
  const dropPreviewRef = useRef<ClipDropPreview | null>(null);
  const lastCompletedClipClickRef = useRef<CompletedClipClick | null>(null);
  const moveActivatedRef = useRef(false);
  const trimPreviewRef = useRef<TrimPreview | null>(null);

  const displayClips = useMemo(() => {
    if (dropPreview) return dropPreview.clips;
    if (!trimPreview) return clips;

    return getTrimmedTimelineClips(
      clips,
      tracks,
      trimPreview.clipId,
      trimPreview.edge,
      trimPreview.trimStart,
      trimPreview.trimEnd,
    );
  }, [clips, dropPreview, tracks, trimPreview]);

  useEffect(() => {
    if (!gesture) return undefined;

    const updateScrub = (clientX: number, clientY: number) => {
      if (gesture.kind !== 'scrub') return;
      const point = getContentPoint(gridRef.current, clientX, clientY);
      if (!point) return;
      const candidate = xToTime(point.x, gesture.pixelsPerSecond);
      const { snappedTime } = gesture.snappingEnabled
        ? snapTimeToCandidates(
            candidate,
            gesture.snapCandidates,
            gesture.pixelsPerSecond,
            SNAP_THRESHOLD_PX,
          )
        : { snappedTime: roundTimelineTime(candidate) };
      store.getState().setCurrentTime(snappedTime);
    };
    const updateMove = (clientX: number, clientY: number) => {
      if (gesture.kind !== 'move') return;
      if (
        !moveActivatedRef.current &&
        Math.hypot(
          clientX - gesture.initialClientX,
          clientY - gesture.initialClientY,
        ) < DRAG_ACTIVATION_DISTANCE
      ) {
        return;
      }
      moveActivatedRef.current = true;
      const point = getContentPoint(gridRef.current, clientX, clientY);
      if (!point) return;
      const next = planClipDrop(gesture, point, dropPreviewRef.current);
      dropPreviewRef.current = next;
      setDropPreview(next);
    };
    const updateTrim = (clientX: number, clientY: number) => {
      if (gesture.kind !== 'trim') return;
      const point = getContentPoint(gridRef.current, clientX, clientY);
      if (!point) return;
      const delta = roundTimelineTime(
        xToTime(point.x, gesture.pixelsPerSecond) -
          gesture.initialPointerTime,
      );
      const trimmed = getTrimmedClip(
        gesture.clip,
        gesture.edge,
        gesture.clip.trimStart + (gesture.edge === 'start' ? delta : 0),
        gesture.clip.trimEnd + (gesture.edge === 'end' ? delta : 0),
      );
      const next: TrimPreview = {
        clipId: gesture.clip.id,
        edge: gesture.edge,
        trimEnd: trimmed.trimEnd,
        trimStart: trimmed.trimStart,
      };
      trimPreviewRef.current = next;
      setTrimPreview(next);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== gesture.pointerId) return;
      event.preventDefault();

      if (gesture.kind === 'move') updateMove(event.clientX, event.clientY);
      if (gesture.kind === 'scrub') updateScrub(event.clientX, event.clientY);
      if (gesture.kind === 'trim') updateTrim(event.clientX, event.clientY);
      if (gesture.kind === 'volume') {
        store
          .getState()
          .setTrackVolume(
            gesture.trackId,
            getVolumeAtPointer(gesture, event.clientY),
          );
      }
    };
    const finishGesture = (event: PointerEvent | null, commit: boolean) => {
      if (event && event.pointerId !== gesture.pointerId) return;

      let completedClipClick = false;
      if (commit && event && gesture.kind === 'move') {
        updateMove(event.clientX, event.clientY);
        const preview = dropPreviewRef.current;
        if (preview?.target) {
          store.getState().commitClipDrop({
            clipId: preview.clipId,
            freeStart: preview.start,
            insertionIndex: preview.insertionIndex,
            target: preview.target,
          });
        }
        completedClipClick = !moveActivatedRef.current;
      }
      if (commit && event && gesture.kind === 'trim') {
        updateTrim(event.clientX, event.clientY);
        const preview = trimPreviewRef.current;
        if (preview) store.getState().commitClipTrim(preview);
      }
      if (gesture.kind === 'volume') {
        const state = store.getState();
        if (commit) {
          state.commitTrackVolume(
            gesture.trackId,
            gesture.previousVolume,
            state.tracks.find(({ id }) => id === gesture.trackId)?.volume ??
              gesture.previousVolume,
          );
        } else {
          state.setTrackVolume(gesture.trackId, gesture.previousVolume);
        }
      }
      if (gesture.kind === 'move') {
        lastCompletedClipClickRef.current =
          completedClipClick && event
            ? { clipId: gesture.clip.id, timeStamp: event.timeStamp }
            : null;
      }

      dropPreviewRef.current = null;
      moveActivatedRef.current = false;
      trimPreviewRef.current = null;
      setDropPreview(null);
      setTrimPreview(null);
      setGesture(null);
      const grid = gridRef.current;
      if (grid?.hasPointerCapture?.(gesture.pointerId)) {
        grid.releasePointerCapture(gesture.pointerId);
      }
    };
    const handlePointerUp = (event: PointerEvent) =>
      finishGesture(event, true);
    const handlePointerCancel = (event: PointerEvent) =>
      finishGesture(event, false);
    const handleWindowBlur = () => finishGesture(null, false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') finishGesture(null, false);
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gesture, gridRef, store]);

  const beginMove = (
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
  ) => {
    if (event.button !== 0) return;
    const point = getContentPoint(
      gridRef.current,
      event.clientX,
      event.clientY,
    );
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    const state = store.getState();
    const previousClick = lastCompletedClipClickRef.current;
    const elapsed = previousClick
      ? event.timeStamp - previousClick.timeStamp
      : Number.POSITIVE_INFINITY;
    if (
      previousClick?.clipId === clip.id &&
      elapsed >= 0 &&
      elapsed <= DOUBLE_CLICK_INTERVAL_MS
    ) {
      lastCompletedClipClickRef.current = null;
      state.setIsPlaying(false);
      state.selectClip(clip.id);
      state.restoreClipTrim(clip.id);
      return;
    }

    lastCompletedClipClickRef.current = null;
    state.setIsPlaying(false);
    state.selectClip(clip.id);
    moveActivatedRef.current = false;
    const originTrackIndex = tracks.findIndex(({ id }) => id === clip.trackId);
    const clipTop = getTimelineClipY(tracks, originTrackIndex);
    const clipHeight = getTimelineClipHeight(clip.type);
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      clip,
      clips,
      currentTime,
      grabOffsetTime: Math.min(
        clip.duration,
        Math.max(0, xToTime(point.x, pixelsPerSecond) - clip.start),
      ),
      grabOffsetY: Math.min(
        clipHeight,
        Math.max(0, point.y - clipTop),
      ),
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      kind: 'move',
      pixelsPerSecond,
      pointerId: event.pointerId,
      snappingEnabled,
      tracks,
    });
  };

  const beginTrim = (
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
    edge: TimelineClipTrimEdge,
  ) => {
    if (event.button !== 0) return;
    lastCompletedClipClickRef.current = null;
    const point = getContentPoint(
      gridRef.current,
      event.clientX,
      event.clientY,
    );
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    store.getState().setIsPlaying(false);
    store.getState().selectClip(clip.id);
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      clip,
      edge,
      initialPointerTime: xToTime(point.x, pixelsPerSecond),
      kind: 'trim',
      pixelsPerSecond,
      pointerId: event.pointerId,
    });
  };

  const beginScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    lastCompletedClipClickRef.current = null;
    const point = getContentPoint(
      gridRef.current,
      event.clientX,
      event.clientY,
    );
    if (!point) return;

    event.preventDefault();
    store.getState().setIsPlaying(false);
    store.getState().selectClip(null);
    const snapCandidates = getClipSnapCandidates(clips);
    const candidate = xToTime(point.x, pixelsPerSecond);
    const snapped = snappingEnabled
      ? snapTimeToCandidates(
          candidate,
          snapCandidates,
          pixelsPerSecond,
          SNAP_THRESHOLD_PX,
        ).snappedTime
      : candidate;
    store.getState().setCurrentTime(snapped);
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'scrub',
      pixelsPerSecond,
      pointerId: event.pointerId,
      snapCandidates,
      snappingEnabled,
    });
  };

  const beginVolume = (
    event: ReactPointerEvent<HTMLElement>,
    trackId: string,
  ) => {
    if (event.button !== 0) return;
    lastCompletedClipClickRef.current = null;
    const track = tracks.find(({ id }) => id === trackId);
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!track || !rect) return;

    event.preventDefault();
    event.stopPropagation();
    store.getState().setIsPlaying(false);
    const next: VolumeGesture = {
      height: rect.height,
      kind: 'volume',
      pointerId: event.pointerId,
      previousVolume: track.volume,
      top: rect.top,
      trackId,
    };
    store
      .getState()
      .setTrackVolume(trackId, getVolumeAtPointer(next, event.clientY));
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture(next);
  };

  return {
    beginMove,
    beginScrub,
    beginTrim,
    beginVolume,
    displayClips,
    dropPreview,
    isInteracting: gesture !== null,
    isScrubbing: gesture?.kind === 'scrub',
  };
}
