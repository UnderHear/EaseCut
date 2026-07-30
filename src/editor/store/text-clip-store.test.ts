import { describe, expect, it } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import { createTimelineStore, createVideoTimelineDraft } from './timeline-store';

describe('timeline store text clips', () => {
  it('creates, selects, persists and undoes a title as one transaction', () => {
    const store = createTimelineStore();
    store.setState({ currentTimeUs: secondsToMicroseconds(2) });

    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: secondsToMicroseconds(2),
      text: '我们的精彩旅程',
    });

    expect(store.getState().selectedClipId).toBe('text-clip-1');
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().clips[0]).toMatchObject({
      bold: false,
      durationUs: secondsToMicroseconds(5),
      italic: false,
      startUs: secondsToMicroseconds(2),
      text: '我们的精彩旅程',
      type: 'text',
      underline: false,
    });
    expect(createVideoTimelineDraft(store.getState()).schemaVersion).toBe(10);

    store.getState().undo();
    expect(store.getState().clips).toEqual([]);
    expect(store.getState().tracks.map(({ type }) => type)).toEqual(['video']);

    store.getState().redo();
    expect(store.getState().clips[0]).toMatchObject({
      id: 'text-clip-1',
      type: 'text',
    });
  });

  it('commits measured properties with center compensation in one history item', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 101, width: 501 },
      startUs: 0,
      text: '旧标题',
    });
    const before = store.getState().clips[0];
    if (!before || before.type !== 'text') {
      throw new Error('Expected a text clip');
    }

    store.getState().commitTextClipProperties({
      bold: true,
      clipId: before.id,
      fontSize: 88,
      fontType: 'ALi_PuHui',
      italic: true,
      layoutSize: { height: 88, width: 420 },
      text: '新标题',
      underline: true,
    });

    expect(store.getState().past).toHaveLength(2);
    expect(store.getState().clips[0]).toMatchObject({
      bold: true,
      fontSize: 88,
      fontType: 'ALi_PuHui',
      italic: true,
      layoutSize: { height: 88, width: 420 },
      position: { x: 430, y: 316 },
      text: '新标题',
      underline: true,
    });

    store.getState().undo();
    expect(store.getState().clips[0]).toEqual(before);

    store.getState().redo();
    expect(store.getState().clips[0]).toMatchObject({
      bold: true,
      italic: true,
      layoutSize: { height: 88, width: 420 },
      position: { x: 430, y: 316 },
      text: '新标题',
      underline: true,
    });
  });
});
