import { describe, expect, it } from 'vitest';

import type { TimelineTrack } from './model';
import {
  MAIN_VIDEO_TRACK_ID,
  getSafeTrackInsertIndex,
  insertTimelineTrack,
  normalizeTimelineTracks,
} from './timeline-tracks';

const createTrack = (
  id: string,
  type: TimelineTrack['type'],
  zIndex: number,
): TimelineTrack => ({
  id,
  name:
    type === 'video'
      ? '视频轨'
      : type === 'audio'
        ? '音频轨道'
        : '文字轨',
  type,
  muted: false,
  zIndex,
});

describe('timeline track creation', () => {
  const tracks = [
    createTrack('audio-track-1', 'audio', 0),
    createTrack(MAIN_VIDEO_TRACK_ID, 'video', 1),
    createTrack('video-overlay-1', 'video', 2),
  ];

  it('normalizes tracks from the bottom audio group to the top text group', () => {
    const normalized = normalizeTimelineTracks([
      createTrack('text-track-1', 'text', 8),
      createTrack('video-overlay-1', 'video', 5),
      createTrack('audio-track-1', 'audio', 3),
      createTrack(MAIN_VIDEO_TRACK_ID, 'video', 1),
    ]);

    expect(normalized.map(({ id, zIndex }) => [id, zIndex])).toEqual([
      ['audio-track-1', 0],
      [MAIN_VIDEO_TRACK_ID, 1],
      ['video-overlay-1', 2],
      ['text-track-1', 3],
    ]);
  });

  it('inserts a dynamic track at the requested same-type position', () => {
    const inserted = insertTimelineTrack(tracks, {
      index: 2,
      type: 'video',
    });

    expect(inserted.track).toEqual(
      expect.objectContaining({
        id: 'video-overlay-2',
        type: 'video',
        muted: false,
        zIndex: 2,
      }),
    );
    expect(inserted.tracks.map(({ id }) => id)).toEqual([
      'audio-track-1',
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-2',
      'video-overlay-1',
    ]);
    expect(inserted.tracks.map(({ zIndex }) => zIndex)).toEqual([0, 1, 2, 3]);
  });

  it('bounds insertion targets to their track type group', () => {
    expect(getSafeTrackInsertIndex(tracks, {
      index: tracks.length,
      type: 'audio',
    })).toBe(1);
    expect(getSafeTrackInsertIndex(tracks, {
      index: 0,
      type: 'video',
    })).toBe(1);
  });

  it('clamps committed tracks to their type group', () => {
    const inserted = insertTimelineTrack(tracks, {
      index: tracks.length,
      type: 'video',
    });

    expect(inserted.tracks.map(({ id }) => id)).toEqual([
      'audio-track-1',
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-1',
      'video-overlay-2',
    ]);
  });
});
