import type { TimelineClip } from '../types';
import { roundTimelineTime, timeToX } from './timeline-math';

type ClipMoveSnapEdge = 'start' | 'end';

type ClosestSnapCandidate = {
  distancePx: number;
  snappedTo: number;
};
type ClipInsertionLayout = {
  clips: TimelineClip[];
  insertedStart: number;
  shiftedClipIds: string[];
};

type PreservedGapInsertionLayoutOptions = {
  allowTrailingFreeStart?: boolean;
};

const SNAP_DISTANCE_EPSILON = 1e-9;

export const sortClipsByStart = (clips: TimelineClip[]) =>
  [...clips].sort(
    (left, right) => left.start - right.start || left.zIndex - right.zIndex,
  );

export const getTrackClips = (clips: TimelineClip[], trackId: string) =>
  sortClipsByStart(clips.filter((clip) => clip.trackId === trackId));

export const layoutTrackSequentially = (clips: TimelineClip[]) => {
  let cursor = 0;

  return clips.map((clip, zIndex) => {
    const nextClip = { ...clip, start: roundTimelineTime(cursor), zIndex };
    cursor += clip.duration;
    return nextClip;
  });
};

export const relayoutTrackInClipSet = (
  allClips: TimelineClip[],
  trackId: string,
) => {
  const relaidTrackClips = layoutTrackSequentially(
    getTrackClips(allClips, trackId),
  );
  const relaidById = new Map(relaidTrackClips.map((clip) => [clip.id, clip]));

  return allClips.map((clip) => relaidById.get(clip.id) ?? clip);
};

export const getTimelineDuration = (clips: TimelineClip[]) =>
  clips.reduce(
    (duration, clip) => Math.max(duration, clip.start + clip.duration),
    0,
  );

export const getInsertionIndex = (
  trackClips: TimelineClip[],
  draggedClipId: string,
  draggedClipX: number,
  draggedClipWidth: number,
  pixelsPerSecond: number,
) => {
  const sortedClips = sortClipsByStart(trackClips);
  const sourceIndex = sortedClips.findIndex(
    (clip) => clip.id === draggedClipId,
  );
  const candidates = sortedClips.filter((clip) => clip.id !== draggedClipId);

  for (let index = 0; index < candidates.length; index += 1) {
    const targetClip = candidates[index];
    const targetClipCenterX = timeToX(
      targetClip.start + targetClip.duration / 2,
      pixelsPerSecond,
    );
    const draggedEdgeX =
      index < sourceIndex ? draggedClipX : draggedClipX + draggedClipWidth;

    if (draggedEdgeX < targetClipCenterX) {
      return index;
    }
  }

  return candidates.length;
};

export const getPreservedGapInsertionLayout = (
  trackClips: TimelineClip[],
  draggedClip: TimelineClip,
  insertionIndex: number,
  candidateStart: number,
  options: PreservedGapInsertionLayoutOptions = {},
): ClipInsertionLayout => {
  const candidates = sortClipsByStart(trackClips).filter(
    (clip) => clip.id !== draggedClip.id,
  );
  const safeInsertionIndex = Math.min(
    Math.max(0, insertionIndex),
    candidates.length,
  );
  const previousClip = candidates[safeInsertionIndex - 1];
  const nextClip = candidates[safeInsertionIndex];
  const previousEnd = previousClip
    ? roundTimelineTime(previousClip.start + previousClip.duration)
    : 0;
  const safeCandidateStart = roundTimelineTime(Math.max(0, candidateStart));
  const allowTrailingFreeStart = options.allowTrailingFreeStart ?? true;
  const insertedStart = nextClip
    ? roundTimelineTime(
        nextClip.start - draggedClip.duration >= previousEnd
          ? Math.min(
              Math.max(safeCandidateStart, previousEnd),
              nextClip.start - draggedClip.duration,
            )
          : previousEnd,
      )
    : roundTimelineTime(
        allowTrailingFreeStart
          ? Math.max(previousEnd, safeCandidateStart)
          : previousEnd,
      );
  const orderedClips = [
    ...candidates.slice(0, safeInsertionIndex),
    { ...draggedClip, start: insertedStart },
    ...candidates.slice(safeInsertionIndex),
  ];
  const shiftedClipIds: string[] = [];
  let cursor = 0;

  const clips = orderedClips.map((clip, index) => {
    const nextStart =
      index <= safeInsertionIndex
        ? clip.start
        : roundTimelineTime(Math.max(clip.start, cursor));

    cursor = roundTimelineTime(nextStart + clip.duration);

    if (nextStart === clip.start && clip.zIndex === index) {
      return clip;
    }

    if (nextStart !== clip.start) shiftedClipIds.push(clip.id);
    return { ...clip, start: nextStart, zIndex: index };
  });

  return {
    clips,
    insertedStart,
    shiftedClipIds,
  };
};

export const getCompactInsertionLayout = (
  trackClips: TimelineClip[],
  draggedClip: TimelineClip,
  insertionIndex: number,
): ClipInsertionLayout => {
  const candidates = sortClipsByStart(trackClips).filter(
    (clip) => clip.id !== draggedClip.id,
  );
  const safeInsertionIndex = Math.min(
    Math.max(0, insertionIndex),
    candidates.length,
  );
  const orderedClips = [
    ...candidates.slice(0, safeInsertionIndex),
    draggedClip,
    ...candidates.slice(safeInsertionIndex),
  ];
  const originalStarts = new Map(
    orderedClips.map((clip) => [clip.id, clip.start]),
  );
  const clips = layoutTrackSequentially(orderedClips);
  const insertedStart =
    clips.find((clip) => clip.id === draggedClip.id)?.start ?? 0;
  const shiftedClipIds = clips
    .filter(
      (clip) =>
        clip.id !== draggedClip.id &&
        clip.start !== originalStarts.get(clip.id),
    )
    .map((clip) => clip.id);

  return {
    clips,
    insertedStart,
    shiftedClipIds,
  };
};

export const planClipInsertion = (
  trackClips: TimelineClip[],
  draggedClip: TimelineClip,
  insertionIndex: number,
  candidateStart: number,
  compact: boolean,
) =>
  compact
    ? getCompactInsertionLayout(trackClips, draggedClip, insertionIndex)
    : getPreservedGapInsertionLayout(
        trackClips,
        draggedClip,
        insertionIndex,
        candidateStart,
      );

export const getClipSnapCandidates = (
  clips: TimelineClip[],
  draggedClipId?: string,
) => [
  0,
  ...clips.flatMap((clip) =>
    clip.id === draggedClipId ? [] : [clip.start, clip.start + clip.duration],
  ),
];

const getClosestSnapCandidate = (
  time: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  let closestCandidate: ClosestSnapCandidate | null = null;

  for (const candidate of candidates) {
    const distance = Math.abs(
      timeToX(candidate, pixelsPerSecond) - timeToX(time, pixelsPerSecond),
    );
    if (
      distance <= thresholdPx &&
      (!closestCandidate ||
        distance < closestCandidate.distancePx - SNAP_DISTANCE_EPSILON)
    ) {
      closestCandidate = {
        distancePx: distance,
        snappedTo: candidate,
      };
    }
  }

  return closestCandidate;
};

export const snapTimeToCandidates = (
  time: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  const safeTime = Math.max(0, time);
  const closestCandidate = getClosestSnapCandidate(
    safeTime,
    candidates,
    pixelsPerSecond,
    thresholdPx,
  );

  return {
    snappedTime: roundTimelineTime(closestCandidate?.snappedTo ?? safeTime),
    snappedTo: closestCandidate?.snappedTo ?? null,
  };
};

export const snapClipMoveToCandidates = (
  start: number,
  duration: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  const safeStart = Math.max(0, start);
  let closestSnap: {
    distancePx: number;
    snappedEdge: ClipMoveSnapEdge;
    snappedStart: number;
    snappedTo: number;
  } | null = null;

  const snapAnchors = [
    { edge: 'start' as const, time: safeStart },
    { edge: 'end' as const, time: safeStart + duration },
  ];

  for (const { edge, time } of snapAnchors) {
    const closestCandidate = getClosestSnapCandidate(
      time,
      candidates,
      pixelsPerSecond,
      thresholdPx,
    );
    if (!closestCandidate) continue;

    const snappedStart =
      edge === 'start'
        ? closestCandidate.snappedTo
        : closestCandidate.snappedTo - duration;
    if (snappedStart < 0) continue;

    if (
      !closestSnap ||
      closestCandidate.distancePx <
        closestSnap.distancePx - SNAP_DISTANCE_EPSILON
    ) {
      closestSnap = {
        distancePx: closestCandidate.distancePx,
        snappedEdge: edge,
        snappedStart,
        snappedTo: closestCandidate.snappedTo,
      };
    }
  }

  return {
    snappedEdge: closestSnap?.snappedEdge ?? null,
    snappedStart: roundTimelineTime(closestSnap?.snappedStart ?? safeStart),
    snappedTo: closestSnap?.snappedTo ?? null,
  };
};
