import { describe, expect, it } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import type { VideoTimelineDraft } from '../types';
import { MAIN_VIDEO_TRACK_ID, createTimelineStore } from './timeline-store';

const createValidDraft = (): VideoTimelineDraft => ({
  canvasSize: { height: 720, width: 1280 },
  clips: [
    {
      durationUs: secondsToMicroseconds(4),
      id: 'clip-video-1',
      name: 'video.mp4',
      sourceDurationUs: secondsToMicroseconds(4),
      sourceId: 'video-1',
      speed: 1,
      src: 'https://example.test/video.mp4',
      startUs: 0,
      trackId: MAIN_VIDEO_TRACK_ID,
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: 0,
      transform: { height: 720, width: 1280, x: 0, y: 0 },
      type: 'video',
      volume: 1,
      zIndex: 0,
    },
  ],
  schemaVersion: 10,
  tracks: [
    {
      id: MAIN_VIDEO_TRACK_ID,
      name: '视频轨',
      type: 'video',
      muted: false,
      zIndex: 0,
    },
  ],
});

const getOnlyMediaClip = (draft: VideoTimelineDraft) => {
  const clip = draft.clips[0];
  if (!clip || clip.type === 'text') {
    throw new Error('Expected a media clip');
  }
  return clip;
};

const createValidTextDraft = (): VideoTimelineDraft => {
  const draft = createValidDraft();
  draft.tracks.push({
    id: 'text-track-1',
    muted: false,
    name: '文字轨 1',
    type: 'text',
    zIndex: 1,
  });
  draft.clips.push({
    bold: false,
    durationUs: secondsToMicroseconds(5),
    fontColor: '#FFFFFFFF',
    fontSize: 120,
    fontType: 'SY_Black',
    id: 'text-clip-1',
    italic: false,
    layoutSize: { height: 120, width: 800 },
    position: { x: 240, y: 300 },
    startUs: 0,
    text: '标题',
    trackId: 'text-track-1',
    type: 'text',
    underline: false,
    zIndex: 0,
  });
  return draft;
};

const getOnlyTextClip = (draft: VideoTimelineDraft) => {
  const clip = draft.clips.find((candidate) => candidate.type === 'text');
  if (!clip) throw new Error('Expected a text clip');
  return clip;
};

describe('timeline draft validation', () => {
  it('明确拒绝 v9 草稿且不尝试迁移', () => {
    const legacyDraft: Omit<VideoTimelineDraft, 'schemaVersion'> & {
      schemaVersion: number;
    } = {
      ...createValidDraft(),
      schemaVersion: 9,
    };

    expect(() =>
      createTimelineStore({
        draft: legacyDraft as VideoTimelineDraft,
      }),
    ).toThrow('不支持的草稿版本：9');
  });

  it.each([
    {
      label: '负时间',
      mutate: (draft: VideoTimelineDraft) => {
        draft.clips[0]!.startUs = -1;
      },
    },
    {
      label: '裁剪范围与片段时长不一致',
      mutate: (draft: VideoTimelineDraft) => {
        getOnlyMediaClip(draft).trimEndUs = secondsToMicroseconds(3);
      },
    },
    {
      label: '片段引用不存在的轨道',
      mutate: (draft: VideoTimelineDraft) => {
        draft.clips[0]!.trackId = 'missing-track';
      },
    },
    {
      label: '片段和轨道媒体类型不一致',
      mutate: (draft: VideoTimelineDraft) => {
        draft.tracks[0]!.type = 'audio';
      },
    },
    {
      label: '片段音量超出范围',
      mutate: (draft: VideoTimelineDraft) => {
        getOnlyMediaClip(draft).volume = 1.01;
      },
    },
    {
      label: '片段倍速超出范围',
      mutate: (draft: VideoTimelineDraft) => {
        getOnlyMediaClip(draft).speed = 4.01;
      },
    },
    {
      label: '倍速与片段时长不一致',
      mutate: (draft: VideoTimelineDraft) => {
        getOnlyMediaClip(draft).speed = 2;
      },
    },
  ])('明确拒绝$label', ({ mutate }) => {
    const draft = createValidDraft();
    mutate(draft);

    expect(() => createTimelineStore({ draft })).toThrow(
      '草稿结构无效，无法打开项目',
    );
  });

  it.each([
    {
      label: '缺失粗体字段',
      mutate: (draft: VideoTimelineDraft) => {
        Reflect.deleteProperty(getOnlyTextClip(draft), 'bold');
      },
    },
    {
      label: '斜体字段不是布尔值',
      mutate: (draft: VideoTimelineDraft) => {
        Object.assign(getOnlyTextClip(draft), { italic: 'true' });
      },
    },
    {
      label: '下划线字段不是布尔值',
      mutate: (draft: VideoTimelineDraft) => {
        Object.assign(getOnlyTextClip(draft), { underline: 1 });
      },
    },
  ])('明确拒绝文字 Clip $label', ({ mutate }) => {
    const draft = createValidTextDraft();
    mutate(draft);

    expect(() => createTimelineStore({ draft })).toThrow(
      '草稿结构无效，无法打开项目',
    );
  });
});
