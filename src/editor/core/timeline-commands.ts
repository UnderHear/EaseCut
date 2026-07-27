import {
  getTimelineDuration,
  getTrackClips,
  planClipInsertion,
  relayoutTrackInClipSet,
  sortClipsByStart,
} from './collision';
import type {
  TimelineClip,
  TimelineClipTransform,
  TimelineTrack,
} from './model';
import { normalizeTimelineTimeUs } from './timeline-math';
import {
  MAIN_VIDEO_TRACK_ID,
  insertTimelineTrack,
  normalizeTimelineTracks,
  type TrackDropTarget,
} from './timeline-tracks';
import { secondsToMicroseconds } from './time';

export const MIN_CLIP_DURATION_US = secondsToMicroseconds(0.6);
export const MIN_CLIP_TRANSFORM_SIZE = 40;

export const normalizeClipTransform = (
  transform: TimelineClipTransform,
): TimelineClipTransform => ({
  height: Math.max(MIN_CLIP_TRANSFORM_SIZE, Math.round(transform.height)),
  width: Math.max(MIN_CLIP_TRANSFORM_SIZE, Math.round(transform.width)),
  x: Math.round(transform.x),
  y: Math.round(transform.y),
});

export const createDefaultClipTransform = (
  canvasSize: { height: number; width: number },
): TimelineClipTransform => ({
  height: Math.round(canvasSize.height),
  width: Math.round(canvasSize.width),
  x: 0,
  y: 0,
});

export type TimelineEdit = {
  clips: TimelineClip[];
  selectedClipId: string | null;
  tracks: TimelineTrack[];
};

export type TimelineEditResult =
  | { changed: false }
  | ({ changed: true } & TimelineEdit);

export type MoveClipParams = {
  clipId: string;
  freeStartUs?: number;
  insertionIndex: number;
  target: TrackDropTarget;
};

export type TrimClipParams = {
  clipId: string;
  edge: 'start' | 'end';
  trimEndUs: number;
  trimStartUs: number;
};

const unchanged: TimelineEditResult = { changed: false };

const derivedId = (clips: readonly TimelineClip[], base: string) => {
  const ids = new Set(clips.map((clip) => clip.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
};

export const normalizeTimelineClips = (clips: TimelineClip[]) =>
  sortClipsByStart(relayoutTrackInClipSet(clips, MAIN_VIDEO_TRACK_ID));

export const removeEmptyTimelineTracks = (
  tracks: TimelineTrack[],
  clips: TimelineClip[],
) => {
  const usedTrackIds = new Set(clips.map((clip) => clip.trackId));
  return normalizeTimelineTracks(
    tracks.filter(
      (track) =>
        track.id === MAIN_VIDEO_TRACK_ID || usedTrackIds.has(track.id),
    ),
  );
};

const changedEdit = (
  edit: TimelineEdit,
  clips: TimelineClip[],
  selectedClipId = edit.selectedClipId,
  tracks = edit.tracks,
): TimelineEditResult => {
  const normalizedClips = normalizeTimelineClips(clips);
  return {
    changed: true,
    clips: normalizedClips,
    selectedClipId,
    tracks: removeEmptyTimelineTracks(tracks, normalizedClips),
  };
};

export const moveClip = (
  edit: TimelineEdit,
  params: MoveClipParams,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === params.clipId);
  if (!clip) return unchanged;

  const target = params.target;
  let tracks = edit.tracks;
  let targetTrack: TimelineTrack | undefined;
  if (target.kind === 'insert') {
    if (target.insert.type !== clip.type) return unchanged;
    const insertion = insertTimelineTrack(tracks, target.insert);
    tracks = insertion.tracks;
    targetTrack = insertion.track;
  } else {
    targetTrack = tracks.find((track) => track.id === target.trackId);
  }
  if (!targetTrack || targetTrack.type !== clip.type) return unchanged;

  const targetClips = getTrackClips(edit.clips, targetTrack.id);
  const movedClip = {
    ...clip,
    trackId: targetTrack.id,
    zIndex: targetClips.length,
  };
  const layout = planClipInsertion(
    targetClips,
    movedClip,
    params.insertionIndex,
    Math.max(0, params.freeStartUs ?? clip.startUs),
    targetTrack.id === MAIN_VIDEO_TRACK_ID,
  );
  const laidOutIds = new Set(layout.clips.map((candidate) => candidate.id));
  const clips = [
    ...edit.clips.filter(
      (candidate) =>
        candidate.id !== clip.id && !laidOutIds.has(candidate.id),
    ),
    ...layout.clips,
  ];
  const current = edit.clips.find((candidate) => candidate.id === clip.id);
  const next = clips.find((candidate) => candidate.id === clip.id);
  if (
    tracks === edit.tracks &&
    current?.trackId === next?.trackId &&
    current?.startUs === next?.startUs &&
    current?.zIndex === next?.zIndex
  ) {
    return unchanged;
  }
  return changedEdit(edit, clips, clip.id, tracks);
};

export const getTrimmedClip = (
  clip: TimelineClip,
  edge: 'start' | 'end',
  trimStartUs: number,
  trimEndUs: number,
): TimelineClip => {
  const sourceDurationUs = Math.max(
    MIN_CLIP_DURATION_US,
    clip.sourceDurationUs,
  );
  const endUs = Math.min(
    sourceDurationUs,
    Math.max(0, normalizeTimelineTimeUs(trimEndUs)),
  );
  const startUs = Math.min(
    endUs,
    Math.max(0, normalizeTimelineTimeUs(trimStartUs)),
  );
  const nextTrimStartUs =
    edge === 'start'
      ? Math.min(startUs, Math.max(0, endUs - MIN_CLIP_DURATION_US))
      : clip.trimStartUs;
  const nextTrimEndUs =
    edge === 'end'
      ? Math.max(endUs, nextTrimStartUs + MIN_CLIP_DURATION_US)
      : Math.max(endUs, nextTrimStartUs + MIN_CLIP_DURATION_US);
  const durationUs = nextTrimEndUs - nextTrimStartUs;

  return {
    ...clip,
    durationUs,
    startUs:
      edge === 'start'
        ? clip.startUs + clip.durationUs - durationUs
        : clip.startUs,
    trimEndUs: nextTrimEndUs,
    trimStartUs: nextTrimStartUs,
  };
};

export const getTrimmedTimelineClips = (
  clips: TimelineClip[],
  clipId: string,
  edge: 'start' | 'end',
  trimStartUs: number,
  trimEndUs: number,
) => {
  const clip = clips.find((candidate) => candidate.id === clipId);
  if (!clip) return clips;

  let trimmed = getTrimmedClip(clip, edge, trimStartUs, trimEndUs);
  if (edge === 'start' && clip.trackId !== MAIN_VIDEO_TRACK_ID) {
    const previous = getTrackClips(clips, clip.trackId)
      .filter(
        (candidate) =>
          candidate.id !== clip.id && candidate.startUs < clip.startUs,
      )
      .at(-1);
    const previousEndUs = previous
      ? previous.startUs + previous.durationUs
      : 0;
    if (trimmed.startUs < previousEndUs) {
      const durationUs = clip.startUs + clip.durationUs - previousEndUs;
      trimmed = {
        ...trimmed,
        durationUs,
        startUs: previousEndUs,
        trimStartUs: trimmed.trimEndUs - durationUs,
      };
    }
  }

  const oldEndUs = clip.startUs + clip.durationUs;
  const deltaUs =
    edge === 'end'
      ? trimmed.startUs + trimmed.durationUs - oldEndUs
      : 0;
  let next = clips.map((candidate) => {
    if (candidate.id === clip.id) return trimmed;
    if (
      deltaUs !== 0 &&
      candidate.trackId === clip.trackId &&
      candidate.startUs >= oldEndUs
    ) {
      return { ...candidate, startUs: candidate.startUs + deltaUs };
    }
    return candidate;
  });
  if (clip.trackId === MAIN_VIDEO_TRACK_ID) {
    next = relayoutTrackInClipSet(next, MAIN_VIDEO_TRACK_ID);
  }
  return normalizeTimelineClips(next);
};

export const trimClip = (
  edit: TimelineEdit,
  params: TrimClipParams,
): TimelineEditResult => {
  const current = edit.clips.find((clip) => clip.id === params.clipId);
  if (!current) return unchanged;
  const clips = getTrimmedTimelineClips(
    edit.clips,
    params.clipId,
    params.edge,
    params.trimStartUs,
    params.trimEndUs,
  );
  const next = clips.find((clip) => clip.id === params.clipId);
  if (
    !next ||
    (next.startUs === current.startUs &&
      next.durationUs === current.durationUs &&
      next.trimStartUs === current.trimStartUs &&
      next.trimEndUs === current.trimEndUs)
  ) {
    return unchanged;
  }
  return changedEdit(edit, clips, current.id);
};

export const restoreClipTrim = (
  edit: TimelineEdit,
  clipId: string,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === clipId);
  if (!clip) return unchanged;
  const start = trimClip(edit, {
    clipId,
    edge: 'start',
    trimEndUs: clip.trimEndUs,
    trimStartUs: 0,
  });
  const afterStart = start.changed ? start : edit;
  const current = afterStart.clips.find((candidate) => candidate.id === clipId);
  if (!current) return unchanged;
  const end = trimClip(afterStart, {
    clipId,
    edge: 'end',
    trimEndUs: current.sourceDurationUs,
    trimStartUs: current.trimStartUs,
  });
  if (!start.changed && !end.changed) return unchanged;
  return end.changed ? end : start;
};

export const transformClip = (
  edit: TimelineEdit,
  clipId: string,
  transform: TimelineClipTransform,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === clipId);
  if (!clip) return unchanged;
  if (
    clip.transform.x === transform.x &&
    clip.transform.y === transform.y &&
    clip.transform.width === transform.width &&
    clip.transform.height === transform.height
  ) {
    return unchanged;
  }
  return changedEdit(
    edit,
    edit.clips.map((candidate) =>
      candidate.id === clipId ? { ...candidate, transform } : candidate,
    ),
    clipId,
  );
};

export const deleteClip = (
  edit: TimelineEdit,
  clipId: string,
): TimelineEditResult =>
  edit.clips.some((clip) => clip.id === clipId)
    ? changedEdit(
        edit,
        edit.clips.filter((clip) => clip.id !== clipId),
        null,
      )
    : unchanged;

export const pasteClip = (
  edit: TimelineEdit,
  copiedClip: TimelineClip,
  anchorId: string,
): TimelineEditResult => {
  const anchor = edit.clips.find((clip) => clip.id === anchorId);
  if (!anchor || anchor.type !== copiedClip.type) return unchanged;
  const trackClips = getTrackClips(edit.clips, anchor.trackId);
  const anchorIndex = trackClips.findIndex((clip) => clip.id === anchor.id);
  const pasted = {
    ...copiedClip,
    id: derivedId(edit.clips, `${copiedClip.id}-copy`),
    trackId: anchor.trackId,
  };
  const layout = planClipInsertion(
    trackClips,
    pasted,
    anchorIndex + 1,
    anchor.startUs + anchor.durationUs,
    anchor.trackId === MAIN_VIDEO_TRACK_ID,
  );
  const laidOutIds = new Set(layout.clips.map((clip) => clip.id));
  return changedEdit(
    edit,
    [
      ...edit.clips.filter((clip) => !laidOutIds.has(clip.id)),
      ...layout.clips,
    ],
    pasted.id,
  );
};

export const findClipAtTime = (
  clips: TimelineClip[],
  timeUs: number,
  preferredClipId?: string | null,
) => {
  const active = clips.filter(
    (clip) =>
      timeUs > clip.startUs && timeUs < clip.startUs + clip.durationUs,
  );
  return active.find((clip) => clip.id === preferredClipId) ?? active[0];
};

export const canSplitClipAtTime = (
  clips: TimelineClip[],
  timeUs: number,
  preferredClipId?: string | null,
) => {
  const clip = findClipAtTime(clips, timeUs, preferredClipId);
  if (!clip) return false;
  const leftDurationUs = timeUs - clip.startUs;
  const rightDurationUs = clip.durationUs - leftDurationUs;
  return (
    leftDurationUs >= MIN_CLIP_DURATION_US &&
    rightDurationUs >= MIN_CLIP_DURATION_US
  );
};

export const splitClip = (
  edit: TimelineEdit,
  clipId: string,
  timeUs: number,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === clipId);
  if (!clip || !canSplitClipAtTime(edit.clips, timeUs, clipId)) {
    return unchanged;
  }
  const leftDurationUs = timeUs - clip.startUs;
  const rightId = derivedId(edit.clips, `${clip.id}-split`);
  const left = {
    ...clip,
    durationUs: leftDurationUs,
    trimEndUs: clip.trimStartUs + leftDurationUs,
  };
  const right = {
    ...clip,
    durationUs: clip.durationUs - leftDurationUs,
    id: rightId,
    startUs: timeUs,
    trimStartUs: clip.trimStartUs + leftDurationUs,
    zIndex: clip.zIndex + 1,
  };
  return changedEdit(
    edit,
    edit.clips.flatMap((candidate) =>
      candidate.id === clipId ? [left, right] : [candidate],
    ),
    rightId,
  );
};

export const getEditDurationUs = (edit: TimelineEdit) =>
  getTimelineDuration(edit.clips);
