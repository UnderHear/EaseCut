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
  schemaVersion: 8,
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

describe('timeline draft validation', () => {
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
});
