import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from './model';
import {
  MAIN_VIDEO_TRACK_ID,
  getSafeTrackInsertIndex,
  insertTimelineTrack,
} from './timeline-tracks';

const createTrack = (
  id: string,
  type: TimelineTrack['type'],
  zIndex: number,
): TimelineTrack => ({
  id,
  name: type === 'video' ? '视频轨' : `音频轨 ${zIndex}`,
  type,
  muted: false,
  zIndex,
});

describe('timeline track creation', () => {
  const tracks = [
    createTrack(MAIN_VIDEO_TRACK_ID, 'video', 0),
    createTrack('video-overlay-1', 'video', 1),
    createTrack('audio-track-1', 'audio', 2),
  ];

  it('inserts a dynamic track at the requested same-type position', () => {
    const inserted = insertTimelineTrack(tracks, {
      index: 1,
      type: 'video',
    });

    expect(inserted.track).toEqual(
      expect.objectContaining({
        id: 'video-overlay-2',
        type: 'video',
        muted: false,
        zIndex: 1,
      }),
    );
    expect(inserted.tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-2',
      'video-overlay-1',
      'audio-track-1',
    ]);
    expect(inserted.tracks.map(({ zIndex }) => zIndex)).toEqual([0, 1, 2, 3]);
  });

  it('bounds insertion targets to their track type group', () => {
    expect(getSafeTrackInsertIndex(tracks, {
      index: 0,
      type: 'audio',
    })).toBe(2);
    expect(getSafeTrackInsertIndex(tracks, {
      index: tracks.length,
      type: 'video',
    })).toBe(2);
  });

  it('clamps committed tracks to their type group', () => {
    const inserted = insertTimelineTrack(tracks, {
      index: tracks.length,
      type: 'video',
    });

    expect(inserted.tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-1',
      'video-overlay-2',
      'audio-track-1',
    ]);
  });
});
