import { describe, expect, it } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import { createTimelineStore, createVideoTimelineDraft } from './timeline-store';

const beginTextStyleEdit = (
  store: ReturnType<typeof createTimelineStore>,
  clipId: string,
) => {
  const token = store.getState().beginTextStyleEdit(clipId);
  if (token === null) throw new Error('Expected a text style edit token');
  return token;
};

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
    expect(createVideoTimelineDraft(store.getState()).schemaVersion).toBe(11);

    store.getState().undo();
    expect(store.getState().clips).toEqual([]);
    expect(store.getState().tracks.map(({ type }) => type)).toEqual(['video']);

    store.getState().redo();
    expect(store.getState().clips[0]).toMatchObject({
      id: 'text-clip-1',
      type: 'text',
    });
  });

  it('commits measured properties with a fixed top-left position in one history item', () => {
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
      position: before.position,
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
      position: before.position,
      text: '新标题',
      underline: true,
    });
  });

  it('previews a continuous text color edit without touching the document or history', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: 0,
      text: '连续颜色预览',
    });
    const clip = store.getState().clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }
    store.setState({ future: [], past: [] });
    const clipsBeforePreview = store.getState().clips;
    const tracksBeforePreview = store.getState().tracks;

    const token = beginTextStyleEdit(store, clip.id);
    store.getState().previewTextStyleEdit(clip.id, token, '#123456FF');
    store.getState().previewTextStyleEdit(clip.id, token, '#ABCDEFff');

    expect(store.getState().continuousEdit).toEqual({
      clipId: clip.id,
      kind: 'text-style',
      phase: 'active',
      preview: { fontColor: '#ABCDEFFF' },
      token,
    });
    expect(store.getState().clips).toBe(clipsBeforePreview);
    expect(store.getState().tracks).toBe(tracksBeforePreview);
    expect(store.getState().clips[0]).toEqual(clip);
    expect(store.getState().past).toEqual([]);
    expect(store.getState().future).toEqual([]);

    store.getState().commitTextStyleEdit(clip.id, token, '#ABCDEFFF');

    expect(store.getState().continuousEdit).toBeNull();
    expect(store.getState().clips[0]).toMatchObject({
      fontColor: '#ABCDEFFF',
    });
    expect(store.getState().past).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().clips[0]).toEqual(clip);
    store.getState().redo();
    expect(store.getState().clips[0]).toMatchObject({
      fontColor: '#ABCDEFFF',
    });
  });

  it('cancels a continuous text color edit without creating history', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: 0,
      text: '取消颜色预览',
    });
    const clip = store.getState().clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }
    store.setState({ future: [], past: [] });

    const cancelledToken = beginTextStyleEdit(store, clip.id);
    store
      .getState()
      .previewTextStyleEdit(clip.id, cancelledToken, '#123456FF');
    store.getState().cancelTextStyleEdit(clip.id, cancelledToken);

    expect(store.getState().continuousEdit).toBeNull();
    expect(store.getState().clips[0]).toEqual(clip);
    expect(store.getState().past).toEqual([]);

    const unchangedToken = beginTextStyleEdit(store, clip.id);
    store
      .getState()
      .previewTextStyleEdit(clip.id, unchangedToken, '#654321FF');
    store
      .getState()
      .commitTextStyleEdit(clip.id, unchangedToken, clip.fontColor);

    expect(store.getState().continuousEdit).toBeNull();
    expect(store.getState().clips[0]).toEqual(clip);
    expect(store.getState().past).toEqual([]);
  });

  it('commits the final native color after blur has suspended its preview', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: 0,
      text: '颜色事件反序',
    });
    const clip = store.getState().clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }
    store.setState({ future: [], past: [] });

    const token = beginTextStyleEdit(store, clip.id);
    store.getState().previewTextStyleEdit(clip.id, token, '#123456FF');
    store.getState().suspendTextStyleEdit(clip.id, token);

    expect(store.getState().continuousEdit).toEqual({
      clipId: clip.id,
      kind: 'text-style',
      phase: 'awaiting-change',
      preview: { fontColor: '#123456FF' },
      token,
    });
    expect(store.getState().clips[0]).toEqual(clip);

    store.getState().commitTextStyleEdit(clip.id, token, '#123456FF');

    expect(store.getState().continuousEdit).toBeNull();
    expect(store.getState().clips[0]).toMatchObject({
      fontColor: '#123456FF',
    });
    expect(store.getState().past).toHaveLength(1);
  });

  it('rejects a late native color change after explicit cancellation', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: 0,
      text: '取消后迟到的颜色事件',
    });
    const clip = store.getState().clips[0];
    if (!clip || clip.type !== 'text') {
      throw new Error('Expected a text clip');
    }
    store.setState({ future: [], past: [] });

    const token = beginTextStyleEdit(store, clip.id);
    store.getState().previewTextStyleEdit(clip.id, token, '#123456FF');
    store.getState().cancelTextStyleEdit(clip.id, token);
    store.getState().commitTextStyleEdit(clip.id, token, '#123456FF');

    expect(store.getState().continuousEdit).toBeNull();
    expect(store.getState().clips[0]).toEqual(clip);
    expect(store.getState().past).toEqual([]);
  });

  it('ignores a late color commit while another clip is being previewed', () => {
    const store = createTimelineStore();
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: 0,
      text: '较早的片段',
    });
    store.getState().addTextClip({
      layoutSize: { height: 120, width: 800 },
      startUs: secondsToMicroseconds(6),
      text: '当前片段',
    });
    const [earlierClip, currentClip] = store.getState().clips;
    if (
      !earlierClip ||
      earlierClip.type !== 'text' ||
      !currentClip ||
      currentClip.type !== 'text'
    ) {
      throw new Error('Expected two text clips');
    }
    store.setState({ future: [], past: [] });

    const token = beginTextStyleEdit(store, currentClip.id);
    store
      .getState()
      .previewTextStyleEdit(currentClip.id, token, '#123456FF');
    store
      .getState()
      .commitTextStyleEdit(earlierClip.id, token, '#ABCDEFff');

    expect(store.getState().continuousEdit).toEqual({
      clipId: currentClip.id,
      kind: 'text-style',
      phase: 'active',
      preview: { fontColor: '#123456FF' },
      token,
    });
    expect(store.getState().clips).toEqual([earlierClip, currentClip]);
    expect(store.getState().past).toEqual([]);
  });
});
