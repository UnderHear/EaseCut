import { beforeEach, describe, expect, it } from 'vitest';

import { getTrackClips } from '../core/collision';
import { secondsToMicroseconds } from '../core/time';
import {
  AUDIO_SOURCE_TRACK_ID_PREFIX,
  createVideoTimelineDraft,
  MAIN_VIDEO_TRACK_ID,
  createTimelineStore,
} from './timeline-store';
import type {
  TimelineClip,
  VideoTimelineDraft,
  VideoTimelineSource,
} from '../types';

const timelineStore = createTimelineStore();

const existingTarget = (trackId: string) =>
  ({ kind: 'existing', trackId }) as const;
const insertTarget = (type: TimelineClip['type'], index: number) =>
  ({ insert: { index, type }, kind: 'insert' }) as const;

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
    currentTimeUs: secondsToMicroseconds(0),
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
  muted: false,
  zIndex,
});

const createAudioTrack = (id: string, name: string, zIndex: number) => ({
  id,
  name,
  type: 'audio' as const,
  muted: false,
  zIndex,
});

const resetToTwoVisualVideoTracks = () => {
  const clips = createFixtureClips();

  timelineStore.setState({
    clips: [
      { ...clips[0], startUs: secondsToMicroseconds(0), trackId: MAIN_VIDEO_TRACK_ID, zIndex: 0 },
      { ...clips[1], startUs: secondsToMicroseconds(0), trackId: 'video-overlay-1', zIndex: 0 },
    ],
    currentTimeUs: secondsToMicroseconds(0),
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
    durationUs: secondsToMicroseconds(4),
    id: 'clip-video-1',
    name: 'video-1.mp4',
    sourceId: 'video-1',
    sourceDurationUs: secondsToMicroseconds(4),
    src: 'http://localhost/video-1.mp4',
    startUs: secondsToMicroseconds(0),
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEndUs: secondsToMicroseconds(4),
    trimStartUs: secondsToMicroseconds(0),
    transform: { ...defaultClipTransform },
    type: 'video',
    volume: 1,
    zIndex: 0,
  },
  {
    durationUs: secondsToMicroseconds(5),
    id: 'clip-video-2',
    name: 'video-2.mp4',
    sourceId: 'video-2',
    sourceDurationUs: secondsToMicroseconds(6),
    src: 'http://localhost/video-2.mp4',
    startUs: secondsToMicroseconds(4),
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEndUs: secondsToMicroseconds(6),
    trimStartUs: secondsToMicroseconds(1),
    transform: { ...defaultClipTransform },
    type: 'video',
    volume: 1,
    zIndex: 1,
  },
  {
    durationUs: secondsToMicroseconds(3.5),
    id: 'clip-video-3',
    name: 'video-3.mp4',
    sourceId: 'video-3',
    sourceDurationUs: secondsToMicroseconds(4),
    src: 'http://localhost/video-3.mp4',
    startUs: secondsToMicroseconds(9),
    trackId: MAIN_VIDEO_TRACK_ID,
    trimEndUs: secondsToMicroseconds(4),
    trimStartUs: secondsToMicroseconds(0.5),
    transform: { ...defaultClipTransform },
    type: 'video',
    volume: 1,
    zIndex: 2,
  },
];

const createAudioClip = (id: string, trackId: string): TimelineClip => ({
  durationUs: secondsToMicroseconds(4),
  id,
  name: `${id}.mp3`,
  sourceId: id,
  sourceDurationUs: secondsToMicroseconds(4),
  src: `http://localhost/${id}.mp3`,
  startUs: secondsToMicroseconds(0),
  trackId,
  trimEndUs: secondsToMicroseconds(4),
  trimStartUs: secondsToMicroseconds(0),
  transform: { ...defaultClipTransform },
  type: 'audio',
  volume: 1,
  zIndex: 0,
});

const resetToTwoVisualAudioTracks = () => {
  timelineStore.setState({
    clips: [
      createAudioClip('clip-audio-a', 'audio-track-1'),
      createAudioClip('clip-audio-b', 'audio-track-2'),
    ],
    currentTimeUs: secondsToMicroseconds(0),
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

    expect(currentClip.startUs + currentClip.durationUs).toBeLessThanOrEqual(
      nextClip.startUs,
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
        muted: false,
        zIndex: 0,
      },
    ]);
  });

  it('controls canvas and timeline snapping independently and resets both', () => {
    expect(timelineStore.getState().canvasSnappingEnabled).toBe(true);
    expect(timelineStore.getState().snappingEnabled).toBe(true);

    timelineStore.getState().toggleCanvasSnapping();
    expect(timelineStore.getState().canvasSnappingEnabled).toBe(false);
    expect(timelineStore.getState().snappingEnabled).toBe(true);

    timelineStore.getState().toggleSnapping();
    expect(timelineStore.getState().canvasSnappingEnabled).toBe(false);
    expect(timelineStore.getState().snappingEnabled).toBe(false);
    expect(timelineStore.getState().past).toEqual([]);

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });
    expect(timelineStore.getState().canvasSnappingEnabled).toBe(true);
    expect(timelineStore.getState().snappingEnabled).toBe(true);
  });

  it('keeps fixture video clips on the main video track', () => {
    const clips = getMainVideoClips();

    expect(clips).toHaveLength(3);
    expect(clips.every((clip) => clip.trackId === MAIN_VIDEO_TRACK_ID)).toBe(
      true,
    );
    expect(clips.map((clip) => clip.startUs)).toEqual(
      [0, 4, 9].map(secondsToMicroseconds),
    );
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
          muted: false,
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
    expect(draft.schemaVersion).toBe(6);
  });

  it('compacts main-track gaps when restoring a saved composition draft', () => {
    const clips = createFixtureClips();

    timelineStore.getState().resetTimeline({
      draft: {
        canvasSize: { height: 720, width: 1280 },
        clips: [
          { ...clips[0], startUs: secondsToMicroseconds(2) },
          { ...clips[1], startUs: secondsToMicroseconds(10) },
          {
            ...clips[2],
            startUs: secondsToMicroseconds(7),
            trackId: 'video-overlay-1',
            zIndex: 0,
          },
        ],
        schemaVersion: 6,
        tracks: [
          createVideoTrack(MAIN_VIDEO_TRACK_ID, '主视频', 0),
          createVideoTrack('video-overlay-1', '视频轨 2', 1),
        ],
      },
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-2', secondsToMicroseconds(4)],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1').map(
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([['clip-video-3', secondsToMicroseconds(7)]]);
  });

  it.each([1, 2, 3, 4, 5])('rejects a schema v%s draft', (schemaVersion) => {
    const validDraft = createVideoTimelineDraft(timelineStore.getState());
    const previousState = timelineStore.getState();

    expect(() =>
      timelineStore.getState().resetTimeline({
        draft: {
          ...validDraft,
          schemaVersion,
        } as unknown as VideoTimelineDraft,
      }),
    ).toThrow(`不支持的草稿版本：${schemaVersion}`);
    expect(timelineStore.getState()).toBe(previousState);
  });

  it('compacts the main track after deleting the selected clip', () => {
    const state = timelineStore.getState();

    state.selectClip('clip-video-2');
    state.deleteSelectedClip();

    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', secondsToMicroseconds(4)],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('compacts the main video track after dropping on the only video track', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(13),
      insertionIndex: 2,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-2', 0],
      ['clip-video-3', secondsToMicroseconds(5)],
      ['clip-video-1', secondsToMicroseconds(8.5)],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('compacts an overlapping same-track drop by insertion order', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-2',
      freeStartUs: secondsToMicroseconds(7),
      insertionIndex: 2,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', secondsToMicroseconds(4)],
      ['clip-video-2', secondsToMicroseconds(7.5)],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('uses the insertion index when dropping a later clip before earlier clips', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-3',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-3', 0],
      ['clip-video-1', secondsToMicroseconds(3.5)],
      ['clip-video-2', secondsToMicroseconds(7.5)],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('creates a dynamic video track from an insert target', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 1),
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
      expect.objectContaining({
        startUs: secondsToMicroseconds(2),
        trackId: 'video-overlay-1',
      }),
    );
  });

  it('rejects an insert target that mismatches the dragged clip type', () => {
    const state = timelineStore.getState();
    const tracksBefore = state.tracks;
    const clipsBefore = state.clips;

    state.commitClipDrop({
      clipId: 'clip-video-1',
      insertionIndex: 0,
      target: insertTarget('audio', 1),
    });

    expect(timelineStore.getState().tracks).toBe(tracksBefore);
    expect(timelineStore.getState().clips).toBe(clipsBefore);
    expect(timelineStore.getState().past).toHaveLength(0);
  });

  it('can insert a dynamic video track above the main video track', () => {
    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 0),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      ['video-overlay-1', MAIN_VIDEO_TRACK_ID],
    );
  });

  it('removes an empty dynamic video track above the main video track', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 0),
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      insertionIndex: 2,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(expect.objectContaining({ trackId: MAIN_VIDEO_TRACK_ID }));
  });

  it('removes an empty dynamic video track after its last clip moves away', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 1),
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(13),
      insertionIndex: 2,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID],
    );
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-1'),
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(8.5),
        trackId: MAIN_VIDEO_TRACK_ID,
      }),
    );
    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-2', 0],
      ['clip-video-3', secondsToMicroseconds(5)],
      ['clip-video-1', secondsToMicroseconds(8.5)],
    ]);
  });

  it('removes an empty middle video track when moving a clip and restoring a draft', () => {
    resetToTwoVisualVideoTracks();

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-2',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: insertTarget('video', 2),
    });

    expect(
      timelineStore
        .getState()
        .tracks.map((track) => [track.id, track.zIndex]),
    ).toEqual([
      [MAIN_VIDEO_TRACK_ID, 0],
      ['video-overlay-2', 1],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1'),
    ).toEqual([]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-video-2'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));

    const draft = createVideoTimelineDraft(timelineStore.getState());
    draft.tracks.splice(
      1,
      0,
      createVideoTrack('video-overlay-1', '视频轨', 1),
    );
    draft.tracks.forEach((track, index) => {
      track.zIndex = index;
    });
    timelineStore.getState().resetTimeline({ draft });

    expect(
      timelineStore
        .getState()
        .tracks.map((track) => [track.id, track.zIndex]),
    ).toEqual([
      [MAIN_VIDEO_TRACK_ID, 0],
      ['video-overlay-2', 1],
    ]);
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
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: insertTarget('video', 2),
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: existingTarget('video-overlay-2'),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-2'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-2').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-video-1', 'clip-video-2']);

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-2'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-2').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-video-1', 'clip-video-2']);
  });

  it('compacts the main track when another dynamic video track still has clips', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 1),
    });
    state.commitClipDrop({
      clipId: 'clip-video-2',
      freeStartUs: secondsToMicroseconds(7),
      insertionIndex: 1,
      target: existingTarget('video-overlay-1'),
    });
    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(13),
      insertionIndex: 1,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'video-overlay-1'],
    );
    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-3', 0],
      ['clip-video-1', secondsToMicroseconds(3.5)],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1').map(
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([['clip-video-2', secondsToMicroseconds(7)]]);
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

    state.setCurrentTimeUs(secondsToMicroseconds(6));
    state.splitAtPlayhead();

    const clips = getMainVideoClips();

    expect(clips).toHaveLength(4);
    expect(clips.map((clip) => clip.startUs)).toEqual(
      [0, 4, 6, 9].map(secondsToMicroseconds),
    );
    expectTrackClipsNotToOverlap();
  });

  it('splits a specific clip at an explicit time without moving the playhead', () => {
    const state = timelineStore.getState();

    state.setCurrentTimeUs(secondsToMicroseconds(1));
    state.splitClipAtTime('clip-video-2', secondsToMicroseconds(6));

    expect(timelineStore.getState().currentTimeUs).toBe(
      secondsToMicroseconds(1),
    );
    expect(
      getMainVideoClips().map((clip) => [clip.startUs, clip.durationUs]),
    ).toEqual(
      [
        [0, 4],
        [4, 2],
        [6, 3],
        [9, 3.5],
      ].map(([start, duration]) => [
        secondsToMicroseconds(start),
        secondsToMicroseconds(duration),
      ]),
    );
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-2-split');
    expectTrackClipsNotToOverlap();
  });

  it('does not split a specific clip inside its minimum edge duration', () => {
    const state = timelineStore.getState();

    state.splitClipAtTime('clip-video-2', secondsToMicroseconds(4.5));

    expect(getMainVideoClips()).toHaveLength(3);
    expect(timelineStore.getState().past).toHaveLength(0);
  });

  it('keeps the main track compact after undo and redo', () => {
    const state = timelineStore.getState();

    state.selectClip('clip-video-2');
    state.deleteSelectedClip();
    state.undo();
    expect(getMainVideoClips().map((clip) => clip.startUs)).toEqual(
      [0, 4, 9].map(secondsToMicroseconds),
    );

    state.redo();
    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-3', secondsToMicroseconds(4)],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('restores dynamic tracks with undo and redo', () => {
    const state = timelineStore.getState();

    state.commitClipDrop({
      clipId: 'clip-video-1',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('video', 1),
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
    expect(timelineStore.getState().tracks[0]?.muted).toBe(true);
    expect(
      createVideoTimelineDraft(timelineStore.getState()).tracks[0]
        ?.muted,
    ).toBe(true);
    expect(timelineStore.getState().layoutRevision).toBe(layoutRevision);

    state.undo();
    expect(timelineStore.getState().tracks[0]?.muted).toBe(false);

    state.redo();
    expect(timelineStore.getState().tracks[0]?.muted).toBe(true);
  });

  it('increments layout revision after layout-changing actions', () => {
    let revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-video-3',
      insertionIndex: 1,
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
    });
    expect(timelineStore.getState().layoutRevision).toBe(revision + 1);
    revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().selectClip('clip-video-2');
    timelineStore.getState().deleteSelectedClip();
    expect(timelineStore.getState().layoutRevision).toBe(revision + 1);
    revision = timelineStore.getState().layoutRevision;

    timelineStore.getState().setCurrentTimeUs(secondsToMicroseconds(1));
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
    state.setCurrentTimeUs(secondsToMicroseconds(2));

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
      freeStartUs: secondsToMicroseconds(1),
      insertionIndex: 0,
      target: insertTarget('video', 1),
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
      freeStartUs: secondsToMicroseconds(1),
      insertionIndex: 0,
      target: insertTarget('video', 1),
    });
    state.toggleTrackMute('video-overlay-1');
    state.commitClipDrop({
      clipId: 'clip-video-2',
      freeStartUs: secondsToMicroseconds(5),
      insertionIndex: 1,
      target: existingTarget('video-overlay-1'),
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
        durationUs: secondsToMicroseconds(4),
        fileName: 'first.mp4',
        height: 720,
        id: 'video-source-1',
        src: 'http://localhost/first.mp4',
        type: 'video',
        width: 1280,
      },
      {
        durationUs: secondsToMicroseconds(6.25),
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
        clip.startUs,
        clip.durationUs,
        clip.sourceDurationUs,
        clip.trimStartUs,
        clip.trimEndUs,
        clip.transform,
      ]),
    ).toEqual([
      [
        'clip-video-source-1',
        'first.mp4',
        'http://localhost/first.mp4',
        0,
        secondsToMicroseconds(4),
        secondsToMicroseconds(4),
        0,
        secondsToMicroseconds(4),
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
        secondsToMicroseconds(4),
        secondsToMicroseconds(6.25),
        secondsToMicroseconds(6.25),
        0,
        secondsToMicroseconds(6.25),
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
          durationUs: secondsToMicroseconds(4),
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
      durationUs: secondsToMicroseconds(4),
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
      durationUs: secondsToMicroseconds(4),
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
        clip.startUs,
        clip.durationUs,
        clip.trimEndUs,
      ]),
    ).toEqual([
      [0, secondsToMicroseconds(5), secondsToMicroseconds(5)],
    ]);
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
          durationUs: secondsToMicroseconds(4),
          fileName: 'video.mp4',
          height: 720,
          id: 'video-source',
          src: 'http://localhost/video.mp4',
          type: 'video',
          width: 1280,
        },
        {
          durationUs: secondsToMicroseconds(10),
          fileName: 'music.mp3',
          id: 'audio-music',
          src: 'http://localhost/music.mp3',
          type: 'audio',
          waveformSrc: 'http://localhost/music.mp3?download=1',
        },
        {
          durationUs: secondsToMicroseconds(3),
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
        clip.startUs,
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

  it('removes an empty middle audio track while preserving the empty main track', () => {
    resetToTwoVisualAudioTracks();

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-audio-b',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: insertTarget('audio', 3),
    });

    expect(
      timelineStore
        .getState()
        .tracks.map((track) => [track.id, track.zIndex]),
    ).toEqual([
      [MAIN_VIDEO_TRACK_ID, 0],
      ['audio-track-1', 1],
      ['audio-track-3', 2],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-2'),
    ).toEqual([]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-audio-b'),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));

    const draft = createVideoTimelineDraft(timelineStore.getState());
    draft.tracks.splice(
      2,
      0,
      createAudioTrack('audio-track-2', '音频轨 2', 2),
    );
    draft.tracks.forEach((track, index) => {
      track.zIndex = index;
    });
    timelineStore.getState().resetTimeline({ draft });

    expect(
      timelineStore
        .getState()
        .tracks.map((track) => [track.id, track.zIndex]),
    ).toEqual([
      [MAIN_VIDEO_TRACK_ID, 0],
      ['audio-track-1', 1],
      ['audio-track-3', 2],
    ]);
    expect(
      timelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-audio-b'),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));
  });

  it('removes every emptied audio track after moving both clips', () => {
    resetToTwoVisualAudioTracks();

    const state = timelineStore.getState();
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: insertTarget('audio', 3),
    });
    state.commitClipDrop({
      clipId: 'clip-audio-a',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: existingTarget('audio-track-3'),
    });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-3'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-3').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-audio-a', 'clip-audio-b']);

    const draft = createVideoTimelineDraft(timelineStore.getState());
    timelineStore.getState().resetTimeline({ draft });

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-3'],
    );
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-3').map(
        (clip) => clip.id,
      ),
    ).toEqual(['clip-audio-a', 'clip-audio-b']);
  });

  it('removes an empty audio track after deletion and normalizes history', () => {
    resetToTwoVisualAudioTracks();

    const state = timelineStore.getState();
    state.selectClip('clip-audio-a');
    state.deleteSelectedClip();

    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-2'],
    );

    state.undo();
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-1', 'audio-track-2'],
    );

    state.redo();
    expect(timelineStore.getState().tracks.map((track) => track.id)).toEqual(
      [MAIN_VIDEO_TRACK_ID, 'audio-track-2'],
    );
  });

  it('removes empty audio tracks after the last clip moves back', () => {
    resetToTwoVisualAudioTracks();

    const state = timelineStore.getState();
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 0,
      target: insertTarget('audio', 3),
    });
    state.commitClipDrop({
      clipId: 'clip-audio-b',
      freeStartUs: secondsToMicroseconds(0),
      insertionIndex: 1,
      target: existingTarget('audio-track-1'),
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
    expect(timelineStore.getState().clips[0]?.durationUs).toBe(
      secondsToMicroseconds(5),
    );

    timelineStore.getState().resetTimeline({
      draft,
      sources: [
        {
          ...sourceWithoutDuration,
          durationUs: secondsToMicroseconds(12.75),
        },
      ],
    });

    expect(timelineStore.getState().clips[0]).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(12.75),
        sourceDurationUs: secondsToMicroseconds(12.75),
        trimEndUs: secondsToMicroseconds(12.75),
        trimStartUs: secondsToMicroseconds(0),
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
    timelineStore.getState().setCurrentTimeUs(secondsToMicroseconds(2));
    timelineStore.getState().splitAtPlayhead();
    const draft = createVideoTimelineDraft(timelineStore.getState());

    timelineStore.getState().resetTimeline({
      draft,
      sources: [
        {
          ...sourceWithoutDuration,
          durationUs: secondsToMicroseconds(12.75),
        },
      ],
    });

    expect(
      timelineStore
        .getState()
        .clips.map((clip) => [
          clip.durationUs,
          clip.sourceDurationUs,
          clip.trimStartUs,
          clip.trimEndUs,
        ]),
    ).toEqual([
      [
        secondsToMicroseconds(2),
        secondsToMicroseconds(12.75),
        0,
        secondsToMicroseconds(2),
      ],
      [
        secondsToMicroseconds(3),
        secondsToMicroseconds(12.75),
        secondsToMicroseconds(2),
        secondsToMicroseconds(5),
      ],
    ]);
  });

  it('incrementally adds newly connected sources without removing edited disconnected clips', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationUs: secondsToMicroseconds(4),
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
          durationUs: secondsToMicroseconds(6),
          fileName: 'second.mp4',
          height: 1080,
          id: 'video-source-2',
          src: 'http://localhost/second.mp4',
          type: 'video',
          width: 1080,
        },
        {
          durationUs: secondsToMicroseconds(8),
          fileName: 'music.mp3',
          id: 'audio-source-1',
          src: 'http://localhost/music.mp3',
          type: 'audio',
        },
      ],
    });

    const state = timelineStore.getState();
    expect(state.clips.map((clip) => [clip.sourceId, clip.startUs])).toEqual([
      ['video-source-1', 0],
      ['audio-source-1', 0],
      ['video-source-2', secondsToMicroseconds(4)],
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
          muted: false,
          zIndex: 0,
        },
        {
          id: 'audio-source-track-audio-source',
          name: 'music.mp3',
          type: 'audio',
          muted: false,
          zIndex: 1,
        },
      ],
    });

    timelineStore.getState().commitClipDrop({
      clipId: 'clip-audio',
      freeStartUs: secondsToMicroseconds(2),
      insertionIndex: 0,
      target: insertTarget('audio', 0),
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
      target: existingTarget(MAIN_VIDEO_TRACK_ID),
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
          muted: false,
          zIndex: 0,
        },
        {
          id: 'audio-track',
          name: '音频轨',
          type: 'audio',
          muted: false,
          zIndex: 1,
        },
      ],
    });

    const state = timelineStore.getState();
    const audioClip = state.clips.find((clip) => clip.id === 'clip-audio');
    if (!audioClip) throw new Error('Expected audio clip');
    state.setClipVolume(audioClip.id, 0.374);
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === audioClip.id)
        ?.volume,
    ).toBe(0.37);
    expect(timelineStore.getState().past).toHaveLength(0);

    state.commitClipVolume(audioClip.id, 1, 0.374);
    expect(timelineStore.getState().past).toHaveLength(1);

    state.undo();
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === audioClip.id)
        ?.volume,
    ).toBe(1);
    state.redo();
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === audioClip.id)
        ?.volume,
    ).toBe(0.37);
  });

  it('exports audio tracks after video tracks without transform extras', () => {
    timelineStore.getState().resetTimeline({
      sources: [
        {
          durationUs: secondsToMicroseconds(4),
          fileName: 'video.mp4',
          id: 'video-source',
          src: 'http://localhost/video.mp4',
          type: 'video',
        },
        {
          durationUs: secondsToMicroseconds(10),
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
    const audioClip = timelineStore
      .getState()
      .clips.find((clip) => clip.trackId === audioTrack?.id);
    timelineStore.getState().setClipVolume(audioClip?.id ?? '', 0.45);

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
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(1),
    });

    const clips = getMainVideoClips();
    expect(
      clips.map((clip) => [clip.id, clip.startUs, clip.durationUs]),
    ).toEqual([
      ['clip-video-1', 0, secondsToMicroseconds(4)],
      [
        'clip-video-2',
        secondsToMicroseconds(4),
        secondsToMicroseconds(3),
      ],
      [
        'clip-video-3',
        secondsToMicroseconds(7),
        secondsToMicroseconds(3.5),
      ],
    ]);
    expect(clips[1]).toEqual(
      expect.objectContaining({
        trimEndUs: secondsToMicroseconds(4),
        trimStartUs: secondsToMicroseconds(1),
      }),
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
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(1),
    });
    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEndUs: secondsToMicroseconds(8),
      trimStartUs: secondsToMicroseconds(1),
    });

    const clips = getMainVideoClips();
    expect(
      clips.map((clip) => [clip.id, clip.startUs, clip.durationUs, clip.trimEndUs]),
    ).toEqual([
      [
        'clip-video-1',
        0,
        secondsToMicroseconds(4),
        secondsToMicroseconds(4),
      ],
      [
        'clip-video-2',
        secondsToMicroseconds(4),
        secondsToMicroseconds(5),
        secondsToMicroseconds(6),
      ],
      [
        'clip-video-3',
        secondsToMicroseconds(9),
        secondsToMicroseconds(3.5),
        secondsToMicroseconds(4),
      ],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('moves the selected clip start when trimming the left edge to the right', () => {
    timelineStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(6),
      trimStartUs: secondsToMicroseconds(2),
    });

    const clips = getMainVideoClips();
    expect(
      clips.map((clip) => [
        clip.id,
        clip.startUs,
        clip.durationUs,
        clip.trimStartUs,
        clip.trimEndUs,
      ]),
    ).toEqual([
      [
        'clip-video-1',
        0,
        secondsToMicroseconds(4),
        0,
        secondsToMicroseconds(4),
      ],
      [
        'clip-video-2',
        secondsToMicroseconds(4),
        secondsToMicroseconds(4),
        secondsToMicroseconds(2),
        secondsToMicroseconds(6),
      ],
      [
        'clip-video-3',
        secondsToMicroseconds(8),
        secondsToMicroseconds(3.5),
        secondsToMicroseconds(0.5),
        secondsToMicroseconds(4),
      ],
    ]);
    expectTrackClipsNotToOverlap();
  });

  it('compacts the main track after left trim when another video track exists', () => {
    timelineStore.setState({
      clips: [
        ...createFixtureClips(),
        {
          ...createFixtureClips()[0],
          id: 'clip-overlay',
          src: 'http://localhost/overlay.mp4',
          startUs: secondsToMicroseconds(0),
          trackId: 'video-overlay-1',
          volume: 1,
          zIndex: 0,
        },
      ],
      tracks: [
        {
          id: MAIN_VIDEO_TRACK_ID,
          name: '视频轨',
          type: 'video',
          muted: false,
          zIndex: 0,
        },
        {
          id: 'video-overlay-1',
          name: '视频轨 2',
          type: 'video',
          muted: false,
          zIndex: 1,
        },
      ],
    });

    timelineStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(6),
      trimStartUs: secondsToMicroseconds(2),
    });

    expect(
      getMainVideoClips().map((clip) => [clip.id, clip.startUs, clip.durationUs]),
    ).toEqual([
      ['clip-video-1', 0, secondsToMicroseconds(4)],
      [
        'clip-video-2',
        secondsToMicroseconds(4),
        secondsToMicroseconds(4),
      ],
      [
        'clip-video-3',
        secondsToMicroseconds(8),
        secondsToMicroseconds(3.5),
      ],
    ]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'video-overlay-1').map(
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([['clip-overlay', 0]]);
    expectTrackClipsNotToOverlap();
  });

  it('limits left-edge trim restore by the previous clip and timeline start', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(6),
      trimStartUs: secondsToMicroseconds(2),
    });
    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(6),
      trimStartUs: secondsToMicroseconds(0),
    });

    expect(
      getMainVideoClips().map((clip) => [
        clip.id,
        clip.startUs,
        clip.durationUs,
        clip.trimStartUs,
      ]),
    ).toEqual([
      ['clip-video-1', 0, secondsToMicroseconds(4), 0],
      [
        'clip-video-2',
        secondsToMicroseconds(4),
        secondsToMicroseconds(6),
        0,
      ],
      [
        'clip-video-3',
        secondsToMicroseconds(10),
        secondsToMicroseconds(3.5),
        secondsToMicroseconds(0.5),
      ],
    ]);

    state.commitClipTrim({
      clipId: 'clip-video-1',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(1),
    });
    state.commitClipTrim({
      clipId: 'clip-video-1',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(0),
    });

    expect(getMainVideoClips()[0]).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(4),
        startUs: secondsToMicroseconds(0),
        trimStartUs: secondsToMicroseconds(0),
      }),
    );
    expectTrackClipsNotToOverlap();
  });

  it('keeps trim edits within source bounds and the minimum clip duration', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(6),
      trimStartUs: secondsToMicroseconds(5.8),
    });

    let clip = getMainVideoClips()[1];
    expect(clip).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(0.6),
        startUs: secondsToMicroseconds(4),
        trimEndUs: secondsToMicroseconds(6),
        trimStartUs: secondsToMicroseconds(5.4),
      }),
    );

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEndUs: secondsToMicroseconds(20),
      trimStartUs: secondsToMicroseconds(5.4),
    });

    clip = getMainVideoClips()[1];
    expect(clip).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(0.6),
        startUs: secondsToMicroseconds(4),
        trimEndUs: secondsToMicroseconds(6),
        trimStartUs: secondsToMicroseconds(5.4),
      }),
    );
    expectTrackClipsNotToOverlap();
  });

  it('restores a video clip with the same layout as manually restoring both trim edges', () => {
    timelineStore.setState((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id === 'clip-video-2') {
          return {
            ...clip,
            durationUs: secondsToMicroseconds(3),
            trimEndUs: secondsToMicroseconds(4),
            trimStartUs: secondsToMicroseconds(1),
          };
        }
        if (clip.id === 'clip-video-3') {
          return { ...clip, startUs: secondsToMicroseconds(7) };
        }
        return clip;
      }),
    }));
    const manualStore = createTimelineStore();
    const initialState = timelineStore.getState();
    manualStore.setState({
      clips: initialState.clips.map((clip) => ({ ...clip })),
      currentTimeUs: initialState.currentTimeUs,
      future: [],
      isPlaying: initialState.isPlaying,
      past: [],
      selectedClipId: initialState.selectedClipId,
      tracks: initialState.tracks.map((track) => ({ ...track })),
    });

    manualStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'start',
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(0),
    });
    const manuallyRestoredStart = manualStore
      .getState()
      .clips.find((clip) => clip.id === 'clip-video-2');
    manualStore.getState().commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEndUs: manuallyRestoredStart?.sourceDurationUs ?? 0,
      trimStartUs: manuallyRestoredStart?.trimStartUs ?? 0,
    });

    timelineStore.getState().restoreClipTrim('clip-video-2');

    expect(timelineStore.getState().clips).toEqual(
      manualStore.getState().clips,
    );
    expect(
      getMainVideoClips().find((clip) => clip.id === 'clip-video-2'),
    ).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(6),
        trimEndUs: secondsToMicroseconds(6),
        trimStartUs: 0,
      }),
    );
    expect(getMainVideoClips().find((clip) => clip.id === 'clip-video-3'))
      .toEqual(expect.objectContaining({ startUs: secondsToMicroseconds(10) }));
    expect(timelineStore.getState().past).toHaveLength(1);
    expectTrackClipsNotToOverlap();

    timelineStore.getState().undo();
    expect(getMainVideoClips().find((clip) => clip.id === 'clip-video-2'))
      .toEqual(
        expect.objectContaining({
          durationUs: secondsToMicroseconds(3),
          trimEndUs: secondsToMicroseconds(4),
          trimStartUs: secondsToMicroseconds(1),
        }),
      );
    timelineStore.getState().redo();
    expect(getMainVideoClips().find((clip) => clip.id === 'clip-video-2'))
      .toEqual(
        expect.objectContaining({
          durationUs: secondsToMicroseconds(6),
          trimEndUs: secondsToMicroseconds(6),
          trimStartUs: 0,
        }),
      );
  });

  it('restores an audio clip with the same layout as manually restoring both trim edges', () => {
    const audioTrackId = 'audio-track-restore';
    const leadingClip = {
      ...createAudioClip('clip-audio-leading', audioTrackId),
      durationUs: secondsToMicroseconds(3),
      sourceDurationUs: secondsToMicroseconds(3),
      trimEndUs: secondsToMicroseconds(3),
      zIndex: 0,
    };
    const restoredClip = {
      ...createAudioClip('clip-audio-restore', audioTrackId),
      durationUs: secondsToMicroseconds(3),
      sourceDurationUs: secondsToMicroseconds(6),
      startUs: secondsToMicroseconds(3),
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(1),
      zIndex: 1,
    };
    const followingClip = {
      ...createAudioClip('clip-audio-following', audioTrackId),
      durationUs: secondsToMicroseconds(2),
      sourceDurationUs: secondsToMicroseconds(2),
      startUs: secondsToMicroseconds(6),
      trimEndUs: secondsToMicroseconds(2),
      zIndex: 2,
    };
    const tracks = [
      createVideoTrack(MAIN_VIDEO_TRACK_ID, '视频轨', 0),
      createAudioTrack(audioTrackId, '音频轨 1', 1),
    ];
    timelineStore.setState({
      clips: [leadingClip, restoredClip, followingClip],
      currentTimeUs: secondsToMicroseconds(0),
      future: [],
      isPlaying: false,
      past: [],
      selectedClipId: null,
      tracks,
    });
    const manualStore = createTimelineStore();
    manualStore.setState({
      clips: timelineStore.getState().clips.map((clip) => ({ ...clip })),
      currentTimeUs: secondsToMicroseconds(0),
      future: [],
      isPlaying: false,
      past: [],
      selectedClipId: null,
      tracks: tracks.map((track) => ({ ...track })),
    });

    manualStore.getState().commitClipTrim({
      clipId: restoredClip.id,
      edge: 'start',
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(0),
    });
    const manuallyRestoredStart = manualStore
      .getState()
      .clips.find((clip) => clip.id === restoredClip.id);
    manualStore.getState().commitClipTrim({
      clipId: restoredClip.id,
      edge: 'end',
      trimEndUs: manuallyRestoredStart?.sourceDurationUs ?? 0,
      trimStartUs: manuallyRestoredStart?.trimStartUs ?? 0,
    });

    timelineStore.getState().restoreClipTrim(restoredClip.id);

    expect(timelineStore.getState().clips).toEqual(
      manualStore.getState().clips,
    );
    expect(
      getTrackClips(timelineStore.getState().clips, audioTrackId).map((clip) => [
        clip.id,
        clip.startUs,
        clip.durationUs,
        clip.trimStartUs,
        clip.trimEndUs,
      ]),
    ).toEqual([
      [
        'clip-audio-leading',
        0,
        secondsToMicroseconds(3),
        0,
        secondsToMicroseconds(3),
      ],
      [
        'clip-audio-restore',
        secondsToMicroseconds(3),
        secondsToMicroseconds(5),
        secondsToMicroseconds(1),
        secondsToMicroseconds(6),
      ],
      [
        'clip-audio-following',
        secondsToMicroseconds(8),
        secondsToMicroseconds(2),
        0,
        secondsToMicroseconds(2),
      ],
    ]);
    expect(timelineStore.getState().past).toHaveLength(1);
    expectTrackClipsNotToOverlap(audioTrackId);
  });

  it('does not add history when restoring an already complete clip', () => {
    const initialClips = timelineStore.getState().clips;

    timelineStore.getState().restoreClipTrim('clip-video-1');

    expect(timelineStore.getState().clips).toBe(initialClips);
    expect(timelineStore.getState().past).toEqual([]);
  });

  it('stores trim edits in undo and redo history', () => {
    const state = timelineStore.getState();

    state.commitClipTrim({
      clipId: 'clip-video-2',
      edge: 'end',
      trimEndUs: secondsToMicroseconds(4),
      trimStartUs: secondsToMicroseconds(1),
    });
    expect(getMainVideoClips()[1]?.trimEndUs).toBe(secondsToMicroseconds(4));
    expect(getMainVideoClips()[2]?.startUs).toBe(secondsToMicroseconds(7));

    state.undo();
    expect(getMainVideoClips()[1]?.trimEndUs).toBe(secondsToMicroseconds(6));
    expect(getMainVideoClips()[2]?.startUs).toBe(secondsToMicroseconds(9));
    expectTrackClipsNotToOverlap();

    state.redo();
    expect(getMainVideoClips()[1]?.trimEndUs).toBe(secondsToMicroseconds(4));
    expect(getMainVideoClips()[2]?.startUs).toBe(secondsToMicroseconds(7));
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
    expect(timelineStore.getState().past).toEqual([]);
    expect(timelineStore.getState().future).toEqual([]);
  });

  it('inserts an exact copy after the anchor and ripples later same-track clips', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips.map((clip) =>
          clip.id === 'clip-video-2'
            ? { ...clip, startUs: secondsToMicroseconds(6) }
            : clip.id === 'clip-video-3'
              ? { ...clip, startUs: secondsToMicroseconds(13) }
              : clip,
        ),
        {
          ...createAudioClip('clip-audio', 'audio-track-1'),
          startUs: secondsToMicroseconds(4),
        },
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
      getMainVideoClips().map((clip) => [clip.id, clip.startUs, clip.zIndex]),
    ).toEqual([
      ['clip-video-1', 0, 0],
      ['clip-video-1-copy', secondsToMicroseconds(4), 1],
      ['clip-video-2', secondsToMicroseconds(8), 2],
      ['clip-video-3', secondsToMicroseconds(13), 3],
    ]);
    expect(timelineStore.getState().selectedClipId).toBe('clip-video-1-copy');
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === 'clip-audio')
        ?.startUs,
    ).toBe(secondsToMicroseconds(4));
    expect(
      timelineStore.getState().clips.find((clip) => clip.id === 'clip-video-1-copy'),
    ).toEqual(
      expect.objectContaining({
        ...originalClip,
        id: 'clip-video-1-copy',
        startUs: secondsToMicroseconds(4),
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
      getMainVideoClips().map((clip) => [clip.id, clip.startUs]),
    ).toEqual([
      ['clip-video-1', 0],
      ['clip-video-1-copy', secondsToMicroseconds(4)],
      ['clip-video-1-copy-2', secondsToMicroseconds(8)],
      ['clip-video-2', secondsToMicroseconds(12)],
      ['clip-video-3', secondsToMicroseconds(17)],
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
          startUs: secondsToMicroseconds(0),
          trackId: 'video-overlay-1',
        },
        {
          ...state.clips[1]!,
          id: 'clip-overlay-next',
          startUs: secondsToMicroseconds(6),
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
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([
      ['clip-overlay', 0],
      ['clip-video-1-copy', secondsToMicroseconds(4)],
      ['clip-overlay-next', secondsToMicroseconds(8)],
    ]);
    expect(timelineStore.getState().clips.find((clip) => clip.id === 'clip-video-1-copy'))
      .toEqual(expect.objectContaining({ trackId: 'video-overlay-1' }));
    expect(getMainVideoClips().map((clip) => [clip.id, clip.startUs])).toEqual([
      ['clip-video-1', 0],
      ['clip-video-2', secondsToMicroseconds(4)],
      ['clip-video-3', secondsToMicroseconds(9)],
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
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([['clip-audio-a', 0]]);
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track-2').map(
        (clip) => [clip.id, clip.startUs],
      ),
    ).toEqual([
      ['clip-audio-b', 0],
      ['clip-audio-a-copy', secondsToMicroseconds(4)],
    ]);
    expect(timelineStore.getState().selectedClipId).toBe('clip-audio-a-copy');
  });

  it('does not paste between audio and video tracks and clears the buffer on reset', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          ...createAudioClip('clip-audio-target', 'audio-track-1'),
          startUs: secondsToMicroseconds(4),
        },
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
        { ...createFixtureClips()[0], id: 'clip-video-target', startUs: secondsToMicroseconds(0) },
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
    durationUs: secondsToMicroseconds(4),
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

    store.getState().syncSources([{ ...source, durationUs: secondsToMicroseconds(8) }]);
    expect(store.getState().clips).toHaveLength(0);
  });

  it('refreshes current source identity without rewriting edit history', () => {
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
    expect(store.getState().past[0]?.clips[0]?.src).toBe(source.src);
    expect(store.getState().future[0]?.clips[0]?.src).toBe(source.src);
  });
});
