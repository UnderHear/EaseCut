import { describe, expect, it } from 'vitest';

import type { TimelineEdit, TimelineEditResult } from './timeline-commands';
import {
  addTextClip,
  changeTextClipProperties,
  changeTextClipTiming,
  deleteClip,
  getTrimmedClip,
  moveClip,
  pasteClip,
  splitClip,
} from './timeline-commands';
import { secondsToMicroseconds } from './time';

const createEdit = (): TimelineEdit => ({
  clips: [],
  selectedClipId: null,
  tracks: [
    {
      id: 'video-main',
      muted: false,
      name: '视频轨',
      type: 'video',
      zIndex: 0,
    },
  ],
});

const expectChanged = (
  result: TimelineEditResult,
): Extract<TimelineEditResult, { changed: true }> => {
  expect(result.changed).toBe(true);
  if (!result.changed) throw new Error('Expected timeline edit to change');
  return result;
};

describe('text clip commands', () => {
  it('creates deterministic five-second defaults at the requested playhead', () => {
    const result = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: secondsToMicroseconds(1),
        text: ' 我们的精彩旅程 ',
      }),
    );

    expect(result.selectedClipId).toBe('text-clip-1');
    expect(result.tracks.map((track) => [track.id, track.type])).toEqual([
      ['video-main', 'video'],
      ['text-track-1', 'text'],
    ]);
    expect(result.clips[0]).toEqual({
      alignType: 1,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
      fontType: 'SY_Black',
      id: 'text-clip-1',
      startUs: secondsToMicroseconds(1),
      text: '我们的精彩旅程',
      trackId: 'text-track-1',
      transform: { height: 200, width: 1_800, x: 60, y: 440 },
      type: 'text',
      zIndex: 0,
    });
  });

  it('reuses a free text track and creates a new track for overlap', () => {
    const first = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 720, width: 1_280 },
        startUs: 0,
        text: '标题一',
      }),
    );
    const second = expectChanged(
      addTextClip(first, {
        canvasSize: { height: 720, width: 1_280 },
        startUs: secondsToMicroseconds(6),
        text: '标题二',
      }),
    );
    const overlapping = expectChanged(
      addTextClip(second, {
        canvasSize: { height: 720, width: 1_280 },
        startUs: secondsToMicroseconds(2),
        text: '标题三',
      }),
    );

    expect(second.clips.at(-1)?.trackId).toBe('text-track-1');
    expect(
      overlapping.clips.find(({ id }) => id === 'text-clip-3'),
    ).toMatchObject({
      id: 'text-clip-3',
      trackId: 'text-track-2',
      transform: { height: 133, width: 1_200, x: 40, y: 293 },
    });
  });

  it('moves timing conflicts to another track and removes an emptied track', () => {
    const first = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '一',
      }),
    );
    const second = expectChanged(
      addTextClip(first, {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: secondsToMicroseconds(6),
        text: '二',
      }),
    );
    const moved = expectChanged(
      changeTextClipTiming(second, {
        clipId: 'text-clip-2',
        endUs: secondsToMicroseconds(4),
        startUs: secondsToMicroseconds(1),
      }),
    );
    expect(moved.clips.find(({ id }) => id === 'text-clip-2')?.trackId).toBe(
      'text-track-2',
    );

    const deleted = expectChanged(deleteClip(moved, 'text-clip-2'));
    expect(deleted.tracks.map(({ id }) => id)).not.toContain('text-track-2');
  });

  it('rejects invalid properties and applies a valid style atomically', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '标题',
      }),
    );

    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontColor: '#FFFFFF',
        text: '',
      }).changed,
    ).toBe(false);
    expect(
      changeTextClipTiming(created, {
        clipId: 'text-clip-1',
        endUs: 500_000,
        startUs: 0,
      }).changed,
    ).toBe(false);
    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontType: 'PM_ZhengDao',
      }).changed,
    ).toBe(false);

    const changed = expectChanged(
      changeTextClipProperties(created, {
        alignType: 2,
        clipId: 'text-clip-1',
        fontColor: '#12345678',
        fontSize: 88,
        fontType: 'ALi_PuHui',
        text: '新标题',
      }),
    );
    expect(changed.clips[0]).toMatchObject({
      alignType: 2,
      fontColor: '#12345678',
      fontSize: 88,
      fontType: 'ALi_PuHui',
      text: '新标题',
    });
  });

  it('moves, trims, splits, pastes and deletes text clips without media fields', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '标题',
      }),
    );
    const moved = expectChanged(
      moveClip(created, {
        clipId: 'text-clip-1',
        freeStartUs: secondsToMicroseconds(2),
        insertionIndex: 0,
        target: { kind: 'existing', trackId: 'text-track-1' },
      }),
    );
    const movedClip = moved.clips.find(({ id }) => id === 'text-clip-1');
    if (!movedClip || movedClip.type !== 'text') {
      throw new Error('Expected moved text clip');
    }
    expect(movedClip.startUs).toBe(secondsToMicroseconds(2));

    expect(
      getTrimmedClip(
        movedClip,
        'end',
        secondsToMicroseconds(6),
      ),
    ).toMatchObject({
      durationUs: secondsToMicroseconds(4),
      text: '标题',
      type: 'text',
    });

    const split = expectChanged(
      splitClip(moved, movedClip.id, secondsToMicroseconds(4)),
    );
    expect(
      split.clips.map((clip) => ({
        durationUs: clip.durationUs,
        id: clip.id,
        type: clip.type,
      })),
    ).toEqual([
      {
        durationUs: secondsToMicroseconds(2),
        id: 'text-clip-1',
        type: 'text',
      },
      {
        durationUs: secondsToMicroseconds(3),
        id: 'text-clip-1-split',
        type: 'text',
      },
    ]);

    const pasted = expectChanged(
      pasteClip(split, movedClip, 'text-clip-1-split'),
    );
    expect(pasted.clips.some(({ id }) => id === 'text-clip-1-copy')).toBe(
      true,
    );
    const deleted = expectChanged(deleteClip(pasted, 'text-clip-1-copy'));
    expect(deleted.clips.some(({ id }) => id === 'text-clip-1-copy')).toBe(
      false,
    );
  });
});
