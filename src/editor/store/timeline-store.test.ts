import { beforeEach, describe, expect, it } from 'vitest';

import { getTrackClips } from '../core/collision';
import {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
  createVideoTimelineDraft,
  MAIN_VIDEO_TRACK_ID,
  createTimelineStore,
} from './timeline-store';
import type { TimelineClip, VideoTimelineSource } from '../types';

const timelineStore = createTimelineStore();

const defaultClipTransform = {
  height: 720,
  width: 1280,
  x: 0,
  y: 0,
};
const defaultExportTransform = {
  Height: 720,
  PosX: 0,
  PosY: 0,
  Type: 'transform',
  Width: 1280,
};
const defaultExportVolume = {
  Type: 'a_volume',
  Volume: 1,
};

const resetStore = () => {
  timelineStore.getState().resetTimeline();
  timelineStore.setState({
    clips: createFixtureClips(),
    currentTime: 0,
    future: [],
    isPlaying: false,
    past: [],
    selectedClipId: null,
  });
};

const getMainVideoClips = () =>
  getTrackClips(timelineStore.getState().clips, MAIN_VIDEO_TRACK_ID);

const createVideoTrack = (id: string, name: string, zIndex: number) => ({
  id,
  name,
  type: 'video' as const,
  volume: 1,
  zIndex,
});

const createAudioTrack = (id: string, name: string, zIndex: number) => ({
  id,
  name,
  type: 'audio' as const,
  volume: 1,
  zIndex,
});

const resetToTwoVisualVideoTracks = () => {
  const clips = createFixtureClips();

  timelineStore.setState({
    clips: [
      { ...clips[0], start: 0, trackId: MAIN_VIDEO_TRACK_ID, zIndex: 0 },
      { ...clips[1], start: 0, trackId: 'video-overlay-1', zIndex: 0 },
    ],
    currentTime: 0,
    future: [],
    past: [],
    selectedClipId: null,
    tracks: [
      createVideoTrack(MAIN_VIDEO_TRACK_ID, '视频轨', 0),
      createVideoTrack('video-overlay-1', '视频轨 2', 1),
    ],
  });
};

const createFixtureClips = (): TimelineClip[] => [
  {
    duration: 4,
    id: 'clip-video-1',
    name: 'video-1.mp4',
    sourceId: 'video-1',
    sourceDuration: 4,
    src: 'http://localhost/video-1.mp4',
    start: 0,
    thumbnailUrls: [],
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEnd: 4,
    trimStart: 0,
    transform: { ...defaultClipTransform },
    type: 'video',
    zIndex: 0,
  },
  {
    duration: 5,
    id: 'clip-video-2',
    name: 'video-2.mp4',
    sourceId: 'video-2',
    sourceDuration: 6,
    src: 'http://localhost/video-2.mp4',
    start: 4,
    thumbnailUrls: [],
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEnd: 6,
    trimStart: 1,
    transform: { ...defaultClipTransform },
    type: 'video',
    zIndex: 1,
  },
  {
    duration: 3.5,
    id: 'clip-video-3',
    name: 'video-3.mp4',
    sourceId: 'video-3',
    sourceDuration: 4,
    src: 'http://localhost/video-3.mp4',
    start: 9,
    thumbnailUrls: [],
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEnd: 4,
    trimStart: 0.5,
    transform: { ...defaultClipTransform },
    type: 'video',
    zIndex: 2,
  },
];

const createAudioClip = (id: string, trackId: string): TimelineClip => ({
  duration: 4,
  id,
  name: `${id}.mp3`,
  sourceId: id,
  sourceDuration: 4,
  src: `http://localhost/${id}.mp3`,
  start: 0,
  thumbnailUrls: [],
  trackId,
  trimEnd: 4,
  trimStart: 0,
  transform: { ...defaultClipTransform },
  type: 'audio',
  zIndex: 0,
});

const resetToTwoVisualAudioTracks = () => {
  timelineStore.setState({
    clips: [
      createAudioClip('clip-audio-a', 'audio-track-1'),
      createAudioClip('clip-audio-b', 'audio-track-2'),
    ],
    currentTime: 0,
    future: [],
    past: [],
    selectedClipId: null,
    tracks: [
      createVideoTrack(MAIN_VIDEO_TRACK_ID, '视频轨', 0),
      createAudioTrack('audio-track-1', '音频轨 1', 1),
      createAudioTrack('audio-track-2', '音频轨 2', 2),
    ],
  });
};

const expectTrackClipsNotToOverlap = (trackId = MAIN_VIDEO_TRACK_ID) => {
  const clips = getTrackClips(timelineStore.getState().clips, trackId);
  for (let index = 0; index < clips.length - 1; index += 1) {
    const currentClip = clips[index];
    const nextClip = clips[index + 1];

    expect(currentClip.start + currentClip.duration).toBeLessThanOrEqual(
      nextClip.start,
    );
  }
};

describe('timelineStore video track layout', () => {
  beforeEach(() => {
    resetStore();
  });

  it('initializes the timeline with only the main video track by default', () => {
    timelineStore.getState().resetTimeline();

    expect(timelineStore.getState().tracks).toEqual([
      {
        id: MAIN_VIDEO_TRACK_ID,
        name: '视频轨',
        type: 'video',
        volume: 1,
        zIndex: 0,
      },
    ]);
  });

  it('keeps fixture video clips on the main video track', () => {
    const clips = getMainVideoClips();

    expect(clips).toHaveLength(3);
    expect(clips.every((clip) => clip.trackId === MAIN_VIDEO_TRACK_ID)).toBe(
      true,
    );
    expect(clips.map((clip) => clip.start)).toEqual([0, 4, 9]);
    expectTrackClipsNotToOverlap();
  });

  it('restores clips, tracks and canvas size from a saved composition draft', () => {
    timelineStore.setState({
      canvasSize: { height: 1080, width: 1920 },
      clips: createFixtureClips().slice(0, 1),
      tracks: [
        {
          id: MAIN_VIDEO_TRACK_ID,
          name: '主视频',
          type: 'video',
          volume: 0,
          zIndex: 0,
        },
      ],
    });
    const draft = createVideoTimelineDraft(timelineStore.getState());

    resetStore();
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().canvasSize).toEqual({
      height: 1080,
      width: 1920,
    });
    expect(timelineStore.getState().tracks).toEqual(draft.tracks);
    expect(timelineStore.getState().clips).toEqual(draft.clips);
    expect(draft.schemaVersion).toBe(4);
  });

  it('restores a schema v1 draft and fills missing clip transforms and track volume', () => {
    const legacyClip = { ...createFixtureClips()[0], transform: undefined };

    timelineStore.getState().resetTimeline({
      draft: {
        canvasSize: { height: 1080, width: 1920 },
        clips: [legacyClip],
        schemaVersion: 1,
        tracks: [
          {
            id: MAIN_VIDEO_TRACK_ID,
            name: '主视频',
            type: 'video',
            zIndex: 0,
          },
        ],
      },
    });

    expect(timelineStore.getState().clips[0]?.transform).toEqual({
      height: 1080,
      width: 1920,
      x: 0,
      y: 0,
    });
    expect(timelineStore.getState().tracks[0]?.volume).toBe(1);
  });

  it('restores a schema v2 draft and fills missing track volume', () => {
    timelineStore.getState().resetTimeline({
      draft: {
        canvasSize: { height: 720, width: 1280 },
        clips: createFixtureClips().slice(0, 1),
        schemaVersion: 2,
        tracks: [
          {
            id: MAIN_VIDEO_TRACK_ID,
            name: '主视频',
            type: 'video',
            zIndex: 0,
          },
        ],
      },
    });

    expect(timelineStore.getState().tracks[0]?.volume).toBe(1);
  });

  it('keeps the gap after deleting the selected clip', () => {
    const state = timelineStore.getState();

    state.selectClip('clip-video-2');
    state.deleteSelectedClip();

    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', 9],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('compacts the main video track after dropping on the only video track', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 13,
      insertionIndex: 2,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-2', 0],
      ['clip-video-3', 5],
      ['clip-video-1', 8.5],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('compacts an overlapping same-track drop by insertion order', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-2',
      freeStart: 7,
      insertionIndex: 2,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', 4],
      ['clip-video-2', 7.5],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('uses the insertion index when dropping a later clip before earlier clips', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-3',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-3', 0],
      ['clip-video-1', 3.5],
      ['clip-video-2', 7.5],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('creates a dynamic video track after dropping on the temporary track target', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });

    expect(timelineStore.getState().tracks).toEqual([
      expect.objectContaining({ id: MAIN_VIDEO_TRACK_ID, name: '视频轨' }),
      expect.objectContaining({
        id: 'video-overlay-1',
        name: '视频轨',
        type: 'video',
      }),
    ]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(
      expect.objectContaining({ start: 2, trackId: 'video-overlay-1' }),
    );
  });

  it('can insert a dynamic video track above the main video track', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 0,
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      ['video-overlay-1', MAIN_VIDEO_TRACK_ID],
    );
  });

  it('trims a trailing empty dynamic video track after its last clip moves away', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 13,
      insertionIndex: 2,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(
      expect.objectContaining({ start: 8.5, trackId: MAIN_VIDEO_TRACK_ID }),
    );
    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-2', 0],
      ['clip-video-3', 5],
      ['clip-video-1', 8.5],
    ]);
  });

  it('keeps an empty middle video track when moving a clip down and restoring the draft', () => {
    resetToTwoVisualVideoTracks();

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-2',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 2,
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1', 'video-overlay-2'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1'),
    ).toEqual([]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-2'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1', 'video-overlay-2'],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-2'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));
  });

  it('keeps both clips on the third visual video track after restoring the draft', () => {
    resetToTwoVisualVideoTracks();

    const state = timelineStore.getState();
    state.commitClipDrop({
      clipId: 'clip-video-2',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 2,
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: 'video-overlay-2',
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1', 'video-overlay-2'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-2').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-video-1', 'clip-video-2']);

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1', 'video-overlay-2'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-2').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-video-1', 'clip-video-2']);
  });

  it('keeps main track gaps when another dynamic video track still has clips', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });
    state.commitClipDrop({
      clipId: 'clip-video-2',
      freeStart: 7,
      insertionIndex: 1,
      targetTrackId: 'video-overlay-1',
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 13,
      insertionIndex: 1,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1'],
    );
    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-3', 9],
      ['clip-video-1', 13],
    ]);
  });

  it('keeps the main video track after deleting every main-track clip', () => {
    const state = timelineStore.getState();

    for (const clip of createFixtureClips()) {
      state.selectClip(clip.id);
      state.deleteSelectedClip();
    }

    expect(timelineStore.getState().clips).toHaveLength(0);
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID],
    );
  });

  it('keeps split clips and neighbors contiguous', () => {
    const state = timelineStore.getState();

    state.setCurrentTime(6);
    state.splitAtPlayhead();

    const clips = getMainVideoClips();

    expect(clips).toHaveLength(4);
    expect(clips.map((clip) => clip.start)).toEqual([0, 4, 6, 9]);
    expectTrackClipsNotToOverlap();
  });

  it('normalizes restored history after undo and redo', () => {
    const state = timelineStore.getState();

    state.selectClip('clip-video-2');
    state.deleteSelectedClip();
    state.undo();
    expect(getMainVideoClips().map((clip) => clip.start)).toEqual([0, 4, 9]);

    state.redo();
    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', 9],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('restores dynamic tracks with undo and redo', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1'],
    );

    state.undo();
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(expect.objectContaining({ trackId: MAIN_VIDEO_TRACK_ID }));

    state.redo();
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1'],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-1' }));
  });

  it('stores track mute changes in undo and redo history', () => {
    const state = timelineStore.getState();
    const layoutRevision = state.layoutRevision;

    state.toggleTrackMute(MAIN_VIDEO_TRACK_ID);
    expect(timelineStore.getState().tracks[0]?.volume).toBe(0);
    expect(
      createVideoTimelineDraft(timelineStore.getState()).tracks[0]
        ?.volume,
    ).toBe(0);
    expect(timelineStore.getState().layoutRevision).toBe(layoutRevision);

    state.undo();
    expect(timelineStore.getState().tracks[0]?.volume).toBe(1);

    state.redo();
    expect(timelineStore.getState().tracks[0]?.volume).toBe(0);
  });

  it('increments layout revision after layout-changing actions', () => {
    let revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-3',
      insertionIndex: 1,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });
    expect(timelineStore.getState().layoutRevision).toBe(revision + 1);
    revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().selectClip('clip-video-2');
    timelineStore.getState().deleteSelectedClip();
    expect(timelineStore.getState().layoutRevision).toBe(revision + 1);
    revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().setCurrentTime(1);
    timelineStore.getState().splitAtPlayhead();
    expect(timelineStore.getState().layoutRevision).toBe(revision + 1);
  });

  it('increments layout revision after undo and redo', () => {
    const state = timelineStore.getState();

    state.selectClip('clip-video-2');
    state.deleteSelectedClip();

    const revisionAfterDelete = timelineStore.getState().layoutRevision;
    state.undo();
    expect(timelineStore.getState().layoutRevision).toBe(
      revisionAfterDelete + 1,
    );

    const revisionAfterUndo = timelineStore.getState().layoutRevision;
    state.redo();
    expect(timelineStore.getState().layoutRevision).toBe(
      revisionAfterUndo + 1,
    );
  });

  it('stores transform edits in undo and redo history', () => {
    const state = timelineStore.getState();

    state.commitClipTransform({
      clipId: 'clip-video-1',
      transform: { height: 240, width: 360, x: 120, y: 80 },
    });
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1')?.transform,
    ).toEqual({ height: 240, width: 360, x: 120, y: 80 });

    state.undo();
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1')?.transform,
    ).toEqual(defaultClipTransform);

    state.redo();
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1')?.transform,
    ).toEqual({ height: 240, width: 360, x: 120, y: 80 });
  });

  it('does not increment layout revision for non-layout actions', () => {
    const state = timelineStore.getState();
    const revision = state.layoutRevision;

    state.selectClip('clip-video-1');
    state.setCurrentTime(2);

    expect(timelineStore.getState().layoutRevision).toBe(revision);
  });

  it('exports clips in the composition renderer schema', () => {
    const payload = timelineStore.getState().createExportPayload();
    const exportedClips = payload.Track[0] ?? [];

    expect(payload.Canvas).toEqual({ Height: 720, Width: 1280 });
    expect(
      exportedClips.map((clip) => [
        clip.Source,
        clip.Type,
        clip.TargetTime,
        clip.Extra[0],
      ]),
    ).toEqual([
      [
        getMainVideoClips()[0]?.src,
        'video',
        [0, 4000],
        { EndTime: 4000, StartTime: 0, Type: 'trim' },
      ],
      [
        getMainVideoClips()[1]?.src,
        'video',
        [4000, 9000],
        { EndTime: 6000, StartTime: 1000, Type: 'trim' },
      ],
      [
        getMainVideoClips()[2]?.src,
        'video',
        [9000, 12500],
        { EndTime: 4000, StartTime: 500, Type: 'trim' },
      ],
    ]);
    expect(exportedClips.map((clip) => clip.Extra[1])).toEqual([
      defaultExportTransform,
      defaultExportTransform,
      defaultExportTransform,
    ]);
    expect(exportedClips.map((clip) => clip.Extra[2])).toEqual([
      defaultExportVolume,
      defaultExportVolume,
      defaultExportVolume,
    ]);
  });

  it('exports dynamic video tracks as additional composition tracks', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 1,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });

    const payload = timelineStore.getState().createExportPayload();

    expect(payload.Track).toHaveLength(2);
    expect(payload.Track[0]?.map((clip) => clip.Source)).toEqual([
      'http://localhost/video-2.mp4',
      'http://localhost/video-3.mp4',
    ]);
    expect(payload.Track[1]).toEqual([
      {
        Extra: [
          { EndTime: 4000, StartTime: 0, Type: 'trim' },
          defaultExportTransform,
          defaultExportVolume,
        ],
        Source: 'http://localhost/video-1.mp4',
        TargetTime: [1000, 5000],
        Type: 'video',
      },
    ]);
  });

  it('exports clips with the target track volume after moving them', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStart: 1,
      insertionIndex: 0,
      targetTrackId: NEW_VIDEO_TRACK_DROP_ID,
      targetTrackInsertIndex: 1,
    });
    state.toggleTrackMute('video-overlay-1');
    state.commitClipDrop({
      clipId: 'clip-video-2',
      freeStart: 5,
      insertionIndex: 1,
      targetTrackId: 'video-overlay-1',
    });

    expect(
      timelineStore
        .getState()
        .createExportPayload()
        .Track[1]?.map((clip) => clip.Extra[2]),
    ).toEqual([
      { Type: 'a_volume', Volume: 0 },
      { Type: 'a_volume', Volume: 0 },
    ]);
  });

  it('initializes the timeline from real video sources and exports the largest 16:9 canvas size', () => {
    const sources: VideoTimelineSource[] = [
      {
        durationSeconds: 4,
        fileName: 'first.mp4',
        height: 720,
        id: 'video-source-1',
        src: 'http://localhost/first.mp4',
        type: 'video',
        width: 1280,
      },
      {
        durationSeconds: 6.25,
        fileName: 'second.mp4',
        height: 1080,
        id: 'video-source-2',
        src: 'http://localhost/second.mp4',
        type: 'video',
        width: 1920,
      },
    ];

    timelineStore.getState().resetTimeline({ sources });

    expect(
      getMainVideoClips().map((clip) => [
        clip.id,
        clip.name,
        clip.src,
        clip.start,
        clip.duration,
        clip.sourceDuration,
        clip.trimStart,
        clip.trimEnd,
        clip.transform,
      ]),
    ).toEqual([
      [
        'clip-video-source-1',
        'first.mp4',
        'http://localhost/first.mp4',
        0,
        4,
        4,
        0,
        4,
        {
          height: 1080,
          width: 1920,
          x: 0,
          y: 0,
        },
      ],
      [
        'clip-video-source-2',
        'second.mp4',
        'http://localhost/second.mp4',
        4,
        6.25,
        6.25,
        0,
        6.25,
        {
          height: 1080,
          width: 1920,
          x: 0,
          y: 0,
        },
      ],
    ]);

    expect(timelineStore.getState().createExportPayload()).toEqual({
      Canvas: { Height: 1080, Width: 1920 },
      Track: [
        [
          {
            Extra: [
              { EndTime: 4000, StartTime: 0, Type: 'trim' },
              {
                Height: 1080,
                PosX: 0,
                PosY: 0,
                Type: 'transform',
                Width: 1920,
              },
              defaultExportVolume,
            ],
            Source: 'http://localhost/first.mp4',
            TargetTime: [0, 4000],
            Type: 'video',
          },
          {
            Extra: [
              { EndTime: 6250, StartTime: 0, Type: 'trim' },
              {
                Height: 1080,
                PosX: 0,
                PosY: 0,
                Type: 'transform',
                Width: 1920,
              },
              defaultExportVolume,
            ],
            Source: 'http://localhost/second.mp4',
            TargetTime: [4000, 10250],
            Type: 'video',
          },
        ],
      ],
    });
  });

  it('keeps the composition canvas at 16:9 and contains square video sources', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationSeconds: 4,
          fileName: 'square.mp4',
          height: 1080,
          id: 'video-source-1',
          src: 'http://localhost/square.mp4',
          type: 'video',
          width: 1080,
        },
      ],
    });

    expect(timelineStore.getState().canvasSize).toEqual({
      height: 720,
      width: 1280,
    });
    expect(getMainVideoClips()[0]?.transform).toEqual({
      height: 720,
      width: 720,
      x: 280,
      y: 0,
    });
    expect(timelineStore.getState().createExportPayload()).toEqual({
      Canvas: { Height: 720, Width: 1280 },
      Track: [
        [
          {
            Extra: [
              { EndTime: 4000, StartTime: 0, Type: 'trim' },
              {
                Height: 720,
                PosX: 280,
                PosY: 0,
                Type: 'transform',
                Width: 720,
              },
              defaultExportVolume,
            ],
            Source: 'http://localhost/square.mp4',
            TargetTime: [0, 4000],
            Type: 'video',
          },
        ],
      ],
    });
  });

  it('repairs a default full-canvas draft transform when square source metadata arrives', () => {
    const source: VideoTimelineSource = {
      durationSeconds: 4,
      fileName: 'square.mp4',
      id: 'video-source-1',
      src: 'http://localhost/square.mp4',
      type: 'video',
    };
    timelineStore.getState().resetTimeline({ sources: [source] });
    const draft = createVideoTimelineDraft(timelineStore.getState());

    timelineStore.getState().resetTimeline({
      draft,
      sources: [{ ...source, height: 1080, width: 1080 }],
    });

    expect(getMainVideoClips()[0]?.transform).toEqual({
      height: 720,
      width: 720,
      x: 280,
      y: 0,
    });
  });

  it('preserves a manually edited draft transform when source metadata arrives', () => {
    const source: VideoTimelineSource = {
      durationSeconds: 4,
      fileName: 'square.mp4',
      id: 'video-source-1',
      src: 'http://localhost/square.mp4',
      type: 'video',
    };
    timelineStore.getState().resetTimeline({ sources: [source] });
    timelineStore.getState().commitClipTransform({
      clipId: 'clip-video-source-1',
      transform: { height: 500, width: 500, x: 120, y: 80 },
    });
    const draft = createVideoTimelineDraft(timelineStore.getState());

    timelineStore.getState().resetTimeline({
      draft,
      sources: [{ ...source, height: 1080, width: 1080 }],
    });

    expect(getMainVideoClips()[0]?.transform).toEqual({
      height: 500,
      width: 500,
      x: 120,
      y: 80,
    });
  });

  it('falls back when source dimensions or duration are missing', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          fileName: 'unknown.mp4',
          id: 'video-source-1',
          src: 'http://localhost/unknown.mp4',
          type: 'video',
        },
      ],
    });

    expect(
      getMainVideoClips().map((clip) => [
        clip.start,
        clip.duration,
        clip.trimEnd,
      ]),
    ).toEqual([[0, 5, 5]]);
    expect(timelineStore.getState().createExportPayload()).toEqual({
      Canvas: { Height: 720, Width: 1280 },
      Track: [
        [
          {
            Extra: [
              { EndTime: 5000, StartTime: 0, Type: 'trim' },
              defaultExportTransform,
              defaultExportVolume,
            ],
            Source: 'http://localhost/unknown.mp4',
            TargetTime: [0, 5000],
            Type: 'video',
          },
        ],
      ],
    });
  });

  it('creates one independent audio track per connected audio source below video tracks', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationSeconds: 4,
          fileName: 'video.mp4',
          height: 720,
          id: 'video-source',
          src: 'http://localhost/video.mp4',
          type: 'video',
          width: 1280,
        },
        {
          durationSeconds: 10,
          fileName: 'music.mp3',
          id: 'audio-music',
          src: 'http://localhost/music.mp3',
          type: 'audio',
          waveformSrc: 'http://localhost/music.mp3?download=1',
        },
        {
          durationSeconds: 3,
          fileName: 'voice.wav',
          id: 'audio-voice',
          src: 'http://localhost/voice.wav',
          type: 'audio',
        },
      ],
    });

    const state = timelineStore.getState();
    expect(state.tracks.map((track) => [track.id, track.type])).toEqual([
      [MAIN_VIDEO_TRACK_ID, 'video'],
      [`${AUDIO_SOURCE_TRACK_ID_PREFIX}audio-music`, 'audio'],
      [`${AUDIO_SOURCE_TRACK_ID_PREFIX}audio-voice`, 'audio'],
    ]);
    expect(
      state.clips.map((clip) => [
        clip.sourceId,
        clip.trackId,
        clip.start,
        clip.type,
      ]),
    ).toEqual([
      ['video-source', MAIN_VIDEO_TRACK_ID, 0, 'video'],
      ['audio-music', `${AUDIO_SOURCE_TRACK_ID_PREFIX}audio-music`, 0, 'audio'],
      ['audio-voice', `${AUDIO_SOURCE_TRACK_ID_PREFIX}audio-voice`, 0, 'audio'],
    ]);
    expect(
      state.clips.find((clip) => clip.sourceId === 'audio-music')?.waveformSrc,
    ).toBe('http://localhost/music.mp3?download=1');
  });

  it('keeps an empty middle audio track when moving a clip down and restoring the draft', () => {
    resetToTwoVisualAudioTracks();

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-audio-b',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: NEW_AUDIO_TRACK_DROP_ID,
      targetTrackInsertIndex: 3,
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1', 'audio-track-2', 'audio-track-3'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-2'),
    ).toEqual([]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-audio-b'),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1', 'audio-track-2', 'audio-track-3'],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-audio-b'),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));
  });

  it('keeps leading empty audio tracks after moving both clips to the third track', () => {
    resetToTwoVisualAudioTracks();

    const state = timelineStore.getState();
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: NEW_AUDIO_TRACK_DROP_ID,
      targetTrackInsertIndex: 3,
    });
    state.commitClipDrop({
      clipId: 'clip-audio-a',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: 'audio-track-3',
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1', 'audio-track-2', 'audio-track-3'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-3').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-audio-a', 'clip-audio-b']);

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1', 'audio-track-2', 'audio-track-3'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-3').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-audio-a', 'clip-audio-b']);
  });

  it('trims trailing empty audio tracks after the last clip moves back', () => {
    resetToTwoVisualAudioTracks();

    const state = timelineStore.getState();
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: NEW_AUDIO_TRACK_DROP_ID,
      targetTrackInsertIndex: 3,
    });
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStart: 0,
      insertionIndex: 1,
      targetTrackId: 'audio-track-1',
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-1').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-audio-a', 'clip-audio-b']);
  });

  it('replaces an untouched five-second audio fallback with resolved source duration', () => {
    const sourceWithoutDuration: VideoTimelineSource = {
      fileName: 'music.mp3',
      id: 'audio-music',
      src: 'http://localhost/music.mp3',
      type: 'audio',
    };

    timelineStore
      .getState()
      .resetTimeline({ sources: [sourceWithoutDuration] });
    const draft = createVideoTimelineDraft(timelineStore.getState());
    expect(timelineStore.getState().clips[0]?.duration).toBe(5);

    timelineStore.getState().resetTimeline({
      draft,
      sources: [{ ...sourceWithoutDuration, durationSeconds: 12.75 }],
    });

    expect(timelineStore.getState().clips[0]).toEqual(
      expect.objectContaining({
        duration: 12.75,
        sourceDuration: 12.75,
        trimEnd: 12.75,
        trimStart: 0,
      }),
    );
  });

  it('preserves audio split edits while resolving the original source duration', () => {
    const sourceWithoutDuration: VideoTimelineSource = {
      fileName: 'music.mp3',
      id: 'audio-music',
      src: 'http://localhost/music.mp3',
      type: 'audio',
    };

    timelineStore
      .getState()
      .resetTimeline({ sources: [sourceWithoutDuration] });
    timelineStore.getState().selectClip('clip-audio-music');
    timelineStore.getState().setCurrentTime(2);
    timelineStore.getState().splitAtPlayhead();
    const draft = createVideoTimelineDraft(timelineStore.getState());

    timelineStore.getState().resetTimeline({
      draft,
      sources: [{ ...sourceWithoutDuration, durationSeconds: 12.75 }],
    });

    expect(
      timelineStore
        .getState()
        .clips.map((clip) => [
          clip.duration,
          clip.sourceDuration,
          clip.trimStart,
          clip.trimEnd,
        ]),
    ).toEqual([
      [2, 12.75, 0, 2],
      [3, 12.75, 2, 5],
    ]);
  });

  it('incrementally adds newly connected sources without removing edited disconnected clips', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationSeconds: 4,
          fileName: 'first.mp4',
          id: 'video-source-1',
          src: 'http://localhost/first.mp4',
          type: 'video',
        },
      ],
    });
    const draft = createVideoTimelineDraft(timelineStore.getState());

    timelineStore.getState().resetTimeline({
      draft,
      sources: [
        {
          durationSeconds: 6,
          fileName: 'second.mp4',
          height: 1080,
          id: 'video-source-2',
          src: 'http://localhost/second.mp4',
          type: 'video',
          width: 1080,
        },
        {
          durationSeconds: 8,
          fileName: 'music.mp3',
          id: 'audio-source-1',
          src: 'http://localhost/music.mp3',
          type: 'audio',
        },
      ],
    });

    const state = timelineStore.getState();
    expect(state.clips.map((clip) => [clip.sourceId, clip.start])).toEqual([
      ['video-source-1', 0],
      ['audio-source-1', 0],
      ['video-source-2', 4],
    ]);
    expect(
      state.clips.find((clip) => clip.sourceId === 'video-source-2')?.transform,
    ).toEqual({
      height: 720,
      width: 720,
      x: 280,
      y: 0,
    });
    expect(
      state.clips.filter((clip) => clip.sourceId === 'video-source-1'),
    ).toHaveLength(1);
  });

  it('migrates legacy clips to stable source ids from matching connected sources', () => {
    const legacyClip = { ...createFixtureClips()[0], sourceId: undefined };

    timelineStore.getState().resetTimeline({
      draft: {
        canvasSize: { height: 720, width: 1280 },
        clips: [legacyClip],
        schemaVersion: 3,
        tracks: [
          {
            id: MAIN_VIDEO_TRACK_ID,
            name: '视频轨',
            type: 'video',
            volume: 1,
            zIndex: 0,
          },
        ],
      },
      sources: [
        {
          durationSeconds: 4,
          fileName: 'video-1.mp4',
          id: 'connected-source-id',
          src: legacyClip.src,
          type: 'video',
        },
      ],
    });

    expect(timelineStore.getState().clips[0]?.sourceId).toBe(
      'connected-source-id',
    );
    expect(
      createVideoTimelineDraft(timelineStore.getState()).schemaVersion,
    ).toBe(4);
  });

  it('creates audio tracks only below video tracks and rejects cross-type drops', () => {
    timelineStore.setState({
      clips: [
        ...createFixtureClips(),
        {
          ...createFixtureClips()[0],
          id: 'clip-audio',
          name: 'music.mp3',
          sourceId: 'audio-source',
          src: 'http://localhost/music.mp3',
          trackId: 'audio-source-track-audio-source',
          type: 'audio',
        },
      ],
      tracks: [
        {
          id: MAIN_VIDEO_TRACK_ID,
          name: '视频轨',
          type: 'video',
          volume: 1,
          zIndex: 0,
        },
        {
          id: 'audio-source-track-audio-source',
          name: 'music.mp3',
          type: 'audio',
          volume: 1,
          zIndex: 1,
        },
      ],
    });

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-audio',
      freeStart: 2,
      insertionIndex: 0,
      targetTrackId: NEW_AUDIO_TRACK_DROP_ID,
      targetTrackInsertIndex: 0,
    });

    expect(
      timelineStore.getState().tracks.map((track) => track.type),
    ).toEqual(['video', 'audio']);
    const audioTrackId = timelineStore
      .getState()
      .clips.find((clip) => clip.id === 'clip-audio')?.trackId;
    expect(audioTrackId).toMatch(/^audio-track-/);

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-audio',
      insertionIndex: 0,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === 'clip-audio')
        ?.trackId,
    ).toBe(audioTrackId);
  });

  it('records one undo step for a committed decimal audio volume change', () => {
    timelineStore.setState({
      clips: [
        ...createFixtureClips(),
        {
          ...createFixtureClips()[0],
          id: 'clip-audio',
          name: 'music.mp3',
          sourceId: 'audio-source',
          src: 'http://localhost/music.mp3',
          trackId: 'audio-track',
          type: 'audio',
        },
      ],
      tracks: [
        {
          id: MAIN_VIDEO_TRACK_ID,
          name: '视频轨',
          type: 'video',
          volume: 1,
          zIndex: 0,
        },
        {
          id: 'audio-track',
          name: '音频轨',
          type: 'audio',
          volume: 1,
          zIndex: 1,
        },
      ],
    });

    const state = timelineStore.getState();
    state.setTrackVolume('audio-track', 0.374);
    expect(timelineStore.getState().tracks[1]?.volume).toBe(0.37);
    expect(timelineStore.getState().past).toHaveLength(0);

    state.commitTrackVolume('audio-track', 1, 0.374);
    expect(timelineStore.getState().past).toHaveLength(1);

    state.undo();
    expect(timelineStore.getState().tracks[1]?.volume).toBe(1);
    state.redo();
    expect(timelineStore.getState().tracks[1]?.volume).toBe(0.37);
  });

  it('exports audio tracks after video tracks without transform extras', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationSeconds: 4,
          fileName: 'video.mp4',
          id: 'video-source',
          src: 'http://localhost/video.mp4',
          type: 'video',
        },
        {
          durationSeconds: 10,
          fileName: 'music.mp3',
          id: 'audio-source',
          src: 'http://localhost/music.mp3',
          type: 'audio',
        },
      ],
    });
    const audioTrack = timelineStore
      .getState()
      .tracks.find((track) => track.type === 'audio');
    expect(audioTrack).toBeDefined();
    timelineStore.getState().setTrackVolume(audioTrack?.id ?? '', 0.45);

    const payload = timelineStore.getState().createExportPayload();
    expect(payload.Track[0]?.[0]?.Type).toBe('video');
    expect(payload.Track[1]).toEqual([
      {
        Extra: [
          { Type: 'a_volume', Volume: 0.45 },
          { EndTime: 10000, StartTime: 0, Type: 'trim' },
        ],
        Source: 'http://localhost/music.mp3',
        TargetTime: [0, 10000],
        Type: 'audio',
      },
    ]);
  });

  it('ripples following same-track clips after trimming the selected clip end', () => {
    timelineStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEnd: 4,
      trimStart: 1,
    });

    const clips = getMainVideoClips();
    expect(clips.map((clip) => [clip.id, clip.start, clip.duration])).toEqual([
      ['clip-video-1', 0, 4],
      ['clip-video-2', 4, 3],
      ['clip-video-3', 7, 3.5],
    ]);
    expect(clips[1]).toEqual(
      expect.objectContaining({ trimEnd: 4, trimStart: 1 }),
    );
    expect(
      timelineStore.getState().createExportPayload().Track[0]?.slice(1),
    ).toEqual([
      {
        Extra: [
          { EndTime: 4000, StartTime: 1000, Type: 'trim' },
          defaultExportTransform,
          defaultExportVolume,
        ],
        Source: 'http://localhost/video-2.mp4',
        TargetTime: [4000, 7000],
        Type: 'video',
      },
      {
        Extra: [
          { EndTime: 4000, StartTime: 500, Type: 'trim' },
          defaultExportTransform,
          defaultExportVolume,
        ],
        Source: 'http://localhost/video-3.mp4',
        TargetTime: [7000, 10500],
        Type: 'video',
      },
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('expands a trimmed clip end up to the source duration', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEnd: 4,
      trimStart: 1,
    });
    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEnd: 8,
      trimStart: 1,
    });

    const clips = getMainVideoClips();
    expect(
      clips.map((clip) => [clip.id, clip.start, clip.duration, clip.trimEnd]),
    ).toEqual([
      ['clip-video-1', 0, 4, 4],
      ['clip-video-2', 4, 5, 6],
      ['clip-video-3', 9, 3.5, 4],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('moves the selected clip start when trimming the left edge to the right', () => {
    timelineStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEnd: 6,
      trimStart: 2,
    });

    const clips = getMainVideoClips();
    expect(
      clips.map((clip) => [
        clip.id,
        clip.start,
        clip.duration,
        clip.trimStart,
        clip.trimEnd,
      ]),
    ).toEqual([
      ['clip-video-1', 0, 4, 0, 4],
      ['clip-video-2', 4, 4, 2, 6],
      ['clip-video-3', 8, 3.5, 0.5, 4],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('keeps main track gaps after left trim when another video track exists', () => {
    timelineStore.setState({
      clips: [
        ...createFixtureClips(),
        {
          ...createFixtureClips()[0],
          id: 'clip-overlay',
          src: 'http://localhost/overlay.mp4',
          start: 0,
          trackId: 'video-overlay-1',
          zIndex: 0,
        },
      ],
      tracks: [
        {
          id: MAIN_VIDEO_TRACK_ID,
          name: '视频轨',
          type: 'video',
          volume: 1,
          zIndex: 0,
        },
        {
          id: 'video-overlay-1',
          name: '视频轨 2',
          type: 'video',
          volume: 1,
          zIndex: 1,
        },
      ],
    });

    timelineStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEnd: 6,
      trimStart: 2,
    });

    expect(
      getMainVideoClips().map((clip) => [clip.id, clip.start, clip.duration]),
    ).toEqual([
      ['clip-video-1', 0, 4],
      ['clip-video-2', 5, 4],
      ['clip-video-3', 9, 3.5],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1').map(
        (clip) => [clip.id, clip.start],
      ),
    ).toEqual([['clip-overlay', 0]]);
    expectTrackClipsNotToOverlap();
  });

  it('limits left-edge trim restore by the previous clip and timeline start', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEnd: 6,
      trimStart: 2,
    });
    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEnd: 6,
      trimStart: 0,
    });

    expect(
      getMainVideoClips().map((clip) => [
        clip.id,
        clip.start,
        clip.duration,
        clip.trimStart,
      ]),
    ).toEqual([
      ['clip-video-1', 0, 4, 0],
      ['clip-video-2', 4, 6, 0],
      ['clip-video-3', 10, 3.5, 0.5],
    ]);

    state.commitClipTrim({
      clipId: 'clip-video-1',
      edge: 'start',
      trimEnd: 4,
      trimStart: 1,
    });
    state.commitClipTrim({
      clipId: 'clip-video-1',
      edge: 'start',
      trimEnd: 4,
      trimStart: 0,
    });

    expect(getMainVideoClips()[0]).toEqual(
      expect.objectContaining({
        duration: 4,
        start: 0,
        trimStart: 0,
      }),
    );
    expectTrackClipsNotToOverlap();
  });

  it('keeps trim edits within source bounds and the minimum clip duration', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEnd: 6,
      trimStart: 5.8,
    });

    let clip = getMainVideoClips()[1];
    expect(clip).toEqual(
      expect.objectContaining({
        duration: 0.6,
        start: 4,
        trimEnd: 6,
        trimStart: 5.4,
      }),
    );

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEnd: 20,
      trimStart: 5.4,
    });

    clip = getMainVideoClips()[1];
    expect(clip).toEqual(
      expect.objectContaining({
        duration: 0.6,
        start: 4,
        trimEnd: 6,
        trimStart: 5.4,
      }),
    );
    expectTrackClipsNotToOverlap();
  });

  it('stores trim edits in undo and redo history', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEnd: 4,
      trimStart: 1,
    });
    expect(getMainVideoClips()[1]?.trimEnd).toBe(4);
    expect(getMainVideoClips()[2]?.start).toBe(7);

    state.undo();
    expect(getMainVideoClips()[1]?.trimEnd).toBe(6);
    expect(getMainVideoClips()[2]?.start).toBe(9);
    expectTrackClipsNotToOverlap();

    state.redo();
    expect(getMainVideoClips()[1]?.trimEnd).toBe(4);
    expect(getMainVideoClips()[2]?.start).toBe(7);
    expectTrackClipsNotToOverlap();
  });
});

describe('timelineStore clip copy and paste', () => {
  beforeEach(() => {
    resetStore();
  });

  it('copies the selected clip as a complete independent snapshot without history', () => {
    timelineStore.setState((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === 'clip-video-2'
          ? {
              ...clip,
              thumbnailUrls: ['thumbnail-a', 'thumbnail-b'],
              transform: { ...clip.transform, width: 900, x: 20 },
            }
          : clip,
      ),
    }));
    const selectedClip = timelineStore
      .getState()
      .clips.find((clip) => clip.id === 'clip-video-2');
    if (!selectedClip) throw new Error('测试片段不存在');

    timelineStore.getState().selectClip(selectedClip.id);
    timelineStore.getState().copySelectedClip();

    const copiedClip = timelineStore.getState().copiedClip;
    expect(copiedClip).toEqual(selectedClip);
    expect(copiedClip).not.toBe(selectedClip);
    expect(copiedClip?.transform).not.toBe(selectedClip.transform);
    expect(copiedClip?.thumbnailUrls).not.toBe(selectedClip.thumbnailUrls);
    expect(timelineStore.getState().past).toEqual([]);
    expect(timelineStore.getState().future).toEqual([]);
  });

  it('inserts an exact copy after the anchor and ripples later same-track clips', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips.map((clip) =>
          clip.id === 'clip-video-2'
            ? { ...clip, start: 6 }
            : clip.id === 'clip-video-3'
              ? { ...clip, start: 13 }
              : clip,
        ),
        { ...createAudioClip('clip-audio', 'audio-track-1'), start: 4 },
      ],
      tracks: [
        ...state.tracks,
        createAudioTrack('audio-track-1', '音频轨 1', 1),
      ],
    }));
    const originalClip = timelineStore
      .getState()
      .clips.find((clip) => clip.id === 'clip-video-1');
    if (!originalClip) throw new Error('测试片段不存在');

    timelineStore.getState().selectClip(originalClip.id);
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().pasteCopiedClip();

    expect(
      getMainVideoClips().map((clip) => [clip.id, clip.start, clip.zIndex]),
    ).toEqual([
      ['clip-video-1', 0, 0],
      ['clip-video-1-copy', 4, 1],
      ['clip-video-2', 10, 2],
      ['clip-video-3', 17, 3],
    ]);
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-1-copy');
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === 'clip-audio')
        ?.start,
    ).toBe(4);
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === 'clip-video-1-copy'),
    ).toEqual(
      expect.objectContaining({
        ...originalClip,
        id: 'clip-video-1-copy',
        start: 4,
        zIndex: 1,
      }),
    );
    expectTrackClipsNotToOverlap();
  });

  it('selects each pasted copy so repeated pastes append with unique IDs', () => {
    timelineStore.getState().selectClip('clip-video-1');
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().pasteCopiedClip();
    timelineStore.getState().pasteCopiedClip();

    expect(
      getMainVideoClips().map((clip) => [clip.id, clip.start]),
    ).toEqual([
      ['clip-video-1', 0],
      ['clip-video-1-copy', 4],
      ['clip-video-1-copy-2', 8],
      ['clip-video-2', 12],
      ['clip-video-3', 17],
    ]);
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-1-copy-2');
  });

  it('pastes a video copy into another video track after the selected anchor', () => {
    timelineStore.getState().selectClip('clip-video-1');
    timelineStore.getState().pasteCopiedClip();
    expect(timelineStore.getState().past).toEqual([]);

    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          ...state.clips[0]!,
          id: 'clip-overlay',
          start: 0,
          trackId: 'video-overlay-1',
        },
        {
          ...state.clips[1]!,
          id: 'clip-overlay-next',
          start: 6,
          trackId: 'video-overlay-1',
          zIndex: 1,
        },
      ],
      tracks: [
        ...state.tracks,
        createVideoTrack('video-overlay-1', '视频轨 2', 1),
      ],
    }));
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().selectClip('clip-overlay');
    timelineStore.getState().pasteCopiedClip();

    expect(timelineStore.getState().clips).toHaveLength(6);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1').map(
        (clip) => [clip.id, clip.start],
      ),
    ).toEqual([
      ['clip-overlay', 0],
      ['clip-video-1-copy', 4],
      ['clip-overlay-next', 10],
    ]);
    expect(timelineStore.getState().clips.find((clip) => clip.id === 'clip-video-1-copy'))
      .toEqual(expect.objectContaining({ trackId: 'video-overlay-1' }));
    expect(getMainVideoClips().map((clip) => [clip.id, clip.start])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-2', 4],
      ['clip-video-3', 9],
    ]);
  });

  it('pastes an audio copy into another audio track after the selected anchor', () => {
    resetToTwoVisualAudioTracks();

    timelineStore.getState().selectClip('clip-audio-a');
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().selectClip('clip-audio-b');
    timelineStore.getState().pasteCopiedClip();

    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-1').map(
        (clip) => [clip.id, clip.start],
      ),
    ).toEqual([['clip-audio-a', 0]]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-2').map(
        (clip) => [clip.id, clip.start],
      ),
    ).toEqual([
      ['clip-audio-b', 0],
      ['clip-audio-a-copy', 4],
    ]);
    expect(timelineStore.getState().selectedClipId).toBe('clip-audio-a-copy');
  });

  it('does not paste between audio and video tracks and clears the buffer on reset', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        { ...createAudioClip('clip-audio-target', 'audio-track-1'), start: 4 },
      ],
      tracks: [
        ...state.tracks,
        createAudioTrack('audio-track-1', '音频轨 1', 1),
      ],
    }));
    timelineStore.getState().selectClip('clip-video-1');
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().selectClip('clip-audio-target');
    timelineStore.getState().pasteCopiedClip();

    expect(timelineStore.getState().clips).toHaveLength(4);
    expect(timelineStore.getState().past).toEqual([]);

    resetToTwoVisualAudioTracks();
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        { ...createFixtureClips()[0], id: 'clip-video-target', start: 0 },
      ],
    }));
    timelineStore.getState().selectClip('clip-audio-a');
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().selectClip('clip-video-target');
    timelineStore.getState().pasteCopiedClip();

    expect(timelineStore.getState().clips).toHaveLength(3);
    expect(timelineStore.getState().past).toEqual([]);

    timelineStore.getState().resetTimeline();
    expect(timelineStore.getState().copiedClip).toBeNull();
  });

  it('restores the anchor selection on undo and reapplies the paste on redo', () => {
    timelineStore.getState().selectClip('clip-video-1');
    timelineStore.getState().copySelectedClip();
    timelineStore.getState().pasteCopiedClip();

    timelineStore.getState().undo();
    expect(timelineStore.getState().clips).toHaveLength(3);
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-1');
    expect(timelineStore.getState().copiedClip?.id).toBe('clip-video-1');

    timelineStore.getState().redo();
    expect(timelineStore.getState().clips).toHaveLength(4);
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-1-copy');
  });
});

describe('createTimelineStore source syncing', () => {
  const source: VideoTimelineSource = {
    durationSeconds: 4,
    fileName: 'source.mp4',
    height: 720,
    id: 'source-1',
    src: 'https://example.com/source.mp4',
    type: 'video',
    width: 1280,
  };

  it('appends each newly observed source once and does not write history', () => {
    const store = createTimelineStore({ sources: [source] });
    const addedSource: VideoTimelineSource = {
      ...source,
      fileName: 'source-2.mp4',
      id: 'source-2',
      src: 'https://example.com/source-2.mp4',
    };

    store.getState().syncSources([source, addedSource]);
    store.getState().syncSources([source, addedSource]);

    expect(store.getState().clips.map((clip) => clip.sourceId)).toEqual([
      'source-1',
      'source-2',
    ]);
    expect(store.getState().past).toEqual([]);
    expect(store.getState().future).toEqual([]);
  });

  it('keeps removed-source clips and does not resurrect a deleted clip', () => {
    const store = createTimelineStore({ sources: [source] });

    store.getState().syncSources([]);
    expect(store.getState().clips).toHaveLength(1);

    store.getState().selectClip('clip-source-1');
    store.getState().deleteSelectedClip();
    expect(store.getState().clips).toHaveLength(0);

    store.getState().syncSources([{ ...source, durationSeconds: 8 }]);
    expect(store.getState().clips).toHaveLength(0);
  });

  it('projects refreshed source identity into current, past, and future clips', () => {
    const store = createTimelineStore({
      sources: [{ ...source, waveformSrc: 'https://example.com/old-waveform' }],
    });
    const initialTransform = store.getState().clips[0]?.transform;
    expect(initialTransform).toBeDefined();

    store.getState().commitClipTransform({
      clipId: 'clip-source-1',
      transform: { ...initialTransform!, x: 10 },
    });
    store.getState().commitClipTransform({
      clipId: 'clip-source-1',
      transform: { ...initialTransform!, x: 20 },
    });
    store.getState().undo();

    const refreshedSource: VideoTimelineSource = {
      ...source,
      fileName: 'renamed-source.mp4',
      src: 'https://example.com/refreshed-source.mp4',
      waveformSrc: 'https://example.com/new-waveform',
    };
    store.getState().syncSources([refreshedSource]);

    const expectedIdentity = {
      name: refreshedSource.fileName,
      src: refreshedSource.src,
      waveformSrc: refreshedSource.waveformSrc,
    };
    expect(store.getState().clips[0]).toEqual(
      expect.objectContaining(expectedIdentity),
    );
    expect(store.getState().past[0]?.clips[0]).toEqual(
      expect.objectContaining(expectedIdentity),
    );
    expect(store.getState().future[0]?.clips[0]).toEqual(
      expect.objectContaining(expectedIdentity),
    );

    store.getState().undo();
    expect(store.getState().clips[0]).toEqual(
      expect.objectContaining({ ...expectedIdentity, transform: initialTransform }),
    );

    store.getState().redo();
    expect(store.getState().clips[0]).toEqual(
      expect.objectContaining({
        ...expectedIdentity,
        transform: { ...initialTransform, x: 10 },
      }),
    );

    store.getState().redo();
    expect(store.getState().clips[0]).toEqual(
      expect.objectContaining({
        ...expectedIdentity,
        transform: { ...initialTransform, x: 20 },
      }),
    );
  });
});
