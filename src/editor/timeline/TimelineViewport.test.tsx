import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import {
  MAIN_VIDEO_TRACK_ID,
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
} from '../store/timeline-store';
import type { TimelineClip, TimelineTrack } from '../types';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from '../components/test-helpers';
import { TimelineViewport } from './TimelineViewport';

vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();

  return {
    ...actual,
    useAudioWaveformSamples: () => [0.2, 0.8, 0.4],
    useFramePreviewUrls: () => [],
  };
});

const videoTrack: TimelineTrack = {
  id: MAIN_VIDEO_TRACK_ID,
  name: '视频轨',
  type: 'video',
  volume: 1,
  zIndex: 0,
};

const audioTrack: TimelineTrack = {
  id: 'audio-track-1',
  name: '音频轨 1',
  type: 'audio',
  volume: 0.5,
  zIndex: 1,
};

const createClip = (patch: Partial<TimelineClip>): TimelineClip => ({
  duration: 4,
  id: 'video-clip',
  name: 'opening.mp4',
  sourceDuration: 6,
  sourceId: 'video-source',
  src: '/opening.mp4',
  start: 0,
  thumbnailUrls: ['opening-frame.jpg'],
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  trimEnd: 4,
  trimStart: 0,
  type: 'video',
  zIndex: 0,
  ...patch,
});

const videoClip = createClip({});
const audioClip = createClip({
  duration: 3,
  id: 'audio-clip',
  name: 'background.mp3',
  sourceDuration: 3,
  sourceId: 'audio-source',
  src: '/background.mp3',
  start: 1,
  thumbnailUrls: [],
  trackId: audioTrack.id,
  trimEnd: 3,
  type: 'audio',
});

const createRect = ({
  height = 0,
  left = 0,
  top = 0,
  width = 0,
}: Partial<Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>> = {}) =>
  ({
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  }) as DOMRect;

const renderTimeline = () => {
  const result = renderWithEditorProviders(<TimelineViewport />);
  const viewport = screen.getByLabelText('时间线轨道区域');
  const grid = viewport.firstElementChild as HTMLDivElement;

  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    value: 240,
  });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
    createRect({ height: 240, width: 800 }),
  );
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(
    createRect({ height: 240, width: 1_200 }),
  );
  fireEvent(window, new Event('resize'));

  return { ...result, grid, viewport };
};

describe('TimelineViewport DOM interactions', () => {
  beforeEach(() => {
    resetTestTimelineStore();
    testTimelineStore.setState({
      clips: [videoClip, audioClip],
      currentTime: 0,
      future: [],
      isPlaying: false,
      past: [],
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
      selectedClipId: videoClip.id,
      snappingEnabled: false,
      tracks: [videoTrack, audioTrack],
    });
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders sticky track controls without names and semantic video/audio clips', () => {
    renderTimeline();

    const videoMuteButton = screen.getByRole('button', {
      name: '视频轨道静音',
    });
    const audioMuteButton = screen.getByRole('button', {
      name: '音频轨 1静音',
    });
    const videoHeader = videoMuteButton.parentElement;
    const audioHeader = audioMuteButton.parentElement;
    expect(videoHeader).not.toBeNull();
    expect(audioHeader).not.toBeNull();
    expect(videoHeader).toHaveClass('oc-timeline-track__control');
    expect(audioHeader).toHaveClass('oc-timeline-track__control');
    expect(videoHeader?.parentElement).toHaveClass('oc-timeline-track');
    expect(videoHeader?.parentElement).toHaveStyle({ height: '56px' });
    expect(audioHeader?.parentElement).toHaveClass('oc-timeline-track');
    expect(audioHeader?.parentElement).toHaveStyle({ height: '40px' });
    expect(videoHeader).not.toHaveStyle({ gridRow: '2' });
    expect(document.querySelector('.oc-timeline-track-stack')).toContainElement(
      document.querySelector('.oc-timeline-tail-row'),
    );
    expect(screen.getByTitle('视频轨道')).toHaveClass(
      'oc-timeline-track__icon',
    );
    expect(screen.getByTitle(audioTrack.name)).toHaveClass(
      'oc-timeline-track__icon',
    );
    expect(videoMuteButton).toHaveAttribute('aria-pressed', 'false');
    expect(audioMuteButton).toHaveAttribute('aria-pressed', 'false');
    expect(videoMuteButton).toHaveAttribute('title', '静音');
    expect(audioMuteButton).toHaveAttribute('title', '静音');

    fireEvent.click(videoMuteButton);

    expect(
      screen.getByRole('button', { name: '视频轨道取消静音' }),
    ).toHaveAttribute('title', '取消静音');

    expect(
      screen.getByRole('article', { name: 'video clip: opening.mp4' }),
    ).toHaveAttribute('data-clip-id', videoClip.id);
    expect(
      screen.getByRole('article', { name: 'video clip: opening.mp4' }),
    ).toHaveAttribute('data-type', 'video');
    expect(
      screen.getByRole('article', { name: 'audio clip: background.mp3' }),
    ).toHaveAttribute('data-clip-id', audioClip.id);
    expect(
      screen.getByRole('article', { name: 'audio clip: background.mp3' }),
    ).toHaveAttribute('data-type', 'audio');
  });

  it('updates the playhead from ruler and empty-lane pointer presses', () => {
    renderTimeline();

    const ruler = screen.getByRole('slider', { name: '时间标尺' });
    fireEvent.pointerDown(ruler, {
      button: 0,
      clientX: 308,
      clientY: 10,
      pointerId: 1,
    });
    expect(testTimelineStore.getState().currentTime).toBe(2.5);
    expect(screen.getByLabelText('时间线轨道区域')).toHaveAttribute(
      'data-scrubbing',
      'true',
    );
    fireEvent.pointerUp(window, {
      clientX: 308,
      clientY: 10,
      pointerId: 1,
    });
    expect(screen.getByLabelText('时间线轨道区域')).toHaveAttribute(
      'data-scrubbing',
      'false',
    );

    const videoLane = document.querySelector(
      `[data-track-id="${MAIN_VIDEO_TRACK_ID}"]`,
    );
    expect(videoLane).not.toBeNull();
    fireEvent.pointerDown(videoLane as Element, {
      button: 0,
      clientX: 588,
      clientY: 50,
      pointerId: 2,
    });

    expect(testTimelineStore.getState().currentTime).toBe(4);
    const playhead = document.querySelector('.oc-timeline-playhead');
    expect(playhead).toHaveStyle({ left: '428px' });
    expect(playhead?.children).toHaveLength(2);
    expect(playhead?.children[0]).toHaveClass(
      'oc-timeline-playhead__handle',
    );
    expect(playhead?.children[1]).toHaveClass('oc-timeline-playhead__line');
  });

  it('keeps the playhead in the viewport overlay while syncing only horizontal scroll', () => {
    const { viewport } = renderTimeline();
    const playhead = document.querySelector('.oc-timeline-playhead');

    expect(playhead?.parentElement).toHaveClass('oc-timeline-playhead-layer');
    expect(playhead?.parentElement?.previousElementSibling).toBe(viewport);
    expect(playhead).toHaveStyle({ left: '108px' });

    viewport.scrollLeft = 48;
    viewport.scrollTop = 120;
    fireEvent.scroll(viewport);

    expect(playhead).toHaveStyle({ left: '60px' });
    expect(playhead?.parentElement).toHaveStyle({
      height: '240px',
      width: '800px',
    });
  });

  it('uses Shift+wheel for horizontal scroll and Ctrl+wheel for zoom', () => {
    const { viewport } = renderTimeline();
    viewport.scrollLeft = 10;

    fireEvent.wheel(viewport, {
      deltaX: 0,
      deltaY: 48,
      shiftKey: true,
    });

    expect(viewport.scrollLeft).toBe(58);
    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      DEFAULT_PIXELS_PER_SECOND,
    );

    viewport.scrollLeft = 0;
    fireEvent.wheel(viewport, {
      clientX: 300,
      ctrlKey: true,
      deltaY: -40,
    });

    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      DEFAULT_PIXELS_PER_SECOND + TIMELINE_ZOOM_STEP,
    );
    expect(viewport.scrollLeft).toBeCloseTo(24);
  });

  it('commits a same-track clip move on pointer release', () => {
    const { viewport } = renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 7,
    });
    expect(viewport).toHaveAttribute('data-interacting', 'true');

    fireEvent.pointerMove(window, {
      clientX: 528,
      clientY: 100,
      pointerId: 7,
    });
    expect(document.querySelector('.oc-timeline-drag-ghost')).toHaveStyle({
      left: '412px',
      width: '240px',
    });
    expect(
      document.querySelector('.oc-timeline-clip-placeholder'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'audio clip: background.mp3' }),
    ).toHaveStyle({ left: '412px' });
    fireEvent.pointerUp(window, {
      clientX: 528,
      clientY: 100,
      pointerId: 7,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ start: 5, trackId: audioTrack.id }));
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('separates the pointer-following clip from its compact drop ghost', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 15,
    });
    fireEvent.pointerMove(window, {
      clientX: 508,
      clientY: 50,
      pointerId: 15,
    });

    expect(clip).toHaveAttribute('data-dragging', 'true');
    expect(clip).toHaveStyle({ left: '412px' });
    expect(document.querySelector('.oc-timeline-drag-ghost')).toHaveStyle({
      left: '12px',
      width: '320px',
    });
    expect(
      document.querySelector('[data-track-id=video-main]'),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerCancel(window, { pointerId: 15 });
  });

  it('strengthens the ghost and renders a guide when a drop snaps', () => {
    testTimelineStore.setState({ snappingEnabled: true });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 16,
    });
    fireEvent.pointerMove(window, {
      clientX: 445,
      clientY: 100,
      pointerId: 16,
    });

    expect(document.querySelector('.oc-timeline-drag-ghost')).toHaveAttribute(
      'data-snapped',
      'true',
    );
    expect(document.querySelector('.oc-timeline-snap-line')).toHaveStyle({
      left: '428px',
    });

    fireEvent.pointerCancel(window, { pointerId: 16 });
  });

  it('selects a clip without creating undo history when the pointer does not move', () => {
    testTimelineStore.setState({ past: [], selectedClipId: null });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 180,
      clientY: 50,
      pointerId: 8,
    });
    fireEvent.pointerUp(window, {
      clientX: 180,
      clientY: 50,
      pointerId: 8,
    });

    expect(testTimelineStore.getState().selectedClipId).toBe(videoClip.id);
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it('does not commit the stale preview when a drag returns to its origin', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 12,
    });
    fireEvent.pointerMove(window, {
      clientX: 528,
      clientY: 100,
      pointerId: 12,
    });
    fireEvent.pointerMove(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 12,
    });
    fireEvent.pointerUp(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 12,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ start: 1, zIndex: 0 }));
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it('keeps a pending row stable until a drag over a real track is released', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 150,
      pointerId: 14,
    });
    expect(document.querySelector('.oc-timeline-drag-ghost')).toHaveAttribute(
      'data-track-changed',
      'true',
    );
    expect(
      document.querySelector('.oc-timeline-track__control[data-pending="true"]'),
    ).toBeInTheDocument();

    fireEvent.pointerMove(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });
    expect(
      document.querySelector('.oc-timeline-track__control[data-pending="true"]'),
    ).toBeInTheDocument();
    fireEvent.pointerUp(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });

    expect(testTimelineStore.getState().tracks).toHaveLength(2);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ start: 1, trackId: audioTrack.id }));
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it('keeps a new track targeted when its insertion creates a gap under the pointer', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 17,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 132,
      pointerId: 17,
    });

    const pendingLane = document.querySelector(
      `[data-track-id="${NEW_AUDIO_TRACK_DROP_ID}"]`,
    );
    expect(pendingLane).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerMove(window, {
      clientX: 340,
      clientY: 132,
      pointerId: 17,
    });

    expect(pendingLane).toHaveAttribute('data-drop-target', 'true');
    expect(
      document.querySelector(`[data-track-id="${audioTrack.id}"]`),
    ).toHaveAttribute('data-drop-target', 'false');

    fireEvent.pointerUp(window, {
      clientX: 340,
      clientY: 132,
      pointerId: 17,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'audio-track-2',
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({ start: 2.65, trackId: 'audio-track-2' }),
    );
  });

  it('creates a video track from the gap between two video tracks', () => {
    const overlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-1',
      name: '视频轨 2',
      zIndex: 1,
    };
    const overlayClip = createClip({
      id: 'overlay-clip',
      name: 'overlay.mp4',
      sourceId: 'overlay-source',
      trackId: overlayTrack.id,
    });
    testTimelineStore.setState({
      clips: [videoClip, overlayClip, { ...audioClip, zIndex: 0 }],
      tracks: [videoTrack, overlayTrack, { ...audioTrack, zIndex: 2 }],
    });
    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 18,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 18,
    });

    expect(
      document.querySelector(`[data-track-id="${NEW_VIDEO_TRACK_DROP_ID}"]`),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 18,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-2',
      'video-overlay-1',
      audioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));
  });

  it('creates an audio track from the gap between two audio tracks', () => {
    const secondAudioTrack: TimelineTrack = {
      ...audioTrack,
      id: 'audio-track-2',
      name: '音频轨 2',
      zIndex: 2,
    };
    const remainingAudioClip = createClip({
      ...audioClip,
      id: 'remaining-audio-clip',
      name: 'remaining.mp3',
      sourceId: 'remaining-audio-source',
      start: 5,
    });
    const secondTrackClip = createClip({
      ...audioClip,
      id: 'second-track-audio-clip',
      name: 'second-track.mp3',
      sourceId: 'second-track-audio-source',
      trackId: secondAudioTrack.id,
    });
    testTimelineStore.setState({
      clips: [
        videoClip,
        audioClip,
        remainingAudioClip,
        secondTrackClip,
      ],
      tracks: [videoTrack, audioTrack, secondAudioTrack],
    });
    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 110,
      pointerId: 19,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 134,
      pointerId: 19,
    });

    expect(
      document.querySelector(`[data-track-id="${NEW_AUDIO_TRACK_DROP_ID}"]`),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 134,
      pointerId: 19,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      audioTrack.id,
      'audio-track-3',
      secondAudioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));
  });

  it('keeps a pending track stable after switching to another video gap', () => {
    const firstOverlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-1',
      name: '视频轨 2',
      zIndex: 1,
    };
    const secondOverlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-2',
      name: '视频轨 3',
      zIndex: 2,
    };
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'first-overlay-clip',
          name: 'first-overlay.mp4',
          sourceId: 'first-overlay-source',
          trackId: firstOverlayTrack.id,
        }),
        createClip({
          id: 'second-overlay-clip',
          name: 'second-overlay.mp4',
          sourceId: 'second-overlay-source',
          trackId: secondOverlayTrack.id,
        }),
        audioClip,
      ],
      tracks: [
        videoTrack,
        firstOverlayTrack,
        secondOverlayTrack,
        { ...audioTrack, zIndex: 3 },
      ],
    });
    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 20,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 20,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 210,
      pointerId: 20,
    });
    fireEvent.pointerMove(window, {
      clientX: 340,
      clientY: 210,
      pointerId: 20,
    });

    expect(
      document.querySelector(`[data-track-id="${NEW_VIDEO_TRACK_DROP_ID}"]`),
    ).toHaveAttribute('data-drop-target', 'true');
    expect(
      document.querySelector(`[data-track-id="${secondOverlayTrack.id}"]`),
    ).toHaveAttribute('data-drop-target', 'false');

    fireEvent.pointerUp(window, {
      clientX: 340,
      clientY: 210,
      pointerId: 20,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      firstOverlayTrack.id,
      'video-overlay-3',
      secondOverlayTrack.id,
      audioTrack.id,
    ]);
  });

  it('does not create a track from a same-type gap that mismatches the clip', () => {
    const overlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-1',
      name: '视频轨 2',
      zIndex: 1,
    };
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'overlay-clip',
          name: 'overlay.mp4',
          sourceId: 'overlay-source',
          trackId: overlayTrack.id,
        }),
        audioClip,
      ],
      tracks: [videoTrack, overlayTrack, { ...audioTrack, zIndex: 2 }],
    });
    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 170,
      pointerId: 21,
    });
    fireEvent.pointerMove(window, {
      clientX: 208,
      clientY: 90,
      pointerId: 21,
    });
    fireEvent.pointerUp(window, {
      clientX: 208,
      clientY: 90,
      pointerId: 21,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
      audioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ trackId: audioTrack.id, start: 1 }));
  });

  it('does not create a track when a gap drag is canceled', () => {
    const overlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-1',
      name: '视频轨 2',
      zIndex: 1,
    };
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'overlay-clip',
          name: 'overlay.mp4',
          sourceId: 'overlay-source',
          trackId: overlayTrack.id,
        }),
      ],
      tracks: [videoTrack, overlayTrack],
    });
    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 22,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 22,
    });
    expect(
      document.querySelector(`[data-track-id="${NEW_VIDEO_TRACK_DROP_ID}"]`),
    ).toBeInTheDocument();

    fireEvent.pointerCancel(window, { pointerId: 22 });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(
      document.querySelector(`[data-track-id="${NEW_VIDEO_TRACK_DROP_ID}"]`),
    ).not.toBeInTheDocument();
  });

  it('does not create an empty track by clicking a track gap', () => {
    const overlayTrack: TimelineTrack = {
      ...videoTrack,
      id: 'video-overlay-1',
      name: '视频轨 2',
      zIndex: 1,
    };
    testTimelineStore.setState({
      clips: [videoClip],
      tracks: [videoTrack, overlayTrack],
    });
    renderTimeline();

    const trackStack = document.querySelector('.oc-timeline-track-stack');
    expect(trackStack).not.toBeNull();
    fireEvent.pointerDown(trackStack as Element, {
      button: 0,
      clientX: 300,
      clientY: 90,
      pointerId: 23,
    });
    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 23,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it('previews and commits an end trim from the selected clip handle', () => {
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of opening.mp4',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 428,
      clientY: 50,
      pointerId: 9,
    });
    fireEvent.pointerMove(window, {
      clientX: 348,
      clientY: 50,
      pointerId: 9,
    });
    expect(screen.getByText('3.0s')).toHaveAttribute('dateTime', 'PT3S');
    fireEvent.pointerUp(window, {
      clientX: 348,
      clientY: 50,
      pointerId: 9,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(
      expect.objectContaining({ duration: 3, trimEnd: 3, trimStart: 0 }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('adjusts audio volume by pointer position and commits the gesture', () => {
    renderTimeline();
    const audio = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    vi.spyOn(audio, 'getBoundingClientRect').mockReturnValue(
      createRect({ height: 32, left: 188, top: 82, width: 240 }),
    );
    const volume = screen.getByRole('button', {
      name: 'Adjust background.mp3 volume, 50 percent',
    });

    fireEvent.pointerDown(volume, {
      button: 0,
      clientX: 300,
      clientY: 98,
      pointerId: 11,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 11,
    });

    expect(testTimelineStore.getState().tracks[1]?.volume).toBe(1);
    expect(
      screen.getByRole('button', {
        name: 'Adjust background.mp3 volume, 100 percent',
      }),
    ).toBeInTheDocument();

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 11,
    });
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('keeps the audio gain stable when grabbing its current volume line', () => {
    testTimelineStore.setState({
      tracks: [videoTrack, { ...audioTrack, volume: 0.75 }],
    });
    renderTimeline();
    const audio = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    vi.spyOn(audio, 'getBoundingClientRect').mockReturnValue(
      createRect({ height: 32, left: 188, top: 82, width: 240 }),
    );
    const volume = screen.getByRole('button', {
      name: 'Adjust background.mp3 volume, 75 percent',
    });

    fireEvent.pointerDown(volume, {
      button: 0,
      clientX: 300,
      clientY: 94,
      pointerId: 13,
    });
    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 94,
      pointerId: 13,
    });

    expect(testTimelineStore.getState().tracks[1]?.volume).toBe(0.75);
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });
});
