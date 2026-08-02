import { describe, expect, it } from 'vitest';

import {
  TIMELINE_CONTENT_PADDING_X,
  TIMELINE_RULER_HEIGHT,
} from '../core/timeline-layout';
import type { TimelineClip, TimelineTrack } from '../types';
import {
  TRACK_INSERT_ACQUIRE_DISTANCE,
  TRACK_INSERT_RELEASE_DISTANCE,
  getContentPoint,
  getTrackInsertTargetAtY,
  planClipTrim,
  type TrimGesture,
} from './timeline-interaction';

const createTrack = (
  id: string,
  type: TimelineTrack['type'],
  zIndex: number,
): TimelineTrack => ({
  id,
  name: type === 'audio' ? '音频轨道' : id,
  type,
  muted: false,
  zIndex,
});

const tracks = [
  createTrack('audio-track-1', 'audio', 0),
  createTrack('video-main', 'video', 1),
  createTrack('video-overlay-1', 'video', 2),
];

const createVideoClip = (
  patch: Partial<Extract<TimelineClip, { type: 'video' }>> = {},
): Extract<TimelineClip, { type: 'video' }> => ({
  durationUs: 3_000_000,
  id: 'trimmed-video',
  name: 'trimmed.mp4',
  sourceDurationUs: 6_000_000,
  sourceId: 'trimmed-source',
  speed: 1,
  src: '/trimmed.mp4',
  startUs: 0,
  trackId: 'video-main',
  transform: { height: 720, width: 1_280, x: 0, y: 0 },
  trimEndUs: 3_000_000,
  trimStartUs: 0,
  type: 'video',
  volume: 1,
  zIndex: 0,
  ...patch,
  hidden: patch.hidden ?? false,
});

const createTrimGesture = (
  patch: Partial<TrimGesture> = {},
): TrimGesture => {
  const clip = patch.clip ?? createVideoClip();
  const edge = patch.edge ?? 'end';

  return {
    clip,
    clips: patch.clips ?? [clip],
    edge,
    initialPointerTimeUs:
      patch.initialPointerTimeUs ??
      clip.startUs + (edge === 'end' ? clip.durationUs : 0),
    kind: 'trim',
    pixelsPerSecond: patch.pixelsPerSecond ?? 80,
    pointerId: patch.pointerId ?? 1,
    snapCandidates: patch.snapCandidates ?? [4_000_000],
    snappingEnabled: patch.snappingEnabled ?? true,
  };
};

describe('timeline content coordinates', () => {
  it('uses the tracks viewport scroll position for body coordinates', () => {
    const viewport = document.createElement('div');
    viewport.scrollLeft = 48;
    viewport.scrollTop = 120;
    viewport.getBoundingClientRect = () =>
      ({
        left: 96,
        top: TIMELINE_RULER_HEIGHT,
      }) as DOMRect;

    expect(getContentPoint(viewport, 180, 72)).toEqual({
      x: 180 - 96 + 48 - TIMELINE_CONTENT_PADDING_X,
      y: TIMELINE_RULER_HEIGHT + 40 + 120,
    });
  });

  it('maps the ruler above the tracks viewport without vertical scroll', () => {
    const viewport = document.createElement('div');
    viewport.scrollLeft = 24;
    viewport.scrollTop = 120;
    viewport.getBoundingClientRect = () =>
      ({
        left: 96,
        top: TIMELINE_RULER_HEIGHT,
      }) as DOMRect;

    expect(getContentPoint(viewport, 84, 12)).toEqual({
      x: 0,
      y: 12,
    });
  });
});

describe('timeline track insertion targeting', () => {
  it('acquires an insertion target within four pixels of its line', () => {
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_ACQUIRE_DISTANCE,
      ),
    ).toEqual({ index: 2, type: 'video' });
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_ACQUIRE_DISTANCE + 0.01,
      ),
    ).toBeNull();
  });

  it('retains an acquired target through the wider release distance', () => {
    const target = { index: 2, type: 'video' } as const;

    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_RELEASE_DISTANCE,
        target,
      ),
    ).toEqual(target);
    expect(
      getTrackInsertTargetAtY(
        tracks,
        'video',
        90 + TRACK_INSERT_RELEASE_DISTANCE + 0.01,
        target,
      ),
    ).toBeNull();
  });

  it('only exposes insertion positions inside the clip type group', () => {
    expect(getTrackInsertTargetAtY(tracks, 'audio', 90)).toBeNull();
    expect(getTrackInsertTargetAtY(tracks, 'audio', 150)).toEqual({
      index: 1,
      type: 'audio',
    });
  });
});

describe('timeline clip trim planning', () => {
  it('snaps an end trim to a candidate inside the six-pixel threshold', () => {
    expect(planClipTrim(createTrimGesture(), 3_950_000)).toEqual({
      clipId: 'trimmed-video',
      durationUs: 4_000_000,
      edge: 'end',
      snapTimeUs: 4_000_000,
      startUs: 0,
      timeUs: 4_000_000,
    });
  });

  it('snaps a start trim while keeping its end fixed', () => {
    const clip = createVideoClip({
      startUs: 2_000_000,
      trackId: 'video-overlay-1',
    });

    expect(
      planClipTrim(
        createTrimGesture({
          clip,
          edge: 'start',
          snapCandidates: [3_000_000],
        }),
        2_950_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 2_000_000,
      edge: 'start',
      snapTimeUs: 3_000_000,
      startUs: 3_000_000,
      timeUs: 3_000_000,
    });
  });

  it.each([
    { pixelsPerSecond: 40, pointerTimeUs: 3_875_000 },
    { pixelsPerSecond: 160, pointerTimeUs: 3_968_750 },
  ])(
    'keeps the threshold at five screen pixels with $pixelsPerSecond pixels per second',
    ({ pixelsPerSecond, pointerTimeUs }) => {
      expect(
        planClipTrim(
          createTrimGesture({ pixelsPerSecond }),
          pointerTimeUs,
        ).snapTimeUs,
      ).toBe(4_000_000);
    },
  );

  it('does not snap outside the six-pixel threshold', () => {
    expect(planClipTrim(createTrimGesture(), 3_900_000)).toEqual({
      clipId: 'trimmed-video',
      durationUs: 3_900_000,
      edge: 'end',
      snapTimeUs: null,
      startUs: 0,
      timeUs: 3_900_000,
    });
  });

  it('keeps the first candidate on an exact distance tie', () => {
    expect(
      planClipTrim(
        createTrimGesture({
          snapCandidates: [3_900_000, 4_000_000],
        }),
        3_950_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 3_900_000,
      edge: 'end',
      snapTimeUs: 3_900_000,
      startUs: 0,
      timeUs: 3_900_000,
    });
  });

  it('preserves free trimming when timeline snapping is disabled', () => {
    expect(
      planClipTrim(
        createTrimGesture({ snappingEnabled: false }),
        3_950_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 3_950_000,
      edge: 'end',
      snapTimeUs: null,
      startUs: 0,
      timeUs: 3_950_000,
    });
  });

  it('rejects a snap that the previous same-track clip would constrain', () => {
    const clip = createVideoClip({
      startUs: 2_000_000,
      trackId: 'video-overlay-1',
    });
    const previous = createVideoClip({
      durationUs: 2_500_000,
      id: 'previous-video',
      sourceDurationUs: 2_500_000,
      sourceId: 'previous-source',
      trackId: 'video-overlay-1',
      trimEndUs: 2_500_000,
    });

    expect(
      planClipTrim(
        createTrimGesture({
          clip,
          clips: [previous, clip],
          edge: 'start',
          snapCandidates: [2_400_000],
        }),
        2_450_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 2_500_000,
      edge: 'start',
      snapTimeUs: null,
      startUs: 2_500_000,
      timeUs: 2_450_000,
    });
  });

  it('does not show a snap when the media source boundary prevents it', () => {
    const clip = createVideoClip({
      sourceDurationUs: 3_000_000,
    });

    expect(
      planClipTrim(
        createTrimGesture({
          clip,
          snapCandidates: [4_000_000],
        }),
        3_950_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 3_000_000,
      edge: 'end',
      snapTimeUs: null,
      startUs: 0,
      timeUs: 3_000_000,
    });
  });

  it('does not show a snap that would violate minimum clip duration', () => {
    const clip = createVideoClip({
      durationUs: 1_000_000,
      trimEndUs: 1_000_000,
    });

    expect(
      planClipTrim(
        createTrimGesture({
          clip,
          snapCandidates: [50_000],
        }),
        75_000,
      ),
    ).toEqual({
      clipId: 'trimmed-video',
      durationUs: 600_000,
      edge: 'end',
      snapTimeUs: null,
      startUs: 0,
      timeUs: 600_000,
    });
  });

  it('applies the same trim snapping to text clips', () => {
    const clip: TimelineClip = {
      bold: false,
      durationUs: 2_000_000,
      fontColor: '#FFFFFFFF',
      fontSize: 80,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip',
      italic: false,
      layoutSize: { height: 120, width: 800 },
      position: { x: 0, y: 0 },
      startUs: 1_000_000,
      text: 'Title',
      trackId: 'text-track-1',
      type: 'text',
      underline: false,
      zIndex: 0,
    };

    expect(
      planClipTrim(
        createTrimGesture({
          clip,
          snapCandidates: [4_000_000],
        }),
        3_950_000,
      ),
    ).toEqual({
      clipId: 'text-clip',
      durationUs: 3_000_000,
      edge: 'end',
      snapTimeUs: 4_000_000,
      startUs: 1_000_000,
      timeUs: 4_000_000,
    });
  });
});
