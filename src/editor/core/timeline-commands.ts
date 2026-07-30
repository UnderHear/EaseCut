import {
  getTimelineDuration,
  getTrackClips,
  planClipInsertion,
  relayoutTrackInClipSet,
  sortClipsByStart,
} from './collision';
import {
  getSpeedAdjustedDurationUs,
  isValidClipSpeed,
  timelineTimeToClipSourceTimeUs,
} from './clip-speed';
import type {
  TimelineClip,
  TimelineMediaClip,
  TimelineClipSpeed,
  TimelineClipTransform,
  TimelineClipVolume,
  TimelineTextAlign,
  TimelineTextClip,
  TimelineTrack,
} from './model';
import {
  isTimelineMediaClip,
  isTimelineTextClip,
} from './model';
import {
  DEFAULT_TIMELINE_TEXT_FONT_TYPE,
  isTimelineTextFontType,
} from './text-fonts';
import { normalizeTimelineTimeUs } from './timeline-math';
import {
  MAIN_VIDEO_TRACK_ID,
  insertTimelineTrack,
  normalizeTimelineTracks,
  type TrackDropTarget,
} from './timeline-tracks';
import { isValidTimeUs, secondsToMicroseconds } from './time';

export const MIN_CLIP_DURATION_US = secondsToMicroseconds(0.6);
export const MIN_CLIP_TRANSFORM_SIZE = 40;
export const DEFAULT_TEXT_CLIP_DURATION_US = secondsToMicroseconds(5);

export const normalizeClipVolume = (volume: number): TimelineClipVolume =>
  Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100;

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

export const createDefaultTextClipTransform = (
  canvasSize: { height: number; width: number },
): TimelineClipTransform => ({
  height: Math.max(
    MIN_CLIP_TRANSFORM_SIZE,
    Math.round(canvasSize.height * (200 / 1080)),
  ),
  width: Math.max(
    MIN_CLIP_TRANSFORM_SIZE,
    Math.round(canvasSize.width * (1800 / 1920)),
  ),
  x: Math.round(canvasSize.width * (60 / 1920)),
  y: Math.round(canvasSize.height * (440 / 1080)),
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
  timeUs?: number;
  trimEndUs?: number;
  trimStartUs?: number;
};

export type ChangeClipSpeedParams = {
  clipId: string;
  speed: TimelineClipSpeed;
};

export type AddTextClipParams = {
  canvasSize: { height: number; width: number };
  startUs: number;
  text: string;
};

export type ChangeTextClipPropertiesParams = {
  alignType?: TimelineTextAlign;
  clipId: string;
  fontColor?: string;
  fontSize?: number;
  fontType?: string;
  text?: string;
};

export type ChangeTextClipTimingParams = {
  clipId: string;
  endUs: number;
  startUs: number;
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
  sortClipsByStart(
    relayoutTrackInClipSet(clips, MAIN_VIDEO_TRACK_ID).map((clip) =>
      isTimelineMediaClip(clip)
        ? { ...clip, volume: normalizeClipVolume(clip.volume) }
        : clip,
    ),
  );

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

const findAvailableTextTrack = (
  tracks: readonly TimelineTrack[],
  clips: readonly TimelineClip[],
  startUs: number,
  endUs: number,
  ignoredClipId?: string,
) =>
  tracks.find(
    (track) =>
      track.type === 'text' &&
      trackAcceptsRange(
        clips,
        track.id,
        startUs,
        endUs,
        ignoredClipId,
      ),
  );

export const addTextClip = (
  edit: TimelineEdit,
  params: AddTextClipParams,
): TimelineEditResult => {
  const text = params.text.trim();
  if (
    text === '' ||
    !isValidTimeUs(params.startUs) ||
    !Number.isFinite(params.canvasSize.height) ||
    !Number.isFinite(params.canvasSize.width) ||
    params.canvasSize.height <= 0 ||
    params.canvasSize.width <= 0
  ) {
    return unchanged;
  }
  const startUs = params.startUs;
  const endUs = startUs + DEFAULT_TEXT_CLIP_DURATION_US;
  let tracks = edit.tracks;
  let track = findAvailableTextTrack(tracks, edit.clips, startUs, endUs);
  if (!track) {
    const insertion = insertTimelineTrack(tracks, {
      index: tracks.length,
      type: 'text',
    });
    tracks = insertion.tracks;
    track = insertion.track;
  }
  const trackClipCount = edit.clips.filter(
    (clip) => clip.trackId === track.id,
  ).length;
  const clip: TimelineTextClip = {
    alignType: 1,
    durationUs: DEFAULT_TEXT_CLIP_DURATION_US,
    fontColor: '#FFFFFFFF',
    fontSize: 120,
    fontType: DEFAULT_TIMELINE_TEXT_FONT_TYPE,
    id: nextNumberedClipId(edit.clips, 'text-clip-'),
    startUs,
    text,
    trackId: track.id,
    transform: createDefaultTextClipTransform(params.canvasSize),
    type: 'text',
    zIndex: trackClipCount,
  };
  return changedEdit(
    edit,
    [...edit.clips, clip],
    clip.id,
    tracks,
  );
};

export const changeTextClipProperties = (
  edit: TimelineEdit,
  params: ChangeTextClipPropertiesParams,
): TimelineEditResult => {
  const clip = edit.clips.find(
    (candidate): candidate is TimelineTextClip =>
      candidate.id === params.clipId && candidate.type === 'text',
  );
  if (!clip) return unchanged;

  const text = params.text === undefined ? clip.text : params.text.trim();
  const fontType = params.fontType ?? clip.fontType;
  const fontSize = params.fontSize ?? clip.fontSize;
  const fontColor = (params.fontColor ?? clip.fontColor).toUpperCase();
  const alignType = params.alignType ?? clip.alignType;
  if (
    text === '' ||
    !isTimelineTextFontType(fontType) ||
    !Number.isInteger(fontSize) ||
    fontSize <= 0 ||
    !/^#[\dA-F]{8}$/.test(fontColor) ||
    ![0, 1, 2].includes(alignType)
  ) {
    return unchanged;
  }
  if (
    text === clip.text &&
    fontType === clip.fontType &&
    fontSize === clip.fontSize &&
    fontColor === clip.fontColor &&
    alignType === clip.alignType
  ) {
    return unchanged;
  }
  return changedEdit(
    edit,
    edit.clips.map((candidate) =>
      candidate.id === clip.id
        ? {
            ...clip,
            alignType,
            fontColor,
            fontSize,
            fontType,
            text,
          }
        : candidate,
    ),
    clip.id,
  );
};

export const changeTextClipTiming = (
  edit: TimelineEdit,
  params: ChangeTextClipTimingParams,
): TimelineEditResult => {
  const clip = edit.clips.find(
    (candidate): candidate is TimelineTextClip =>
      candidate.id === params.clipId && candidate.type === 'text',
  );
  if (
    !clip ||
    !isValidTimeUs(params.startUs) ||
    !isValidTimeUs(params.endUs) ||
    params.endUs - params.startUs < MIN_CLIP_DURATION_US
  ) {
    return unchanged;
  }
  let tracks = edit.tracks;
  let track =
    tracks.find(
      (candidate) =>
        candidate.id === clip.trackId &&
        trackAcceptsRange(
          edit.clips,
          candidate.id,
          params.startUs,
          params.endUs,
          clip.id,
        ),
    ) ??
    findAvailableTextTrack(
      tracks,
      edit.clips,
      params.startUs,
      params.endUs,
      clip.id,
    );
  if (!track) {
    const insertion = insertTimelineTrack(tracks, {
      index: tracks.length,
      type: 'text',
    });
    tracks = insertion.tracks;
    track = insertion.track;
  }
  if (
    clip.startUs === params.startUs &&
    clip.durationUs === params.endUs - params.startUs &&
    clip.trackId === track.id
  ) {
    return unchanged;
  }
  return changedEdit(
    edit,
    edit.clips.map((candidate) =>
      candidate.id === clip.id
        ? {
            ...clip,
            durationUs: params.endUs - params.startUs,
            startUs: params.startUs,
            trackId: track.id,
            zIndex: edit.clips.filter(
              (trackClip) =>
                trackClip.trackId === track.id &&
                trackClip.id !== clip.id,
            ).length,
          }
        : candidate,
    ),
    clip.id,
    tracks,
  );
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

const getTrimmedMediaClip = (
  clip: TimelineMediaClip,
  edge: 'start' | 'end',
  trimStartUs: number,
  trimEndUs: number,
): TimelineMediaClip => {
  const sourceDurationUs = clip.sourceDurationUs;
  const endUs = Math.min(
    sourceDurationUs,
    Math.max(0, normalizeTimelineTimeUs(trimEndUs)),
  );
  const startUs = Math.min(
    endUs,
    Math.max(0, normalizeTimelineTimeUs(trimStartUs)),
  );
  let nextTrimStartUs = clip.trimStartUs;
  let nextTrimEndUs = clip.trimEndUs;

  if (edge === 'start') {
    nextTrimEndUs = endUs;
    const maximumTrimStartUs = findMaximumTrimStartUs(
      nextTrimEndUs,
      clip.speed,
      MIN_CLIP_DURATION_US,
    );
    if (maximumTrimStartUs === null) return clip;
    nextTrimStartUs = Math.min(startUs, maximumTrimStartUs);
  } else {
    const minimumTrimEndUs = findMinimumTrimEndUs(
      clip.trimStartUs,
      sourceDurationUs,
      clip.speed,
      MIN_CLIP_DURATION_US,
    );
    if (minimumTrimEndUs === null) return clip;
    nextTrimEndUs = Math.max(endUs, minimumTrimEndUs);
  }

  const durationUs = getSpeedAdjustedDurationUs(
    nextTrimStartUs,
    nextTrimEndUs,
    clip.speed,
  );

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

const nextNumberedClipId = (
  clips: readonly TimelineClip[],
  prefix: string,
) => {
  const ids = new Set(clips.map((clip) => clip.id));
  let index = 1;
  while (ids.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
};

const rangesOverlap = (
  leftStartUs: number,
  leftEndUs: number,
  rightStartUs: number,
  rightEndUs: number,
) => leftStartUs < rightEndUs && rightStartUs < leftEndUs;

const trackAcceptsRange = (
  clips: readonly TimelineClip[],
  trackId: string,
  startUs: number,
  endUs: number,
  ignoredClipId?: string,
) =>
  !clips.some(
    (clip) =>
      clip.trackId === trackId &&
      clip.id !== ignoredClipId &&
      rangesOverlap(
        startUs,
        endUs,
        clip.startUs,
        clip.startUs + clip.durationUs,
      ),
  );

export const getTrimmedClip = (
  clip: TimelineClip,
  edge: 'start' | 'end',
  timeUs: number,
): TimelineClip => {
  const boundaryUs = normalizeTimelineTimeUs(Math.max(0, timeUs));
  if (isTimelineTextClip(clip)) {
    const clipEndUs = clip.startUs + clip.durationUs;
    if (edge === 'start') {
      const startUs = Math.min(
        Math.max(0, boundaryUs),
        clipEndUs - MIN_CLIP_DURATION_US,
      );
      return {
        ...clip,
        durationUs: clipEndUs - startUs,
        startUs,
      };
    }
    const endUs = Math.max(
      clip.startUs + MIN_CLIP_DURATION_US,
      boundaryUs,
    );
    return {
      ...clip,
      durationUs: endUs - clip.startUs,
    };
  }

  const currentBoundaryUs =
    edge === 'start'
      ? clip.startUs
      : clip.startUs + clip.durationUs;
  const sourceDeltaUs = Math.round(
    (boundaryUs - currentBoundaryUs) * clip.speed,
  );
  return getTrimmedMediaClip(
    clip,
    edge,
    clip.trimStartUs + (edge === 'start' ? sourceDeltaUs : 0),
    clip.trimEndUs + (edge === 'end' ? sourceDeltaUs : 0),
  );
};

const findMaximumTrimStartUs = (
  trimEndUs: number,
  speed: TimelineClipSpeed,
  minimumDurationUs: number,
) => {
  if (
    getSpeedAdjustedDurationUs(0, trimEndUs, speed) < minimumDurationUs
  ) {
    return null;
  }

  let low = 0;
  let high = trimEndUs;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      getSpeedAdjustedDurationUs(middle, trimEndUs, speed) >=
      minimumDurationUs
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
};

const findMinimumTrimEndUs = (
  trimStartUs: number,
  sourceDurationUs: number,
  speed: TimelineClipSpeed,
  minimumDurationUs: number,
) => {
  if (
    getSpeedAdjustedDurationUs(trimStartUs, sourceDurationUs, speed) <
    minimumDurationUs
  ) {
    return null;
  }

  let low = trimStartUs;
  let high = sourceDurationUs;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (
      getSpeedAdjustedDurationUs(trimStartUs, middle, speed) >=
      minimumDurationUs
    ) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
};

export const getTrimmedTimelineClips = (
  clips: TimelineClip[],
  clipId: string,
  edge: 'start' | 'end',
  timeUs: number,
  mediaTrim?: {
    trimEndUs: number;
    trimStartUs: number;
  },
) => {
  const clip = clips.find((candidate) => candidate.id === clipId);
  if (!clip) return clips;

  let trimmed =
    mediaTrim && isTimelineMediaClip(clip)
      ? getTrimmedMediaClip(
          clip,
          edge,
          mediaTrim.trimStartUs,
          mediaTrim.trimEndUs,
        )
      : getTrimmedClip(clip, edge, timeUs);
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
      trimmed = getTrimmedClip(clip, edge, previousEndUs);
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
  const sourceBoundaryUs =
    params.edge === 'start' ? params.trimStartUs : params.trimEndUs;
  const currentSourceBoundaryUs =
    isTimelineMediaClip(current)
      ? params.edge === 'start'
        ? current.trimStartUs
        : current.trimEndUs
      : null;
  const currentTimelineBoundaryUs =
    params.edge === 'start'
      ? current.startUs
      : current.startUs + current.durationUs;
  const boundary =
    params.timeUs !== undefined
      ? { edge: params.edge, timeUs: params.timeUs }
      : isTimelineMediaClip(current) &&
          sourceBoundaryUs !== undefined &&
          currentSourceBoundaryUs !== null
        ? {
            edge: params.edge,
            timeUs:
              currentTimelineBoundaryUs +
              Math.round(
                (sourceBoundaryUs - currentSourceBoundaryUs) /
                  current.speed,
              ),
          }
        : null;
  if (!boundary) return unchanged;
  const clips = getTrimmedTimelineClips(
    edit.clips,
    params.clipId,
    boundary.edge,
    boundary.timeUs,
    params.trimStartUs !== undefined && params.trimEndUs !== undefined
      ? {
          trimEndUs: params.trimEndUs,
          trimStartUs: params.trimStartUs,
        }
      : undefined,
  );
  const next = clips.find((clip) => clip.id === params.clipId);
  if (
    !next ||
    (next.startUs === current.startUs &&
      next.durationUs === current.durationUs &&
      (
        !isTimelineMediaClip(next) ||
        !isTimelineMediaClip(current) ||
        (
          next.trimStartUs === current.trimStartUs &&
          next.trimEndUs === current.trimEndUs
        )
      ))
  ) {
    return unchanged;
  }
  return changedEdit(edit, clips, current.id);
};

export const changeClipSpeed = (
  edit: TimelineEdit,
  params: ChangeClipSpeedParams,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === params.clipId);
  if (
    !clip ||
    !isTimelineMediaClip(clip) ||
    !isValidClipSpeed(params.speed) ||
    params.speed === clip.speed
  ) {
    return unchanged;
  }
  const speed = params.speed;

  const durationUs = getSpeedAdjustedDurationUs(
    clip.trimStartUs,
    clip.trimEndUs,
    speed,
  );
  if (durationUs <= 0) return unchanged;

  const oldEndUs = clip.startUs + clip.durationUs;
  const deltaUs = durationUs - clip.durationUs;
  let clips = edit.clips.map((candidate) => {
    if (candidate.id === clip.id) {
      return isTimelineMediaClip(candidate)
        ? { ...candidate, durationUs, speed }
        : candidate;
    }
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
    clips = relayoutTrackInClipSet(clips, MAIN_VIDEO_TRACK_ID);
  }

  return changedEdit(edit, clips, clip.id);
};

export const restoreClipTrim = (
  edit: TimelineEdit,
  clipId: string,
): TimelineEditResult => {
  const clip = edit.clips.find((candidate) => candidate.id === clipId);
  if (!clip || !isTimelineMediaClip(clip)) return unchanged;
  const start = trimClip(edit, {
    clipId,
    edge: 'start',
    trimEndUs: clip.trimEndUs,
    trimStartUs: 0,
  });
  const afterStart = start.changed ? start : edit;
  const current = afterStart.clips.find((candidate) => candidate.id === clipId);
  if (!current || !isTimelineMediaClip(current)) return unchanged;
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
  if (isTimelineTextClip(clip)) {
    return (
      timeUs - clip.startUs >= MIN_CLIP_DURATION_US &&
      clip.startUs + clip.durationUs - timeUs >= MIN_CLIP_DURATION_US
    );
  }
  const sourceTimeUs = timelineTimeToClipSourceTimeUs(clip, timeUs);
  const leftDurationUs = getSpeedAdjustedDurationUs(
    clip.trimStartUs,
    sourceTimeUs,
    clip.speed,
  );
  const rightDurationUs = getSpeedAdjustedDurationUs(
    sourceTimeUs,
    clip.trimEndUs,
    clip.speed,
  );
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
  if (isTimelineTextClip(clip)) {
    const leftDurationUs = timeUs - clip.startUs;
    const rightDurationUs = clip.durationUs - leftDurationUs;
    const rightId = derivedId(edit.clips, `${clip.id}-split`);
    return changedEdit(
      edit,
      edit.clips.flatMap((candidate) =>
        candidate.id === clipId
          ? [
              { ...clip, durationUs: leftDurationUs },
              {
                ...clip,
                durationUs: rightDurationUs,
                id: rightId,
                startUs: timeUs,
                zIndex: clip.zIndex + 1,
              },
            ]
          : [candidate],
      ),
      rightId,
    );
  }
  const sourceTimeUs = timelineTimeToClipSourceTimeUs(clip, timeUs);
  const leftDurationUs = getSpeedAdjustedDurationUs(
    clip.trimStartUs,
    sourceTimeUs,
    clip.speed,
  );
  const rightDurationUs = getSpeedAdjustedDurationUs(
    sourceTimeUs,
    clip.trimEndUs,
    clip.speed,
  );
  const rightId = derivedId(edit.clips, `${clip.id}-split`);
  const left = {
    ...clip,
    durationUs: leftDurationUs,
    trimEndUs: sourceTimeUs,
  };
  const right = {
    ...clip,
    durationUs: rightDurationUs,
    id: rightId,
    startUs: clip.startUs + leftDurationUs,
    trimStartUs: sourceTimeUs,
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
