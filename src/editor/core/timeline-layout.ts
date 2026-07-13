import type { TimelineClipType, TimelineTrack } from '../types';

export const TIMELINE_RULER_HEIGHT = 32;
export const TIMELINE_TRACK_HEIGHT = 56;
export const TIMELINE_CLIP_HEIGHT = TIMELINE_TRACK_HEIGHT;
export const TIMELINE_AUDIO_TRACK_HEIGHT = 40;
export const TIMELINE_AUDIO_CLIP_HEIGHT = TIMELINE_AUDIO_TRACK_HEIGHT;
export const TIMELINE_TRACK_HEADER_WIDTH = 96;
export const TIMELINE_CONTENT_PADDING_X = 12;
export const TIMELINE_TRACK_GAP = 4;

export const getTimelineTrackHeight = (track: Pick<TimelineTrack, 'type'>) =>
  track.type === 'audio' ? TIMELINE_AUDIO_TRACK_HEIGHT : TIMELINE_TRACK_HEIGHT;

export const getTimelineClipHeight = (type: TimelineClipType) =>
  type === 'audio' ? TIMELINE_AUDIO_CLIP_HEIGHT : TIMELINE_CLIP_HEIGHT;

export const getTimelineTracksHeight = (
  tracks: Pick<TimelineTrack, 'type'>[],
) =>
  tracks.reduce(
    (height, track, index) =>
      height + getTimelineTrackHeight(track) + (index > 0 ? TIMELINE_TRACK_GAP : 0),
    0,
  );

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
