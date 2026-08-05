import { createStore, type StoreApi } from 'zustand/vanilla';

import { createCompositionSnapshot } from '../core/composition';
import {
  areCanvasSizesEqual,
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  findCanvasSelection,
  findOriginalCanvasSize,
  getCanvasSizeForSelection,
  resizeClipsForCanvas,
} from '../core/canvas-size';
import { createCompositionExportPayload } from '../core/export-schema';
import {
  addMediaClip,
  addTextClip,
  changeClipHidden,
  changeTextClipProperties,
  changeTextClipTiming,
  changeClipSpeed,
  createDefaultClipTransform,
  deleteClip,
  findClipAtTime,
  MIN_CLIP_DURATION_US,
  moveClip,
  moveClipPosition,
  normalizeClipVolume,
  normalizeClipTransform,
  normalizeTimelineClips,
  pasteClip,
  removeEmptyTimelineTracks,
  restoreClipTrim,
  splitClip,
  transformMediaClip,
  trimClip,
  updateTimelineClip,
  type AddMediaClipParams,
  type AddTextClipParams,
  type MoveClipParams,
  type ChangeTextClipPropertiesParams,
  type ChangeTextClipTimingParams,
  type ChangeClipSpeedParams,
  type ChangeClipHiddenParams,
  type TimelineEdit,
  type TimelineEditResult,
  type TrimClipParams,
  type UpdateTimelineClipParams,
} from '../core/timeline-commands';
import {
  DEFAULT_CLIP_SPEED,
  getSpeedAdjustedDurationUs,
} from '../core/clip-speed';
import {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  MAIN_VIDEO_TRACK_ID,
  normalizeTimelineTracks,
} from '../core/timeline-tracks';
export {
  COMPOSITION_CANVAS_PRESETS,
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  getOriginalCanvasSize,
  type CompositionCanvasPreset,
  type CompositionCanvasSelection,
} from '../core/canvas-size';
export {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  AUDIO_TRACK_ID_PREFIX,
  DYNAMIC_VIDEO_TRACK_ID_PREFIX,
  MAIN_VIDEO_TRACK_ID,
  TEXT_TRACK_ID_PREFIX,
  isDynamicVideoTrack,
  normalizeTimelineTracks,
  type TrackDropTarget,
  type TrackInsertTarget,
} from '../core/timeline-tracks';
export {
  canSplitClipAtTime,
  createDefaultClipTransform,
  getTrimmedClip,
  getTrimmedTimelineClips,
  MIN_CLIP_TRANSFORM_SIZE,
  normalizeClipVolume,
  normalizeClipTransform,
  normalizeTimelineClips,
} from '../core/timeline-commands';
import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  normalizeTimelineTimeUs,
} from '../core/timeline-math';
import { isValidTimeUs, secondsToMicroseconds } from '../core/time';
import type {
  CompositionExportPayload,
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipPosition,
  TimelineTimedMediaClip,
  TimelineTextClip,
  TimelineClipTransform,
  TimelineSnapshot,
  TimelineTrack,
  VideoTimelineDraft,
  VideoTimelineSource,
} from '../types';
import {
  isTimelineMediaClip,
  isTimelineTextClip,
  isTimelineTimedMediaClip,
  isTimelineVisualMediaClip,
  type TimelineCanvasSelection,
} from '../core/model';

export const VIDEO_TIMELINE_DRAFT_SCHEMA_VERSION = 12;
export const DEFAULT_VIDEO_SOURCE_DURATION_US = secondsToMicroseconds(5);
export const MIN_SPLIT_CLIP_DURATION_US = MIN_CLIP_DURATION_US;

const defaultTracks: TimelineTrack[] = [{
  id: MAIN_VIDEO_TRACK_ID,
  muted: false,
  name: '视频轨',
  type: 'video',
  zIndex: 0,
}];

export type CommitClipDropParams = MoveClipParams;
export type CommitClipSpeedParams = ChangeClipSpeedParams;
export type CommitClipHiddenParams = ChangeClipHiddenParams;
export type CommitClipTrimParams = TrimClipParams;
export type AddTextClipCommand = Pick<
  AddTextClipParams,
  'layoutSize' | 'startUs' | 'text'
>;
export type AddMediaClipCommand = Omit<AddMediaClipParams, 'canvasSize'>;
export type CommitClipPositionParams = {
  clipId: string;
  position: TimelineClipPosition;
};
export type CommitMediaClipTransformParams = {
  clipId: string;
  transform: TimelineClipTransform;
};
export type TimelineContinuousEdit = {
  clipId: string;
  kind: 'text-style';
  phase: 'active' | 'awaiting-change';
  preview: {
    fontColor: string;
  };
  token: number;
};

export type ResetTimelineParams = {
  draft?: VideoTimelineDraft;
  sources?: VideoTimelineSource[];
};

export type TimelineState = {
  canvasSnappingEnabled: boolean;
  canvasSelection: TimelineCanvasSelection | null;
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  continuousEdit: TimelineContinuousEdit | null;
  copiedClip: TimelineClip | null;
  currentTimeUs: number;
  future: TimelineSnapshot[];
  isPlaying: boolean;
  layoutRevision: number;
  originalCanvasSize: TimelineCanvasSize | null;
  past: TimelineSnapshot[];
  pixelsPerSecond: number;
  playheadFollowEnabled: boolean;
  selectedClipId: string | null;
  snappingEnabled: boolean;
  tracks: TimelineTrack[];
};

export type TimelineDraftSource = Pick<
  TimelineState,
  'canvasSize' | 'clips' | 'tracks'
>;

export type TimelineActions = {
  addMediaClip: (params: AddMediaClipCommand) => string | null;
  addTextClip: (params: AddTextClipCommand) => string | null;
  beginTextStyleEdit: (clipId: string) => number | null;
  cancelTextStyleEdit: (clipId: string, token?: number) => void;
  commitCanvasSize: (selection: TimelineCanvasSelection) => void;
  commitClipDrop: (params: CommitClipDropParams) => void;
  commitClipPosition: (params: CommitClipPositionParams) => void;
  commitClipSpeed: (params: CommitClipSpeedParams) => void;
  commitMediaClipTransform: (params: CommitMediaClipTransformParams) => void;
  commitClipTrim: (params: CommitClipTrimParams) => void;
  commitClipVolume: (
    clipId: string,
    previousVolume: number,
    volume: number,
  ) => void;
  commitTextClipProperties: (
    params: ChangeTextClipPropertiesParams,
  ) => void;
  commitTextStyleEdit: (
    clipId: string,
    token: number,
    fontColor: string,
  ) => void;
  commitTextClipTiming: (params: ChangeTextClipTimingParams) => void;
  copySelectedClip: () => void;
  createExportPayload: () => CompositionExportPayload;
  deleteSelectedClip: () => void;
  discardSourceFromHistory: (sourceId: string) => void;
  pasteCopiedClip: () => void;
  previewTextStyleEdit: (
    clipId: string,
    token: number,
    fontColor: string,
  ) => void;
  redo: () => void;
  refreshSources: (sources: VideoTimelineSource[]) => void;
  removeClip: (clipId: string) => boolean;
  resetTimeline: (params?: ResetTimelineParams) => void;
  restoreClipTrim: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
  setCurrentTimeUs: (timeUs: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPixelsPerSecond: (pixelsPerSecond: number) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  setClipHidden: (clipId: string, hidden: boolean) => void;
  splitAtPlayhead: () => void;
  splitClipAtTime: (clipId: string, timeUs: number) => void;
  suspendTextStyleEdit: (clipId: string, token: number) => void;
  toggleCanvasSnapping: () => void;
  togglePlayheadFollow: () => void;
  toggleSnapping: () => void;
  toggleTrackMute: (trackId: string) => void;
  undo: () => void;
  updateClip: (params: UpdateTimelineClipParams) => boolean;
};

export type TimelineStore = TimelineState & TimelineActions;
export type TimelineStoreApi = StoreApi<TimelineStore>;

const cloneClip = (clip: TimelineClip): TimelineClip =>
  isTimelineTextClip(clip)
    ? {
        ...clip,
        layoutSize: { ...clip.layoutSize },
        position: { ...clip.position },
      }
    : { ...clip, transform: { ...clip.transform } };
const cloneClips = (clips: readonly TimelineClip[]) => clips.map(cloneClip);
const cloneTracks = (tracks: readonly TimelineTrack[]) =>
  tracks.map((track) => ({ ...track }));

const hasSourceDimensions = (
  source: VideoTimelineSource,
): source is VideoTimelineSource & Required<Pick<VideoTimelineSource, 'height' | 'width'>> =>
  typeof source.height === 'number' &&
  source.height > 0 &&
  typeof source.width === 'number' &&
  source.width > 0;

const getSourceDurationUs = (source: VideoTimelineSource) => {
  if (source.durationUs === undefined) {
    return DEFAULT_VIDEO_SOURCE_DURATION_US;
  }
  if (!isValidTimeUs(source.durationUs) || source.durationUs === 0) {
    throw new RangeError(`素材 ${source.id} 的 durationUs 必须是正安全整数`);
  }
  return source.durationUs;
};

const createSourceTransform = (
  source: VideoTimelineSource,
  canvasSize: TimelineCanvasSize,
) => {
  if (source.type === 'audio' || !hasSourceDimensions(source)) {
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

const audioTrackId = (sourceId: string) =>
  `${AUDIO_SOURCE_TRACK_ID_PREFIX}${sourceId}`;

const createTrackForSource = (
  source: VideoTimelineSource,
  zIndex: number,
): TimelineTrack => ({
  id: source.type === 'audio' ? audioTrackId(source.id) : MAIN_VIDEO_TRACK_ID,
  muted: false,
  name: source.type === 'audio' ? '音频轨道' : '视频轨',
  type: source.type === 'audio' ? 'audio' : 'video',
  zIndex,
});

export const createTimelineClipsFromSources = (
  sources: readonly VideoTimelineSource[],
  canvasSize: TimelineCanvasSize,
) => {
  let videoCursorUs = 0;
  return sources.map((source) => {
    const durationUs = getSourceDurationUs(source);
    const base = {
      durationUs,
      hidden: false,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceId: source.id,
      src: source.src,
      startUs: source.type === 'audio' ? 0 : videoCursorUs,
      trackId:
        source.type === 'audio' ? audioTrackId(source.id) : MAIN_VIDEO_TRACK_ID,
      transform: createSourceTransform(source, canvasSize),
      zIndex: 0,
    };
    const clip: TimelineClip = source.type === 'image'
      ? { ...base, type: 'image' }
      : {
          ...base,
          sourceDurationUs: durationUs,
          speed: DEFAULT_CLIP_SPEED,
          trimEndUs: durationUs,
          trimStartUs: 0,
          type: source.type,
          volume: 1,
          ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
        };
    if (source.type !== 'audio') videoCursorUs += durationUs;
    return clip;
  });
};

const createTracksFromSources = (
  sources: readonly VideoTimelineSource[],
) => {
  const tracks = [{ ...defaultTracks[0] }];
  for (const source of sources) {
    if (source.type === 'audio') {
      tracks.push(createTrackForSource(source, tracks.length));
    }
  }
  return normalizeTimelineTracks(tracks);
};

const createBaseState = (
  canvasSelection: TimelineCanvasSelection | null,
  canvasSize: TimelineCanvasSize,
  clips: TimelineClip[],
  originalCanvasSize: TimelineCanvasSize | null,
  tracks: TimelineTrack[],
): TimelineState => ({
  canvasSnappingEnabled: true,
  canvasSelection,
  canvasSize,
  clips,
  continuousEdit: null,
  copiedClip: null,
  currentTimeUs: 0,
  future: [],
  isPlaying: false,
  layoutRevision: 0,
  originalCanvasSize,
  past: [],
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  playheadFollowEnabled: true,
  selectedClipId: null,
  snappingEnabled: true,
  tracks,
});

const createInitialState = (params?: ResetTimelineParams): TimelineState => {
  if (params?.draft) {
    let snapshot;
    try {
      snapshot = createCompositionSnapshot(params.draft);
    } catch (error) {
      if (
        error instanceof RangeError &&
        error.message.startsWith('不支持的草稿版本')
      ) {
        throw error;
      }
      throw new TypeError('草稿结构无效，无法打开项目', { cause: error });
    }
    const originalCanvasSize = findOriginalCanvasSize(params.sources ?? []);
    const state = createBaseState(
      findCanvasSelection(snapshot.canvasSize, originalCanvasSize),
      { ...snapshot.canvasSize },
      normalizeTimelineClips(cloneClips(snapshot.clips)),
      originalCanvasSize,
      removeEmptyTimelineTracks(
        cloneTracks(snapshot.tracks),
        cloneClips(snapshot.clips),
      ),
    );
    const sourceIds = new Set(
      state.clips.flatMap((clip) =>
        isTimelineMediaClip(clip) ? [clip.sourceId] : [],
      ),
    );
    const merged = mergeSources(
      state,
      params.sources ?? [],
      new Set(
        (params.sources ?? [])
          .filter((source) => !sourceIds.has(source.id))
          .map((source) => source.id),
      ),
    );
    return merged.changed
      ? { ...state, clips: merged.clips, tracks: merged.tracks }
      : state;
  }

  const sources = params?.sources ?? [];
  const originalCanvasSize = findOriginalCanvasSize(sources);
  const canvasSize =
    originalCanvasSize ?? { ...DEFAULT_COMPOSITION_CANVAS_SIZE };
  return createBaseState(
    'original',
    canvasSize,
    normalizeTimelineClips(createTimelineClipsFromSources(sources, canvasSize)),
    originalCanvasSize,
    sources.length > 0
      ? createTracksFromSources(sources)
      : cloneTracks(defaultTracks),
  );
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
  canvasSelection: state.canvasSelection,
  canvasSize: { ...state.canvasSize },
  clips: cloneClips(state.clips),
  selectedClipId: state.selectedClipId,
  tracks: cloneTracks(state.tracks),
});

const resizeOriginalCanvasSnapshot = (
  snapshot: TimelineSnapshot,
  originalCanvasSize: TimelineCanvasSize | null,
): TimelineSnapshot => {
  const canvasSelection =
    snapshot.canvasSelection ??
    findCanvasSelection(snapshot.canvasSize, originalCanvasSize);
  if (canvasSelection !== 'original') return snapshot;
  const canvasSize = getCanvasSizeForSelection(
    canvasSelection,
    originalCanvasSize,
  );
  if (
    snapshot.canvasSelection === canvasSelection &&
    areCanvasSizesEqual(snapshot.canvasSize, canvasSize)
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    canvasSelection,
    canvasSize: { ...canvasSize },
    clips: resizeClipsForCanvas(
      snapshot.clips,
      snapshot.canvasSize,
      canvasSize,
    ),
  };
};

const areOptionalCanvasSizesEqual = (
  left: TimelineCanvasSize | null,
  right: TimelineCanvasSize | null,
) =>
  left === null
    ? right === null
    : right !== null && areCanvasSizesEqual(left, right);

const asEdit = (state: TimelineState): TimelineEdit => ({
  clips: state.clips,
  selectedClipId: state.selectedClipId,
  tracks: state.tracks,
});

const applyEdit = (
  state: TimelineState,
  result: TimelineEditResult,
): Partial<TimelineState> | null => {
  if (!result.changed) return null;
  const durationUs = selectTimelineDuration(result);
  return {
    clips: result.clips,
    currentTimeUs: Math.min(state.currentTimeUs, durationUs),
    future: [],
    isPlaying: state.isPlaying && state.currentTimeUs <= durationUs,
    layoutRevision: state.layoutRevision + 1,
    past: [...state.past, createSnapshot(state)],
    selectedClipId: result.selectedClipId,
    continuousEdit: null,
    tracks: result.tracks,
  };
};

const normalizeTextClipFontColor = (fontColor: string) => {
  const normalized = fontColor.toUpperCase();
  return /^#[\dA-F]{8}$/.test(normalized) ? normalized : null;
};

type TimelineSourceMergeState = TimelineEdit & {
  canvasSize: TimelineCanvasSize;
};

function mergeSources(
  state: TimelineSourceMergeState,
  sources: readonly VideoTimelineSource[],
  newSourceIds: ReadonlySet<string>,
  autoFitClipIds: ReadonlySet<string> = new Set(),
): TimelineEditResult {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const durationChanges: Array<{
    clipId: string;
    deltaUs: number;
    oldEndUs: number;
    trackId: string;
  }> = [];
  const mergedExistingClips = state.clips.map((clip) => {
    if (!isTimelineMediaClip(clip)) return clip;
    const source = sourceById.get(clip.sourceId);
    if (!source || source.type !== clip.type) return clip;
    const shouldFitSource =
      source.type !== 'audio' &&
      hasSourceDimensions(source) &&
      (autoFitClipIds.has(clip.id) ||
        (clip.transform.height === state.canvasSize.height &&
          clip.transform.width === state.canvasSize.width &&
          clip.transform.x === 0 &&
          clip.transform.y === 0));
    if (clip.type === 'image') {
      return source.type === 'image'
        ? {
            ...clip,
            name: source.fileName,
            src: source.src,
            ...(shouldFitSource
              ? { transform: createSourceTransform(source, state.canvasSize) }
              : {}),
          }
        : clip;
    }
    if (source.type === 'image') return clip;
    const durationUs = getSourceDurationUs(source);
    const resolvedClipDurationUs = getSpeedAdjustedDurationUs(
      0,
      durationUs,
      clip.speed,
    );
    const isUntouchedFallback =
      clip.sourceDurationUs === DEFAULT_VIDEO_SOURCE_DURATION_US &&
      clip.durationUs ===
        getSpeedAdjustedDurationUs(
          0,
          DEFAULT_VIDEO_SOURCE_DURATION_US,
          clip.speed,
        ) &&
      clip.trimStartUs === 0 &&
      clip.trimEndUs === DEFAULT_VIDEO_SOURCE_DURATION_US;
    if (
      isUntouchedFallback &&
      resolvedClipDurationUs !== clip.durationUs
    ) {
      durationChanges.push({
        clipId: clip.id,
        deltaUs: resolvedClipDurationUs - clip.durationUs,
        oldEndUs: clip.startUs + clip.durationUs,
        trackId: clip.trackId,
      });
    }
    const next = {
      ...clip,
      name: source.fileName,
      src: source.src,
      ...(source.waveformSrc
        ? { waveformSrc: source.waveformSrc }
        : { waveformSrc: undefined }),
      ...(isUntouchedFallback
        ? {
            durationUs: resolvedClipDurationUs,
            sourceDurationUs: durationUs,
            trimEndUs: durationUs,
          }
        : { sourceDurationUs: Math.max(durationUs, clip.trimEndUs) }),
      ...(shouldFitSource
        ? { transform: createSourceTransform(source, state.canvasSize) }
        : {}),
    };
    return next;
  });
  const clips = mergedExistingClips.map((clip, index) => {
    const original = state.clips[index];
    if (!original) return clip;
    const shiftUs = durationChanges.reduce(
      (shift, change) =>
        change.clipId !== original.id &&
        change.trackId === original.trackId &&
        original.startUs >= change.oldEndUs
          ? shift + change.deltaUs
          : shift,
      0,
    );
    return shiftUs === 0
      ? clip
      : { ...clip, startUs: clip.startUs + shiftUs };
  });
  let changed = clips.some(
    (clip, index) => JSON.stringify(clip) !== JSON.stringify(state.clips[index]),
  );
  const tracks = [...state.tracks];
  let videoCursorUs = clips
    .filter((clip) => clip.trackId === MAIN_VIDEO_TRACK_ID)
    .reduce(
      (endUs, clip) => Math.max(endUs, clip.startUs + clip.durationUs),
      0,
    );

  for (const source of sources) {
    if (!newSourceIds.has(source.id)) continue;
    const durationUs = getSourceDurationUs(source);
    const track = createTrackForSource(source, tracks.length);
    if (!tracks.some((candidate) => candidate.id === track.id)) {
      tracks.push(track);
    }
    const base = {
      durationUs,
      hidden: false,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceId: source.id,
      src: source.src,
      startUs: source.type === 'audio' ? 0 : videoCursorUs,
      trackId: track.id,
      transform: createSourceTransform(source, state.canvasSize),
      zIndex: 0,
    };
    clips.push(
      source.type === 'image'
        ? { ...base, type: 'image' }
        : {
            ...base,
            sourceDurationUs: durationUs,
            speed: DEFAULT_CLIP_SPEED,
            trimEndUs: durationUs,
            trimStartUs: 0,
            type: source.type,
            volume: 1,
            ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
          },
    );
    if (source.type !== 'audio') videoCursorUs += durationUs;
    changed = true;
  }

  return changed
    ? {
        changed: true,
        clips: normalizeTimelineClips(clips),
        selectedClipId: state.selectedClipId,
        tracks: normalizeTimelineTracks(tracks),
      }
    : { changed: false };
}

const getReferencedSources = (
  clips: readonly TimelineClip[],
  sources: readonly VideoTimelineSource[],
) => {
  const referencedSourceIds = new Set(
    clips.flatMap((clip) =>
      isTimelineMediaClip(clip) ? [clip.sourceId] : [],
    ),
  );
  return sources.filter((source) => referencedSourceIds.has(source.id));
};

const getAutoFitClipIds = (
  clips: readonly TimelineClip[],
  canvasSize: TimelineCanvasSize,
  sources: readonly VideoTimelineSource[],
) => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return new Set(
    clips.flatMap((clip) => {
      if (!isTimelineVisualMediaClip(clip)) return [];
      const source = sourceById.get(clip.sourceId);
      if (!source || source.type === 'audio') return [];
      const autoTransform = createSourceTransform(source, canvasSize);
      const isAutoTransform =
        (clip.transform.height === canvasSize.height &&
          clip.transform.width === canvasSize.width &&
          clip.transform.x === 0 &&
          clip.transform.y === 0) ||
        (clip.transform.height === autoTransform.height &&
          clip.transform.width === autoTransform.width &&
          clip.transform.x === autoTransform.x &&
          clip.transform.y === autoTransform.y);
      return isAutoTransform ? [clip.id] : [];
    }),
  );
};

const refreshTimelineSnapshotSources = (
  snapshot: TimelineSnapshot,
  sources: readonly VideoTimelineSource[],
): TimelineSnapshot => {
  const referencedSources = getReferencedSources(snapshot.clips, sources);
  const result = mergeSources(
    snapshot,
    referencedSources,
    new Set(),
    getAutoFitClipIds(
      snapshot.clips,
      snapshot.canvasSize,
      referencedSources,
    ),
  );
  return result.changed
    ? {
        ...snapshot,
        clips: result.clips,
        selectedClipId: result.selectedClipId,
        tracks: result.tracks,
      }
    : snapshot;
};

const refreshCopiedClipSource = (
  copiedClip: TimelineClip | null,
  canvasSize: TimelineCanvasSize,
  sources: readonly VideoTimelineSource[],
) => {
  if (!copiedClip || !isTimelineMediaClip(copiedClip)) return copiedClip;
  const source = sources.find((candidate) => candidate.id === copiedClip.sourceId);
  if (!source || source.type !== copiedClip.type) return copiedClip;
  const result = mergeSources(
    {
      canvasSize,
      clips: [copiedClip],
      selectedClipId: copiedClip.id,
      tracks: [],
    },
    [source],
    new Set(),
    getAutoFitClipIds([copiedClip], canvasSize, [source]),
  );
  const refreshedClip = result.changed ? result.clips[0] : undefined;
  return refreshedClip
    ? {
        ...refreshedClip,
        startUs: copiedClip.startUs,
        trackId: copiedClip.trackId,
        zIndex: copiedClip.zIndex,
      }
    : copiedClip;
};

const discardSourceFromSnapshot = (
  snapshot: TimelineSnapshot,
  sourceId: string,
): TimelineSnapshot => {
  const clips = snapshot.clips.filter(
    (clip) => !isTimelineMediaClip(clip) || clip.sourceId !== sourceId,
  );
  if (clips.length === snapshot.clips.length) return snapshot;
  return {
    ...snapshot,
    clips,
    selectedClipId: clips.some((clip) => clip.id === snapshot.selectedClipId)
      ? snapshot.selectedClipId
      : null,
    tracks: removeEmptyTimelineTracks(snapshot.tracks, clips),
  };
};

export const createTimelineStore = (
  params?: ResetTimelineParams,
): TimelineStoreApi => {
  let nextContinuousEditToken = 1;
  const initialState = createInitialState(params);

  return createStore<TimelineStore>()((set, get) => {
    const commit = (result: TimelineEditResult) => {
      const next = applyEdit(get(), result);
      if (!next) return false;
      set(next);
      return true;
    };

    return {
      ...initialState,

      addMediaClip: ({ source, startUs, trackId }) => {
        const state = get();
        const changed = commit(
          addMediaClip(asEdit(state), {
            canvasSize: state.canvasSize,
            source,
            startUs,
            ...(trackId ? { trackId } : {}),
          }),
        );
        return changed ? get().selectedClipId : null;
      },

      addTextClip: ({ layoutSize, startUs, text }) => {
        const state = get();
        const changed = commit(
          addTextClip(asEdit(state), {
            canvasSize: state.canvasSize,
            layoutSize,
            startUs,
            text,
          }),
        );
        return changed ? get().selectedClipId : null;
      },

      beginTextStyleEdit: (clipId) => {
        const state = get();
        const clip = state.clips.find(
          (candidate): candidate is TimelineTextClip =>
            candidate.id === clipId && isTimelineTextClip(candidate),
        );
        if (!clip) return null;
        if (
          state.continuousEdit?.kind === 'text-style' &&
          state.continuousEdit.clipId === clipId
        ) {
          if (state.continuousEdit.phase === 'awaiting-change') {
            set({
              continuousEdit: {
                ...state.continuousEdit,
                phase: 'active',
                preview: { fontColor: clip.fontColor },
              },
            });
          }
          return state.continuousEdit.token;
        }
        const token = nextContinuousEditToken;
        nextContinuousEditToken += 1;
        set({
          continuousEdit: {
            clipId,
            kind: 'text-style',
            phase: 'active',
            preview: { fontColor: clip.fontColor },
            token,
          },
        });
        return token;
      },

      cancelTextStyleEdit: (clipId, token) => {
        const continuousEdit = get().continuousEdit;
        if (
          continuousEdit?.kind === 'text-style' &&
          continuousEdit.clipId === clipId &&
          (token === undefined || continuousEdit.token === token)
        ) {
          set({ continuousEdit: null });
        }
      },

      commitCanvasSize: (canvasSelection) => {
        const state = get();
        const resolvedCanvasSize = getCanvasSizeForSelection(
          canvasSelection,
          state.originalCanvasSize,
        );
        const canvasSizeChanged = !areCanvasSizesEqual(
          state.canvasSize,
          resolvedCanvasSize,
        );
        if (!canvasSizeChanged && state.canvasSelection === canvasSelection) {
          return;
        }

        const nextCanvasSize = { ...resolvedCanvasSize };
        set({
          canvasSelection,
          ...(canvasSizeChanged
            ? {
                canvasSize: nextCanvasSize,
                clips: resizeClipsForCanvas(
                  state.clips,
                  state.canvasSize,
                  nextCanvasSize,
                ),
                layoutRevision: state.layoutRevision + 1,
              }
            : {}),
          continuousEdit: null,
          future: [],
          past: [...state.past, createSnapshot(state)],
        });
      },

      commitClipDrop: (command) => commit(moveClip(asEdit(get()), command)),

      commitClipPosition: (command) =>
        commit(moveClipPosition(asEdit(get()), command)),

      commitClipSpeed: (command) =>
        commit(changeClipSpeed(asEdit(get()), command)),

      commitMediaClipTransform: ({ clipId, transform }) =>
        commit(
          transformMediaClip(
            asEdit(get()),
            clipId,
            normalizeClipTransform(transform),
          ),
        ),

      commitClipTrim: (command) => commit(trimClip(asEdit(get()), command)),

      commitClipVolume: (clipId, previousVolume, volume) => {
        const state = get();
        const target = state.clips.find(
          (clip): clip is TimelineTimedMediaClip =>
            clip.id === clipId && isTimelineTimedMediaClip(clip),
        );
        if (!target) return;
        const nextVolume = normalizeClipVolume(volume);
        const previous = normalizeClipVolume(previousVolume);
        if (nextVolume === previous) return;
        set({
          future: [],
          past: [
            ...state.past,
            {
              ...createSnapshot(state),
              clips: state.clips.map((clip) =>
                clip.id === clipId && isTimelineTimedMediaClip(clip)
                  ? { ...clip, volume: previous }
                  : clip,
              ),
            },
          ],
          clips: state.clips.map((clip) =>
            clip.id === clipId && isTimelineTimedMediaClip(clip)
              ? { ...clip, volume: nextVolume }
              : clip,
          ),
        });
      },

      commitTextClipProperties: (params) =>
        commit(changeTextClipProperties(asEdit(get()), params)),

      commitTextStyleEdit: (clipId, token, fontColor) => {
        const state = get();
        if (
          state.continuousEdit?.kind !== 'text-style' ||
          state.continuousEdit.clipId !== clipId ||
          state.continuousEdit.token !== token
        ) {
          return;
        }
        const normalized = normalizeTextClipFontColor(fontColor);
        if (!normalized) {
          if (state.continuousEdit?.clipId === clipId) {
            set({ continuousEdit: null });
          }
          return;
        }
        const next = applyEdit(
          state,
          changeTextClipProperties(asEdit(state), {
            clipId,
            fontColor: normalized,
          }),
        );
        if (next) {
          set(next);
          return;
        }
        if (state.continuousEdit?.clipId === clipId) {
          set({ continuousEdit: null });
        }
      },

      commitTextClipTiming: (params) =>
        commit(changeTextClipTiming(asEdit(get()), params)),

      copySelectedClip: () => {
        const state = get();
        const clip = state.clips.find(
          (candidate) => candidate.id === state.selectedClipId,
        );
        if (clip) set({ copiedClip: cloneClip(clip) });
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
        if (state.selectedClipId) {
          commit(deleteClip(asEdit(state), state.selectedClipId));
        }
      },

      pasteCopiedClip: () => {
        const state = get();
        if (state.copiedClip && state.selectedClipId) {
          commit(
            pasteClip(
              asEdit(state),
              state.copiedClip,
              state.selectedClipId,
            ),
          );
        }
      },

      redo: () => {
        const state = get();
        const next = state.future[0];
        if (!next) return;
        set({
          canvasSelection: next.canvasSelection,
          canvasSize: { ...next.canvasSize },
          clips: cloneClips(next.clips),
          future: state.future.slice(1),
          layoutRevision: state.layoutRevision + 1,
          past: [...state.past, createSnapshot(state)],
          selectedClipId: next.selectedClipId,
          continuousEdit: null,
          tracks: cloneTracks(next.tracks),
        });
      },

      discardSourceFromHistory: (sourceId) => {
        const state = get();
        const future = state.future.map((snapshot) =>
          discardSourceFromSnapshot(snapshot, sourceId),
        );
        const past = state.past.map((snapshot) =>
          discardSourceFromSnapshot(snapshot, sourceId),
        );
        const copiedClip =
          state.copiedClip &&
          isTimelineMediaClip(state.copiedClip) &&
          state.copiedClip.sourceId === sourceId
            ? null
            : state.copiedClip;
        const futureChanged = future.some(
          (snapshot, index) => snapshot !== state.future[index],
        );
        const pastChanged = past.some(
          (snapshot, index) => snapshot !== state.past[index],
        );
        if (!futureChanged && !pastChanged && copiedClip === state.copiedClip) {
          return;
        }
        set({
          copiedClip,
          ...(futureChanged ? { future } : {}),
          ...(pastChanged ? { past } : {}),
        });
      },

      previewTextStyleEdit: (clipId, token, fontColor) => {
        const state = get();
        const continuousEdit = state.continuousEdit;
        const normalized = normalizeTextClipFontColor(fontColor);
        if (
          continuousEdit?.kind !== 'text-style' ||
          continuousEdit.clipId !== clipId ||
          continuousEdit.token !== token ||
          !normalized ||
          (continuousEdit.phase === 'active' &&
            continuousEdit.preview.fontColor === normalized)
        ) {
          return;
        }
        set({
          continuousEdit: {
            ...continuousEdit,
            phase: 'active',
            preview: { fontColor: normalized },
          },
        });
      },

      refreshSources: (sources) => {
        const state = get();
        const referencedSources = getReferencedSources(state.clips, sources);
        const autoFitClipIds = getAutoFitClipIds(
          state.clips,
          state.canvasSize,
          referencedSources,
        );
        const originalCanvasSize = findOriginalCanvasSize(referencedSources);
        const originalCanvasSizeChanged = !areOptionalCanvasSizesEqual(
          state.originalCanvasSize,
          originalCanvasSize,
        );
        const canvasSelection =
          state.canvasSelection ??
          findCanvasSelection(state.canvasSize, originalCanvasSize);
        const canvasSelectionChanged = canvasSelection !== state.canvasSelection;
        const resolvedCanvasSize =
          canvasSelection === 'original'
            ? getCanvasSizeForSelection(canvasSelection, originalCanvasSize)
            : state.canvasSize;
        const canvasSizeChanged = !areCanvasSizesEqual(
          state.canvasSize,
          resolvedCanvasSize,
        );
        const nextCanvasSize = canvasSizeChanged
          ? { ...resolvedCanvasSize }
          : state.canvasSize;
        const resizedClips = canvasSizeChanged
          ? resizeClipsForCanvas(state.clips, state.canvasSize, nextCanvasSize)
          : state.clips;
        const result = mergeSources(
          canvasSizeChanged
            ? {
                ...state,
                canvasSize: nextCanvasSize,
                clips: resizedClips,
              }
            : state,
          referencedSources,
          new Set(),
          autoFitClipIds,
        );
        const resizedFuture = originalCanvasSizeChanged
          ? state.future.map((snapshot) =>
              resizeOriginalCanvasSnapshot(snapshot, originalCanvasSize),
            )
          : state.future;
        const resizedPast = originalCanvasSizeChanged
          ? state.past.map((snapshot) =>
              resizeOriginalCanvasSnapshot(snapshot, originalCanvasSize),
            )
          : state.past;
        const future = resizedFuture.map((snapshot) =>
          refreshTimelineSnapshotSources(snapshot, sources),
        );
        const past = resizedPast.map((snapshot) =>
          refreshTimelineSnapshotSources(snapshot, sources),
        );
        const copiedClip = refreshCopiedClipSource(
          state.copiedClip,
          nextCanvasSize,
          sources,
        );
        const futureChanged = future.some(
          (snapshot, index) => snapshot !== state.future[index],
        );
        const pastChanged = past.some(
          (snapshot, index) => snapshot !== state.past[index],
        );
        const copiedClipChanged = copiedClip !== state.copiedClip;
        if (
          !result.changed &&
          !canvasSizeChanged &&
          !canvasSelectionChanged &&
          !originalCanvasSizeChanged &&
          !futureChanged &&
          !pastChanged &&
          !copiedClipChanged
        ) {
          return;
        }
        set({
          ...(canvasSelectionChanged ? { canvasSelection } : {}),
          ...(copiedClipChanged ? { copiedClip } : {}),
          ...(futureChanged ? { future } : {}),
          ...(pastChanged ? { past } : {}),
          ...(result.changed || canvasSizeChanged
            ? {
                canvasSize: nextCanvasSize,
                clips: result.changed ? result.clips : resizedClips,
                layoutRevision: state.layoutRevision + 1,
                tracks: result.changed ? result.tracks : state.tracks,
              }
            : {}),
          originalCanvasSize,
        });
      },

      removeClip: (clipId) => commit(deleteClip(asEdit(get()), clipId)),

      resetTimeline: (nextParams) => {
        const nextState = createInitialState(nextParams);
        set({
          ...nextState,
          layoutRevision: get().layoutRevision + 1,
        });
      },

      restoreClipTrim: (clipId) =>
        commit(restoreClipTrim(asEdit(get()), clipId)),

      selectClip: (selectedClipId) =>
        set((state) => ({
          selectedClipId,
          continuousEdit:
            state.continuousEdit?.clipId === selectedClipId
              ? state.continuousEdit
              : null,
        })),

      setCurrentTimeUs: (timeUs) =>
        set({
          currentTimeUs: normalizeTimelineTimeUs(
            Math.min(
              Math.max(0, timeUs),
              selectTimelineDuration(get()),
            ),
          ),
        }),

      setIsPlaying: (isPlaying) => {
        const state = get();
        const durationUs = selectTimelineDuration(state);
        set({
          currentTimeUs:
            isPlaying && state.currentTimeUs >= durationUs
              ? 0
              : state.currentTimeUs,
          isPlaying,
        });
      },

      setPixelsPerSecond: (pixelsPerSecond) =>
        set({
          pixelsPerSecond: Math.min(
            MAX_PIXELS_PER_SECOND,
            Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond),
          ),
        }),

      setClipVolume: (clipId, volume) =>
        set((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === clipId && isTimelineTimedMediaClip(clip)
              ? { ...clip, volume: normalizeClipVolume(volume) }
              : clip,
          ),
        })),

      splitAtPlayhead: () => {
        const state = get();
        const clip = findClipAtTime(
          state.clips,
          state.currentTimeUs,
          state.selectedClipId,
        );
        if (clip) commit(splitClip(asEdit(state), clip.id, state.currentTimeUs));
      },

      splitClipAtTime: (clipId, timeUs) =>
        commit(
          splitClip(
            asEdit(get()),
            clipId,
            normalizeTimelineTimeUs(timeUs),
          ),
        ),

      suspendTextStyleEdit: (clipId, token) => {
        const state = get();
        const continuousEdit = state.continuousEdit;
        if (
          continuousEdit?.kind !== 'text-style' ||
          continuousEdit.clipId !== clipId ||
          continuousEdit.token !== token ||
          continuousEdit.phase === 'awaiting-change'
        ) {
          return;
        }
        set({
          continuousEdit: {
            ...continuousEdit,
            phase: 'awaiting-change',
          },
        });
      },

      toggleCanvasSnapping: () =>
        set((state) => ({
          canvasSnappingEnabled: !state.canvasSnappingEnabled,
        })),

      setClipHidden: (clipId, hidden) =>
        commit(changeClipHidden(asEdit(get()), { clipId, hidden })),

      togglePlayheadFollow: () =>
        set((state) => ({
          playheadFollowEnabled: !state.playheadFollowEnabled,
        })),

      toggleSnapping: () =>
        set((state) => ({ snappingEnabled: !state.snappingEnabled })),

      toggleTrackMute: (trackId) => {
        const state = get();
        if (!state.tracks.some((track) => track.id === trackId)) return;
        set({
          future: [],
          past: [...state.past, createSnapshot(state)],
          tracks: state.tracks.map((track) =>
            track.id === trackId ? { ...track, muted: !track.muted } : track,
          ),
        });
      },

      undo: () => {
        const state = get();
        const previous = state.past.at(-1);
        if (!previous) return;
        set({
          canvasSelection: previous.canvasSelection,
          canvasSize: { ...previous.canvasSize },
          clips: cloneClips(previous.clips),
          future: [createSnapshot(state), ...state.future],
          layoutRevision: state.layoutRevision + 1,
          past: state.past.slice(0, -1),
          selectedClipId: previous.selectedClipId,
          continuousEdit: null,
          tracks: cloneTracks(previous.tracks),
        });
      },

      updateClip: (params) =>
        commit(updateTimelineClip(asEdit(get()), params)),
    };
  });
};

export const selectTimelineDuration = (
  state: Pick<TimelineState, 'clips'>,
) =>
  state.clips.reduce(
    (durationUs, clip) =>
      Math.max(durationUs, clip.startUs + clip.durationUs),
    0,
  );

export const selectHasAudibleMedia = (
  state: Pick<TimelineState, 'clips' | 'tracks'>,
) => {
  const tracksById = new Map(state.tracks.map((track) => [track.id, track]));
  return state.clips.some(
    (clip) =>
      isTimelineTimedMediaClip(clip) &&
      !tracksById.get(clip.trackId)?.muted &&
      clip.volume > 0,
  );
};
