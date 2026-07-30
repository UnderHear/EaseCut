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
  durationUsToWidth,
  timeUsToX,
  xToTimeUs,
} from '../core/timeline-math';
import { secondsToMicroseconds } from '../core/time';
import type {
  TrackDropTarget,
  TrackInsertTarget,
} from '../core/timeline-tracks';
import { MAIN_VIDEO_TRACK_ID } from '../core/timeline-tracks';
import type {
  TimelineClip,
  TimelineClipTrimEdge,
  TimelineTrack,
} from '../types';

type ContentPoint = { x: number; y: number };

export type MoveGesture = {
  clip: TimelineClip;
  clips: TimelineClip[];
  currentTimeUs: number;
  grabOffsetTimeUs: number;
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
  initialPointerTimeUs: number;
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
  clipId: string;
  height: number;
  kind: 'volume';
  pointerId: number;
  previousVolume: number;
  top: number;
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
  originStartUs: number;
  originTrackId: string;
  rawStartUs: number;
  snapTimeUs: number | null;
  startUs: number;
  target: TrackDropTarget | null;
};

export type TrimPreview = {
  clipId: string;
  edge: TimelineClipTrimEdge;
  timeUs: number;
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
  const audioTrackCount = tracks.filter(
    (track) => track.type === 'audio',
  ).length;
  const firstIndex =
    type === 'video'
      ? 0
      : type === 'audio'
        ? videoTrackCount
        : videoTrackCount + audioTrackCount;
  const lastIndex =
    type === 'video'
      ? videoTrackCount
      : type === 'audio'
        ? videoTrackCount + audioTrackCount
        : tracks.length;

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
  const audioTrackCount = tracks.filter(({ type }) => type === 'audio').length;
  const textStartIndex = videoTrackCount + audioTrackCount;

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
    (hoveredTrack?.type === 'audio' ||
      hoveredTrack?.type === 'text' ||
      pointerY >= tracksBottom)
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
  if (
    clip.type === 'audio' &&
    (hoveredTrack?.type === 'text' || pointerY >= tracksBottom)
  ) {
    return createInsertDropTarget(tracks, {
      index: textStartIndex,
      type: 'audio',
    });
  }
  if (
    clip.type === 'text' &&
    (
      hoveredTrack?.type === 'video' ||
      hoveredTrack?.type === 'audio' ||
      pointerY < TIMELINE_RULER_HEIGHT
    )
  ) {
    return createInsertDropTarget(tracks, {
      index: textStartIndex,
      type: 'text',
    });
  }
  if (clip.type === 'text' && pointerY >= tracksBottom) {
    return createInsertDropTarget(tracks, {
      index: tracks.length,
      type: 'text',
    });
  }

  return null;
};

export const planClipDrop = (
  gesture: MoveGesture,
  point: ContentPoint,
  previousPreview: ClipDropPreview | null = null,
): ClipDropPreview => {
  const { clip, clips, currentTimeUs, pixelsPerSecond, snappingEnabled, tracks } =
    gesture;
  const resolvedTarget = getDropTarget(tracks, clip, point.y, previousPreview);
  const insertLineY = resolvedTarget?.insertLineY ?? null;
  const target = resolvedTarget?.target ?? null;
  const targetTrack = resolvedTarget?.targetTrack ?? null;

  const requestedStartUs = Math.max(
    0,
    xToTimeUs(point.x, pixelsPerSecond) - gesture.grabOffsetTimeUs,
  );
  const snapped = snappingEnabled
    ? snapClipMoveToCandidates(
        requestedStartUs,
        clip.durationUs,
        [...getClipSnapCandidates(clips, clip.id), currentTimeUs],
        pixelsPerSecond,
        SNAP_THRESHOLD_PX,
      )
    : { snappedStartUs: requestedStartUs, snappedToUs: null };
  const targetClips = targetTrack ? getTrackClips(clips, targetTrack.id) : [];
  const insertionIndex = getInsertionIndex(
    targetClips,
    clip.id,
    timeUsToX(snapped.snappedStartUs, pixelsPerSecond),
    durationUsToWidth(clip.durationUs, pixelsPerSecond),
    pixelsPerSecond,
  );
  const targetClip = {
    ...clip,
    startUs: snapped.snappedStartUs,
    trackId: targetTrack?.id ?? clip.trackId,
    zIndex: targetClips.length,
  };
  const layout = targetTrack
    ? planClipInsertion(
        targetClips,
        targetClip,
        insertionIndex,
        snapped.snappedStartUs,
        targetTrack.id === MAIN_VIDEO_TRACK_ID,
      )
    : {
        clips: [targetClip],
        insertedStartUs: snapped.snappedStartUs,
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
    originStartUs: clip.startUs,
    originTrackId: clip.trackId,
    rawStartUs: requestedStartUs,
    snapTimeUs:
      snapped.snappedToUs !== null &&
      layout.insertedStartUs === snapped.snappedStartUs &&
      layout.shiftedClipIds.length === 0
        ? snapped.snappedToUs
        : null,
    startUs: layout.insertedStartUs,
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

export const getTimelineContentDurationUs = (clips: TimelineClip[]) =>
  Math.max(
    secondsToMicroseconds(12),
    getTimelineDuration(clips) + secondsToMicroseconds(2),
  );
