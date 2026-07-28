import { createStore, type StoreApi } from 'zustand/vanilla';

import { createCompositionSnapshot } from '../core/composition';
import { createCompositionExportPayload } from '../core/export-schema';
import {
  changeClipSpeed,
  createDefaultClipTransform,
  deleteClip,
  findClipAtTime,
  MIN_CLIP_DURATION_US,
  moveClip,
  normalizeClipVolume,
  normalizeClipTransform,
  normalizeTimelineClips,
  pasteClip,
  removeEmptyTimelineTracks,
  restoreClipTrim,
  splitClip,
  transformClip,
  trimClip,
  type MoveClipParams,
  type ChangeClipSpeedParams,
  type TimelineEdit,
  type TimelineEditResult,
  type TrimClipParams,
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
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  AUDIO_TRACK_ID_PREFIX,
  DYNAMIC_VIDEO_TRACK_ID_PREFIX,
  MAIN_VIDEO_TRACK_ID,
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
  TimelineClipTransform,
  TimelineSnapshot,
  TimelineTrack,
  VideoTimelineDraft,
  VideoTimelineSource,
} from '../types';

export const VIDEO_TIMELINE_DRAFT_SCHEMA_VERSION = 7;
export const DEFAULT_COMPOSITION_CANVAS_SIZE: TimelineCanvasSize = {
  height: 720,
  width: 1280,
};
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
export type CommitClipTrimParams = TrimClipParams;
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
  currentTimeUs: number;
  future: TimelineSnapshot[];
  isPlaying: boolean;
  layoutRevision: number;
  past: TimelineSnapshot[];
  pixelsPerSecond: number;
  selectedClipId: string | null;
  snappingEnabled: boolean;
  tracks: TimelineTrack[];
};

export type TimelineDraftSource = Pick<
  TimelineState,
  'canvasSize' | 'clips' | 'tracks'
>;

export type TimelineActions = {
  commitClipDrop: (params: CommitClipDropParams) => void;
  commitClipSpeed: (params: CommitClipSpeedParams) => void;
  commitClipTransform: (params: CommitClipTransformParams) => void;
  commitClipTrim: (params: CommitClipTrimParams) => void;
  commitClipVolume: (
    clipId: string,
    previousVolume: number,
    volume: number,
  ) => void;
  copySelectedClip: () => void;
  createExportPayload: () => CompositionExportPayload;
  deleteSelectedClip: () => void;
  pasteCopiedClip: () => void;
  redo: () => void;
  resetTimeline: (params?: ResetTimelineParams) => void;
  restoreClipTrim: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
  setCurrentTimeUs: (timeUs: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPixelsPerSecond: (pixelsPerSecond: number) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  splitAtPlayhead: () => void;
  splitClipAtTime: (clipId: string, timeUs: number) => void;
  syncSources: (sources: VideoTimelineSource[]) => void;
  toggleCanvasSnapping: () => void;
  toggleSnapping: () => void;
  toggleTrackMute: (trackId: string) => void;
  undo: () => void;
};

export type TimelineStore = TimelineState & TimelineActions;
export type TimelineStoreApi = StoreApi<TimelineStore>;

const cloneClip = (clip: TimelineClip): TimelineClip => ({
  ...clip,
  transform: { ...clip.transform },
});
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

const getCanvasSize = (sources: readonly VideoTimelineSource[]) => {
  const source = sources
    .filter(
      (candidate) =>
        candidate.type === 'video' &&
        hasSourceDimensions(candidate) &&
        candidate.width / candidate.height === 16 / 9,
    )
    .sort(
      (left, right) =>
        (right.width ?? 0) * (right.height ?? 0) -
        (left.width ?? 0) * (left.height ?? 0),
    )[0];
  return source && hasSourceDimensions(source)
    ? { height: source.height, width: source.width }
    : { ...DEFAULT_COMPOSITION_CANVAS_SIZE };
};

const createSourceTransform = (
  source: VideoTimelineSource,
  canvasSize: TimelineCanvasSize,
) => {
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

const audioTrackId = (sourceId: string) =>
  `${AUDIO_SOURCE_TRACK_ID_PREFIX}${sourceId}`;

const createTrackForSource = (
  source: VideoTimelineSource,
  zIndex: number,
): TimelineTrack => ({
  id: source.type === 'video' ? MAIN_VIDEO_TRACK_ID : audioTrackId(source.id),
  muted: false,
  name: source.type === 'video' ? '视频轨' : source.fileName,
  type: source.type,
  zIndex,
});

export const createTimelineClipsFromSources = (
  sources: readonly VideoTimelineSource[],
  canvasSize: TimelineCanvasSize,
) => {
  let videoCursorUs = 0;
  return sources.map((source) => {
    const durationUs = getSourceDurationUs(source);
    const clip: TimelineClip = {
      durationUs,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceDurationUs: durationUs,
      sourceId: source.id,
      speed: DEFAULT_CLIP_SPEED,
      src: source.src,
      startUs: source.type === 'video' ? videoCursorUs : 0,
      trackId:
        source.type === 'video' ? MAIN_VIDEO_TRACK_ID : audioTrackId(source.id),
      transform: createSourceTransform(source, canvasSize),
      trimEndUs: durationUs,
      trimStartUs: 0,
      type: source.type,
      volume: 1,
      ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
      zIndex: 0,
    };
    if (source.type === 'video') videoCursorUs += durationUs;
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
  canvasSize: TimelineCanvasSize,
  clips: TimelineClip[],
  tracks: TimelineTrack[],
): TimelineState => ({
  canvasSnappingEnabled: true,
  canvasSize,
  clips,
  copiedClip: null,
  currentTimeUs: 0,
  future: [],
  isPlaying: false,
  layoutRevision: 0,
  past: [],
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
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
    const state = createBaseState(
      { ...snapshot.canvasSize },
      normalizeTimelineClips(cloneClips(snapshot.clips)),
      removeEmptyTimelineTracks(
        cloneTracks(snapshot.tracks),
        cloneClips(snapshot.clips),
      ),
    );
    const sourceIds = new Set(state.clips.map((clip) => clip.sourceId));
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
  const canvasSize = getCanvasSize(sources);
  return createBaseState(
    canvasSize,
    normalizeTimelineClips(createTimelineClipsFromSources(sources, canvasSize)),
    sources.length > 0 ? createTracksFromSources(sources) : cloneTracks(defaultTracks),
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
  clips: cloneClips(state.clips),
  selectedClipId: state.selectedClipId,
  tracks: cloneTracks(state.tracks),
});

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
    tracks: result.tracks,
  };
};

function mergeSources(
  state: TimelineState,
  sources: readonly VideoTimelineSource[],
  newSourceIds: ReadonlySet<string>,
): TimelineEditResult {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const durationChanges: Array<{
    clipId: string;
    deltaUs: number;
    oldEndUs: number;
    trackId: string;
  }> = [];
  const mergedExistingClips = state.clips.map((clip) => {
    const source = sourceById.get(clip.sourceId);
    if (!source || source.type !== clip.type) return clip;
    const durationUs = getSourceDurationUs(source);
    const resolvedClipDurationUs = getSpeedAdjustedDurationUs(
      0,
      durationUs,
      clip.speed,
    );
    const shouldFitSource =
      source.type === 'video' &&
      hasSourceDimensions(source) &&
      clip.transform.height === state.canvasSize.height &&
      clip.transform.width === state.canvasSize.width &&
      clip.transform.x === 0 &&
      clip.transform.y === 0;
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
    clips.push({
      durationUs,
      id: `clip-${source.id}`,
      name: source.fileName,
      sourceDurationUs: durationUs,
      sourceId: source.id,
      speed: DEFAULT_CLIP_SPEED,
      src: source.src,
      startUs: source.type === 'video' ? videoCursorUs : 0,
      trackId: track.id,
      transform: createSourceTransform(source, state.canvasSize),
      trimEndUs: durationUs,
      trimStartUs: 0,
      type: source.type,
      volume: 1,
      ...(source.waveformSrc ? { waveformSrc: source.waveformSrc } : {}),
      zIndex: 0,
    });
    if (source.type === 'video') videoCursorUs += durationUs;
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

export const createTimelineStore = (
  params?: ResetTimelineParams,
): TimelineStoreApi => {
  const knownSourceIds = new Set(
    (params?.sources ?? []).map((source) => source.id),
  );

  return createStore<TimelineStore>()((set, get) => {
    const commit = (result: TimelineEditResult) => {
      const next = applyEdit(get(), result);
      if (next) set(next);
    };

    return {
      ...createInitialState(params),

      commitClipDrop: (command) => commit(moveClip(asEdit(get()), command)),

      commitClipSpeed: (command) =>
        commit(changeClipSpeed(asEdit(get()), command)),

      commitClipTransform: ({ clipId, transform }) =>
        commit(
          transformClip(
            asEdit(get()),
            clipId,
            normalizeClipTransform(transform),
          ),
        ),

      commitClipTrim: (command) => commit(trimClip(asEdit(get()), command)),

      commitClipVolume: (clipId, previousVolume, volume) => {
        const state = get();
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
                clip.id === clipId ? { ...clip, volume: previous } : clip,
              ),
            },
          ],
          clips: state.clips.map((clip) =>
            clip.id === clipId ? { ...clip, volume: nextVolume } : clip,
          ),
        });
      },

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
          clips: cloneClips(next.clips),
          future: state.future.slice(1),
          layoutRevision: state.layoutRevision + 1,
          past: [...state.past, createSnapshot(state)],
          selectedClipId: next.selectedClipId,
          tracks: cloneTracks(next.tracks),
        });
      },

      resetTimeline: (nextParams) => {
        knownSourceIds.clear();
        for (const source of nextParams?.sources ?? []) {
          knownSourceIds.add(source.id);
        }
        set({
          ...createInitialState(nextParams),
          layoutRevision: get().layoutRevision + 1,
        });
      },

      restoreClipTrim: (clipId) =>
        commit(restoreClipTrim(asEdit(get()), clipId)),

      selectClip: (selectedClipId) => set({ selectedClipId }),

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
            clip.id === clipId
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

      syncSources: (sources) => {
        const state = get();
        const newSourceIds = new Set(
          sources
            .filter((source) => !knownSourceIds.has(source.id))
            .map((source) => source.id),
        );
        const result = mergeSources(state, sources, newSourceIds);
        for (const source of sources) knownSourceIds.add(source.id);
        if (!result.changed) return;
        set({
          clips: result.clips,
          layoutRevision: state.layoutRevision + 1,
          tracks: result.tracks,
        });
      },

      toggleCanvasSnapping: () =>
        set((state) => ({
          canvasSnappingEnabled: !state.canvasSnappingEnabled,
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
          clips: cloneClips(previous.clips),
          future: [createSnapshot(state), ...state.future],
          layoutRevision: state.layoutRevision + 1,
          past: state.past.slice(0, -1),
          selectedClipId: previous.selectedClipId,
          tracks: cloneTracks(previous.tracks),
        });
      },
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
    (clip) => !tracksById.get(clip.trackId)?.muted && clip.volume > 0,
  );
};
