import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from './model';
import {
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_GAP,
  getTimelineTrackInsertY,
  getTimelineTrackLayouts,
  getTimelineTrackY,
  getTimelineTracksHeight,
} from './timeline-layout';

const videoTrack = { type: 'video' } as const satisfies Pick<
  TimelineTrack,
  'type'
>;
const audioTrack = { type: 'audio' } as const satisfies Pick<
  TimelineTrack,
  'type'
>;
const textTrack = { type: 'text' } as const satisfies Pick<
  TimelineTrack,
  'type'
>;

describe('timeline track layout', () => {
  it('lays out bottom-to-top storage in top-to-bottom visual order', () => {
    const tracks = [audioTrack, videoTrack, textTrack];
    const layouts = getTimelineTrackLayouts(tracks);

    expect(layouts).toEqual([
      {
        bottom: 88,
        height: 56,
        index: 2,
        top: TIMELINE_RULER_HEIGHT,
        track: textTrack,
      },
      {
        bottom: 148,
        height: 56,
        index: 1,
        top: 88 + TIMELINE_TRACK_GAP,
        track: videoTrack,
      },
      {
        bottom: 192,
        height: 40,
        index: 0,
        top: 148 + TIMELINE_TRACK_GAP,
        track: audioTrack,
      },
    ]);
    expect(getTimelineTracksHeight(tracks)).toBe(160);
  });

  it('maps storage insertion indexes to reversed visual boundaries', () => {
    const tracks = [audioTrack, videoTrack, textTrack];

    expect(getTimelineTrackInsertY(tracks, { index: 3, type: 'text' })).toBe(
      TIMELINE_RULER_HEIGHT,
    );
    expect(getTimelineTrackInsertY(tracks, { index: 2, type: 'text' })).toBe(
      88 + TIMELINE_TRACK_GAP / 2,
    );
    expect(getTimelineTrackInsertY(tracks, { index: 1, type: 'video' })).toBe(
      148 + TIMELINE_TRACK_GAP / 2,
    );
    expect(getTimelineTrackInsertY(tracks, { index: 0, type: 'audio' })).toBe(
      192 + TIMELINE_TRACK_GAP / 2,
    );
    expect(getTimelineTrackY(tracks, 2)).toBe(TIMELINE_RULER_HEIGHT);
    expect(getTimelineTrackY(tracks, 0)).toBe(152);
  });
});
