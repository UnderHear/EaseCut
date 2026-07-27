import type { TrackInsertTarget } from './timeline-tracks';
import type { TimelineClipType, TimelineTrack } from './model';

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
  index: number;
  top: number;
  track: T;
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

export const getTimelineTrackY = (
  tracks: Pick<TimelineTrack, 'type'>[],
  trackIndex: number,
) => {
  const layouts = getTimelineTrackLayouts(tracks);
  const layout = layouts[trackIndex];
  if (layout) return layout.top;

  const lastLayout = layouts.at(-1);
  return lastLayout
    ? lastLayout.bottom + TIMELINE_TRACK_GAP
    : TIMELINE_RULER_HEIGHT;
};

export const getTimelineTrackInsertY = (
  tracks: Pick<TimelineTrack, 'type'>[],
  target: TrackInsertTarget,
) => {
  const layouts = getTimelineTrackLayouts(tracks);
  if (target.index <= 0) return TIMELINE_RULER_HEIGHT;

  const before = layouts[target.index - 1];
  const after = layouts[target.index];
  if (before && after) return (before.bottom + after.top) / 2;
  if (before) return before.bottom + TIMELINE_TRACK_GAP / 2;

  return TIMELINE_RULER_HEIGHT;
};

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
