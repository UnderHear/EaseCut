import { describe, expect, it } from 'vitest';

import {
  TIMELINE_CONTENT_PADDING_X,
  TIMELINE_RULER_HEIGHT,
} from '../core/timeline-layout';
import type { TimelineTrack } from '../types';
import {
  TRACK_INSERT_ACQUIRE_DISTANCE,
  TRACK_INSERT_RELEASE_DISTANCE,
  getContentPoint,
  getTrackInsertTargetAtY,
} from './timeline-interaction';

const createTrack = (
  id: string,
  type: TimelineTrack['type'],
  zIndex: number,
): TimelineTrack => ({
  id,
  name: id,
  type,
  volume: 1,
  zIndex,
});

const tracks = [
  createTrack('video-main', 'video', 0),
  createTrack('video-overlay-1', 'video', 1),
  createTrack('audio-track-1', 'audio', 2),
];

describe('timeline content coordinates', () => {
  it('uses the tracks viewport scroll position for body coordinates', () => {
    const viewport = document.createElement('div');
    viewport.scrollLeft = 48;
    viewport.scrollTop = 120;
    viewport.getBoundingClientRect = () =>
      ({
        left: 96,
        top: TIMELINE_RULER_HEIGHT,
      }) as DOMRect;

    expect(getContentPoint(viewport, 180, 72)).toEqual({
      x: 180 - 96 + 48 - TIMELINE_CONTENT_PADDING_X,
      y: TIMELINE_RULER_HEIGHT + 40 + 120,
    });
  });

  it('maps the ruler above the tracks viewport without vertical scroll', () => {
    const viewport = document.createElement('div');
    viewport.scrollLeft = 24;
    viewport.scrollTop = 120;
    viewport.getBoundingClientRect = () =>
      ({
        left: 96,
        top: TIMELINE_RULER_HEIGHT,
      }) as DOMRect;

    expect(getContentPoint(viewport, 84, 12)).toEqual({
      x: 0,
      y: 12,
    });
  });
});

describe('timeline track insertion targeting', () => {
  it('acquires an insertion target within four pixels of its line', () => {
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_ACQUIRE_DISTANCE,
      ),
    ).toEqual({ index: 1, type: 'video' });
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_ACQUIRE_DISTANCE + 0.01,
      ),
    ).toBeNull();
  });

  it('retains an acquired target through the wider release distance', () => {
    const target = { index: 1, type: 'video' } as const;

    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_RELEASE_DISTANCE,
        target,
      ),
    ).toEqual(target);
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_RELEASE_DISTANCE + 0.01,
        target,
      ),
    ).toBeNull();
  });

  it('only exposes insertion positions inside the clip type group', () => {
    expect(getTrackInsertTargetAtY(tracks, 'audio', 90)).toBeNull();
    expect(getTrackInsertTargetAtY(tracks, 'audio', 150)).toEqual({
      index: 2,
      type: 'audio',
    });
  });
});
