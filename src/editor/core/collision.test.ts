import { describe, expect, it } from 'vitest';

import {
  getCompactInsertionLayout,
  getInsertionIndex,
  getPreservedGapInsertionLayout,
  snapClipMoveToCandidates,
} from './collision';
import type { TimelineClip } from '../types';

const createClip = (
  id: string,
  start: number,
  duration: number,
): TimelineClip => ({
  duration,
  id,
  name: id,
  sourceId: id,
  sourceDuration: duration,
  src: `${id}.mp4`,
  start,
  thumbnailUrls: [],
  trackId: 'video-main',
  trimEnd: duration,
  trimStart: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'video',
  zIndex: start,
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
      4,
    );

    expect(layout.insertedStart).toBe(4);
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['a', 0],
      ['c', 4],
      ['b', 6],
    ]);
  });

  it('clamps the candidate start inside the insertion slot', () => {
    const draggedClip = createClip('c', 8, 1);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 2), createClip('b', 6, 2), draggedClip],
      draggedClip,
      1,
      5.5,
    );

    expect(layout.insertedStart).toBe(5);
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['a', 0],
      ['c', 5],
      ['b', 6],
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

    expect(layout.insertedStart).toBe(0);
    expect(layout.shiftedClipIds).toEqual(['a', 'b']);
    expect(layout.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['c', 0],
      ['a', 3.5],
      ['b', 7.5],
    ]);
  });

  it('keeps the candidate start after inserting at the end of the track', () => {
    const draggedClip = createClip('c', 9, 3.5);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 4), createClip('b', 4, 5), draggedClip],
      draggedClip,
      2,
      13,
    );

    expect(layout.insertedStart).toBe(13);
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['a', 0],
      ['b', 4],
      ['c', 13],
    ]);
  });

  it('can clamp the final insertion slot to the previous clip end', () => {
    const draggedClip = createClip('c', 9, 3.5);
    const layout = getPreservedGapInsertionLayout(
      [createClip('a', 0, 4), createClip('b', 4, 5), draggedClip],
      draggedClip,
      2,
      13,
      { allowTrailingFreeStart: false },
    );

    expect(layout.insertedStart).toBe(9);
    expect(layout.shiftedClipIds).toEqual([]);
    expect(layout.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['a', 0],
      ['b', 4],
      ['c', 9],
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

    expect(layout.insertedStart).toBe(2);
    expect(layout.shiftedClipIds).toEqual(['b']);
    expect(
      layout.clips.map((clip) => [clip.id, clip.start, clip.zIndex]),
    ).toEqual([
      ['a', 0, 0],
      ['c', 2, 1],
      ['b', 3, 2],
    ]);
  });
});

describe('snapClipMoveToCandidates', () => {
  it('snaps a moved clip by its start edge', () => {
    expect(snapClipMoveToCandidates(3.95, 2, [4], 80, 6)).toEqual({
      snappedEdge: 'start',
      snappedStart: 4,
      snappedTo: 4,
    });
  });

  it('snaps a moved clip by its end edge', () => {
    expect(snapClipMoveToCandidates(1.05, 3, [4], 80, 6)).toEqual({
      snappedEdge: 'end',
      snappedStart: 1,
      snappedTo: 4,
    });
  });

  it('chooses the closest edge and keeps start edge on an exact tie', () => {
    expect(snapClipMoveToCandidates(1.05, 0.1, [1, 1.2], 80, 6)).toEqual({
      snappedEdge: 'start',
      snappedStart: 1,
      snappedTo: 1,
    });
  });

  it('ignores end-edge snaps that would move the clip before zero', () => {
    expect(snapClipMoveToCandidates(0, 2.05, [2], 80, 6)).toEqual({
      snappedEdge: null,
      snappedStart: 0,
      snappedTo: null,
    });
  });
});
