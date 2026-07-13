import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from '../types';
import {
  MAIN_VIDEO_TRACK_ID,
  NEW_AUDIO_TRACK_DROP_ID,
  getVisibleTimelineTracks,
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
  volume: 1,
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
        volume: 1,
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

  it('uses the same type-bounded insertion rule for pending tracks', () => {
    const visibleTracks = getVisibleTimelineTracks(tracks, {
      index: 0,
      type: 'audio',
    });

    expect(visibleTracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-1',
      NEW_AUDIO_TRACK_DROP_ID,
      'audio-track-1',
    ]);
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
