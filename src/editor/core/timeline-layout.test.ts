import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from '../types';
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

describe('timeline track layout', () => {
  it('uses one geometry model for row positions', () => {
    const layouts = getTimelineTrackLayouts([videoTrack, audioTrack]);

    expect(layouts).toEqual([
      {
        bottom: 88,
        height: 56,
        index: 0,
        top: TIMELINE_RULER_HEIGHT,
        track: videoTrack,
      },
      {
        bottom: 132,
        height: 40,
        index: 1,
        top: 88 + TIMELINE_TRACK_GAP,
        track: audioTrack,
      },
    ]);
    expect(getTimelineTracksHeight([videoTrack, audioTrack])).toBe(100);
  });

  it('centers insertion lines at the leading, internal, and trailing edges', () => {
    const tracks = [videoTrack, audioTrack];

    expect(getTimelineTrackInsertY(tracks, { index: 0, type: 'video' })).toBe(
      TIMELINE_RULER_HEIGHT,
    );
    expect(getTimelineTrackInsertY(tracks, { index: 1, type: 'video' })).toBe(
      88 + TIMELINE_TRACK_GAP / 2,
    );
    expect(getTimelineTrackInsertY(tracks, { index: 2, type: 'audio' })).toBe(
      132 + TIMELINE_TRACK_GAP / 2,
    );
    expect(getTimelineTrackY(tracks, 1)).toBe(92);
  });
});
