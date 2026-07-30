import type {
  TimelineCanvasSize,
  TimelineClip,
  TimelineMediaClip,
  TimelineClipTransform,
  TimelineProject,
  TimelineTextClip,
  TimelineTrack,
} from './model';
import {
  isTimelineMediaClip,
  isTimelineTextClip,
} from './model';
import {
  getSpeedAdjustedDurationUs,
  isValidClipSpeed,
  timelineTimeToClipSourceTimeUs,
} from './clip-speed';
import { normalizeTimelineTracks } from './timeline-tracks';
import { isValidTimeUs } from './time';
import { isTimelineTextFontType } from './text-fonts';

export type CompositionSnapshotInput = Readonly<{
  canvasSize: TimelineCanvasSize;
  clips: readonly TimelineClip[];
  schemaVersion?: TimelineProject['schemaVersion'];
  tracks: readonly TimelineTrack[];
}>;

export type CompositionSnapshot = Readonly<{
  canvasSize: TimelineCanvasSize;
  clips: readonly TimelineClip[];
  schemaVersion: 8;
  tracks: readonly TimelineTrack[];
}>;

export type CompositionVideoGap = Readonly<{
  endUs: number;
  startUs: number;
}>;

export type CompositionMediaLayer = Readonly<{
  clip: TimelineMediaClip;
  sourceTimeUs: number;
  track: TimelineTrack;
  transform: TimelineClipTransform;
  volume: number;
}>;

export type CompositionTextLayer = Readonly<{
  clip: TimelineTextClip;
  track: TimelineTrack;
  transform: TimelineClipTransform;
}>;

export type CompositionEvaluation = Readonly<{
  audioLayers: readonly CompositionMediaLayer[];
  textLayers: readonly CompositionTextLayer[];
  timeUs: number;
  videoLayers: readonly CompositionMediaLayer[];
}>;

const isPositiveFinite = (value: number) =>
  Number.isFinite(value) && value > 0;

const validateTrack = (track: TimelineTrack) => {
  if (
    !track.id ||
    (track.type === 'audio' ? track.name !== '音频轨道' : !track.name) ||
    !['video', 'audio', 'text'].includes(track.type) ||
    !Number.isInteger(track.zIndex) ||
    typeof track.muted !== 'boolean'
  ) {
    throw new TypeError(`轨道 ${track.id || '<unknown>'} 无效`);
  }
};

const validateClip = (
  clip: TimelineClip,
  tracksById: ReadonlyMap<string, TimelineTrack>,
) => {
  const track = tracksById.get(clip.trackId);
  if (!clip.id || !track) {
    throw new TypeError(`片段 ${clip.id || '<unknown>'} 的引用无效`);
  }
  if (track.type !== clip.type) {
    throw new TypeError(`片段 ${clip.id} 与轨道类型不一致`);
  }
  if (
    !isValidTimeUs(clip.startUs) ||
    !isValidTimeUs(clip.durationUs) ||
    clip.durationUs === 0
  ) {
    throw new RangeError(`片段 ${clip.id} 的时间范围无效`);
  }
  if (
    isTimelineMediaClip(clip) &&
    (
      !clip.sourceId ||
      !clip.src ||
      !isValidTimeUs(clip.sourceDurationUs) ||
      clip.sourceDurationUs === 0 ||
      !isValidTimeUs(clip.trimStartUs) ||
      !isValidTimeUs(clip.trimEndUs) ||
      clip.trimEndUs > clip.sourceDurationUs ||
      !isValidClipSpeed(clip.speed) ||
      getSpeedAdjustedDurationUs(
        clip.trimStartUs,
        clip.trimEndUs,
        clip.speed,
      ) !== clip.durationUs
    )
  ) {
    throw new RangeError(`片段 ${clip.id} 的媒体时间范围无效`);
  }
  if (
    isTimelineTextClip(clip) &&
    (
      clip.text.trim() === '' ||
      !isTimelineTextFontType(clip.fontType) ||
      'sourceId' in clip ||
      'src' in clip ||
      'trimStartUs' in clip ||
      'trimEndUs' in clip ||
      'speed' in clip ||
      'volume' in clip ||
      !Number.isInteger(clip.fontSize) ||
      clip.fontSize <= 0 ||
      !/^#[\dA-F]{8}$/i.test(clip.fontColor) ||
      ![0, 1, 2].includes(clip.alignType)
    )
  ) {
    throw new TypeError(`文字片段 ${clip.id} 的文字属性无效`);
  }
  if (
    !Number.isInteger(clip.zIndex) ||
    (isTimelineMediaClip(clip) &&
      (
        !Number.isFinite(clip.volume) ||
        clip.volume < 0 ||
        clip.volume > 1
      )) ||
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
  if (input.schemaVersion !== undefined && input.schemaVersion !== 8) {
    throw new RangeError(`不支持的草稿版本：${input.schemaVersion}`);
  }
  if (
    !isPositiveFinite(input.canvasSize.height) ||
    !isPositiveFinite(input.canvasSize.width) ||
    input.tracks.length === 0
  ) {
    throw new TypeError('项目画布或轨道无效');
  }

  const trackIds = new Set<string>();
  for (const track of input.tracks) {
    validateTrack(track);
    if (trackIds.has(track.id)) {
      throw new TypeError(`轨道 ID 重复：${track.id}`);
    }
    trackIds.add(track.id);
  }
  const tracks = normalizeTimelineTracks(input.tracks);
  const tracksById = new Map(tracks.map((track) => [track.id, track]));

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
    schemaVersion: 8,
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
  const videoLayers: CompositionMediaLayer[] = [];
  const audioLayers: CompositionMediaLayer[] = [];
  const textLayers: CompositionTextLayer[] = [];

  for (const clip of getCompositionActiveClips(snapshot, timeUs)) {
    const track = tracksById.get(clip.trackId);
    if (!track) continue;
    if (clip.type === 'text') {
      textLayers.push({
        clip,
        track,
        transform: clip.transform,
      });
      continue;
    }
    const layer = {
      clip,
      sourceTimeUs: timelineTimeToClipSourceTimeUs(clip, timeUs),
      track,
      transform: clip.transform,
      volume: track.muted ? 0 : clip.volume,
    };
    if (clip.type === 'video') videoLayers.push(layer);
    if (!track.muted && clip.volume > 0) audioLayers.push(layer);
  }

  return { audioLayers, textLayers, timeUs, videoLayers };
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
