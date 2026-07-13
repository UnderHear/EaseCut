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

export type TimelineTrackLayout<
  T extends Pick<TimelineTrack, 'type'> = Pick<TimelineTrack, 'type'>,
> = {
  bottom: number;
  height: number;
  hitTop: number;
  index: number;
  top: number;
  track: T;
};

export type TimelineTrackGap<
  T extends Pick<TimelineTrack, 'type'> = Pick<TimelineTrack, 'type'>,
> = {
  afterTrack: T;
  beforeTrack: T;
  bottom: number;
  index: number;
  top: number;
};

export const getTimelineTrackLayouts = <
  T extends Pick<TimelineTrack, 'type'>,
>(
  tracks: readonly T[],
): TimelineTrackLayout<T>[] => {
  let top = TIMELINE_RULER_HEIGHT;

  return tracks.map((track, index) => {
    const height = getTimelineTrackHeight(track);
    const bottom = top + height;
    const layout = {
      bottom,
      height,
      hitTop: index === 0 ? top : top - TIMELINE_TRACK_GAP,
      index,
      top,
      track,
    };

    top = bottom + TIMELINE_TRACK_GAP;
    return layout;
  });
};

export const getTimelineTracksHeight = (
  tracks: Pick<TimelineTrack, 'type'>[],
) => {
  const lastTrack = getTimelineTrackLayouts(tracks).at(-1);
  return lastTrack ? lastTrack.bottom - TIMELINE_RULER_HEIGHT : 0;
};

export const getTimelineTrackGapAtY = <
  T extends Pick<TimelineTrack, 'type'>,
>(
  tracks: readonly T[],
  y: number,
): TimelineTrackGap<T> | null => {
  const layout = getTimelineTrackLayouts(tracks).find(
    ({ index, top }) =>
      index > 0 && y >= top - TIMELINE_TRACK_GAP && y < top,
  );
  const beforeTrack = layout ? tracks[layout.index - 1] : undefined;

  if (!layout || !beforeTrack) return null;

  return {
    afterTrack: layout.track,
    beforeTrack,
    bottom: layout.top,
    index: layout.index,
    top: layout.top - TIMELINE_TRACK_GAP,
  };
};

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
