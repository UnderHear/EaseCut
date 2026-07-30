import type { TimelineTrack } from './model';

export const MAIN_VIDEO_TRACK_ID = 'video-main';
export const DYNAMIC_VIDEO_TRACK_ID_PREFIX = 'video-overlay-';
export const AUDIO_TRACK_ID_PREFIX = 'audio-track-';
export const AUDIO_SOURCE_TRACK_ID_PREFIX = 'audio-source-track-';
export const TEXT_TRACK_ID_PREFIX = 'text-track-';

export type TrackInsertTarget = {
  index: number;
  type: TimelineTrack['type'];
};

export type TrackDropTarget =
  | { kind: 'existing'; trackId: string }
  | { insert: TrackInsertTarget; kind: 'insert' };

export const normalizeTimelineTracks = (tracks: TimelineTrack[]) =>
  [
    ...tracks.filter((track) => track.type === 'video'),
    ...tracks.filter((track) => track.type === 'audio'),
    ...tracks.filter((track) => track.type === 'text'),
  ].map((track, zIndex) => ({
    ...track,
    zIndex,
  }));

const dynamicVideoTrackIdPattern = new RegExp(
  `^${DYNAMIC_VIDEO_TRACK_ID_PREFIX}(\\d+)$`,
);
const dynamicAudioTrackIdPattern = new RegExp(
  `^${AUDIO_TRACK_ID_PREFIX}(\\d+)$`,
);
const dynamicTextTrackIdPattern = new RegExp(
  `^${TEXT_TRACK_ID_PREFIX}(\\d+)$`,
);

export const isDynamicVideoTrack = (track: TimelineTrack) =>
  track.type === 'video' && dynamicVideoTrackIdPattern.test(track.id);

const getDynamicTrackNumber = (track: TimelineTrack) => {
  const pattern =
    track.type === 'video'
      ? dynamicVideoTrackIdPattern
      : track.type === 'audio'
        ? dynamicAudioTrackIdPattern
        : dynamicTextTrackIdPattern;
  const match = pattern.exec(track.id);
  return match ? Number(match[1]) : 0;
};

const getNextDynamicTrackNumber = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
) =>
  tracks.reduce(
    (max, track) =>
      track.type === type
        ? Math.max(max, getDynamicTrackNumber(track))
        : max,
    0,
  ) + 1;

const getNextTrackZIndex = (tracks: TimelineTrack[]) =>
  tracks.reduce((max, track) => Math.max(max, track.zIndex), 0) + 1;

const getNextTextTrackName = (tracks: TimelineTrack[]) =>
  `文字轨 ${tracks.filter((track) => track.type === 'text').length + 1}`;

const createTimelineTrack = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
  id: string,
): TimelineTrack => ({
  id,
  muted: false,
  name:
    type === 'video'
      ? '视频轨'
      : type === 'audio'
        ? '音频轨道'
        : getNextTextTrackName(tracks),
  type,
  zIndex: getNextTrackZIndex(tracks),
});

const createDynamicTrack = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
) =>
  createTimelineTrack(
    tracks,
    type,
    type === 'video'
      ? `${DYNAMIC_VIDEO_TRACK_ID_PREFIX}${getNextDynamicTrackNumber(tracks, type)}`
      : type === 'audio'
        ? `${AUDIO_TRACK_ID_PREFIX}${getNextDynamicTrackNumber(tracks, type)}`
        : `${TEXT_TRACK_ID_PREFIX}${getNextDynamicTrackNumber(tracks, type)}`,
  );

export const getSafeTrackInsertIndex = (
  tracks: TimelineTrack[],
  target: TrackInsertTarget,
) => {
  const videoTrackCount = tracks.filter(
    (track) => track.type === 'video',
  ).length;
  const audioTrackCount = tracks.filter(
    (track) => track.type === 'audio',
  ).length;
  const minimum =
    target.type === 'video'
      ? 0
      : target.type === 'audio'
        ? videoTrackCount
        : videoTrackCount + audioTrackCount;
  const maximum =
    target.type === 'video'
      ? videoTrackCount
      : target.type === 'audio'
        ? videoTrackCount + audioTrackCount
        : tracks.length;

  return Math.min(Math.max(minimum, target.index), maximum);
};

export const insertTimelineTrack = (
  tracks: TimelineTrack[],
  target: TrackInsertTarget,
) => {
  const normalizedTracks = normalizeTimelineTracks(tracks);
  const insertIndex = getSafeTrackInsertIndex(normalizedTracks, target);
  const createdTrack = createDynamicTrack(normalizedTracks, target.type);
  const nextTracks = normalizeTimelineTracks([
    ...normalizedTracks.slice(0, insertIndex),
    createdTrack,
    ...normalizedTracks.slice(insertIndex),
  ]);
  const track = nextTracks.find(({ id }) => id === createdTrack.id);

  if (!track) {
    throw new Error(`Failed to insert timeline track ${createdTrack.id}`);
  }

  return { track, tracks: nextTracks };
};
