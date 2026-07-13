import type {
  TimelineTrack,
  TimelineTrackVolume,
} from '../types';

export const MAIN_VIDEO_TRACK_ID = 'video-main';
export const DYNAMIC_VIDEO_TRACK_ID_PREFIX = 'video-overlay-';
export const AUDIO_TRACK_ID_PREFIX = 'audio-track-';
export const AUDIO_SOURCE_TRACK_ID_PREFIX = 'audio-source-track-';
export const NEW_VIDEO_TRACK_DROP_ID = '__new-video-track-drop__';
export const NEW_AUDIO_TRACK_DROP_ID = '__new-audio-track-drop__';

export type TrackInsertTarget = {
  index: number;
  type: TimelineTrack['type'];
};

export type PendingTimelineTrack = TrackInsertTarget;

export const normalizeTrackVolume = (volume: number): TimelineTrackVolume =>
  Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100;

export const normalizeTimelineTracks = (tracks: TimelineTrack[]) =>
  [
    ...tracks.filter((track) => track.type === 'video'),
    ...tracks.filter((track) => track.type === 'audio'),
  ].map((track, zIndex) => ({
    ...track,
    volume: normalizeTrackVolume(track.volume),
    zIndex,
  }));

const dynamicVideoTrackIdPattern = new RegExp(
  `^${DYNAMIC_VIDEO_TRACK_ID_PREFIX}(\\d+)$`,
);
const dynamicAudioTrackIdPattern = new RegExp(
  `^${AUDIO_TRACK_ID_PREFIX}(\\d+)$`,
);

export const isDynamicVideoTrack = (track: TimelineTrack) =>
  track.type === 'video' && dynamicVideoTrackIdPattern.test(track.id);

const getDynamicTrackNumber = (track: TimelineTrack) => {
  const pattern =
    track.type === 'video'
      ? dynamicVideoTrackIdPattern
      : dynamicAudioTrackIdPattern;
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

const getNextAudioTrackName = (tracks: TimelineTrack[]) =>
  `音频轨 ${tracks.filter((track) => track.type === 'audio').length + 1}`;

const createTimelineTrack = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
  id: string,
): TimelineTrack => ({
  id,
  name: type === 'video' ? '视频轨' : getNextAudioTrackName(tracks),
  type,
  volume: 1,
  zIndex: getNextTrackZIndex(tracks),
});

export const createPendingTrack = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
): TimelineTrack =>
  createTimelineTrack(
    tracks,
    type,
    type === 'video' ? NEW_VIDEO_TRACK_DROP_ID : NEW_AUDIO_TRACK_DROP_ID,
  );

const createDynamicTrack = (
  tracks: TimelineTrack[],
  type: TimelineTrack['type'],
) =>
  createTimelineTrack(
    tracks,
    type,
    type === 'video'
      ? `${DYNAMIC_VIDEO_TRACK_ID_PREFIX}${getNextDynamicTrackNumber(tracks, type)}`
      : `${AUDIO_TRACK_ID_PREFIX}${getNextDynamicTrackNumber(tracks, type)}`,
  );

export const getSafeTrackInsertIndex = (
  tracks: TimelineTrack[],
  target: TrackInsertTarget,
) => {
  const videoTrackCount = tracks.filter(
    (track) => track.type === 'video',
  ).length;
  const minimum = target.type === 'video' ? 0 : videoTrackCount;
  const maximum =
    target.type === 'video' ? videoTrackCount : tracks.length;

  return Math.min(Math.max(minimum, target.index), maximum);
};

export const getVisibleTimelineTracks = (
  tracks: TimelineTrack[],
  pendingTrack: PendingTimelineTrack | null,
) => {
  if (pendingTrack === null) {
    return tracks;
  }

  const normalizedTracks = normalizeTimelineTracks(tracks);
  const insertIndex = getSafeTrackInsertIndex(
    normalizedTracks,
    pendingTrack,
  );
  return normalizeTimelineTracks([
    ...normalizedTracks.slice(0, insertIndex),
    createPendingTrack(normalizedTracks, pendingTrack.type),
    ...normalizedTracks.slice(insertIndex),
  ]);
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
