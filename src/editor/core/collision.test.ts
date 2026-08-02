import { describe, expect, it } from 'vitest';

import {
  getCompactInsertionLayout,
  getClipSnapCandidates,
  getInsertionIndex,
  getPreservedGapInsertionLayout,
  snapClipMoveToCandidates,
} from './collision';
import { secondsToMicroseconds } from './time';
import type { TimelineClip } from './model';

const createClip = (
  id: string,
  startSeconds: number,
  durationSeconds: number,
): TimelineClip => ({
  durationUs: secondsToMicroseconds(durationSeconds),
  hidden: false,
  id,
  name: id,
  sourceId: id,
  sourceDurationUs: secondsToMicroseconds(durationSeconds),
  speed: 1,
  src: `${id}.mp4`,
  startUs: secondsToMicroseconds(startSeconds),
  trackId: 'video-main',
  trimEndUs: secondsToMicroseconds(durationSeconds),
  trimStartUs: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'video',
  volume: 1,
  zIndex: startSeconds,
});

describe('getInsertionIndex', () => {
  it('places a wider dragged clip before the first clip at the timeline start', () => {
    const clips = [createClip('a', 0, 1), createClip('b', 1, 3)];

    expect(getInsertionIndex(clips, 'b', 0, 240, 80)).toBe(0);
  });

  it('places a dragged clip after the next clip when its right edge crosses the midpoint', () => {
    const clips = [createClip('a', 0, 1), createClip('b', 1, 3)];

    expect(getInsertionIndex(clips, 'a', 120, 80, 80)).toBe(1);
  });
});

describe('getPreservedGapInsertionLayout', () => {
  it('keeps the candidate start when the insertion slot has enough room', () => {
    const draggedClip = createClip('c', 8, 1);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 2), createClip('b', 6, 2), draggedClip],
      draggedClip,
      1,
      secondsToMicroseconds(4),
    );

    expect(layout.insertedStartUs).toBe(secondsToMicroseconds(4));
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.startUs])).toEqual([
      ['a', 0],
      ['c', secondsToMicroseconds(4)],
      ['b', secondsToMicroseconds(6)],
    ]);
  });

  it('clamps the candidate start inside the insertion slot', () => {
    const draggedClip = createClip('c', 8, 1);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 2), createClip('b', 6, 2), draggedClip],
      draggedClip,
      1,
      secondsToMicroseconds(5.5),
    );

    expect(layout.insertedStartUs).toBe(secondsToMicroseconds(5));
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.startUs])).toEqual([
      ['a', 0],
      ['c', secondsToMicroseconds(5)],
      ['b', secondsToMicroseconds(6)],
    ]);
  });

  it('ripples only following clips that overlap an undersized insertion slot', () => {
    const draggedClip = createClip('c', 9, 3.5);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 4), createClip('b', 4, 5), draggedClip],
      draggedClip,
      0,
      0,
    );

    expect(layout.insertedStartUs).toBe(0);
    expect(layout.shiftedClipIds).toEqual(['a', 'b']);
    expect(layout.clips.map((clip) => [clip.id, clip.startUs])).toEqual([
      ['c', 0],
      ['a', secondsToMicroseconds(3.5)],
      ['b', secondsToMicroseconds(7.5)],
    ]);
  });

  it('keeps the candidate start after inserting at the end of the track', () => {
    const draggedClip = createClip('c', 9, 3.5);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 4), createClip('b', 4, 5), draggedClip],
      draggedClip,
      2,
      secondsToMicroseconds(13),
    );

    expect(layout.insertedStartUs).toBe(secondsToMicroseconds(13));
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.startUs])).toEqual([
      ['a', 0],
      ['b', secondsToMicroseconds(4)],
      ['c', secondsToMicroseconds(13)],
    ]);
  });

  it('can clamp the final insertion slot to the previous clip end', () => {
    const draggedClip = createClip('c', 9, 3.5);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 4), createClip('b', 4, 5), draggedClip],
      draggedClip,
      2,
      secondsToMicroseconds(13),
      { allowTrailingFreeStart: false },
    );

    expect(layout.insertedStartUs).toBe(secondsToMicroseconds(9));
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.startUs])).toEqual([
      ['a', 0],
      ['b', secondsToMicroseconds(4)],
      ['c', secondsToMicroseconds(9)],
    ]);
  });
});

describe('getCompactInsertionLayout', () => {
  it('inserts by index and removes gaps from the whole track', () => {
    const draggedClip = createClip('c', 12, 1);
    const layout = getCompactInsertionLayout(
      [createClip('a', 0, 2), createClip('b', 6, 3), draggedClip],
      draggedClip,
      1,
    );

    expect(layout.insertedStartUs).toBe(secondsToMicroseconds(2));
    expect(layout.shiftedClipIds).toEqual(['b']);
    expect(
      layout.clips.map((clip) => [clip.id, clip.startUs, clip.zIndex]),
    ).toEqual([
      ['a', 0, 0],
      ['c', secondsToMicroseconds(2), 1],
      ['b', secondsToMicroseconds(3), 2],
    ]);
  });
});

describe('snapClipMoveToCandidates', () => {
  it('snaps a moved clip by its start edge', () => {
    expect(
      snapClipMoveToCandidates(
        secondsToMicroseconds(3.95),
        secondsToMicroseconds(2),
        [secondsToMicroseconds(4)],
        80,
        6,
      ),
    ).toEqual({
      snappedEdge: 'start',
      snappedStartUs: secondsToMicroseconds(4),
      snappedToUs: secondsToMicroseconds(4),
    });
  });

  it('snaps a moved clip by its end edge', () => {
    expect(
      snapClipMoveToCandidates(
        secondsToMicroseconds(1.05),
        secondsToMicroseconds(3),
        [secondsToMicroseconds(4)],
        80,
        6,
      ),
    ).toEqual({
      snappedEdge: 'end',
      snappedStartUs: secondsToMicroseconds(1),
      snappedToUs: secondsToMicroseconds(4),
    });
  });

  it('chooses the closest edge and keeps start edge on an exact tie', () => {
    expect(
      snapClipMoveToCandidates(
        secondsToMicroseconds(1.05),
        secondsToMicroseconds(0.1),
        [secondsToMicroseconds(1), secondsToMicroseconds(1.2)],
        80,
        6,
      ),
    ).toEqual({
      snappedEdge: 'start',
      snappedStartUs: secondsToMicroseconds(1),
      snappedToUs: secondsToMicroseconds(1),
    });
  });

  it('ignores end-edge snaps that would move the clip before zero', () => {
    expect(
      snapClipMoveToCandidates(
        0,
        secondsToMicroseconds(2.05),
        [secondsToMicroseconds(2)],
        80,
        6,
      ),
    ).toEqual({
      snappedEdge: null,
      snappedStartUs: 0,
      snappedToUs: null,
    });
  });
});

describe('getClipSnapCandidates', () => {
  it('excludes both edges of the actively edited clip', () => {
    expect(
      getClipSnapCandidates(
        [
          createClip('active', 1, 2),
          createClip('target', 5, 3),
        ],
        'active',
      ),
    ).toEqual([
      0,
      secondsToMicroseconds(5),
      secondsToMicroseconds(8),
    ]);
  });
});
