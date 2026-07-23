import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import {
  DEFAULT_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import {
  MAIN_VIDEO_TRACK_ID,
} from '../store/timeline-store';
import type { TimelineClip, TimelineTrack } from '../types';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from '../components/test-helpers';
import { TimelineViewport } from './TimelineViewport';

const { useFramePreviewStripMock } = vi.hoisted(() => ({
  useFramePreviewStripMock: vi.fn(),
}));

vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();

  return {
    ...actual,
    useAudioWaveformSamples: () => [0.2, 0.8, 0.4],
    useFramePreviewStrip: useFramePreviewStripMock,
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

const overlayVideoTrack: TimelineTrack = {
  id: 'video-overlay-1',
  name: '视频轨',
  type: 'video',
  volume: 1,
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

const renderTimeline = (
  props: Parameters<typeof TimelineViewport>[0] = {},
) => {
  const result = renderWithEditorProviders(<TimelineViewport {...props} />);
  const shell = document.querySelector('.oc-timeline-shell') as HTMLDivElement;
  const controlsViewport = document.querySelector(
    '.oc-timeline-controls-viewport',
  ) as HTMLDivElement;
  const rulerCanvas = document.querySelector(
    '.oc-timeline-ruler-canvas',
  ) as HTMLDivElement;
  const viewport = screen.getByLabelText('时间线轨道区域');
  const grid = viewport.querySelector('.oc-timeline-grid') as HTMLDivElement;

  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 704,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    value: 208,
  });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
    createRect({ height: 208, left: 96, top: 32, width: 704 }),
  );
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(
    createRect({ height: 208, left: 96, top: 32, width: 1_200 }),
  );
  fireEvent(window, new Event('resize'));

  return {
    ...result,
    controlsViewport,
    grid,
    rulerCanvas,
    shell,
    viewport,
  };
};

const doubleClickClip = (
  clip: Element,
  { clientX, clientY, pointerId }: { clientX: number; clientY: number; pointerId: number },
) => {
  fireEvent.pointerDown(clip, { button: 0, clientX, clientY, pointerId });
  fireEvent.pointerUp(window, { clientX, clientY, pointerId });
  fireEvent.pointerDown(clip, { button: 0, clientX, clientY, pointerId });
  fireEvent.pointerUp(window, { clientX, clientY, pointerId });
};

describe('TimelineViewport DOM interactions', () => {
  beforeEach(() => {
    useFramePreviewStripMock.mockReset();
    useFramePreviewStripMock.mockImplementation((request) =>
      request
        ? {
            frameWidth: 85,
            frames: [
              { index: 0, url: 'blob:frame-0' },
              { index: 1, url: 'blob:frame-1' },
            ],
            pixelsPerSecond: request.pixelsPerSecond,
          }
        : null,
    );
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('partitions fixed controls and ruler from the only scrollable tracks region', () => {
    const { grid, shell, viewport } = renderTimeline();
    const corner = shell.querySelector(':scope > .oc-timeline-corner');
    const controlsViewport = shell.querySelector(
      ':scope > .oc-timeline-controls-viewport',
    );
    const rulerViewport = shell.querySelector(
      ':scope > .oc-timeline-ruler-viewport',
    );
    const playheadLayer = shell.querySelector(
      ':scope > .oc-timeline-playhead-layer',
    );

    expect([...shell.children]).toEqual([
      corner,
      controlsViewport,
      rulerViewport,
      viewport,
      playheadLayer,
    ]);
    expect(shell.querySelectorAll('.oc-scrollbar')).toHaveLength(1);
    expect(viewport).toHaveClass('oc-timeline-viewport', 'oc-scrollbar');
    expect(viewport).toContainElement(grid);
    expect(rulerViewport).toContainElement(
      screen.getByRole('slider', { name: '时间标尺' }),
    );
    expect(controlsViewport).toContainElement(
      document.querySelector('.oc-timeline-controls-stack'),
    );
    expect(viewport).not.toContainElement(
      screen.getByRole('button', { name: '主视频轨道静音' }),
    );
  });

  it('keeps fixed controls aligned with semantic track lanes', () => {
    renderTimeline();

    const videoMuteButton = screen.getByRole('button', {
      name: '主视频轨道静音',
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
    expect(videoHeader).toHaveAttribute(
      'data-control-track-id',
      MAIN_VIDEO_TRACK_ID,
    );
    expect(audioHeader).toHaveAttribute(
      'data-control-track-id',
      audioTrack.id,
    );
    expect(videoHeader).toHaveStyle({ height: '56px' });
    expect(audioHeader).toHaveStyle({ height: '40px' });
    expect(videoHeader).not.toHaveStyle({ gridRow: '2' });
    expect(document.querySelector('.oc-timeline-controls-stack')).toContainElement(
      videoHeader,
    );
    expect(document.querySelector('.oc-timeline-controls-stack')).toContainElement(
      document.querySelector('.oc-timeline-track__control--tail'),
    );
    expect(document.querySelector('.oc-timeline-track-stack')).toContainElement(
      document.querySelector('.oc-timeline-tail-row'),
    );
    const videoLane = document.querySelector(
      `[data-track-id="${MAIN_VIDEO_TRACK_ID}"]`,
    );
    const audioLane = document.querySelector(
      `[data-track-id="${audioTrack.id}"]`,
    );
    expect(videoLane?.parentElement).toHaveStyle({ height: '56px' });
    expect(audioLane?.parentElement).toHaveStyle({ height: '40px' });
    expect(videoLane?.parentElement).toHaveAttribute(
      'data-main-track',
      'true',
    );
    expect(audioLane?.parentElement).not.toHaveAttribute('data-main-track');
    expect(screen.getByTitle('主视频轨道')).toHaveClass(
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
      screen.getByRole('button', { name: '主视频轨道取消静音' }),
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
    expect(
      screen
        .getByRole('article', { name: 'audio clip: background.mp3' })
        .querySelector('.oc-timeline-clip__duration'),
    ).toHaveTextContent('00:03:00');
  });

  it('keeps source-frame geometry and extraction request stable during a start trim', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    const strip = clip.querySelector(
      '.oc-timeline-clip__preview-strip',
    ) as HTMLDivElement;
    const getVideoRequest = () =>
      useFramePreviewStripMock.mock.calls
        .map(([request]) => request)
        .filter((request) => request?.src === videoClip.src)
        .at(-1);
    const requestBeforeTrim = getVideoRequest();
    const imageStylesBeforeTrim = [
      ...clip.querySelectorAll<HTMLImageElement>(
        '.oc-timeline-clip__thumbnail',
      ),
    ].map((image) => ({
      left: image.style.left,
      src: image.src,
      width: image.style.width,
    }));

    expect(strip).toHaveStyle({ transform: 'translate3d(0px, -50%, 0)' });
    expect(imageStylesBeforeTrim).toEqual([
      { left: '0px', src: 'blob:frame-0', width: '85px' },
      { left: '85px', src: 'blob:frame-1', width: '85px' },
    ]);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Trim start of opening.mp4' }),
      { button: 0, clientX: 108, clientY: 50, pointerId: 40 },
    );
    fireEvent.pointerMove(window, {
      clientX: 188,
      clientY: 50,
      pointerId: 40,
    });

    expect(getVideoRequest()).toEqual(requestBeforeTrim);
    expect(strip).toHaveStyle({ transform: 'translate3d(-80px, -50%, 0)' });
    expect(
      [
        ...clip.querySelectorAll<HTMLImageElement>(
          '.oc-timeline-clip__thumbnail',
        ),
      ].map((image) => ({
        left: image.style.left,
        src: image.src,
        width: image.style.width,
      })),
    ).toEqual(imageStylesBeforeTrim);
  });

  it('rescales retained preview frames to the current timeline zoom', () => {
    useFramePreviewStripMock.mockReturnValue({
      frameWidth: 85,
      frames: [
        { index: 0, url: 'blob:frame-0' },
        { index: 1, url: 'blob:frame-1' },
      ],
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND / 2,
    });

    renderTimeline();

    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    expect(
      [
        ...clip.querySelectorAll<HTMLImageElement>(
          '.oc-timeline-clip__thumbnail',
        ),
      ].map((image) => ({
        left: image.style.left,
        width: image.style.width,
      })),
    ).toEqual([
      { left: '0px', width: '170px' },
      { left: '170px', width: '170px' },
    ]);
  });

  it('uses the standard video label for non-main video tracks', () => {
    testTimelineStore.setState({
      tracks: [videoTrack, overlayVideoTrack, audioTrack],
    });
    renderTimeline();

    const overlayIcon = screen.getByTitle('视频轨道');
    expect(overlayIcon.closest('.oc-timeline-track__control')).not.toHaveAttribute(
      'data-main-track',
    );
    expect(
      screen.getByRole('button', { name: '视频轨道静音' }),
    ).toBeInTheDocument();
  });

  it('shows an empty-state hint only for an empty main video track', () => {
    testTimelineStore.setState({ clips: [audioClip] });
    renderTimeline();

    const hint = screen.getByText('主轨道：可将素材拖放到这里');
    expect(hint).toHaveClass('oc-timeline-track__empty-hint');
    expect(hint.closest('[data-track-id]')).toHaveAttribute(
      'data-track-id',
      MAIN_VIDEO_TRACK_ID,
    );

    act(() => {
      testTimelineStore.setState({ clips: [videoClip, audioClip] });
    });

    expect(
      screen.queryByText('主轨道：可将素材拖放到这里'),
    ).not.toBeInTheDocument();
  });

  it('does not show the empty-state hint for an empty non-main video track', () => {
    testTimelineStore.setState({
      tracks: [videoTrack, overlayVideoTrack, audioTrack],
    });
    renderTimeline();

    expect(
      screen.queryByText('主轨道：可将素材拖放到这里'),
    ).not.toBeInTheDocument();
  });

  it('highlights video gaps in the corner and ruler at the current zoom', () => {
    testTimelineStore.setState({
      clips: [
        createClip({ duration: 2, trimEnd: 2 }),
        createClip({
          id: 'video-clip-2',
          name: 'ending.mp4',
          sourceId: 'video-source-2',
          start: 4,
        }),
      ],
    });
    renderTimeline();

    expect(screen.getByText('有视频空隙')).toHaveClass(
      'oc-timeline-gap-status',
    );
    const gap = document.querySelector('.oc-timeline-ruler__gap');
    expect(gap).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 2 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${2 * DEFAULT_PIXELS_PER_SECOND}px`,
    });
    const ruler = screen.getByRole('slider', { name: '时间标尺' });
    expect(ruler.querySelector('time[datetime="PT2S"]')).toHaveClass(
      'oc-timeline-ruler__label--gap',
    );
    expect(ruler.querySelector('time[datetime="PT4S"]')).not.toHaveClass(
      'oc-timeline-ruler__label--gap',
    );

    act(() => {
      testTimelineStore.setState({ pixelsPerSecond: 100 });
    });

    expect(gap).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 200}px`,
      width: '200px',
    });
  });

  it('does not show a video-gap status without a gap or without video', () => {
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'video-clip-2',
          name: 'ending.mp4',
          sourceId: 'video-source-2',
          start: 4,
        }),
      ],
    });
    renderTimeline();

    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
    expect(document.querySelector('.oc-timeline-ruler__gap')).toBeNull();

    act(() => {
      testTimelineStore.setState({ clips: [audioClip] });
    });

    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
    expect(document.querySelector('.oc-timeline-ruler__gap')).toBeNull();
  });

  it('updates the video-gap status during a trim preview', () => {
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'video-clip-2',
          name: 'middle.mp4',
          sourceId: 'video-source-2',
          start: 4,
        }),
        createClip({
          id: 'overlay-clip',
          name: 'ending.mp4',
          sourceId: 'overlay-source',
          start: 8,
          trackId: overlayVideoTrack.id,
        }),
      ],
      tracks: [videoTrack, overlayVideoTrack],
    });
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of opening.mp4',
    });

    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 428,
      clientY: 50,
      pointerId: 27,
    });
    fireEvent.pointerMove(window, {
      clientX: 348,
      clientY: 50,
      pointerId: 27,
    });

    expect(screen.getByText('有视频空隙')).toBeInTheDocument();
    expect(document.querySelector('.oc-timeline-ruler__gap')).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 7 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${DEFAULT_PIXELS_PER_SECOND}px`,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ duration: 4 }));

    fireEvent.pointerCancel(window, { pointerId: 27 });
    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
  });

  it('updates the video-gap status during a drag preview', () => {
    const overlayClip = createClip({
      id: 'overlay-clip',
      name: 'ending.mp4',
      sourceId: 'overlay-source',
      start: 4,
      trackId: overlayVideoTrack.id,
    });
    testTimelineStore.setState({
      clips: [videoClip, overlayClip],
      tracks: [videoTrack, overlayVideoTrack],
    });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: ending.mp4',
    });

    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 448,
      clientY: 110,
      pointerId: 28,
    });
    fireEvent.pointerMove(window, {
      clientX: 528,
      clientY: 110,
      pointerId: 28,
    });

    expect(screen.getByText('有视频空隙')).toBeInTheDocument();
    expect(document.querySelector('.oc-timeline-ruler__gap')).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 4 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${DEFAULT_PIXELS_PER_SECOND}px`,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === overlayClip.id),
    ).toEqual(expect.objectContaining({ start: 4 }));

    fireEvent.pointerCancel(window, { pointerId: 28 });
    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
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
    expect(testTimelineStore.getState().selectedClipId).toBeNull();
    expect(document.querySelector('.oc-timeline-shell')).toHaveAttribute(
      'data-scrubbing',
      'true',
    );
    fireEvent.pointerUp(window, {
      clientX: 308,
      clientY: 10,
      pointerId: 1,
    });
    expect(document.querySelector('.oc-timeline-shell')).toHaveAttribute(
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
    expect(playhead).toHaveStyle({ left: '332px' });
    expect(playhead?.children).toHaveLength(2);
    expect(playhead?.children[0]).toHaveClass(
      'oc-timeline-playhead__handle',
    );
    expect(playhead?.children[1]).toHaveClass('oc-timeline-playhead__line');
  });

  it('keeps the selected clip while scrubbing from the playhead', () => {
    renderTimeline();

    const playhead = document.querySelector('.oc-timeline-playhead');
    expect(playhead).not.toBeNull();

    fireEvent.pointerDown(playhead as Element, {
      button: 0,
      clientX: 108,
      clientY: 10,
      pointerId: 3,
    });

    expect(testTimelineStore.getState().selectedClipId).toBe(videoClip.id);

    fireEvent.pointerUp(window, {
      clientX: 108,
      clientY: 10,
      pointerId: 3,
    });
  });

  it('syncs the ruler, controls, and playhead from the tracks viewport', () => {
    const { controlsViewport, rulerCanvas, shell, viewport } = renderTimeline();
    const playhead = document.querySelector('.oc-timeline-playhead');

    expect(playhead?.parentElement).toHaveClass('oc-timeline-playhead-layer');
    expect(playhead?.parentElement?.parentElement).toBe(shell);
    expect(playhead).toHaveStyle({ left: '12px' });

    viewport.scrollLeft = 48;
    viewport.scrollTop = 120;
    fireEvent.scroll(viewport);

    expect(rulerCanvas).toHaveStyle({
      transform: 'translate3d(-48px, 0, 0)',
    });
    expect(controlsViewport.firstElementChild).toHaveStyle({
      transform: 'translate3d(0, -120px, 0)',
    });
    expect(playhead).toHaveStyle({ left: '-36px' });
    expect((playhead?.parentElement as HTMLElement).style.height).toBe('');
    expect((playhead?.parentElement as HTMLElement).style.width).toBe('');
  });

  it('forwards wheel scrolling from the fixed controls to the tracks viewport', () => {
    const { controlsViewport, viewport } = renderTimeline();
    const controlsStack = controlsViewport.firstElementChild;

    fireEvent.wheel(controlsViewport, { deltaY: 48 });

    expect(viewport.scrollTop).toBe(48);
    fireEvent.scroll(viewport);
    expect(controlsStack).toHaveStyle({
      transform: 'translate3d(0, -48px, 0)',
    });

    fireEvent.wheel(controlsViewport, {
      deltaY: 32,
      shiftKey: true,
    });

    expect(viewport.scrollLeft).toBe(32);
    fireEvent.scroll(viewport);
    expect(
      document.querySelector('.oc-timeline-ruler-canvas'),
    ).toHaveStyle({
      transform: 'translate3d(-32px, 0, 0)',
    });
  });

  it('keeps short timeline content width independent from viewport resize state', () => {
    testTimelineStore.setState({ clips: [] });
    const { grid, viewport } = renderTimeline();
    const contentLaneWidth =
      12 * DEFAULT_PIXELS_PER_SECOND + TIMELINE_CONTENT_PADDING_X * 2;

    expect(grid.style.getPropertyValue('--oc-timeline-lane-width')).toBe(
      `${contentLaneWidth}px`,
    );
    expect(grid.style.width).toBe('');

    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      value: 1_200,
    });
    fireEvent(window, new Event('resize'));

    expect(grid.style.getPropertyValue('--oc-timeline-lane-width')).toBe(
      `${contentLaneWidth}px`,
    );
    expect(grid.style.width).toBe('');
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

  it('keeps a pointer-anchored playhead stable while zooming', () => {
    testTimelineStore.setState({ currentTime: 2.4 });
    const { viewport } = renderTimeline();
    const playhead = document.querySelector('.oc-timeline-playhead');

    expect(playhead).toHaveStyle({ left: '204px' });

    fireEvent.wheel(viewport, {
      clientX: 300,
      ctrlKey: true,
      deltaY: -40,
    });

    expect(viewport.scrollLeft).toBeCloseTo(24);
    expect(playhead).toHaveStyle({ left: '204px' });
  });

  it('automatically follows the playhead inside the tracks viewport during playback', () => {
    const { viewport } = renderTimeline();

    act(() => {
      testTimelineStore.setState({
        currentTime: 9,
        isPlaying: true,
      });
    });

    expect(viewport.scrollLeft).toBe(140);
  });

  it('commits a same-track clip move on pointer release', () => {
    const onClipTimingPreviewChange = vi.fn();
    const { shell } = renderTimeline({ onClipTimingPreviewChange });
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 7,
    });
    expect(shell).toHaveAttribute('data-interacting', 'true');

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
    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toHaveStyle({
      height: '40px',
      left: '412px',
      top: '60px',
      width: '240px',
    });
    expect(
      screen.queryByRole('article', { name: 'audio clip: background.mp3' }),
    ).not.toBeInTheDocument();
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith({
      clipId: audioClip.id,
      duration: 3,
      start: 5,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ start: 1 }));
    fireEvent.pointerUp(window, {
      clientX: 528,
      clientY: 100,
      pointerId: 7,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ start: 5, trackId: audioTrack.id }));
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith(null);
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('separates the pointer-following clip from its compact drop ghost', () => {
    const onClipTimingPreviewChange = vi.fn();
    renderTimeline({ onClipTimingPreviewChange });
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

    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toHaveStyle({
      left: '412px',
      top: '0px',
    });
    expect(document.querySelector('.oc-timeline-drag-ghost')).toHaveStyle({
      left: '12px',
      width: '320px',
    });
    expect(
      document.querySelector('[data-track-id=video-main]'),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerCancel(window, { pointerId: 15 });
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith(null);
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
      left: '332px',
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

  it('opens the target clip menu without starting a move gesture', () => {
    testTimelineStore.setState({ past: [], selectedClipId: videoClip.id });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 300 }),
    );

    fireEvent.contextMenu(clip, { clientX: 250, clientY: 100 });

    expect(
      screen.getByRole('menu', { name: 'background.mp3 操作菜单' }),
    ).toBeVisible();
    expect(screen.queryByText('Ctrl+B')).not.toBeInTheDocument();
    expect(testTimelineStore.getState().selectedClipId).toBe(audioClip.id);
    expect(testTimelineStore.getState().past).toHaveLength(0);
    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toBeNull();
  });

  it('splits a clip at the context-menu pointer without moving the playhead', () => {
    testTimelineStore.setState({ currentTime: 0.25, selectedClipId: null });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );

    fireEvent.contextMenu(clip, { clientX: 300, clientY: 50 });
    const splitItem = screen.getByRole('menuitem', { name: /\u5206\u5272/ });
    fireEvent.pointerDown(splitItem, {
      button: 0,
      clientX: 300,
      clientY: 50,
      pointerId: 29,
    });
    fireEvent.click(splitItem);

    expect(testTimelineStore.getState().currentTime).toBe(0.25);
    expect(
      testTimelineStore
        .getState()
        .clips.filter(({ type }) => type === 'video')
        .map(({ duration, start }) => [start, duration]),
    ).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it('disables context-menu operations when their current state is invalid', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );

    fireEvent.contextMenu(clip, { clientX: 110, clientY: 50 });

    expect(screen.getByRole('menuitem', { name: /\u5206\u5272/ })).toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('menuitem', { name: /\u7c98\u8d34/ })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('disables pasting a copied clip into a different media type', () => {
    testTimelineStore.setState({ copiedClip: videoClip });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 300 }),
    );

    fireEvent.contextMenu(clip, { clientX: 250, clientY: 100 });

    expect(screen.getByRole('menuitem', { name: /\u7c98\u8d34/ })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('uses the existing copy, paste, download and delete clip actions', () => {
    const onDownloadClip = vi.fn();
    renderTimeline({ onDownloadClip });
    const video = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );

    fireEvent.contextMenu(video, { clientX: 300, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: /\u590d\u5236/ }));
    expect(testTimelineStore.getState().copiedClip?.id).toBe(videoClip.id);

    fireEvent.contextMenu(video, { clientX: 300, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: /\u7c98\u8d34/ }));
    expect(testTimelineStore.getState().clips).toHaveLength(3);

    const pastedClipId = testTimelineStore.getState().selectedClipId;
    const pastedClip = screen
      .getAllByRole('article', { name: 'video clip: opening.mp4' })
      .find(
        (candidate) => candidate.getAttribute('data-clip-id') === pastedClipId,
      )!;
    expect(pastedClip).toBeDefined();
    vi.spyOn(pastedClip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );
    fireEvent.contextMenu(pastedClip, { clientX: 300, clientY: 50 });
    fireEvent.click(
      screen.getByRole('menuitem', { name: '下载原始素材' }),
    );
    expect(onDownloadClip).toHaveBeenCalledWith(
      expect.objectContaining({ id: pastedClipId, src: videoClip.src }),
    );

    fireEvent.contextMenu(pastedClip, { clientX: 300, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: /\u5220\u9664/ }));
    expect(testTimelineStore.getState().clips).toHaveLength(2);
    expect(testTimelineStore.getState().selectedClipId).toBeNull();
    expect(pastedClipId).not.toBeNull();
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

  it('keeps track rows stable while switching from an insert line to a track', () => {
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
    expect(document.querySelector('.oc-timeline-track-insert-line')).toHaveStyle({
      top: '102px',
    });
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(2);

    fireEvent.pointerMove(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });
    expect(document.querySelector('.oc-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.oc-timeline-drag-ghost')).toBeInTheDocument();
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(2);
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

  it('keeps an insertion line targeted without creating a temporary row', () => {
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

    const insertLine = document.querySelector('.oc-timeline-track-insert-line');
    expect(insertLine).toHaveStyle({ top: '102px' });
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(2);

    fireEvent.pointerMove(window, {
      clientX: 340,
      clientY: 132,
      pointerId: 17,
    });

    expect(insertLine).toHaveStyle({ top: '102px' });
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

  it('creates a video track from the leading insertion line', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 24,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 31,
      pointerId: 24,
    });

    expect(
      document.querySelector('.oc-timeline-track-insert-line'),
    ).toHaveAttribute('data-leading', 'true');
    expect(document.querySelector('.oc-timeline-track-insert-line')).toHaveStyle({
      top: '0px',
    });
    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toHaveStyle({
      top: '0px',
    });
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(2);

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 31,
      pointerId: 24,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      'video-overlay-1',
      MAIN_VIDEO_TRACK_ID,
      audioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-1' }));
  });

  it('creates an audio track from the video and audio type boundary', () => {
    const remainingAudioClip = createClip({
      ...audioClip,
      id: 'remaining-audio-clip',
      name: 'remaining.mp3',
      sourceId: 'remaining-audio-source',
      start: 5,
    });
    testTimelineStore.setState({
      clips: [videoClip, audioClip, remainingAudioClip],
    });
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: background.mp3',
    });

    fireEvent.pointerDown(clip, {
      button: 0,
      clientX: 208,
      clientY: 100,
      pointerId: 25,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 25,
    });

    expect(document.querySelector('.oc-timeline-track-insert-line')).toHaveStyle({
      top: '58px',
    });

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 25,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      'audio-track-2',
      audioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-2' }));
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

    expect(document.querySelector('.oc-timeline-track-insert-line')).toHaveStyle({
      top: '58px',
    });
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(3);

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

    expect(document.querySelector('.oc-timeline-track-insert-line')).toHaveStyle({
      top: '102px',
    });
    expect(document.querySelectorAll('.oc-timeline-track')).toHaveLength(3);

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

  it('switches from an insertion line after leaving the release range', () => {
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
      clientY: 150,
      pointerId: 20,
    });
    fireEvent.pointerMove(window, {
      clientX: 340,
      clientY: 159,
      pointerId: 20,
    });

    expect(document.querySelector('.oc-timeline-track-insert-line')).toBeNull();
    expect(
      document.querySelector(`[data-track-id="${secondOverlayTrack.id}"]`),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerUp(window, {
      clientX: 340,
      clientY: 159,
      pointerId: 20,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      firstOverlayTrack.id,
      secondOverlayTrack.id,
      audioTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ trackId: secondOverlayTrack.id }));
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
    expect(document.querySelector('.oc-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toBeInTheDocument();
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
    expect(document.querySelector('.oc-timeline-track-insert-line')).toBeInTheDocument();

    fireEvent.pointerCancel(window, { pointerId: 22 });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(document.querySelector('.oc-timeline-track-insert-line')).not.toBeInTheDocument();
  });

  it('cancels an insertion preview when the window loses focus', () => {
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
      pointerId: 26,
    });
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 26,
    });
    fireEvent.blur(window);

    expect(document.querySelector('.oc-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.oc-timeline-clip--drag-overlay')).toBeNull();
    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(testTimelineStore.getState().past).toHaveLength(0);
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
    const onClipTimingPreviewChange = vi.fn();
    renderTimeline({ onClipTimingPreviewChange });
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
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
    expect(clip.querySelector('.oc-timeline-clip__duration')).toHaveAttribute(
      'dateTime',
      'PT3S',
    );
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith({
      clipId: videoClip.id,
      duration: 3,
      start: 0,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ duration: 4 }));
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
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith(null);
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('restores video and audio clip trims on double click', () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id === videoClip.id) {
          return {
            ...clip,
            duration: 3,
            trimEnd: 4,
            trimStart: 1,
          };
        }
        if (clip.id === audioClip.id) {
          return {
            ...clip,
            duration: 2,
            trimEnd: 2.5,
            trimStart: 0.5,
          };
        }
        return clip;
      }),
    }));
    renderTimeline();

    doubleClickClip(
      screen.getByRole('article', { name: 'video clip: opening.mp4' }),
      { clientX: 200, clientY: 50, pointerId: 30 },
    );

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(
      expect.objectContaining({ duration: 6, trimEnd: 6, trimStart: 0 }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);

    doubleClickClip(
      screen.getByRole('article', { name: 'audio clip: background.mp3' }),
      { clientX: 200, clientY: 100, pointerId: 31 },
    );

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({ duration: 3, trimEnd: 3, trimStart: 0 }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(2);
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
