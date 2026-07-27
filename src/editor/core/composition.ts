import type {
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipTransform,
  TimelineProject,
  TimelineTrack,
} from './model';
import { isValidTimeUs } from './time';

export type CompositionSnapshotInput = Readonly<{
  canvasSize: TimelineCanvasSize;
  clips: readonly TimelineClip[];
  schemaVersion?: TimelineProject['schemaVersion'];
  tracks: readonly TimelineTrack[];
}>;

export type CompositionSnapshot = Readonly<{
  canvasSize: TimelineCanvasSize;
  clips: readonly TimelineClip[];
  schemaVersion: 5;
  tracks: readonly TimelineTrack[];
}>;

export type CompositionVideoGap = Readonly<{
  endUs: number;
  startUs: number;
}>;

export type CompositionLayer = Readonly<{
  clip: TimelineClip;
  sourceTimeUs: number;
  track: TimelineTrack;
  transform: TimelineClipTransform;
  volume: number;
}>;

export type CompositionEvaluation = Readonly<{
  audioLayers: readonly CompositionLayer[];
  timeUs: number;
  videoLayers: readonly CompositionLayer[];
}>;

const isPositiveFinite = (value: number) =>
  Number.isFinite(value) && value > 0;

const validateTrack = (track: TimelineTrack) => {
  if (
    !track.id ||
    !track.name ||
    !Number.isInteger(track.zIndex) ||
    !Number.isFinite(track.volume) ||
    track.volume < 0 ||
    track.volume > 1
  ) {
    throw new TypeError(`轨道 ${track.id || '<unknown>'} 无效`);
  }
};

const validateClip = (
  clip: TimelineClip,
  tracksById: ReadonlyMap<string, TimelineTrack>,
) => {
  const track = tracksById.get(clip.trackId);
  if (!clip.id || !clip.sourceId || !clip.src || !track) {
    throw new TypeError(`片段 ${clip.id || '<unknown>'} 的引用无效`);
  }
  if (track.type !== clip.type) {
    throw new TypeError(`片段 ${clip.id} 与轨道类型不一致`);
  }
  if (
    !isValidTimeUs(clip.startUs) ||
    !isValidTimeUs(clip.durationUs) ||
    clip.durationUs === 0 ||
    !isValidTimeUs(clip.sourceDurationUs) ||
    clip.sourceDurationUs === 0 ||
    !isValidTimeUs(clip.trimStartUs) ||
    !isValidTimeUs(clip.trimEndUs) ||
    clip.trimEndUs > clip.sourceDurationUs ||
    clip.trimEndUs - clip.trimStartUs !== clip.durationUs
  ) {
    throw new RangeError(`片段 ${clip.id} 的时间范围无效`);
  }
  if (
    !Number.isInteger(clip.zIndex) ||
    ![
      clip.transform.height,
      clip.transform.width,
      clip.transform.x,
      clip.transform.y,
    ].every(Number.isFinite) ||
    !isPositiveFinite(clip.transform.height) ||
    !isPositiveFinite(clip.transform.width)
  ) {
    throw new RangeError(`片段 ${clip.id} 的布局无效`);
  }
};

export const createCompositionSnapshot = (
  input: CompositionSnapshotInput,
): CompositionSnapshot => {
  if (input.schemaVersion !== undefined && input.schemaVersion !== 5) {
    throw new RangeError(`不支持的草稿版本：${input.schemaVersion}`);
  }
  if (
    !isPositiveFinite(input.canvasSize.height) ||
    !isPositiveFinite(input.canvasSize.width) ||
    input.tracks.length === 0
  ) {
    throw new TypeError('项目画布或轨道无效');
  }

  const tracks = [...input.tracks].sort(
    (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id),
  );
  const tracksById = new Map<string, TimelineTrack>();
  for (const track of tracks) {
    validateTrack(track);
    if (tracksById.has(track.id)) {
      throw new TypeError(`轨道 ID 重复：${track.id}`);
    }
    tracksById.set(track.id, track);
  }

  const clipIds = new Set<string>();
  const clips = [...input.clips];
  for (const clip of clips) {
    validateClip(clip, tracksById);
    if (clipIds.has(clip.id)) {
      throw new TypeError(`片段 ID 重复：${clip.id}`);
    }
    clipIds.add(clip.id);
  }

  clips.sort(
    (left, right) =>
      (tracksById.get(left.trackId)?.zIndex ?? 0) -
        (tracksById.get(right.trackId)?.zIndex ?? 0) ||
      left.startUs - right.startUs ||
      left.zIndex - right.zIndex ||
      left.id.localeCompare(right.id),
  );

  return {
    canvasSize: { ...input.canvasSize },
    clips,
    schemaVersion: 5,
    tracks,
  };
};

export const getCompositionTrackClips = (
  snapshot: CompositionSnapshot,
  trackId: string,
) => snapshot.clips.filter((clip) => clip.trackId === trackId);

export const getCompositionActiveClips = (
  snapshot: CompositionSnapshot,
  timeUs: number,
) => {
  if (!isValidTimeUs(timeUs)) {
    throw new RangeError('timeUs 必须是非负安全整数');
  }
  return snapshot.clips.filter(
    (clip) =>
      timeUs >= clip.startUs && timeUs < clip.startUs + clip.durationUs,
  );
};

export const evaluateCompositionAt = (
  snapshot: CompositionSnapshot,
  timeUs: number,
): CompositionEvaluation => {
  if (!isValidTimeUs(timeUs)) {
    throw new RangeError('timeUs 必须是非负安全整数');
  }

  const tracksById = new Map(snapshot.tracks.map((track) => [track.id, track]));
  const videoLayers: CompositionLayer[] = [];
  const audioLayers: CompositionLayer[] = [];

  for (const clip of getCompositionActiveClips(snapshot, timeUs)) {
    const track = tracksById.get(clip.trackId);
    if (!track) continue;
    const layer = {
      clip,
      sourceTimeUs: clip.trimStartUs + timeUs - clip.startUs,
      track,
      transform: clip.transform,
      volume: track.volume,
    };
    if (clip.type === 'video') videoLayers.push(layer);
    if (track.volume > 0) audioLayers.push(layer);
  }

  return { audioLayers, timeUs, videoLayers };
};

export const getCompositionVideoGaps = (
  snapshot: CompositionSnapshot,
): readonly CompositionVideoGap[] => {
  const ranges = snapshot.clips
    .filter((clip) => clip.type === 'video')
    .map((clip) => ({
      endUs: clip.startUs + clip.durationUs,
      startUs: clip.startUs,
    }))
    .sort((left, right) => left.startUs - right.startUs);
  const gaps: CompositionVideoGap[] = [];
  let coveredUntilUs = 0;

  for (const range of ranges) {
    if (range.startUs > coveredUntilUs) {
      gaps.push({ endUs: range.startUs, startUs: coveredUntilUs });
    }
    coveredUntilUs = Math.max(coveredUntilUs, range.endUs);
  }

  return gaps;
};
