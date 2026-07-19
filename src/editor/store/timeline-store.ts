import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  getTimelineDuration,
  getTrackClips,
  planClipInsertion,
  relayoutTrackInClipSet,
  sortClipsByStart,
} from '../core/collision';
import { createCompositionExportPayload } from '../core/export-schema';
import {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  MAIN_VIDEO_TRACK_ID,
  insertTimelineTrack,
  normalizeTimelineTracks,
  normalizeTrackVolume,
  type TrackDropTarget,
} from '../core/timeline-tracks';
export {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  AUDIO_TRACK_ID_PREFIX,
  DYNAMIC_VIDEO_TRACK_ID_PREFIX,
  MAIN_VIDEO_TRACK_ID,
  isDynamicVideoTrack,
  normalizeTimelineTracks,
  normalizeTrackVolume,
  type TrackDropTarget,
  type TrackInsertTarget,
} from '../core/timeline-tracks';
import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  roundTimelineTime,
} from '../core/timeline-math';
import type {
  CompositionExportPayload,
  TimelineClipDraft,
  TimelineClipTransform,
  TimelineCanvasSize,
  TimelineClip,
  TimelineSnapshot,
  TimelineTrack,
  TimelineTrackDraft,
  VideoTimelineDraft,
  VideoTimelineSource,
} from '../types';

const defaultTimelineTracks: TimelineTrack[] = [
  {
    id: MAIN_VIDEO_TRACK_ID,
    name: '视频轨',
    type: 'video',
    volume: 1,
    zIndex: 0,
  },
];

const createDefaultTimelineClips = (): TimelineClip[] => [];

export const VIDEO_TIMELINE_DRAFT_SCHEMA_VERSION = 4;
export const DEFAULT_COMPOSITION_CANVAS_SIZE: TimelineCanvasSize = {
  height: 720,
  width: 1280,
};
export const DEFAULT_VIDEO_SOURCE_DURATION_SECONDS = 5;
export const MIN_SPLIT_CLIP_DURATION_SECONDS = 0.6;
export const MIN_CLIP_TRANSFORM_SIZE = 40;

export type CommitClipDropParams = {
  clipId: string;
  freeStart?: number;
  insertionIndex: number;
  target: TrackDropTarget;
};

export type CommitClipTrimParams = {
  clipId: string;
  edge: 'start' | 'end';
  trimEnd: number;
  trimStart: number;
};

export type CommitClipTransformParams = {
  clipId: string;
  transform: TimelineClipTransform;
};

export type ResetTimelineParams = {
  draft?: VideoTimelineDraft;
  sources?: VideoTimelineSource[];
};

export type TimelineState = {
  canvasSnappingEnabled: boolean;
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  copiedClip: TimelineClip | null;
  currentTime: number;
  future: TimelineSnapshot[];
  isPlaying: boolean;
  layoutRevision: number;
  past: TimelineSnapshot[];
  pixelsPerSecond: number;
  selectedClipId: string | null;
  snappingEnabled: boolean;
  tracks: TimelineTrack[];
};

export type TimelineDraftSource = {
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  tracks: TimelineTrack[];
};

export type TimelineActions = {
  commitClipDrop: (params: CommitClipDropParams) => void;
  commitClipTrim: (params: CommitClipTrimParams) => void;
  commitClipTransform: (params: CommitClipTransformParams) => void;
  copySelectedClip: () => void;
  createExportPayload: () => CompositionExportPayload;
  deleteSelectedClip: () => void;
  pasteCopiedClip: () => void;
  redo: () => void;
  resetTimeline: (params?: ResetTimelineParams) => void;
  restoreClipTrim: (clipId: string) => void;
  syncSources: (sources: VideoTimelineSource[]) => void;
  selectClip: (clipId: string | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPixelsPerSecond: (pixelsPerSecond: number) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  commitTrackVolume: (
    trackId: string,
    previousVolume: number,
    volume: number,
  ) => void;
  splitAtPlayhead: () => void;
  splitClipAtTime: (clipId: string, time: number) => void;
  toggleCanvasSnapping: () => void;
  toggleSnapping: () => void;
  toggleTrackMute: (trackId: string) => void;
  undo: () => void;
};

const getSourceDuration = (source: VideoTimelineSource) =>
  typeof source.durationSeconds === 'number' && source.durationSeconds > 0
    ? roundTimelineTime(source.durationSeconds)
    : DEFAULT_VIDEO_SOURCE_DURATION_SECONDS;

const hasSourceDimensions = (
  source: VideoTimelineSource,
): source is VideoTimelineSource &
  Required<Pick<VideoTimelineSource, 'height' | 'width'>> =>
  typeof source.height === 'number' &&
  typeof source.width === 'number' &&
  source.height > 0 &&
  source.width > 0;

const getCompositionCanvasSize = (
  sources: VideoTimelineSource[],
): TimelineCanvasSize => {
  const largestSource = sources
    .filter((source) => source.type === 'video')
    .filter((source) => hasSourceDimensions(source))
    .filter(
      (source) =>
        source.width / source.height ===
        DEFAULT_COMPOSITION_CANVAS_SIZE.width /
          DEFAULT_COMPOSITION_CANVAS_SIZE.height,
    )
    .sort(
      (left, right) =>
        (right.width ?? 0) * (right.height ?? 0) -
        (left.width ?? 0) * (left.height ?? 0),
    )[0];

  return largestSource
    ? {
        height: largestSource.height ?? DEFAULT_COMPOSITION_CANVAS_SIZE.height,
        width: largestSource.width ?? DEFAULT_COMPOSITION_CANVAS_SIZE.width,
      }
    : DEFAULT_COMPOSITION_CANVAS_SIZE;
};

export const createDefaultClipTransform = (
  canvasSize: TimelineCanvasSize,
): TimelineClipTransform => ({
  height: Math.round(canvasSize.height),
  width: Math.round(canvasSize.width),
  x: 0,
  y: 0,
});

const createContainedClipTransform = (
  source: VideoTimelineSource,
  canvasSize: TimelineCanvasSize,
): TimelineClipTransform => {
  if (source.type !== 'video' || !hasSourceDimensions(source)) {
    return createDefaultClipTransform(canvasSize);
  }

  const scale = Math.min(
    canvasSize.width / source.width,
    canvasSize.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;

  return normalizeClipTransform({
    height,
    width,
    x: (canvasSize.width - width) / 2,
    y: (canvasSize.height - height) / 2,
  });
};

const isDefaultClipTransform = (
  transform: TimelineClipTransform,
  canvasSize: TimelineCanvasSize,
) =>
  transform.x === 0 &&
  transform.y === 0 &&
  transform.width === Math.round(canvasSize.width) &&
  transform.height === Math.round(canvasSize.height);

const areClipTransformsEqual = (
  left: TimelineClipTransform,
  right: TimelineClipTransform,
) =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;

export const normalizeClipTransform = (
  transform: TimelineClipTransform,
): TimelineClipTransform => ({
  height: Math.max(MIN_CLIP_TRANSFORM_SIZE, Math.round(transform.height)),
  width: Math.max(MIN_CLIP_TRANSFORM_SIZE, Math.round(transform.width)),
  x: Math.round(transform.x),
  y: Math.round(transform.y),
});

const getAudioSourceTrackId = (sourceId: string) =>
  `${AUDIO_SOURCE_TRACK_ID_PREFIX}${sourceId}`;

export const createTimelineClipsFromSources = (
  sources: VideoTimelineSource[],
  canvasSize = DEFAULT_COMPOSITION_CANVAS_SIZE,
): TimelineClip[] => {
  let videoCursor = 0;

  return sources.map((source, sourceIndex) => {
    const duration = getSourceDuration(source);
    const isVideo = source.type === 'video';
    const clip: TimelineClip = {
      duration,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceId: source.id,
      sourceDuration: duration,
      src: source.src,
      ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
      start: isVideo ? roundTimelineTime(videoCursor) : 0,
      thumbnailUrls: [],
      trackId: isVideo ? MAIN_VIDEO_TRACK_ID : getAudioSourceTrackId(source.id),
      trimEnd: duration,
      trimStart: 0,
      transform: createContainedClipTransform(source, canvasSize),
      type: source.type,
      zIndex: isVideo ? sourceIndex : 0,
    };

    if (isVideo) {
      videoCursor = roundTimelineTime(videoCursor + duration);
    }
    return clip;
  });
};

const createTimelineTracksFromSources = (sources: VideoTimelineSource[]) =>
  normalizeTimelineTracks([
    ...defaultTimelineTracks,
    ...sources
      .filter((source) => source.type === 'audio')
      .map((source, index): TimelineTrack => ({
        id: getAudioSourceTrackId(source.id),
        name: source.fileName,
        type: 'audio',
        volume: 1,
        zIndex: index + 1,
      })),
  ]);

const cloneClip = (clip: TimelineClip): TimelineClip => ({
  ...clip,
  thumbnailUrls: [...clip.thumbnailUrls],
  transform: { ...clip.transform },
});

const cloneClips = (clips: TimelineClip[]) => clips.map(cloneClip);
const cloneTracks = (tracks: TimelineTrack[]) =>
  tracks.map((track) => ({ ...track }));

const createCopiedClipId = (clips: TimelineClip[], sourceId: string) => {
  const clipIds = new Set(clips.map((clip) => clip.id));
  const baseId = `${sourceId}-copy`;
  let copyId = baseId;
  let copyNumber = 2;

  while (clipIds.has(copyId)) {
    copyId = `${baseId}-${copyNumber}`;
    copyNumber += 1;
  }

  return copyId;
};

const createPastedClipLayout = (
  clips: TimelineClip[],
  copiedClip: TimelineClip,
  anchorClip: TimelineClip,
) => {
  const trackClips = getTrackClips(clips, anchorClip.trackId);
  const anchorIndex = trackClips.findIndex(
    (clip) => clip.id === anchorClip.id,
  );
  const pastedClip: TimelineClip = {
    ...cloneClip(copiedClip),
    id: createCopiedClipId(clips, copiedClip.id),
    start: roundTimelineTime(anchorClip.start + anchorClip.duration),
    trackId: anchorClip.trackId,
  };
  const precedingClips = trackClips.slice(0, anchorIndex + 1);
  let nextAvailableStart = roundTimelineTime(
    pastedClip.start + pastedClip.duration,
  );
  const followingClips = trackClips.slice(anchorIndex + 1).map((clip) => {
    const start = roundTimelineTime(
      Math.max(clip.start + pastedClip.duration, nextAvailableStart),
    );
    nextAvailableStart = roundTimelineTime(start + clip.duration);
    return { ...clip, start };
  });
  const nextTrackClips = [...precedingClips, pastedClip, ...followingClips].map(
    (clip, zIndex) => ({ ...clip, zIndex }),
  );
  const nextTrackClipsById = new Map(
    nextTrackClips.map((clip) => [clip.id, clip]),
  );

  return {
    clips: [
      ...clips.map((clip) => nextTrackClipsById.get(clip.id) ?? clip),
      nextTrackClipsById.get(pastedClip.id) ?? pastedClip,
    ],
    pastedClipId: pastedClip.id,
  };
};
const removeEmptyTimelineTracks = (
  tracks: TimelineTrack[],
  clips: TimelineClip[],
) => {
  const clipTrackIds = new Set(clips.map((clip) => clip.trackId));

  return normalizeTimelineTracks(
    tracks.filter(
      (track) =>
        track.id === MAIN_VIDEO_TRACK_ID || clipTrackIds.has(track.id),
    ),
  );
};

export const shouldCompactMainVideoTrackAfterDrop = (
  targetTrackId: string,
) => targetTrackId === MAIN_VIDEO_TRACK_ID;

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isTimelineCanvasSize = (value: unknown): value is TimelineCanvasSize =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  isFinitePositiveNumber((value as TimelineCanvasSize).height) &&
  isFinitePositiveNumber((value as TimelineCanvasSize).width);

const isTimelineTrackDraft = (value: unknown): value is TimelineTrackDraft => {
  const track = value as TimelineTrackDraft;

  return (
    Boolean(track) &&
    typeof track === 'object' &&
    typeof track.id === 'string' &&
    (track.type === 'video' || track.type === 'audio') &&
    typeof track.name === 'string' &&
    (typeof track.volume === 'undefined' ||
      (typeof track.volume === 'number' &&
        Number.isFinite(track.volume) &&
        track.volume >= 0 &&
        track.volume <= 1)) &&
    typeof track.zIndex === 'number' &&
    Number.isFinite(track.zIndex)
  );
};

const isTimelineClipTransform = (
  value: unknown,
): value is TimelineClipTransform => {
  const transform = value as TimelineClipTransform;

  return (
    Boolean(transform) &&
    typeof transform === 'object' &&
    typeof transform.x === 'number' &&
    Number.isFinite(transform.x) &&
    typeof transform.y === 'number' &&
    Number.isFinite(transform.y) &&
    typeof transform.width === 'number' &&
    Number.isFinite(transform.width) &&
    transform.width > 0 &&
    typeof transform.height === 'number' &&
    Number.isFinite(transform.height) &&
    transform.height > 0
  );
};

const isTimelineClipDraft = (value: unknown): value is TimelineClipDraft => {
  const clip = value as TimelineClipDraft;

  return (
    Boolean(clip) &&
    typeof clip === 'object' &&
    typeof clip.id === 'string' &&
    (clip.type === 'video' || clip.type === 'audio') &&
    (typeof clip.sourceId === 'undefined' ||
      typeof clip.sourceId === 'string') &&
    typeof clip.src === 'string' &&
    typeof clip.name === 'string' &&
    typeof clip.trackId === 'string' &&
    typeof clip.start === 'number' &&
    Number.isFinite(clip.start) &&
    clip.start >= 0 &&
    typeof clip.duration === 'number' &&
    Number.isFinite(clip.duration) &&
    clip.duration > 0 &&
    typeof clip.sourceDuration === 'number' &&
    Number.isFinite(clip.sourceDuration) &&
    clip.sourceDuration > 0 &&
    typeof clip.trimStart === 'number' &&
    Number.isFinite(clip.trimStart) &&
    clip.trimStart >= 0 &&
    typeof clip.trimEnd === 'number' &&
    Number.isFinite(clip.trimEnd) &&
    clip.trimEnd > clip.trimStart &&
    clip.trimEnd <= clip.sourceDuration &&
    roundTimelineTime(clip.trimEnd - clip.trimStart) ===
      roundTimelineTime(clip.duration) &&
    Array.isArray(clip.thumbnailUrls) &&
    clip.thumbnailUrls.every((url) => typeof url === 'string') &&
    (typeof clip.transform === 'undefined' ||
      isTimelineClipTransform(clip.transform)) &&
    typeof clip.zIndex === 'number' &&
    Number.isFinite(clip.zIndex)
  );
};

const isSupportedDraftSchemaVersion = (
  version: unknown,
): version is VideoTimelineDraft['schemaVersion'] =>
  version === 1 ||
  version === 2 ||
  version === 3 ||
  version === VIDEO_TIMELINE_DRAFT_SCHEMA_VERSION;

const getLegacyClipSourceId = (
  clip: TimelineClipDraft,
  sources: VideoTimelineSource[],
) => {
  const matchingSource = sources.find((source) => source.src === clip.src);
  if (matchingSource) return matchingSource.id;

  return clip.id.replace(/^clip-/, '').replace(/-split-[^-]+$/, '');
};

const normalizeDraftClip = (
  clip: TimelineClipDraft,
  canvasSize: TimelineCanvasSize,
  sources: VideoTimelineSource[],
): TimelineClip => ({
  ...clip,
  sourceId: clip.sourceId?.trim() || getLegacyClipSourceId(clip, sources),
  transform: normalizeClipTransform(
    clip.transform ?? createDefaultClipTransform(canvasSize),
  ),
});

const normalizeDraftTrack = (track: TimelineTrackDraft): TimelineTrack => ({
  ...track,
  volume: normalizeTrackVolume(track.volume ?? 1),
});

type MergeSourcesIntoDraftStateOptions = {
  addMissingSourceIds?: ReadonlySet<string>;
};

const mergeSourcesIntoDraftState = (
  state: TimelineState,
  sources: VideoTimelineSource[],
  options: MergeSourcesIntoDraftStateOptions = {},
): TimelineState => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clipsWithSourceMetadata = state.clips.map((clip) => {
    const source = sourceById.get(clip.sourceId);
    if (!source || source.type !== clip.type) return clip;

    const hasSourceIdentityChange =
      source.src !== clip.src ||
      source.fileName !== clip.name ||
      source.waveformSrc !== clip.waveformSrc;
    const clipWithSourceIdentity = hasSourceIdentityChange
      ? {
          ...clip,
          name: source.fileName,
          src: source.src,
          waveformSrc: source.waveformSrc,
        }
      : clip;
    const containedTransform =
      source.type === 'video' &&
      hasSourceDimensions(source) &&
      isDefaultClipTransform(clipWithSourceIdentity.transform, state.canvasSize)
        ? createContainedClipTransform(source, state.canvasSize)
        : clipWithSourceIdentity.transform;
    const clipWithSourceMetadata = areClipTransformsEqual(
      clipWithSourceIdentity.transform,
      containedTransform,
    )
      ? clipWithSourceIdentity
      : { ...clipWithSourceIdentity, transform: containedTransform };
    if (
      typeof source.durationSeconds !== 'number' ||
      source.durationSeconds <= 0
    ) {
      return clipWithSourceMetadata;
    }

    const sourceDuration = getSourceDuration(source);
    if (clip.sourceDuration === sourceDuration) return clipWithSourceMetadata;

    const isWholeFallbackClip =
      clip.sourceDuration === DEFAULT_VIDEO_SOURCE_DURATION_SECONDS &&
      clip.duration === DEFAULT_VIDEO_SOURCE_DURATION_SECONDS &&
      clip.trimStart === 0 &&
      clip.trimEnd === DEFAULT_VIDEO_SOURCE_DURATION_SECONDS;
    if (isWholeFallbackClip) {
      return {
        ...clipWithSourceMetadata,
        duration: sourceDuration,
        sourceDuration,
        trimEnd: sourceDuration,
      };
    }

    if (clip.trimEnd <= sourceDuration) {
      return { ...clipWithSourceMetadata, sourceDuration };
    }

    return getTrimmedClip(
      { ...clipWithSourceMetadata, sourceDuration },
      'end',
      clip.trimStart,
      sourceDuration,
    );
  });
  const stateWithSourceMetadata = clipsWithSourceMetadata.some(
    (clip, index) => clip !== state.clips[index],
  )
    ? { ...state, clips: normalizeTimelineClips(clipsWithSourceMetadata) }
    : state;
  const existingSourceIds = new Set(
    stateWithSourceMetadata.clips.map((clip) => clip.sourceId),
  );
  const missingSources = sources.filter(
    (source) =>
      !existingSourceIds.has(source.id) &&
      (!options.addMissingSourceIds ||
        options.addMissingSourceIds.has(source.id)),
  );
  if (missingSources.length === 0) return stateWithSourceMetadata;

  let videoCursor = getTrackClips(
    stateWithSourceMetadata.clips,
    MAIN_VIDEO_TRACK_ID,
  ).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  const tracks = [...stateWithSourceMetadata.tracks];
  const clips = [...stateWithSourceMetadata.clips];

  for (const source of missingSources) {
    const duration = getSourceDuration(source);
    const isVideo = source.type === 'video';
    let trackId = MAIN_VIDEO_TRACK_ID;

    if (isVideo && !tracks.some((track) => track.id === MAIN_VIDEO_TRACK_ID)) {
      tracks.push({ ...defaultTimelineTracks[0] });
    }

    if (!isVideo) {
      trackId = getAudioSourceTrackId(source.id);
      tracks.push({
        id: trackId,
        name: source.fileName,
        type: 'audio',
        volume: 1,
        zIndex: tracks.length,
      });
    }

    const trackClipCount = clips.filter(
      (clip) => clip.trackId === trackId,
    ).length;
    clips.push({
      duration,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceDuration: duration,
      sourceId: source.id,
      src: source.src,
      ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
      start: isVideo ? roundTimelineTime(videoCursor) : 0,
      thumbnailUrls: [],
      trackId,
      trimEnd: duration,
      trimStart: 0,
      transform: createContainedClipTransform(
        source,
        stateWithSourceMetadata.canvasSize,
      ),
      type: source.type,
      zIndex: trackClipCount,
    });

    if (isVideo) {
      videoCursor = roundTimelineTime(videoCursor + duration);
    }
  }

  return {
    ...stateWithSourceMetadata,
    clips: normalizeTimelineClips(clips),
    tracks: normalizeTimelineTracks(tracks),
  };
};

const createStateFromDraft = (
  draft: VideoTimelineDraft | undefined,
  sources: VideoTimelineSource[],
): TimelineState | null => {
  if (
    !draft ||
    !isSupportedDraftSchemaVersion(draft.schemaVersion) ||
    !isTimelineCanvasSize(draft.canvasSize) ||
    !Array.isArray(draft.tracks) ||
    draft.tracks.length === 0 ||
    !draft.tracks.every(isTimelineTrackDraft) ||
    !Array.isArray(draft.clips) ||
    !draft.clips.every(isTimelineClipDraft)
  ) {
    return null;
  }

  const trackById = new Map(draft.tracks.map((track) => [track.id, track]));
  const clipIds = new Set<string>();
  if (
    trackById.size !== draft.tracks.length ||
    draft.clips.some((clip) => {
      const track = trackById.get(clip.trackId);
      if (!track || track.type !== clip.type || clipIds.has(clip.id)) {
        return true;
      }
      clipIds.add(clip.id);
      return false;
    })
  ) {
    return null;
  }

  const clips = normalizeTimelineClips(
    draft.clips.map((clip) =>
      normalizeDraftClip(clip, draft.canvasSize, sources),
    ),
  );
  const tracks = removeEmptyTimelineTracks(
    draft.tracks.map(normalizeDraftTrack),
    clips,
  );

  return mergeSourcesIntoDraftState(
    {
      canvasSnappingEnabled: true,
      canvasSize: { ...draft.canvasSize },
      clips,
      copiedClip: null,
      currentTime: 0,
      future: [],
      isPlaying: false,
      layoutRevision: 0,
      past: [],
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
      selectedClipId: null,
      snappingEnabled: true,
      tracks,
    },
    sources,
  );
};

const createInitialState = (params?: ResetTimelineParams): TimelineState => {
  const sources = params?.sources ?? [];
  const draftState = createStateFromDraft(params?.draft, sources);
  if (draftState) {
    return draftState;
  }
  const canvasSize = params?.sources
    ? getCompositionCanvasSize(sources)
    : DEFAULT_COMPOSITION_CANVAS_SIZE;

  return {
    canvasSnappingEnabled: true,
    canvasSize,
    clips: normalizeTimelineClips(
      params?.sources
        ? createTimelineClipsFromSources(sources, canvasSize)
        : createDefaultTimelineClips(),
    ),
    copiedClip: null,
    currentTime: 0,
    future: [],
    isPlaying: false,
    layoutRevision: 0,
    past: [],
    pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
    selectedClipId: null,
    snappingEnabled: true,
    tracks: params?.sources
      ? createTimelineTracksFromSources(sources)
      : defaultTimelineTracks,
  };
};

export const createVideoTimelineDraft = (
  state: TimelineDraftSource,
): VideoTimelineDraft => ({
  canvasSize: { ...state.canvasSize },
  clips: cloneClips(state.clips),
  schemaVersion: VIDEO_TIMELINE_DRAFT_SCHEMA_VERSION,
  tracks: cloneTracks(state.tracks),
});

const createSnapshot = (state: TimelineState): TimelineSnapshot => ({
  clips: cloneClips(state.clips),
  selectedClipId: state.selectedClipId,
  tracks: cloneTracks(state.tracks),
});

const recordClipsChange = (
  state: TimelineState,
  clips: TimelineClip[],
  selectedClipId = state.selectedClipId,
  tracks = state.tracks,
) => {
  const nextClips = normalizeTimelineClips(clips);

  return {
    clips: nextClips,
    future: [] as TimelineSnapshot[],
    layoutRevision: state.layoutRevision + 1,
    past: [...state.past, createSnapshot(state)],
    selectedClipId,
    tracks: removeEmptyTimelineTracks(tracks, nextClips),
  };
};

const hasSameClipLayout = (
  currentClips: TimelineClip[],
  nextClips: TimelineClip[],
) => {
  if (currentClips.length !== nextClips.length) return false;
  const currentById = new Map(currentClips.map((clip) => [clip.id, clip]));

  return nextClips.every((clip) => {
    const current = currentById.get(clip.id);
    return (
      current?.start === clip.start &&
      current.trackId === clip.trackId &&
      current.zIndex === clip.zIndex
    );
  });
};

export const normalizeTimelineClips = (clips: TimelineClip[]) =>
  sortClipsByStart(relayoutTrackInClipSet(clips, MAIN_VIDEO_TRACK_ID));

const getTrackById = (tracks: TimelineTrack[], trackId: string) =>
  tracks.find((track) => track.id === trackId);

const canMoveClipToTrack = (
  clip: TimelineClip,
  targetTrack: TimelineTrack | undefined,
) => targetTrack?.type === clip.type;

const getClipAtTime = (
  clips: TimelineClip[],
  time: number,
  preferredClipId?: string | null,
) => {
  const activeClips = clips.filter(
    (clip) => time > clip.start && time < clip.start + clip.duration,
  );

  return (
    activeClips.find((clip) => clip.id === preferredClipId) ?? activeClips[0]
  );
};

export const canSplitClipAtTime = (
  clips: TimelineClip[],
  time: number,
  preferredClipId?: string | null,
) => {
  const clipAtTime = getClipAtTime(clips, time, preferredClipId);
  if (!clipAtTime) return false;

  const splitOffset = roundTimelineTime(time - clipAtTime.start);
  const rightDuration = roundTimelineTime(clipAtTime.duration - splitOffset);

  return (
    splitOffset >= MIN_SPLIT_CLIP_DURATION_SECONDS &&
    rightDuration >= MIN_SPLIT_CLIP_DURATION_SECONDS
  );
};

export const getTrimmedClip = (
  clip: TimelineClip,
  edge: 'start' | 'end',
  trimStart: number,
  trimEnd: number,
): TimelineClip => {
  const safeSourceDuration = Math.max(
    MIN_SPLIT_CLIP_DURATION_SECONDS,
    clip.sourceDuration,
  );
  const safeTrimEnd = Math.min(
    safeSourceDuration,
    Math.max(0, roundTimelineTime(trimEnd)),
  );
  const safeTrimStart = Math.min(
    safeTrimEnd,
    Math.max(0, roundTimelineTime(trimStart)),
  );
  const nextTrimStart =
    edge === 'start'
      ? Math.min(
          Math.max(0, safeTrimStart),
          Math.max(0, safeTrimEnd - MIN_SPLIT_CLIP_DURATION_SECONDS),
        )
      : clip.trimStart;
  const nextTrimEnd =
    edge === 'end'
      ? Math.min(
          safeSourceDuration,
          Math.max(
            safeTrimEnd,
            nextTrimStart + MIN_SPLIT_CLIP_DURATION_SECONDS,
          ),
        )
      : Math.max(safeTrimEnd, nextTrimStart + MIN_SPLIT_CLIP_DURATION_SECONDS);
  const duration = roundTimelineTime(nextTrimEnd - nextTrimStart);
  const start =
    edge === 'start'
      ? roundTimelineTime(clip.start + clip.duration - duration)
      : clip.start;

  return {
    ...clip,
    duration,
    start,
    trimEnd: roundTimelineTime(nextTrimEnd),
    trimStart: roundTimelineTime(nextTrimStart),
  };
};

const constrainStartTrimToTrackGap = (
  clips: TimelineClip[],
  clip: TimelineClip,
  trimmedClip: TimelineClip,
) => {
  const previousClip = getTrackClips(clips, clip.trackId)
    .filter(
      (candidate) => candidate.id !== clip.id && candidate.start < clip.start,
    )
    .at(-1);
  const previousEnd = roundTimelineTime(
    Math.max(0, previousClip ? previousClip.start + previousClip.duration : 0),
  );
  if (trimmedClip.start >= previousEnd) return trimmedClip;

  const duration = roundTimelineTime(clip.start + clip.duration - previousEnd);

  return {
    ...trimmedClip,
    duration,
    start: previousEnd,
    trimStart: roundTimelineTime(trimmedClip.trimEnd - duration),
  };
};

export const getRippleTrimmedClips = (
  clips: TimelineClip[],
  clipId: string,
  edge: 'start' | 'end',
  trimStart: number,
  trimEnd: number,
  options: { constrainStartToTrackGap?: boolean } = {},
) => {
  const targetClip = clips.find((clip) => clip.id === clipId);
  if (!targetClip) return clips;

  const trimmedClip = getTrimmedClip(targetClip, edge, trimStart, trimEnd);
  const shouldConstrainStart = options.constrainStartToTrackGap ?? true;
  const nextClip =
    edge === 'start' && shouldConstrainStart
      ? constrainStartTrimToTrackGap(clips, targetClip, trimmedClip)
      : trimmedClip;
  const oldEnd = roundTimelineTime(targetClip.start + targetClip.duration);
  const nextEnd = roundTimelineTime(nextClip.start + nextClip.duration);
  const endDelta = edge === 'end' ? roundTimelineTime(nextEnd - oldEnd) : 0;

  return normalizeTimelineClips(
    clips.map((clip) => {
      if (clip.id === clipId) return nextClip;
      if (
        endDelta !== 0 &&
        clip.trackId === targetClip.trackId &&
        clip.start >= oldEnd
      ) {
        return { ...clip, start: roundTimelineTime(clip.start + endDelta) };
      }

      return clip;
    }),
  );
};

export const getTrimmedTimelineClips = (
  clips: TimelineClip[],
  clipId: string,
  edge: 'start' | 'end',
  trimStart: number,
  trimEnd: number,
) => {
  const targetClip = clips.find((clip) => clip.id === clipId);
  const shouldCompactMainTrack =
    targetClip?.type === 'video' &&
    targetClip.trackId === MAIN_VIDEO_TRACK_ID;
  const trimmedClips = getRippleTrimmedClips(
    clips,
    clipId,
    edge,
    trimStart,
    trimEnd,
    { constrainStartToTrackGap: !shouldCompactMainTrack },
  );

  return shouldCompactMainTrack
    ? relayoutTrackInClipSet(trimmedClips, MAIN_VIDEO_TRACK_ID)
    : trimmedClips;
};

export type TimelineStore = TimelineState & TimelineActions;
export type TimelineStoreApi = StoreApi<TimelineStore>;

export const createTimelineStore = (
  params?: ResetTimelineParams,
): TimelineStoreApi => {
  const knownSourceIds = new Set(
    (params?.sources ?? []).map((source) => source.id),
  );
  const replaceKnownSourceIds = (sources: VideoTimelineSource[]) => {
    knownSourceIds.clear();
    sources.forEach((source) => knownSourceIds.add(source.id));
  };

  return createStore<TimelineStore>()(
    (set, get) => ({
      ...createInitialState(params),

    commitClipDrop: ({
      clipId,
      freeStart,
      insertionIndex,
      target,
    }) => {
      const state = get();
      const draggedClip = state.clips.find((clip) => clip.id === clipId);
      if (!draggedClip) {
        return;
      }

      let nextTracks = state.tracks;
      let nextTargetTrackId: string;
      let targetTrack: TimelineTrack | undefined;

      if (target.kind === 'insert') {
        if (draggedClip.type !== target.insert.type) {
          return;
        }

        const inserted = insertTimelineTrack(state.tracks, target.insert);
        nextTracks = inserted.tracks;
        nextTargetTrackId = inserted.track.id;
        targetTrack = inserted.track;
      } else {
        nextTargetTrackId = target.trackId;
        targetTrack = getTrackById(nextTracks, target.trackId);
      }

      if (!canMoveClipToTrack(draggedClip, targetTrack)) {
        return;
      }

      const targetTrackClips = getTrackClips(state.clips, nextTargetTrackId);
      const requestedStart = roundTimelineTime(
        Math.max(0, freeStart ?? draggedClip.start),
      );
      const targetClip = {
        ...draggedClip,
        trackId: nextTargetTrackId,
        zIndex: targetTrackClips.length,
      };
      const insertionLayout = planClipInsertion(
        targetTrackClips,
        targetClip,
        insertionIndex,
        requestedStart,
        shouldCompactMainVideoTrackAfterDrop(nextTargetTrackId),
      );
      const nextTargetClipIds = new Set(
        insertionLayout.clips.map((clip) => clip.id),
      );
      const nextClips = [
        ...state.clips.filter(
          (clip) => clip.id !== clipId && !nextTargetClipIds.has(clip.id),
        ),
        ...insertionLayout.clips,
      ];

      if (
        nextTracks === state.tracks &&
        hasSameClipLayout(state.clips, nextClips)
      ) {
        if (state.selectedClipId !== clipId) set({ selectedClipId: clipId });
        return;
      }

      set(recordClipsChange(state, nextClips, clipId, nextTracks));
    },

    commitClipTrim: ({ clipId, edge, trimEnd, trimStart }) => {
      const state = get();
      const targetClip = state.clips.find((clip) => clip.id === clipId);
      if (!targetClip) return;

      const nextClips = getTrimmedTimelineClips(
        state.clips,
        clipId,
        edge,
        trimStart,
        trimEnd,
      );
      const nextClip = nextClips.find((clip) => clip.id === clipId);
      if (
        !nextClip ||
        (nextClip.duration === targetClip.duration &&
          nextClip.start === targetClip.start &&
          nextClip.trimEnd === targetClip.trimEnd &&
          nextClip.trimStart === targetClip.trimStart)
      ) {
        return;
      }

      const normalizedClips = normalizeTimelineClips(nextClips);
      const duration = getTimelineDuration(normalizedClips);

      set({
        ...recordClipsChange(state, normalizedClips, clipId),
        currentTime: Math.min(state.currentTime, duration),
        isPlaying: state.currentTime <= duration ? state.isPlaying : false,
      });
    },

    restoreClipTrim: (clipId) => {
      const state = get();
      const targetClip = state.clips.find((clip) => clip.id === clipId);
      if (!targetClip) return;

      let nextClips = state.clips;
      let nextClip = targetClip;
      let changed = false;

      const restoreEdge = (
        edge: 'start' | 'end',
        trimStart: number,
        trimEnd: number,
      ) => {
        const candidateClips = getTrimmedTimelineClips(
          nextClips,
          clipId,
          edge,
          trimStart,
          trimEnd,
        );
        const candidateClip = candidateClips.find(
          (clip) => clip.id === clipId,
        );
        if (
          !candidateClip ||
          (candidateClip.duration === nextClip.duration &&
            candidateClip.start === nextClip.start &&
            candidateClip.trimEnd === nextClip.trimEnd &&
            candidateClip.trimStart === nextClip.trimStart)
        ) {
          return;
        }

        changed = true;
        nextClips = candidateClips;
        nextClip = candidateClip;
      };

      restoreEdge('start', 0, nextClip.trimEnd);
      restoreEdge('end', nextClip.trimStart, nextClip.sourceDuration);
      if (!changed) return;

      const normalizedClips = normalizeTimelineClips(nextClips);
      const duration = getTimelineDuration(normalizedClips);

      set({
        ...recordClipsChange(state, normalizedClips, clipId),
        currentTime: Math.min(state.currentTime, duration),
        isPlaying: state.currentTime <= duration ? state.isPlaying : false,
      });
    },

    commitClipTransform: ({ clipId, transform }) => {
      const state = get();
      const targetClip = state.clips.find((clip) => clip.id === clipId);
      if (!targetClip) return;

      const nextTransform = normalizeClipTransform(transform);
      if (
        nextTransform.x === targetClip.transform.x &&
        nextTransform.y === targetClip.transform.y &&
        nextTransform.width === targetClip.transform.width &&
        nextTransform.height === targetClip.transform.height
      ) {
        return;
      }

      const nextClips = state.clips.map((clip) =>
        clip.id === clipId ? { ...clip, transform: nextTransform } : clip,
      );

      set(recordClipsChange(state, nextClips, clipId));
    },

    copySelectedClip: () => {
      const state = get();
      const selectedClip = state.clips.find(
        (clip) => clip.id === state.selectedClipId,
      );
      if (!selectedClip) return;

      set({ copiedClip: cloneClip(selectedClip) });
    },

    createExportPayload: () => {
      const state = get();
      return createCompositionExportPayload(
        state.tracks,
        state.clips,
        state.canvasSize,
      );
    },

    deleteSelectedClip: () => {
      const state = get();
      const selectedClip = state.clips.find(
        (clip) => clip.id === state.selectedClipId,
      );
      if (!selectedClip) return;

      const nextClips = state.clips.filter(
        (clip) => clip.id !== selectedClip.id,
      );
      const duration = getTimelineDuration(nextClips);

      set({
        ...recordClipsChange(state, nextClips, null),
        currentTime: Math.min(state.currentTime, duration),
        isPlaying: state.currentTime <= duration ? state.isPlaying : false,
      });
    },

    pasteCopiedClip: () => {
      const state = get();
      const anchorClip = state.clips.find(
        (clip) => clip.id === state.selectedClipId,
      );
      const copiedClip = state.copiedClip;
      if (!anchorClip || !copiedClip || anchorClip.type !== copiedClip.type) {
        return;
      }

      const { clips, pastedClipId } = createPastedClipLayout(
        state.clips,
        copiedClip,
        anchorClip,
      );
      set(recordClipsChange(state, clips, pastedClipId));
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;

      const nextClips = normalizeTimelineClips(cloneClips(next.clips));
      set({
        clips: nextClips,
        future: state.future.slice(1),
        layoutRevision: state.layoutRevision + 1,
        past: [...state.past, createSnapshot(state)],
        selectedClipId: next.selectedClipId,
        tracks: removeEmptyTimelineTracks(
          cloneTracks(next.tracks),
          nextClips,
        ),
      });
    },

    resetTimeline: (params) => {
      replaceKnownSourceIds(params?.sources ?? []);
      set({
        ...createInitialState(params),
        layoutRevision: get().layoutRevision + 1,
      });
    },

    syncSources: (sources) => {
      const state = get();
      const addMissingSourceIds = new Set(
        sources
          .filter((source) => !knownSourceIds.has(source.id))
          .map((source) => source.id),
      );
      const mergedState = mergeSourcesIntoDraftState(state, sources, {
        addMissingSourceIds,
      });
      const syncSnapshot = (snapshot: TimelineSnapshot): TimelineSnapshot => {
        const snapshotState = mergeSourcesIntoDraftState(
          {
            ...state,
            clips: snapshot.clips,
            selectedClipId: snapshot.selectedClipId,
            tracks: snapshot.tracks,
          },
          sources,
          { addMissingSourceIds: new Set() },
        );

        return snapshotState.clips === snapshot.clips &&
          snapshotState.tracks === snapshot.tracks
          ? snapshot
          : {
              clips: snapshotState.clips,
              selectedClipId: snapshot.selectedClipId,
              tracks: snapshotState.tracks,
            };
      };
      const nextPast = state.past.map(syncSnapshot);
      const nextFuture = state.future.map(syncSnapshot);
      const historyChanged =
        nextPast.some((snapshot, index) => snapshot !== state.past[index]) ||
        nextFuture.some(
          (snapshot, index) => snapshot !== state.future[index],
        );
      sources.forEach((source) => knownSourceIds.add(source.id));
      if (mergedState === state && !historyChanged) return;

      set({
        ...mergedState,
        future: nextFuture,
        layoutRevision:
          mergedState === state
            ? state.layoutRevision
            : state.layoutRevision + 1,
        past: nextPast,
      });
    },

    selectClip: (clipId) => {
      set({ selectedClipId: clipId });
    },

    setCurrentTime: (time) => {
      const duration = getTimelineDuration(get().clips);
      set({
        currentTime: roundTimelineTime(Math.min(Math.max(0, time), duration)),
      });
    },

    setIsPlaying: (isPlaying) => {
      const state = get();
      const duration = getTimelineDuration(state.clips);

      set({
        currentTime:
          isPlaying && state.currentTime >= duration ? 0 : state.currentTime,
        isPlaying,
      });
    },

    setPixelsPerSecond: (pixelsPerSecond) => {
      set({
        pixelsPerSecond: Math.min(
          MAX_PIXELS_PER_SECOND,
          Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond),
        ),
      });
    },

    setTrackVolume: (trackId, volume) => {
      const nextVolume = normalizeTrackVolume(volume);
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, volume: nextVolume } : track,
        ),
      }));
    },

    commitTrackVolume: (trackId, previousVolume, volume) => {
      const state = get();
      const track = state.tracks.find((candidate) => candidate.id === trackId);
      if (!track) return;

      const nextVolume = normalizeTrackVolume(volume);
      const normalizedPreviousVolume = normalizeTrackVolume(previousVolume);
      if (nextVolume === normalizedPreviousVolume) return;

      set({
        future: [],
        past: [
          ...state.past,
          {
            ...createSnapshot(state),
            tracks: state.tracks.map((candidate) =>
              candidate.id === trackId
                ? { ...candidate, volume: normalizedPreviousVolume }
                : { ...candidate },
            ),
          },
        ],
        tracks: state.tracks.map((candidate) =>
          candidate.id === trackId
            ? { ...candidate, volume: nextVolume }
            : candidate,
        ),
      });
    },

    splitAtPlayhead: () => {
      const state = get();
      const clipAtPlayhead = getClipAtTime(
        state.clips,
        state.currentTime,
        state.selectedClipId,
      );

      if (!clipAtPlayhead) return;

      get().splitClipAtTime(clipAtPlayhead.id, state.currentTime);
    },

    splitClipAtTime: (clipId, time) => {
      const state = get();
      const clipAtTime = state.clips.find((clip) => clip.id === clipId);
      const splitTime = roundTimelineTime(time);

      if (
        !clipAtTime ||
        splitTime <= clipAtTime.start ||
        splitTime >= clipAtTime.start + clipAtTime.duration ||
        !canSplitClipAtTime(state.clips, splitTime, clipAtTime.id)
      ) {
        return;
      }

      const splitOffset = roundTimelineTime(splitTime - clipAtTime.start);
      const rightDuration = roundTimelineTime(
        clipAtTime.duration - splitOffset,
      );

      const leftClip: TimelineClip = {
        ...clipAtTime,
        duration: splitOffset,
        trimEnd: roundTimelineTime(clipAtTime.trimStart + splitOffset),
      };
      const rightClip: TimelineClip = {
        ...clipAtTime,
        id: `${clipAtTime.id}-split-${Date.now().toString(36)}`,
        start: splitTime,
        duration: rightDuration,
        trimStart: roundTimelineTime(clipAtTime.trimStart + splitOffset),
        zIndex: clipAtTime.zIndex + 1,
      };
      const nextClips = sortClipsByStart(
        state.clips.flatMap((clip) =>
          clip.id === clipAtTime.id ? [leftClip, rightClip] : [clip],
        ),
      );

      set(recordClipsChange(state, nextClips, rightClip.id));
    },

    toggleCanvasSnapping: () => {
      set((state) => ({
        canvasSnappingEnabled: !state.canvasSnappingEnabled,
      }));
    },

    toggleSnapping: () => {
      set((state) => ({ snappingEnabled: !state.snappingEnabled }));
    },

    toggleTrackMute: (trackId) => {
      const state = get();
      const track = state.tracks.find((candidate) => candidate.id === trackId);
      if (!track) return;

      set({
        future: [],
        past: [...state.past, createSnapshot(state)],
        tracks: state.tracks.map((candidate) =>
          candidate.id === trackId
            ? { ...candidate, volume: candidate.volume === 0 ? 1 : 0 }
            : candidate,
        ),
      });
    },

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;

      const previousClips = normalizeTimelineClips(cloneClips(previous.clips));
      set({
        clips: previousClips,
        future: [createSnapshot(state), ...state.future],
        layoutRevision: state.layoutRevision + 1,
        past: state.past.slice(0, -1),
        selectedClipId: previous.selectedClipId,
        tracks: removeEmptyTimelineTracks(
          cloneTracks(previous.tracks),
          previousClips,
        ),
      });
    },
  }),
  );
};

export const selectTimelineDuration = (state: TimelineState) =>
  getTimelineDuration(state.clips);
