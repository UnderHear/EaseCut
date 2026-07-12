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
  TIMELINE_TRACK_HEADER_WIDTH,
  getTimelineTrackHeight,
  getTimelineTracksHeight,
} from '../core/timeline-layout';
import {
  SNAP_THRESHOLD_PX,
  durationToWidth,
  timeToX,
  xToTime,
} from '../core/timeline-math';
import {
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
  getVisibleTimelineTracks,
  shouldCompactMainVideoTrackAfterDrop,
  type PendingTimelineTrack,
} from '../store/timeline-store';
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
  insertionIndex: number;
  originStart: number;
  originTrackId: string;
  pendingTrack: PendingTimelineTrack | null;
  rawStart: number;
  snapTime: number | null;
  start: number;
  targetTrackId: string;
  targetTrackInsertIndex?: number;
};

export type TrimPreview = {
  clipId: string;
  edge: TimelineClipTrimEdge;
  trimEnd: number;
  trimStart: number;
};

export const DRAG_ACTIVATION_DISTANCE = 4;

export const samePendingTrack = (
  left: PendingTimelineTrack | null,
  right: PendingTimelineTrack | null,
) => left?.index === right?.index && left?.type === right?.type;

export const getContentPoint = (
  grid: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): ContentPoint | null => {
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const viewportRect = grid.parentElement?.getBoundingClientRect();
  const viewportY = viewportRect ? clientY - viewportRect.top : null;

  return {
    x: Math.max(
      0,
      clientX -
        rect.left -
        TIMELINE_TRACK_HEADER_WIDTH -
        TIMELINE_CONTENT_PADDING_X,
    ),
    y:
      viewportY !== null &&
      viewportY >= 0 &&
      viewportY < TIMELINE_RULER_HEIGHT
        ? viewportY
        : clientY - rect.top,
  };
};

const getTrackAtY = (tracks: TimelineTrack[], y: number) => {
  let cursor = TIMELINE_RULER_HEIGHT;

  for (const track of tracks) {
    const bottom = cursor + getTimelineTrackHeight(track);
    if (y >= cursor && y < bottom) return track;
    cursor = bottom;
  }

  return null;
};

const getDropTarget = (
  tracks: TimelineTrack[],
  visibleTracks: TimelineTrack[],
  clip: TimelineClip,
  pointerY: number,
) => {
  const hoveredTrack = getTrackAtY(visibleTracks, pointerY);
  const videoTrackCount = tracks.filter(({ type }) => type === 'video').length;
  const createPendingTarget = (pendingTrack: PendingTimelineTrack) => {
    const projectedTracks = getVisibleTimelineTracks(tracks, pendingTrack);
    const id =
      pendingTrack.type === 'video'
        ? NEW_VIDEO_TRACK_DROP_ID
        : NEW_AUDIO_TRACK_DROP_ID;

    return {
      pendingTrack,
      targetTrack: projectedTracks.find((track) => track.id === id) ?? null,
    };
  };

  if (
    hoveredTrack?.id === NEW_VIDEO_TRACK_DROP_ID ||
    hoveredTrack?.id === NEW_AUDIO_TRACK_DROP_ID
  ) {
    return {
      pendingTrack: {
        index: Math.max(
          0,
          visibleTracks.findIndex((track) => track.id === hoveredTrack.id),
        ),
        type: hoveredTrack.type,
      },
      targetTrack: hoveredTrack,
    };
  }

  if (hoveredTrack?.type === clip.type) {
    return { pendingTrack: null, targetTrack: hoveredTrack };
  }

  const tracksBottom =
    TIMELINE_RULER_HEIGHT + getTimelineTracksHeight(visibleTracks);
  if (clip.type === 'video' && pointerY < TIMELINE_RULER_HEIGHT) {
    return createPendingTarget({ index: 0, type: 'video' });
  }
  if (
    clip.type === 'video' &&
    (hoveredTrack?.type === 'audio' || pointerY >= tracksBottom)
  ) {
    return createPendingTarget({ index: videoTrackCount, type: 'video' });
  }
  if (
    clip.type === 'audio' &&
    (hoveredTrack?.type === 'video' || pointerY < TIMELINE_RULER_HEIGHT)
  ) {
    return createPendingTarget({ index: videoTrackCount, type: 'audio' });
  }
  if (clip.type === 'audio' && pointerY >= tracksBottom) {
    return createPendingTarget({ index: tracks.length, type: 'audio' });
  }

  return {
    pendingTrack: null,
    targetTrack: tracks.find((track) => track.id === clip.trackId) ?? null,
  };
};

export const planClipDrop = (
  gesture: MoveGesture,
  point: ContentPoint,
  visibleTracks: TimelineTrack[],
): ClipDropPreview | null => {
  const { clip, clips, currentTime, pixelsPerSecond, snappingEnabled, tracks } =
    gesture;
  const { pendingTrack, targetTrack } = getDropTarget(
    tracks,
    visibleTracks,
    clip,
    point.y,
  );
  if (!targetTrack) return null;

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
  const targetClips =
    targetTrack.id === NEW_VIDEO_TRACK_DROP_ID ||
    targetTrack.id === NEW_AUDIO_TRACK_DROP_ID
      ? []
      : getTrackClips(clips, targetTrack.id);
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
    trackId: targetTrack.id,
    zIndex: targetClips.length,
  };
  const layout = planClipInsertion(
    targetClips,
    targetClip,
    insertionIndex,
    snapped.snappedStart,
    shouldCompactMainVideoTrackAfterDrop(
      tracks,
      clips,
      clip.id,
      targetTrack.id,
    ),
  );
  const projectedIds = new Set(layout.clips.map(({ id }) => id));

  return {
    clipId: clip.id,
    clips: [
      ...clips.filter(
        (candidate) =>
          candidate.id !== clip.id && !projectedIds.has(candidate.id),
      ),
      ...layout.clips,
    ],
    insertionIndex,
    originStart: clip.start,
    originTrackId: clip.trackId,
    pendingTrack,
    rawStart: requestedStart,
    snapTime:
      snapped.snappedTo !== null &&
      layout.insertedStart === snapped.snappedStart &&
      layout.shiftedClipIds.length === 0
        ? snapped.snappedTo
        : null,
    start: layout.insertedStart,
    targetTrackId: targetTrack.id,
    targetTrackInsertIndex: pendingTrack?.index,
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
