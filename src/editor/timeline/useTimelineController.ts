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
  snapTimeUsToCandidates,
} from '../core/collision';
import {
  getTimelineClipHeight,
  getTimelineClipY,
} from '../core/timeline-layout';
import {
  SNAP_THRESHOLD_PX,
  normalizeTimelineTimeUs,
  xToTimeUs,
} from '../core/timeline-math';
import { isTimelineTimedMediaClip } from '../core/model';
import {
  getTrimmedTimelineClips,
} from '../core/timeline-commands';
import {
  useTimelineStore,
  useTimelineStoreApi,
} from '../store/timeline-store-context';
import type {
  TimelineClip,
  TimelineClipTimingPreview,
  TimelineClipTrimEdge,
} from '../types';
import {
  DRAG_ACTIVATION_DISTANCE,
  getContentPoint,
  getVolumeAtPointer,
  planClipDrop,
  planClipTrim,
  type ClipDropPreview,
  type TimelineGesture,
  type TrimPreview,
  type VolumeGesture,
} from './timeline-interaction';

type TimelineControllerOptions = {
  gridRef: RefObject<HTMLDivElement | null>;
  onClipTimingPreviewChange?: (
    preview: TimelineClipTimingPreview | null,
  ) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
};

const DOUBLE_CLICK_INTERVAL_MS = 500;

type CompletedClipClick = {
  clipId: string;
  timeStamp: number;
};

export function useTimelineController({
  gridRef,
  onClipTimingPreviewChange,
  viewportRef,
}: TimelineControllerOptions) {
  const clips = useTimelineStore((state) => state.clips);
  const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
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

  useEffect(
    () => () => onClipTimingPreviewChange?.(null),
    [onClipTimingPreviewChange],
  );

  const displayClips = useMemo(() => {
    if (dropPreview) return dropPreview.clips;
    if (!trimPreview) return clips;

    return getTrimmedTimelineClips(
      clips,
      trimPreview.clipId,
      trimPreview.edge,
      trimPreview.timeUs,
    );
  }, [clips, dropPreview, trimPreview]);

  useEffect(() => {
    if (!gesture) return undefined;

    const updateScrub = (clientX: number, clientY: number) => {
      if (gesture.kind !== 'scrub') return;
      const point = getContentPoint(viewportRef.current, clientX, clientY);
      if (!point) return;
      const candidateTimeUs = xToTimeUs(point.x, gesture.pixelsPerSecond);
      const { snappedTimeUs } = gesture.snappingEnabled
        ? snapTimeUsToCandidates(
            candidateTimeUs,
            gesture.snapCandidates,
            gesture.pixelsPerSecond,
            SNAP_THRESHOLD_PX,
          )
        : {
            snappedTimeUs: normalizeTimelineTimeUs(candidateTimeUs),
          };
      store.getState().setCurrentTimeUs(snappedTimeUs);
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
      const point = getContentPoint(viewportRef.current, clientX, clientY);
      if (!point) return;
      const next = planClipDrop(gesture, point, dropPreviewRef.current);
      dropPreviewRef.current = next;
      setDropPreview(next);
      onClipTimingPreviewChange?.({
        clipId: gesture.clip.id,
        durationUs: gesture.clip.durationUs,
        startUs: next.startUs,
      });
    };
    const updateTrim = (clientX: number, clientY: number) => {
      if (gesture.kind !== 'trim') return;
      const point = getContentPoint(viewportRef.current, clientX, clientY);
      if (!point) return;
      const next = planClipTrim(
        gesture,
        xToTimeUs(point.x, gesture.pixelsPerSecond),
      );
      trimPreviewRef.current = next;
      setTrimPreview(next);
      onClipTimingPreviewChange?.({
        clipId: next.clipId,
        durationUs: next.durationUs,
        startUs: next.startUs,
      });
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
          .setClipVolume(
            gesture.clipId,
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
            freeStartUs: preview.startUs,
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
        const clip = state.clips.find(({ id }) => id === gesture.clipId);
        if (commit) {
          state.commitClipVolume(
            gesture.clipId,
            gesture.previousVolume,
            clip && isTimelineTimedMediaClip(clip)
              ? clip.volume
              : gesture.previousVolume,
          );
        } else {
          state.setClipVolume(gesture.clipId, gesture.previousVolume);
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
      onClipTimingPreviewChange?.(null);
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
  }, [
    clips,
    gesture,
    gridRef,
    onClipTimingPreviewChange,
    store,
    viewportRef,
  ]);

  const beginMove = (
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
  ) => {
    if (event.button !== 0) return;
    const point = getContentPoint(
      viewportRef.current,
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
      currentTimeUs,
      grabOffsetTimeUs: Math.min(
        clip.durationUs,
        Math.max(0, xToTimeUs(point.x, pixelsPerSecond) - clip.startUs),
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
      viewportRef.current,
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
      clips,
      edge,
      initialPointerTimeUs: xToTimeUs(point.x, pixelsPerSecond),
      kind: 'trim',
      pixelsPerSecond,
      pointerId: event.pointerId,
      snapCandidates: [
        ...getClipSnapCandidates(clips, clip.id),
        currentTimeUs,
      ],
      snappingEnabled,
    });
  };

  const beginScrub = (
    event: ReactPointerEvent<HTMLElement>,
    preserveSelection = false,
  ) => {
    if (event.button !== 0) return;
    lastCompletedClipClickRef.current = null;
    const point = getContentPoint(
      viewportRef.current,
      event.clientX,
      event.clientY,
    );
    if (!point) return;

    event.preventDefault();
    store.getState().setIsPlaying(false);
    if (!preserveSelection) store.getState().selectClip(null);
    const snapCandidates = getClipSnapCandidates(clips);
    const candidateTimeUs = xToTimeUs(point.x, pixelsPerSecond);
    const snappedTimeUs = snappingEnabled
      ? snapTimeUsToCandidates(
          candidateTimeUs,
          snapCandidates,
          pixelsPerSecond,
          SNAP_THRESHOLD_PX,
        ).snappedTimeUs
      : candidateTimeUs;
    store.getState().setCurrentTimeUs(snappedTimeUs);
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'scrub',
      pixelsPerSecond,
      pointerId: event.pointerId,
      snapCandidates,
      snappingEnabled,
    });
  };

  const beginPlayheadScrub = (event: ReactPointerEvent<HTMLElement>) => {
    beginScrub(event, true);
  };

  const beginVolume = (
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
  ) => {
    if (event.button !== 0 || !isTimelineTimedMediaClip(clip)) return;
    lastCompletedClipClickRef.current = null;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    store.getState().setIsPlaying(false);
    const next: VolumeGesture = {
      clipId: clip.id,
      height: rect.height,
      kind: 'volume',
      pointerId: event.pointerId,
      previousVolume: clip.volume,
      top: rect.top,
    };
    store
      .getState()
      .setClipVolume(clip.id, getVolumeAtPointer(next, event.clientY));
    gridRef.current?.setPointerCapture?.(event.pointerId);
    setGesture(next);
  };

  return {
    beginMove,
    beginPlayheadScrub,
    beginScrub,
    beginTrim,
    beginVolume,
    displayClips,
    dropPreview,
    isInteracting: gesture !== null,
    isScrubbing: gesture?.kind === 'scrub',
    trimPreview,
  };
}
