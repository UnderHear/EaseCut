import { describe, expect, it } from 'vitest';

import type {
  AddTextClipParams,
  TimelineEdit,
  TimelineEditResult,
} from './timeline-commands';
import {
  addTextClip as addTextClipCommand,
  changeTextClipProperties,
  changeTextClipTiming,
  deleteClip,
  getTrimmedClip,
  moveClip,
  moveClipPosition,
  pasteClip,
  splitClip,
  transformMediaClip,
} from './timeline-commands';
import { secondsToMicroseconds } from './time';

const defaultTextLayoutSize = { height: 120, width: 800 };

const addTextClip = (
  edit: TimelineEdit,
  params: Omit<AddTextClipParams, 'layoutSize'> & {
    layoutSize?: AddTextClipParams['layoutSize'];
  },
) => {
  const { layoutSize = defaultTextLayoutSize, ...command } = params;
  return addTextClipCommand(edit, { ...command, layoutSize });
};

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
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
      fontType: 'SY_Black',
      hidden: false,
      id: 'text-clip-1',
      italic: false,
      layoutSize: defaultTextLayoutSize,
      position: { x: 560, y: 480 },
      startUs: secondsToMicroseconds(1),
      text: '我们的精彩旅程',
      trackId: 'text-track-1',
      type: 'text',
      underline: false,
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
      layoutSize: defaultTextLayoutSize,
      position: { x: 240, y: 300 },
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
        bold: true,
        clipId: 'text-clip-1',
      }).changed,
    ).toBe(false);
    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontColor: '#FFFFFF',
        text: '',
      }).changed,
    ).toBe(false);
    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        layoutSize: { height: 120, width: 800 },
        text: '第一行\n第二行',
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
    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontSize: 88,
        layoutSize: { height: 0, width: 420 },
      }),
    ).toEqual({ changed: false });
    expect(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontColor: '#12345678',
        layoutSize: { height: 88, width: 420 },
      }),
    ).toEqual({ changed: false });
    expect(created.clips[0]).toMatchObject({
      fontSize: 120,
      layoutSize: defaultTextLayoutSize,
      position: { x: 560, y: 480 },
      text: '标题',
    });

    const changed = expectChanged(
      changeTextClipProperties(created, {
        bold: true,
        clipId: 'text-clip-1',
        fontColor: '#12345678',
        fontSize: 88,
        fontType: 'ALi_PuHui',
        italic: true,
        layoutSize: { height: 88, width: 420 },
        text: '新标题',
        underline: true,
      }),
    );
    expect(changed.clips[0]).toMatchObject({
      bold: true,
      fontColor: '#12345678',
      fontSize: 88,
      fontType: 'ALi_PuHui',
      italic: true,
      layoutSize: { height: 88, width: 420 },
      position: { x: 560, y: 480 },
      text: '新标题',
      underline: true,
    });
  });

  it('toggles underline without changing natural layout', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '标题',
      }),
    );
    const changed = expectChanged(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        underline: true,
      }),
    );

    expect(changed.clips[0]).toMatchObject({
      layoutSize: defaultTextLayoutSize,
      position: { x: 560, y: 480 },
      underline: true,
    });
  });

  it('preserves the top-left position when the natural dimensions change', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 721, width: 1_281 },
        layoutSize: { height: 101, width: 501 },
        startUs: 0,
        text: '旧标题',
      }),
    );
    const changed = expectChanged(
      changeTextClipProperties(created, {
        clipId: 'text-clip-1',
        fontSize: 121,
        layoutSize: { height: 100, width: 500 },
        text: '新标题',
      }),
    );
    const clip = changed.clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }

    expect(clip.position).toEqual({ x: 390, y: 310 });
  });

  it('moves text without changing natural size and rejects media transforms', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '标题',
      }),
    );
    const moved = expectChanged(
      moveClipPosition(created, {
        clipId: 'text-clip-1',
        position: { x: -100, y: 80 },
      }),
    );
    const clip = moved.clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }

    expect(clip.position).toEqual({ x: -100, y: 80 });
    expect(clip.layoutSize).toEqual(defaultTextLayoutSize);
    expect(
      transformMediaClip(moved, clip.id, {
        height: 20,
        width: 20,
        x: 0,
        y: 0,
      }),
    ).toEqual({ changed: false });
  });

  it('moves, trims, splits, pastes and deletes text clips without media fields', () => {
    const created = expectChanged(
      addTextClip(createEdit(), {
        canvasSize: { height: 1_080, width: 1_920 },
        startUs: 0,
        text: '标题',
      }),
    );
    const styled = expectChanged(
      changeTextClipProperties(created, {
        bold: true,
        clipId: 'text-clip-1',
        italic: true,
        layoutSize: defaultTextLayoutSize,
        underline: true,
      }),
    );
    const moved = expectChanged(
      moveClip(styled, {
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
    expect(
      pasted.clips.find(({ id }) => id === 'text-clip-1-copy'),
    ).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
    });
    const deleted = expectChanged(deleteClip(pasted, 'text-clip-1-copy'));
    expect(deleted.clips.some(({ id }) => id === 'text-clip-1-copy')).toBe(
      false,
    );
  });
});
