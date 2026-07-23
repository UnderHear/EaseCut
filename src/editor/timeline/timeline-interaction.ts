import {
  getClipSnapCandidates,
  getInsertionIndex,
  getTimelineDuration,
  getTrackClips,
  planClipInsertion,
  snapClipMoveToCandidates,
} from '../core/collision';
import {
  TIMELINE_CONTENT_PADDING_X,
  TIMELINE_RULER_HEIGHT,
  getTimelineTrackInsertY,
  getTimelineTrackLayouts,
  getTimelineTracksHeight,
} from '../core/timeline-layout';
import {
  SNAP_THRESHOLD_PX,
  durationToWidth,
  timeToX,
  xToTime,
} from '../core/timeline-math';
import type {
  TrackDropTarget,
  TrackInsertTarget,
} from '../core/timeline-tracks';
import { shouldCompactMainVideoTrackAfterDrop } from '../store/timeline-store';
import type {
  TimelineClip,
  TimelineClipTrimEdge,
  TimelineTrack,
} from '../types';

type ContentPoint = { x: number; y: number };

export type MoveGesture = {
  clip: TimelineClip;
  clips: TimelineClip[];
  currentTime: number;
  grabOffsetTime: number;
  grabOffsetY: number;
  initialClientX: number;
  initialClientY: number;
  kind: 'move';
  pixelsPerSecond: number;
  pointerId: number;
  snappingEnabled: boolean;
  tracks: TimelineTrack[];
};

export type TrimGesture = {
  clip: TimelineClip;
  edge: TimelineClipTrimEdge;
  initialPointerTime: number;
  kind: 'trim';
  pixelsPerSecond: number;
  pointerId: number;
};

export type ScrubGesture = {
  kind: 'scrub';
  pixelsPerSecond: number;
  pointerId: number;
  snapCandidates: number[];
  snappingEnabled: boolean;
};

export type VolumeGesture = {
  height: number;
  kind: 'volume';
  pointerId: number;
  previousVolume: number;
  top: number;
  trackId: string;
};

export type TimelineGesture =
  | MoveGesture
  | ScrubGesture
  | TrimGesture
  | VolumeGesture;

export type ClipDropPreview = {
  clipId: string;
  clips: TimelineClip[];
  dragTop: number;
  insertionIndex: number;
  insertLineY: number | null;
  originStart: number;
  originTrackId: string;
  rawStart: number;
  snapTime: number | null;
  start: number;
  target: TrackDropTarget | null;
};

export type TrimPreview = {
  clipId: string;
  edge: TimelineClipTrimEdge;
  trimEnd: number;
  trimStart: number;
};

export const DRAG_ACTIVATION_DISTANCE = 4;
export const TRACK_INSERT_ACQUIRE_DISTANCE = 4;
export const TRACK_INSERT_RELEASE_DISTANCE = 6;

export const getContentPoint = (
  viewport: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): ContentPoint | null => {
  if (!viewport) return null;
  const rect = viewport.getBoundingClientRect();
  const localY = clientY - rect.top;

  return {
    x: Math.max(
      0,
      clientX -
        rect.left +
        viewport.scrollLeft -
        TIMELINE_CONTENT_PADDING_X,
    ),
    y:
      localY < 0
        ? Math.max(0, localY + TIMELINE_RULER_HEIGHT)
        : TIMELINE_RULER_HEIGHT + localY + viewport.scrollTop,
  };
};

const getTrackAtY = (tracks: TimelineTrack[], y: number) => {
  const layout = getTimelineTrackLayouts(tracks).find(
    ({ bottom, top }) => y >= top && y < bottom,
  );
  return layout?.track ?? null;
};

const getTrackInsertTargets = (
  tracks: TimelineTrack[],
  type: TimelineClip['type'],
) => {
  const videoTrackCount = tracks.filter(
    (track) => track.type === 'video',
  ).length;
  const firstIndex = type === 'video' ? 0 : videoTrackCount;
  const lastIndex = type === 'video' ? videoTrackCount : tracks.length;

  return Array.from(
    { length: lastIndex - firstIndex + 1 },
    (_, offset): TrackInsertTarget => ({
      index: firstIndex + offset,
      type,
    }),
  );
};

const getInsertTargetDistance = (
  tracks: TimelineTrack[],
  target: TrackInsertTarget,
  pointerY: number,
) => Math.abs(getTimelineTrackInsertY(tracks, target) - pointerY);

export const getTrackInsertTargetAtY = (
  tracks: TimelineTrack[],
  type: TimelineClip['type'],
  pointerY: number,
  previousInsert: TrackInsertTarget | null = null,
) => {
  if (
    previousInsert?.type === type &&
    getInsertTargetDistance(tracks, previousInsert, pointerY) <=
      TRACK_INSERT_RELEASE_DISTANCE
  ) {
    return previousInsert;
  }

  const closest = getTrackInsertTargets(tracks, type)
    .map((insert) => ({
      distance: getInsertTargetDistance(tracks, insert, pointerY),
      insert,
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest && closest.distance <= TRACK_INSERT_ACQUIRE_DISTANCE
    ? closest.insert
    : null;
};

const createInsertDropTarget = (
  tracks: TimelineTrack[],
  insert: TrackInsertTarget,
) => ({
  insertLineY: getTimelineTrackInsertY(tracks, insert),
  target: { insert, kind: 'insert' } as const,
  targetTrack: null,
});

const getDropTarget = (
  tracks: TimelineTrack[],
  clip: TimelineClip,
  pointerY: number,
  previousPreview: ClipDropPreview | null,
) => {
  const previousInsert =
    previousPreview?.target?.kind === 'insert'
      ? previousPreview.target.insert
      : null;
  const insertTarget = getTrackInsertTargetAtY(
    tracks,
    clip.type,
    pointerY,
    previousInsert,
  );
  if (insertTarget) {
    return createInsertDropTarget(tracks, insertTarget);
  }

  const hoveredTrack = getTrackAtY(tracks, pointerY);
  const videoTrackCount = tracks.filter(({ type }) => type === 'video').length;

  if (hoveredTrack?.type === clip.type) {
    return {
      insertLineY: null,
      target: { kind: 'existing', trackId: hoveredTrack.id } as const,
      targetTrack: hoveredTrack,
    };
  }

  const tracksBottom =
    TIMELINE_RULER_HEIGHT + getTimelineTracksHeight(tracks);
  if (clip.type === 'video' && pointerY < TIMELINE_RULER_HEIGHT) {
    return createInsertDropTarget(tracks, { index: 0, type: 'video' });
  }
  if (
    clip.type === 'video' &&
    (hoveredTrack?.type === 'audio' || pointerY >= tracksBottom)
  ) {
    return createInsertDropTarget(tracks, {
      index: videoTrackCount,
      type: 'video',
    });
  }
  if (
    clip.type === 'audio' &&
    (hoveredTrack?.type === 'video' || pointerY < TIMELINE_RULER_HEIGHT)
  ) {
    return createInsertDropTarget(tracks, {
      index: videoTrackCount,
      type: 'audio',
    });
  }
  if (clip.type === 'audio' && pointerY >= tracksBottom) {
    return createInsertDropTarget(tracks, {
      index: tracks.length,
      type: 'audio',
    });
  }

  return null;
};

export const planClipDrop = (
  gesture: MoveGesture,
  point: ContentPoint,
  previousPreview: ClipDropPreview | null = null,
): ClipDropPreview => {
  const { clip, clips, currentTime, pixelsPerSecond, snappingEnabled, tracks } =
    gesture;
  const resolvedTarget = getDropTarget(tracks, clip, point.y, previousPreview);
  const insertLineY = resolvedTarget?.insertLineY ?? null;
  const target = resolvedTarget?.target ?? null;
  const targetTrack = resolvedTarget?.targetTrack ?? null;

  const requestedStart = Math.max(
    0,
    xToTime(point.x, pixelsPerSecond) - gesture.grabOffsetTime,
  );
  const snapped = snappingEnabled
    ? snapClipMoveToCandidates(
        requestedStart,
        clip.duration,
        [...getClipSnapCandidates(clips, clip.id), currentTime],
        pixelsPerSecond,
        SNAP_THRESHOLD_PX,
      )
    : { snappedStart: requestedStart, snappedTo: null };
  const targetClips = targetTrack ? getTrackClips(clips, targetTrack.id) : [];
  const insertionIndex = getInsertionIndex(
    targetClips,
    clip.id,
    timeToX(snapped.snappedStart, pixelsPerSecond),
    durationToWidth(clip.duration, pixelsPerSecond),
    pixelsPerSecond,
  );
  const targetClip = {
    ...clip,
    start: snapped.snappedStart,
    trackId: targetTrack?.id ?? clip.trackId,
    zIndex: targetClips.length,
  };
  const layout = targetTrack
    ? planClipInsertion(
        targetClips,
        targetClip,
        insertionIndex,
        snapped.snappedStart,
        shouldCompactMainVideoTrackAfterDrop(targetTrack.id),
      )
    : {
        clips: [targetClip],
        insertedStart: snapped.snappedStart,
        shiftedClipIds: [] as string[],
      };
  const projectedIds = new Set(layout.clips.map(({ id }) => id));
  const displayClips = [
    ...clips.filter(
      (candidate) =>
        candidate.id !== clip.id && !projectedIds.has(candidate.id),
    ),
    ...layout.clips.filter((candidate) => candidate.id !== clip.id),
  ];

  return {
    clipId: clip.id,
    clips: displayClips,
    dragTop: Math.max(TIMELINE_RULER_HEIGHT, point.y - gesture.grabOffsetY),
    insertionIndex,
    insertLineY,
    originStart: clip.start,
    originTrackId: clip.trackId,
    rawStart: requestedStart,
    snapTime:
      snapped.snappedTo !== null &&
      layout.insertedStart === snapped.snappedStart &&
      layout.shiftedClipIds.length === 0
        ? snapped.snappedTo
        : null,
    start: layout.insertedStart,
    target,
  };
};

export const getVolumeAtPointer = (
  gesture: Pick<VolumeGesture, 'height' | 'top'>,
  clientY: number,
) => {
  const inset = Math.min(8, gesture.height / 4);
  const range = Math.max(1, gesture.height - inset * 2);
  return Math.min(
    1,
    Math.max(0, 1 - (clientY - gesture.top - inset) / range),
  );
};

export const getTimelineContentDuration = (clips: TimelineClip[]) =>
  Math.max(12, getTimelineDuration(clips) + 2);
