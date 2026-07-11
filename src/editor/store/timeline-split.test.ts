import { beforeEach, describe, expect, it } from 'vitest';

import { getTrackClips } from '../core/collision';
import { createTimelineStore, MAIN_VIDEO_TRACK_ID } from './timeline-store';

const timelineStore = createTimelineStore();

const resetStoreWithSource = () => {
  timelineStore.getState().resetTimeline({
    sources: [
      {
        durationSeconds: 4,
        fileName: 'clip.mp4',
        id: 'video-source-1',
        src: 'http://localhost/clip.mp4',
        type: 'video',
      },
    ],
  });
};

const getMainVideoClips = () =>
  getTrackClips(timelineStore.getState().clips, MAIN_VIDEO_TRACK_ID);

describe('timeline splitting', () => {
  beforeEach(() => {
    resetStoreWithSource();
  });

  it('does not split when either side would be shorter than 0.6s', () => {
    const state = timelineStore.getState();
    const initialRevision = state.layoutRevision;

    state.setCurrentTime(0.5);
    state.splitAtPlayhead();
    state.setCurrentTime(3.5);
    state.splitAtPlayhead();

    expect(getMainVideoClips()).toHaveLength(1);
    expect(timelineStore.getState().layoutRevision).toBe(initialRevision);
  });

  it('allows splitting when both sides are at least 0.6s', () => {
    const state = timelineStore.getState();

    state.setCurrentTime(0.6);
    state.splitAtPlayhead();

    expect(
      getMainVideoClips().map((clip) => [clip.start, clip.duration]),
    ).toEqual([
      [0, 0.6],
      [0.6, 3.4],
    ]);
  });

  it('splits the selected audio clip when video and audio overlap', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          duration: 4,
          id: 'clip-audio',
          name: 'music.mp3',
          sourceDuration: 4,
          sourceId: 'audio-source',
          src: 'http://localhost/music.mp3',
          start: 0,
          thumbnailUrls: [],
          trackId: 'audio-track',
          trimEnd: 4,
          trimStart: 0,
          transform: { height: 720, width: 1280, x: 0, y: 0 },
          type: 'audio',
          zIndex: 0,
        },
      ],
      tracks: [
        ...state.tracks,
        {
          id: 'audio-track',
          name: '音频轨',
          type: 'audio',
          volume: 1,
          zIndex: 1,
        },
      ],
    }));
    const state = timelineStore.getState();
    state.selectClip('clip-audio');
    state.setCurrentTime(2);
    state.splitAtPlayhead();

    expect(getMainVideoClips()).toHaveLength(1);
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track').map(
        (clip) => [clip.start, clip.duration],
      ),
    ).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });
});
