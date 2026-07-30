import { describe, expect, it } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import { createTimelineStore, createVideoTimelineDraft } from './timeline-store';

describe('timeline store text clips', () => {
  it('creates, selects, persists and undoes a title as one transaction', () => {
    const store = createTimelineStore();
    store.setState({ currentTimeUs: secondsToMicroseconds(2) });

    store.getState().addTextClip('我们的精彩旅程');

    expect(store.getState().selectedClipId).toBe('text-clip-1');
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().clips[0]).toMatchObject({
      durationUs: secondsToMicroseconds(5),
      startUs: secondsToMicroseconds(2),
      text: '我们的精彩旅程',
      type: 'text',
    });
    expect(createVideoTimelineDraft(store.getState()).schemaVersion).toBe(8);

    store.getState().undo();
    expect(store.getState().clips).toEqual([]);
    expect(store.getState().tracks.map(({ type }) => type)).toEqual(['video']);

    store.getState().redo();
    expect(store.getState().clips[0]).toMatchObject({
      id: 'text-clip-1',
      type: 'text',
    });
  });
});
