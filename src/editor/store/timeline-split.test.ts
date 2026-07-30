import { beforeEach, describe, expect, it } from 'vitest';

import { getTrackClips } from '../core/collision';
import { secondsToMicroseconds } from '../core/time';
import { createTimelineStore, MAIN_VIDEO_TRACK_ID } from './timeline-store';

const timelineStore = createTimelineStore();

const resetStoreWithSource = () => {
  timelineStore.getState().resetTimeline({
    sources: [
      {
        durationUs: secondsToMicroseconds(4),
        fileName: 'clip.mp4',
        id: 'video-source-1',
        src: 'http://localhost/clip.mp4',
        type: 'video',
      },
    ],
  });
};

const getMainVideoClips = () =>
  getTrackClips(
    timelineStore.getState().clips,
    MAIN_VIDEO_TRACK_ID,
  ).filter((clip) => clip.type === 'video');

describe('timeline splitting', () => {
  beforeEach(() => {
    resetStoreWithSource();
  });

  it('does not split when either side would be shorter than 0.6s', () => {
    const state = timelineStore.getState();
    const initialRevision = state.layoutRevision;

    state.setCurrentTimeUs(secondsToMicroseconds(0.5));
    state.splitAtPlayhead();
    state.setCurrentTimeUs(secondsToMicroseconds(3.5));
    state.splitAtPlayhead();

    expect(getMainVideoClips()).toHaveLength(1);
    expect(timelineStore.getState().layoutRevision).toBe(initialRevision);
  });

  it('allows splitting when both sides are at least 0.6s', () => {
    const state = timelineStore.getState();

    state.setCurrentTimeUs(secondsToMicroseconds(0.6));
    state.splitAtPlayhead();

    expect(
      getMainVideoClips().map((clip) => [clip.startUs, clip.durationUs]),
    ).toEqual([
      [0, 0.6],
      [0.6, 3.4],
    ].map(([start, duration]) => [
      secondsToMicroseconds(start),
      secondsToMicroseconds(duration),
    ]));
  });

  it('maps a speed-adjusted split point back to the source without gaps', () => {
    const state = timelineStore.getState();
    state.commitClipSpeed({ clipId: 'clip-video-source-1', speed: 2 });
    state.setCurrentTimeUs(secondsToMicroseconds(1));
    state.splitAtPlayhead();

    expect(
      getMainVideoClips().map((clip) => [
        clip.startUs,
        clip.durationUs,
        clip.trimStartUs,
        clip.trimEndUs,
        clip.speed,
      ]),
    ).toEqual([
      [
        0,
        secondsToMicroseconds(1),
        0,
        secondsToMicroseconds(2),
        2,
      ],
      [
        secondsToMicroseconds(1),
        secondsToMicroseconds(1),
        secondsToMicroseconds(2),
        secondsToMicroseconds(4),
        2,
      ],
    ]);
  });

  it('splits the selected audio clip when video and audio overlap', () => {
    timelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          durationUs: secondsToMicroseconds(4),
          id: 'clip-audio',
          name: 'music.mp3',
          sourceDurationUs: secondsToMicroseconds(4),
          sourceId: 'audio-source',
          speed: 1,
          src: 'http://localhost/music.mp3',
          startUs: 0,
          trackId: 'audio-track',
          trimEndUs: secondsToMicroseconds(4),
          trimStartUs: 0,
          transform: { height: 720, width: 1280, x: 0, y: 0 },
          type: 'audio',
          volume: 1,
          zIndex: 0,
        },
      ],
      tracks: [
        ...state.tracks,
        {
          id: 'audio-track',
          name: '音频轨',
          type: 'audio',
          muted: false,
          zIndex: 1,
        },
      ],
    }));
    const state = timelineStore.getState();
    state.selectClip('clip-audio');
    state.setCurrentTimeUs(secondsToMicroseconds(2));
    state.splitAtPlayhead();

    expect(getMainVideoClips()).toHaveLength(1);
    expect(
      getTrackClips(timelineStore.getState().clips, 'audio-track').map(
        (clip) => [clip.startUs, clip.durationUs],
      ),
    ).toEqual([
      [0, 2],
      [2, 2],
    ].map(([start, duration]) => [
      secondsToMicroseconds(start),
      secondsToMicroseconds(duration),
    ]));
  });
});
