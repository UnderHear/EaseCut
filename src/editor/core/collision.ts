import type { TimelineClip } from './model';
import { normalizeTimelineTimeUs, timeUsToX } from './timeline-math';

type ClipMoveSnapEdge = 'start' | 'end';

type ClosestSnapCandidate = {
  distancePx: number;
  snappedToUs: number;
};
type ClipInsertionLayout = {
  clips: TimelineClip[];
  insertedStartUs: number;
  shiftedClipIds: string[];
};

type PreservedGapInsertionLayoutOptions = {
  allowTrailingFreeStart?: boolean;
};

const SNAP_DISTANCE_EPSILON = 1e-9;

export const sortClipsByStart = (clips: TimelineClip[]) =>
  [...clips].sort(
    (left, right) => left.startUs - right.startUs || left.zIndex - right.zIndex,
  );

export const getTrackClips = (clips: TimelineClip[], trackId: string) =>
  sortClipsByStart(clips.filter((clip) => clip.trackId === trackId));

export const layoutTrackSequentially = (clips: TimelineClip[]) => {
  let cursor = 0;

  return clips.map((clip, zIndex) => {
    const nextClip = {
      ...clip,
      startUs: normalizeTimelineTimeUs(cursor),
      zIndex,
    };
    cursor += clip.durationUs;
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
    (duration, clip) => Math.max(duration, clip.startUs + clip.durationUs),
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
    const targetClipCenterX = timeUsToX(
      targetClip.startUs + targetClip.durationUs / 2,
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
  candidateStartUs: number,
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
    ? normalizeTimelineTimeUs(previousClip.startUs + previousClip.durationUs)
    : 0;
  const safeCandidateStart = normalizeTimelineTimeUs(
    Math.max(0, candidateStartUs),
  );
  const allowTrailingFreeStart = options.allowTrailingFreeStart ?? true;
  const insertedStartUs = nextClip
    ? normalizeTimelineTimeUs(
        nextClip.startUs - draggedClip.durationUs >= previousEnd
          ? Math.min(
              Math.max(safeCandidateStart, previousEnd),
              nextClip.startUs - draggedClip.durationUs,
            )
          : previousEnd,
      )
    : normalizeTimelineTimeUs(
        allowTrailingFreeStart
          ? Math.max(previousEnd, safeCandidateStart)
          : previousEnd,
      );
  const orderedClips = [
    ...candidates.slice(0, safeInsertionIndex),
    { ...draggedClip, startUs: insertedStartUs },
    ...candidates.slice(safeInsertionIndex),
  ];
  const shiftedClipIds: string[] = [];
  let cursor = 0;

  const clips = orderedClips.map((clip, index) => {
    const nextStart =
      index <= safeInsertionIndex
        ? clip.startUs
        : normalizeTimelineTimeUs(Math.max(clip.startUs, cursor));

    cursor = normalizeTimelineTimeUs(nextStart + clip.durationUs);

    if (nextStart === clip.startUs && clip.zIndex === index) {
      return clip;
    }

    if (nextStart !== clip.startUs) shiftedClipIds.push(clip.id);
    return { ...clip, startUs: nextStart, zIndex: index };
  });

  return {
    clips,
    insertedStartUs,
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
    orderedClips.map((clip) => [clip.id, clip.startUs]),
  );
  const clips = layoutTrackSequentially(orderedClips);
  const insertedStartUs =
    clips.find((clip) => clip.id === draggedClip.id)?.startUs ?? 0;
  const shiftedClipIds = clips
    .filter(
      (clip) =>
        clip.id !== draggedClip.id &&
        clip.startUs !== originalStarts.get(clip.id),
    )
    .map((clip) => clip.id);

  return {
    clips,
    insertedStartUs,
    shiftedClipIds,
  };
};

export const planClipInsertion = (
  trackClips: TimelineClip[],
  draggedClip: TimelineClip,
  insertionIndex: number,
  candidateStartUs: number,
  compact: boolean,
) =>
  compact
    ? getCompactInsertionLayout(trackClips, draggedClip, insertionIndex)
    : getPreservedGapInsertionLayout(
        trackClips,
        draggedClip,
        insertionIndex,
        candidateStartUs,
      );

export const getClipSnapCandidates = (
  clips: TimelineClip[],
  draggedClipId?: string,
) => [
  0,
  ...clips.flatMap((clip) =>
    clip.id === draggedClipId ? [] : [clip.startUs, clip.startUs + clip.durationUs],
  ),
];

const getClosestSnapCandidate = (
  timeUs: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  let closestCandidate: ClosestSnapCandidate | null = null;

  for (const candidate of candidates) {
    const distance = Math.abs(
      timeUsToX(candidate, pixelsPerSecond) -
        timeUsToX(timeUs, pixelsPerSecond),
    );
    if (
      distance <= thresholdPx &&
      (!closestCandidate ||
        distance < closestCandidate.distancePx - SNAP_DISTANCE_EPSILON)
    ) {
      closestCandidate = {
        distancePx: distance,
        snappedToUs: candidate,
      };
    }
  }

  return closestCandidate;
};

export const snapTimeUsToCandidates = (
  timeUs: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  const safeTime = Math.max(0, timeUs);
  const closestCandidate = getClosestSnapCandidate(
    safeTime,
    candidates,
    pixelsPerSecond,
    thresholdPx,
  );

  return {
    snappedTimeUs: normalizeTimelineTimeUs(
      closestCandidate?.snappedToUs ?? safeTime,
    ),
    snappedToUs: closestCandidate?.snappedToUs ?? null,
  };
};

export const snapClipMoveToCandidates = (
  startUs: number,
  durationUs: number,
  candidates: number[],
  pixelsPerSecond: number,
  thresholdPx: number,
) => {
  const safeStart = Math.max(0, startUs);
  let closestSnap: {
    distancePx: number;
    snappedEdge: ClipMoveSnapEdge;
    snappedStartUs: number;
    snappedToUs: number;
  } | null = null;

  const snapAnchors = [
    { edge: 'start' as const, time: safeStart },
    { edge: 'end' as const, time: safeStart + durationUs },
  ];

  for (const { edge, time } of snapAnchors) {
    const closestCandidate = getClosestSnapCandidate(
      time,
      candidates,
      pixelsPerSecond,
      thresholdPx,
    );
    if (!closestCandidate) continue;

    const snappedStartUs =
      edge === 'start'
        ? closestCandidate.snappedToUs
        : closestCandidate.snappedToUs - durationUs;
    if (snappedStartUs < 0) continue;

    if (
      !closestSnap ||
      closestCandidate.distancePx <
        closestSnap.distancePx - SNAP_DISTANCE_EPSILON
    ) {
      closestSnap = {
        distancePx: closestCandidate.distancePx,
        snappedEdge: edge,
        snappedStartUs,
        snappedToUs: closestCandidate.snappedToUs,
      };
    }
  }

  return {
    snappedEdge: closestSnap?.snappedEdge ?? null,
    snappedStartUs: normalizeTimelineTimeUs(
      closestSnap?.snappedStartUs ?? safeStart,
    ),
    snappedToUs: closestSnap?.snappedToUs ?? null,
  };
};
