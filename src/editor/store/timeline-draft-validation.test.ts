import { describe, expect, it } from 'vitest';

import type { VideoTimelineDraft } from '../types';
import {
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  MAIN_VIDEO_TRACK_ID,
  createTimelineStore,
} from './timeline-store';

const createValidDraft = (): VideoTimelineDraft => ({
  canvasSize: { height: 720, width: 1280 },
  clips: [
    {
      duration: 4,
      id: 'clip-video-1',
      name: 'video.mp4',
      sourceDuration: 4,
      sourceId: 'video-1',
      src: 'https://example.test/video.mp4',
      start: 0,
      thumbnailUrls: [],
      trackId: MAIN_VIDEO_TRACK_ID,
      trimEnd: 4,
      trimStart: 0,
      transform: { height: 720, width: 1280, x: 0, y: 0 },
      type: 'video',
      zIndex: 0,
    },
  ],
  schemaVersion: 4,
  tracks: [
    {
      id: MAIN_VIDEO_TRACK_ID,
      name: '视频轨',
      type: 'video',
      volume: 1,
      zIndex: 0,
    },
  ],
});

describe('timeline draft validation', () => {
  it.each([
    {
      label: '负时间',
      mutate: (draft: VideoTimelineDraft) => {
        draft.clips[0]!.start = -1;
      },
    },
    {
      label: '裁剪范围与片段时长不一致',
      mutate: (draft: VideoTimelineDraft) => {
        draft.clips[0]!.trimEnd = 3;
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
  ])('拒绝$label并回退到安全空状态', ({ mutate }) => {
    const draft = createValidDraft();
    mutate(draft);

    const state = createTimelineStore({ draft }).getState();

    expect(state.canvasSize).toEqual(DEFAULT_COMPOSITION_CANVAS_SIZE);
    expect(state.clips).toEqual([]);
    expect(state.tracks).toEqual([
      expect.objectContaining({ id: MAIN_VIDEO_TRACK_ID, type: 'video' }),
    ]);
  });
});
