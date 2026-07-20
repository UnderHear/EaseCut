import { describe, expect, it } from 'vitest';

import { MAIN_VIDEO_TRACK_ID } from '../core/timeline-tracks';
import type { TimelineClip } from '../types';
import { getVideoGaps } from './video-gaps';

const createClip = (
  id: string,
  start: number,
  duration: number,
  patch: Partial<TimelineClip> = {},
): TimelineClip => ({
  duration,
  id,
  name: `${id}.mp4`,
  sourceDuration: duration,
  sourceId: `${id}-source`,
  src: `/${id}.mp4`,
  start,
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  trimEnd: duration,
  trimStart: 0,
  type: 'video',
  zIndex: 0,
  ...patch,
});

describe('getVideoGaps', () => {
  it('does not report gaps for contiguous or overlapping video coverage', () => {
    expect(
      getVideoGaps([
        createClip('first', 0, 4),
        createClip('overlap', 2, 3),
        createClip('contiguous', 5, 2),
      ]),
    ).toEqual([]);
  });

  it('merges video coverage across tracks', () => {
    expect(
      getVideoGaps([
        createClip('main-first', 0, 2),
        createClip('main-second', 4, 2),
        createClip('overlay', 2, 2, { trackId: 'video-overlay-1' }),
      ]),
    ).toEqual([]);
  });

  it('reports leading and multiple internal gaps', () => {
    expect(
      getVideoGaps([
        createClip('first', 2, 2),
        createClip('second', 5, 1),
        createClip('third', 8, 2),
      ]),
    ).toEqual([
      { end: 2, start: 0 },
      { end: 5, start: 4 },
      { end: 8, start: 6 },
    ]);
  });

  it('ignores audio coverage and does not report a trailing gap', () => {
    expect(
      getVideoGaps([
        createClip('first', 0, 2),
        createClip('audio-between', 2, 3, {
          name: 'audio-between.mp3',
          src: '/audio-between.mp3',
          trackId: 'audio-track-1',
          type: 'audio',
        }),
        createClip('second', 5, 2),
        createClip('audio-tail', 7, 5, {
          name: 'audio-tail.mp3',
          src: '/audio-tail.mp3',
          trackId: 'audio-track-1',
          type: 'audio',
        }),
      ]),
    ).toEqual([{ end: 5, start: 2 }]);
  });

  it('does not report a gap when there are no video clips', () => {
    expect(
      getVideoGaps([
        createClip('audio', 0, 5, {
          name: 'audio.mp3',
          src: '/audio.mp3',
          trackId: 'audio-track-1',
          type: 'audio',
        }),
      ]),
    ).toEqual([]);
  });
});
