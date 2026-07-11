import type { TimelineClipType, TimelineTrack } from '../types';

export const TIMELINE_RULER_HEIGHT = 32;
export const TIMELINE_TRACK_HEIGHT = 66;
export const TIMELINE_CLIP_HEIGHT = 64;
export const TIMELINE_AUDIO_TRACK_HEIGHT = 44;
export const TIMELINE_AUDIO_CLIP_HEIGHT = TIMELINE_AUDIO_TRACK_HEIGHT - 2;
export const TIMELINE_TRACK_HEADER_WIDTH = 104;

export const getTimelineTrackHeight = (track: Pick<TimelineTrack, 'type'>) =>
  track.type === 'audio' ? TIMELINE_AUDIO_TRACK_HEIGHT : TIMELINE_TRACK_HEIGHT;

export const getTimelineClipHeight = (type: TimelineClipType) =>
  type === 'audio' ? TIMELINE_AUDIO_CLIP_HEIGHT : TIMELINE_CLIP_HEIGHT;

export const getTimelineTracksHeight = (
  tracks: Pick<TimelineTrack, 'type'>[],
) =>
  tracks.reduce((height, track) => height + getTimelineTrackHeight(track), 0);

export const getTimelineTrackY = (
  tracks: Pick<TimelineTrack, 'type'>[],
  trackIndex: number,
) =>
  TIMELINE_RULER_HEIGHT + getTimelineTracksHeight(tracks.slice(0, trackIndex));

export const getTimelineClipY = (
  tracks: Pick<TimelineTrack, 'type'>[],
  trackIndex: number,
) => {
  const track = tracks[trackIndex];
  if (!track) return TIMELINE_RULER_HEIGHT;

  return (
    getTimelineTrackY(tracks, trackIndex) +
    (getTimelineTrackHeight(track) - getTimelineClipHeight(track.type)) / 2
  );
};
