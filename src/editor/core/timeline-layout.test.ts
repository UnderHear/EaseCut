import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from '../types';
import {
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_GAP,
  getTimelineTrackLayouts,
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
  it('uses one geometry model for row positions and gap hit areas', () => {
    const layouts = getTimelineTrackLayouts([videoTrack, audioTrack]);

    expect(layouts).toEqual([
      {
        bottom: 88,
        height: 56,
        hitTop: TIMELINE_RULER_HEIGHT,
        index: 0,
        top: TIMELINE_RULER_HEIGHT,
        track: videoTrack,
      },
      {
        bottom: 132,
        height: 40,
        hitTop: 88,
        index: 1,
        top: 88 + TIMELINE_TRACK_GAP,
        track: audioTrack,
      },
    ]);
    expect(getTimelineTracksHeight([videoTrack, audioTrack])).toBe(100);
  });
});
