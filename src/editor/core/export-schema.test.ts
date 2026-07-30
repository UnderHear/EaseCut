import { describe, expect, it } from 'vitest';

import type { VideoTimelineDraft } from './model';
import {
  createCompositionSnapshot,
  evaluateCompositionAt,
} from './composition';
import { createCompositionExportPayload } from './export-schema';

describe('createCompositionExportPayload', () => {
  it('从微秒快照生成既有 PascalCase 毫秒契约', () => {
    const draft: VideoTimelineDraft = {
      canvasSize: { height: 1_080.4, width: 1_920.6 },
      clips: [
        {
          durationUs: 2_000_000,
          id: 'video',
          name: '视频',
          sourceDurationUs: 4_000_000,
          sourceId: 'video-source',
          speed: 1,
          src: 'video.mp4',
          startUs: 1_234_500,
          trackId: 'video-track',
          transform: { height: 360.6, width: 640.4, x: 10.5, y: 20.4 },
          trimEndUs: 2_500_500,
          trimStartUs: 500_500,
          type: 'video',
          volume: 0.75,
          zIndex: 0,
        },
        {
          durationUs: 1_000_000,
          id: 'audio',
          name: '音频',
          sourceDurationUs: 3_000_000,
          sourceId: 'audio-source',
          speed: 1,
          src: 'audio.mp3',
          startUs: 0,
          trackId: 'audio-track',
          transform: { height: 1_080, width: 1_920, x: 0, y: 0 },
          trimEndUs: 1_000_499,
          trimStartUs: 499,
          type: 'audio',
          volume: 0.25,
          zIndex: 0,
        },
      ],
      schemaVersion: 8,
      tracks: [
        {
          id: 'audio-track',
          name: '音频轨',
          type: 'audio',
          muted: false,
          zIndex: 10,
        },
        {
          id: 'video-track',
          name: '视频轨',
          type: 'video',
          muted: false,
          zIndex: 0,
        },
      ],
    };

    expect(createCompositionExportPayload(draft)).toEqual({
      Canvas: { Height: 1_080, Width: 1_921 },
      Track: [
        [
          {
            Extra: [
              { EndTime: 2_501, StartTime: 501, Type: 'trim' },
              { Speed: 1, Type: 'speed' },
              {
                Height: 361,
                PosX: 11,
                PosY: 20,
                Type: 'transform',
                Width: 640,
              },
              { Type: 'a_volume', Volume: 0.75 },
            ],
            Source: 'video.mp4',
            TargetTime: [1_235, 3_235],
            Type: 'video',
          },
        ],
        [
          {
            Extra: [
              { Type: 'a_volume', Volume: 0.25 },
              { EndTime: 1_000, StartTime: 0, Type: 'trim' },
              { Speed: 1, Type: 'speed' },
            ],
            Source: 'audio.mp3',
            TargetTime: [0, 1_000],
            Type: 'audio',
          },
        ],
      ],
    });
  });

  it('保留轨道数组顺序，并在同轨使用稳定片段顺序', () => {
    const draft: VideoTimelineDraft = {
      canvasSize: { height: 100, width: 100 },
      clips: ['z', 'a'].map((id) => ({
        durationUs: 1_000,
        id,
        name: id,
        sourceDurationUs: 1_000,
        sourceId: id,
        speed: 1,
        src: `${id}.mp4`,
        startUs: 0,
        trackId: 'video',
        transform: { height: 100, width: 100, x: 0, y: 0 },
        trimEndUs: 1_000,
        trimStartUs: 0,
        type: 'video' as const,
        volume: id === 'z' ? 0.3 : 0.8,
        zIndex: 0,
      })),
      schemaVersion: 8,
      tracks: [
        {
          id: 'video',
          name: '视频',
          type: 'video',
          muted: false,
          zIndex: 0,
        },
      ],
    };

    expect(
      createCompositionExportPayload(draft).Track[0]?.map(
        (clip) => (clip.Type === 'text' ? null : clip.Source),
      ),
    ).toEqual(['a.mp4', 'z.mp4']);
    expect(
      createCompositionExportPayload(draft).Track[0]?.map((clip) =>
        clip.Extra.find((extra) => extra.Type === 'a_volume'),
      ),
    ).toEqual([
      { Type: 'a_volume', Volume: 0.8 },
      { Type: 'a_volume', Volume: 0.3 },
    ]);
  });

  it('keeps preview source time consistent with trim-then-speed export semantics', () => {
    const draft: VideoTimelineDraft = {
      canvasSize: { height: 720, width: 1_280 },
      clips: [{
        durationUs: 1_500_000,
        id: 'video',
        name: 'video',
        sourceDurationUs: 8_000_000,
        sourceId: 'source',
        speed: 2,
        src: 'video.mp4',
        startUs: 2_000_000,
        trackId: 'video-track',
        transform: { height: 720, width: 1_280, x: 0, y: 0 },
        trimEndUs: 4_000_000,
        trimStartUs: 1_000_000,
        type: 'video',
        volume: 1,
        zIndex: 0,
      }],
      schemaVersion: 8,
      tracks: [{
        id: 'video-track',
        name: '视频轨',
        type: 'video',
        muted: false,
        zIndex: 0,
      }],
    };
    const snapshot = createCompositionSnapshot(draft);
    const evaluation = evaluateCompositionAt(snapshot, 2_750_000);
    const exportedClip =
      createCompositionExportPayload(snapshot).Track[0]?.[0];
    const trim = exportedClip?.Extra.find(
      (extra) => extra.Type === 'trim',
    );
    if (!trim || trim.Type !== 'trim') {
      throw new Error('Expected exported trim semantics');
    }
    const speed = exportedClip?.Extra.find(
      (extra) => extra.Type === 'speed',
    );
    if (!speed || speed.Type !== 'speed') {
      throw new Error('Expected exported speed semantics');
    }

    const exportedSourceTimeUs =
      trim.StartTime * 1_000 +
      (2_750_000 - (exportedClip?.TargetTime[0] ?? 0) * 1_000) *
        speed.Speed;
    expect(evaluation.videoLayers[0]?.sourceTimeUs).toBe(
      exportedSourceTimeUs,
    );
    expect(exportedClip?.Extra.slice(0, 2)).toEqual([
      { EndTime: 4_000, StartTime: 1_000, Type: 'trim' },
      { Speed: 2, Type: 'speed' },
    ]);
    expect(exportedClip?.TargetTime).toEqual([2_000, 3_500]);
  });

  it('exports a text clip without media-only fields', () => {
    const payload = createCompositionExportPayload({
      canvasSize: { height: 1_080, width: 1_920 },
      clips: [
        {
          alignType: 1,
          durationUs: 8_000_000,
          fontColor: '#FFFFFFFF',
          fontSize: 120,
          fontType: 'SY_Black',
          id: 'text-clip-1',
          startUs: 1_000_000,
          text: '我们的精彩旅程',
          trackId: 'text-track-1',
          transform: { height: 200, width: 1_800, x: 60, y: 440 },
          type: 'text',
          zIndex: 0,
        },
      ],
      schemaVersion: 8,
      tracks: [
        {
          id: 'text-track-1',
          muted: false,
          name: '文字轨 1',
          type: 'text',
          zIndex: 0,
        },
      ],
    });

    expect(payload.Track[0]?.[0]).toEqual({
      AlignType: 1,
      Extra: [
        {
          Height: 200,
          PosX: 60,
          PosY: 440,
          Type: 'transform',
          Width: 1_800,
        },
      ],
      FontColor: '#FFFFFFFF',
      FontSize: 120,
      FontType: 'SY_Black',
      TargetTime: [1_000, 9_000],
      Text: '我们的精彩旅程',
      Type: 'text',
    });
    expect(payload.Track[0]?.[0]).not.toHaveProperty('Source');
  });
});
