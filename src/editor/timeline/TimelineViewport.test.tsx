import { readFileSync } from 'node:fs';

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import {
  DEFAULT_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import { secondsToMicroseconds } from '../core/time';
import { MAIN_VIDEO_TRACK_ID } from '../store/timeline-store';
import type {
  TimelineImageClip,
  TimelineTimedMediaClip,
  TimelineTrack,
} from '../types';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from '../components/test-helpers';
import { TimelineViewport } from './TimelineViewport';
import {
  getClipRevealScrollPosition,
  type ClipRevealGeometry,
} from './clip-reveal';

const editorStyles = readFileSync('src/editor/styles.css', 'utf8');

const { useFramePreviewStripMock, useSingleFramePreviewMock } = vi.hoisted(() => ({
  useFramePreviewStripMock: vi.fn(),
  useSingleFramePreviewMock: vi.fn(),
}));

vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();

  return {
    ...actual,
    useAudioWaveformSamples: () => [0.2, 0.8, 0.4],
    useFramePreviewStrip: useFramePreviewStripMock,
    useSingleFramePreview: useSingleFramePreviewMock,
    useMediaObjectUrl: (
      input: string | { src: string },
      enabled: boolean,
    ) => enabled ? `blob:${typeof input === 'string' ? input : input.src}` : null,
  };
});

const videoTrack: TimelineTrack = {
  id: MAIN_VIDEO_TRACK_ID,
  name: '视频轨',
  type: 'video',
  muted: false,
  zIndex: 1,
};

const audioTrack: TimelineTrack = {
  id: 'audio-track-1',
  name: '音频轨道',
  type: 'audio',
  muted: false,
  zIndex: 0,
};

const overlayVideoTrack: TimelineTrack = {
  id: 'video-overlay-1',
  name: '视频轨',
  type: 'video',
  muted: false,
  zIndex: 2,
};

const createClip = (
  patch: Partial<TimelineTimedMediaClip>,
): TimelineTimedMediaClip => {
  const clip = {
  durationUs: secondsToMicroseconds(4),
  id: 'video-clip',
  name: 'opening.mp4',
  sourceDurationUs: secondsToMicroseconds(6),
  sourceId: 'video-source',
  speed: 1,
  src: '/opening.mp4',
  startUs: 0,
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  trimEndUs: secondsToMicroseconds(4),
  trimStartUs: 0,
  type: 'video',
  volume: 1,
  zIndex: 0,
  ...patch,
  hidden: patch.hidden ?? false,
  };
  return clip.type === 'audio'
    ? { ...clip, type: 'audio' }
    : { ...clip, type: 'video' };
};
const getStoreMediaClip = (clipId: string) => {
  const clip = testTimelineStore
    .getState()
    .clips.find((candidate) => candidate.id === clipId);
  if (!clip || (clip.type !== 'video' && clip.type !== 'audio')) {
    throw new Error(`Expected media clip ${clipId}`);
  }
  return clip;
};

const videoClip = createClip({});
const audioClip = createClip({
  durationUs: secondsToMicroseconds(3),
  id: 'audio-clip',
  name: 'background.mp3',
  sourceDurationUs: secondsToMicroseconds(3),
  sourceId: 'audio-source',
  src: '/background.mp3',
  startUs: secondsToMicroseconds(1),
  trackId: audioTrack.id,
  trimEndUs: secondsToMicroseconds(3),
  type: 'audio',
  volume: 0.5,
});

const imageClip: TimelineImageClip = {
  durationUs: secondsToMicroseconds(5),
  hidden: false,
  id: 'image-clip',
  name: 'still.png',
  sourceId: 'image-source',
  src: '/still.png',
  startUs: 0,
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'image',
  zIndex: 0,
};

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
  const shell = document.querySelector('.ec-timeline-shell') as HTMLDivElement;
  const controlsViewport = document.querySelector(
    '.ec-timeline-controls-viewport',
  ) as HTMLDivElement;
  const rulerCanvas = document.querySelector(
    '.ec-timeline-ruler-canvas',
  ) as HTMLDivElement;
  const viewport = screen.getByLabelText('时间线轨道区域');
  const grid = viewport.querySelector('.ec-timeline-grid') as HTMLDivElement;

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

const setViewportScrollSize = (
  viewport: HTMLElement,
  { height, width }: { height: number; width: number },
) => {
  Object.defineProperty(viewport, 'scrollHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(viewport, 'scrollWidth', {
    configurable: true,
    value: width,
  });
};

const mockRevealElementRects = ({
  clipId,
  clipRect,
  trackId,
  trackRect,
}: {
  clipId: string;
  clipRect: DOMRect;
  trackId: string;
  trackRect: DOMRect;
}) => {
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.clipId === clipId) return clipRect;
      if (this.dataset.trackId === trackId) return trackRect;
      return getBoundingClientRect.call(this);
    },
  );
};

const addRevealAudioClip = (sourceId: string) => {
  testTimelineStore.getState().addMediaClip({
    source: {
      durationUs: secondsToMicroseconds(2),
      fileName: `${sourceId}.mp3`,
      id: sourceId,
      src: `/${sourceId}.mp3`,
      type: 'audio',
    },
    startUs: secondsToMicroseconds(6),
  });
};

const createRevealGeometry = (
  patch: Partial<ClipRevealGeometry> = {},
): ClipRevealGeometry => ({
  clip: {
    bottom: 140,
    left: 200,
    right: 300,
    top: 100,
  },
  track: {
    bottom: 148,
    top: 92,
  },
  viewport: {
    height: 208,
    left: 96,
    scrollHeight: 800,
    scrollLeft: 80,
    scrollTop: 50,
    scrollWidth: 2_000,
    top: 32,
    width: 704,
  },
  ...patch,
});

const doubleClickClip = (
  clip: Element,
  { clientX, clientY, pointerId }: { clientX: number; clientY: number; pointerId: number },
) => {
  fireEvent.pointerDown(clip, { button: 0, clientX, clientY, pointerId });
  fireEvent.pointerUp(window, { clientX, clientY, pointerId });
  fireEvent.pointerDown(clip, { button: 0, clientX, clientY, pointerId });
  fireEvent.pointerUp(window, { clientX, clientY, pointerId });
};

describe('getClipRevealScrollPosition', () => {
  it('keeps both axes when the clip has any visible overlap', () => {
    expect(
      getClipRevealScrollPosition(
        createRevealGeometry({
          clip: {
            bottom: 260,
            left: 70,
            right: 150,
            top: 220,
          },
        }),
      ),
    ).toEqual({ left: 80, top: 50 });
  });

  it('centers the clip start and track when both axes are outside', () => {
    expect(
      getClipRevealScrollPosition(
        createRevealGeometry({
          clip: {
            bottom: 340,
            left: 900,
            right: 1_020,
            top: 300,
          },
          track: { bottom: 330, top: 290 },
          viewport: {
            ...createRevealGeometry().viewport,
            scrollLeft: 100,
            scrollTop: 20,
          },
        }),
      ),
    ).toEqual({ left: 552, top: 194 });
  });

  it('adjusts only the axis without a visible intersection', () => {
    expect(
      getClipRevealScrollPosition(
        createRevealGeometry({
          clip: {
            bottom: 340,
            left: 200,
            right: 300,
            top: 300,
          },
          track: { bottom: 336, top: 280 },
          viewport: {
            ...createRevealGeometry().viewport,
            scrollTop: 10,
          },
        }),
      ),
    ).toEqual({ left: 80, top: 182 });
  });

  it('treats touching edges as hidden and clamps to scroll bounds', () => {
    expect(
      getClipRevealScrollPosition(
        createRevealGeometry({
          clip: {
            bottom: 140,
            left: 16,
            right: 96,
            top: 100,
          },
          viewport: {
            ...createRevealGeometry().viewport,
            scrollLeft: 120,
          },
        }),
      ),
    ).toEqual({ left: 0, top: 50 });

    expect(
      getClipRevealScrollPosition(
        createRevealGeometry({
          clip: {
            bottom: 800,
            left: 1_600,
            right: 1_720,
            top: 760,
          },
          track: { bottom: 800, top: 760 },
          viewport: {
            ...createRevealGeometry().viewport,
            scrollLeft: 1_500,
            scrollTop: 580,
          },
        }),
      ),
    ).toEqual({ left: 1_296, top: 592 });
  });
});

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
    useSingleFramePreviewMock.mockReset();
    useSingleFramePreviewMock.mockImplementation((request) =>
      request
        ? {
            height: 90,
            status: 'ready',
            timeUs: request.timeUs,
            url: `blob:trim-frame-${request.timeUs}`,
            width: 160,
          }
        : null,
    );
    resetTestTimelineStore();
    testTimelineStore.setState({
      clips: [videoClip, audioClip],
      currentTimeUs: 0,
      future: [],
      isPlaying: false,
      past: [],
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
      selectedClipId: videoClip.id,
      snappingEnabled: false,
      tracks: [audioTrack, videoTrack],
    });
    vi.stubGlobal('ResizeObserver', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('partitions fixed controls and ruler from the only scrollable tracks region', () => {
    const { grid, shell, viewport } = renderTimeline();
    const corner = shell.querySelector(':scope > .ec-timeline-corner');
    const controlsViewport = shell.querySelector(
      ':scope > .ec-timeline-controls-viewport',
    );
    const rulerViewport = shell.querySelector(
      ':scope > .ec-timeline-ruler-viewport',
    );
    const playheadLayer = shell.querySelector(
      ':scope > .ec-timeline-playhead-layer',
    );

    expect([...shell.children]).toEqual([
      corner,
      controlsViewport,
      rulerViewport,
      viewport,
      playheadLayer,
    ]);
    expect(shell.querySelectorAll('.ec-scrollbar')).toHaveLength(1);
    expect(viewport).toHaveClass('ec-timeline-viewport', 'ec-scrollbar');
    expect(viewport).toContainElement(grid);
    expect(rulerViewport).toContainElement(
      screen.getByRole('slider', { name: '时间标尺' }),
    );
    expect(controlsViewport).toContainElement(
      document.querySelector('.ec-timeline-controls-stack'),
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
      name: '音频轨道静音',
    });
    const videoHeader = videoMuteButton.parentElement;
    const audioHeader = audioMuteButton.parentElement;
    expect(videoHeader).not.toBeNull();
    expect(audioHeader).not.toBeNull();
    expect(videoHeader).toHaveClass('ec-timeline-track__control');
    expect(audioHeader).toHaveClass('ec-timeline-track__control');
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
    expect(document.querySelector('.ec-timeline-controls-stack')).toContainElement(
      videoHeader,
    );
    expect(document.querySelector('.ec-timeline-controls-stack')).toContainElement(
      document.querySelector('.ec-timeline-track__control--tail'),
    );
    expect(document.querySelector('.ec-timeline-track-stack')).toContainElement(
      document.querySelector('.ec-timeline-tail-row'),
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
      'ec-timeline-track__icon',
    );
    expect(screen.getByTitle('音频轨道')).toHaveClass(
      'ec-timeline-track__icon',
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
        .querySelector('.ec-timeline-clip__duration'),
    ).toHaveTextContent('00:03:00');
  });

  it('renders clip metadata only when the clip info toggle is on', () => {
    renderTimeline();
    const videoArticle = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });

    expect(videoArticle.querySelector('.ec-timeline-clip__meta')).not.toBeNull();

    act(() => testTimelineStore.getState().toggleClipInfoVisibility());

    expect(videoArticle.querySelector('.ec-timeline-clip__meta')).toBeNull();

    act(() => testTimelineStore.getState().toggleClipInfoVisibility());

    expect(videoArticle.querySelector('.ec-timeline-clip__meta')).not.toBeNull();
  });

  it('keeps source-frame geometry and extraction request stable during a start trim', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    const strip = clip.querySelector(
      '.ec-timeline-clip__preview-strip',
    ) as HTMLDivElement;
    const getVideoRequest = () =>
      useFramePreviewStripMock.mock.calls
        .map(([request]) => request)
        .filter((request) => request?.src === videoClip.src)
        .at(-1);
    const requestBeforeTrim = getVideoRequest();
    const thumbnailStateBeforeTrim = [
      ...clip.querySelectorAll<HTMLImageElement>(
        '.ec-timeline-clip__thumbnail',
      ),
    ].map((image) => ({
      left: image.style.left,
      src: image.src,
      width: image.style.width,
    }));

    expect(strip).toHaveStyle({ transform: 'translate3d(0px, -50%, 0)' });
    expect(thumbnailStateBeforeTrim).toEqual([
      {
        left: '0px',
        src: 'blob:frame-0',
        width: '85px',
      },
      {
        left: '85px',
        src: 'blob:frame-1',
        width: '85px',
      },
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
          '.ec-timeline-clip__thumbnail',
        ),
      ].map((image) => ({
        left: image.style.left,
        src: image.src,
        width: image.style.width,
      })),
    ).toEqual(thumbnailStateBeforeTrim);
  });

  it('renders a dedicated text track and title clip without mute controls', () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-1',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 2,
    };
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          bold: false,
          durationUs: secondsToMicroseconds(5),
          fontColor: '#FFFFFFFF',
          fontSize: 120,
            fontType: 'SY_Black',
            hidden: false,
          id: 'text-clip-1',
          italic: false,
          layoutSize: { height: 200, width: 1_800 },
          position: { x: 60, y: 440 },
          startUs: 0,
          text: '我们的精彩旅程',
          trackId: textTrack.id,
          type: 'text',
          underline: false,
          zIndex: 0,
        },
      ],
      tracks: [...state.tracks, textTrack],
    }));

    renderTimeline();

    expect(screen.getByTitle('文字轨道')).toHaveClass(
      'ec-timeline-track__icon',
    );
    expect(screen.getByTitle('文字轨道').parentElement).toHaveStyle({
      height: '40px',
    });
    expect(
      screen.queryByRole('button', { name: /文字轨道.*静音/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('article', {
        name: 'text clip: 我们的精彩旅程',
      }),
    ).toHaveAttribute('data-type', 'text');
    expect(
      screen.getByRole('article', {
        name: 'text clip: 我们的精彩旅程',
      }).parentElement?.parentElement,
    ).toHaveStyle({ height: '40px' });
    expect(screen.getAllByText('我们的精彩旅程')).toHaveLength(2);
    expect(screen.getByText('00:05:00')).toBeVisible();
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '.ec-timeline-track__control[data-control-track-id]',
        ),
      ].map((control) => control.dataset.controlTrackId),
    ).toEqual([textTrack.id, MAIN_VIDEO_TRACK_ID, audioTrack.id]);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '.ec-timeline-track__lane[data-track-id]',
        ),
      ].map((lane) => lane.dataset.trackId),
    ).toEqual([textTrack.id, MAIN_VIDEO_TRACK_ID, audioTrack.id]);
  });

  it('renders a repeated image preview on a video track without audio controls', () => {
    testTimelineStore.setState({
      clips: [imageClip],
      selectedClipId: imageClip.id,
      tracks: [videoTrack],
    });
    renderTimeline();

    const image = screen.getByRole('article', {
      name: 'image clip: still.png',
    });
    const preview = image.querySelector<HTMLElement>(
      '.ec-timeline-clip__image-preview',
    );
    expect(image).toHaveAttribute('data-type', 'image');
    expect(preview?.style.backgroundImage).toContain('blob:/still.png');
    expect(image.querySelector('.ec-timeline-clip__volume')).toBeNull();
    expect(useFramePreviewStripMock).toHaveBeenCalledWith(null);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Trim end of still.png' }),
      { button: 0, clientX: 508, clientY: 50, pointerId: 62 },
    );
    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean),
    ).toHaveLength(0);
    fireEvent.pointerCancel(window, { pointerId: 62 });
    expect(
      editorStyles.match(
        /\.ec-timeline-clip__image-preview\s*\{([^}]*)\}/,
      )?.[1],
    ).toMatch(/background-repeat:\s*repeat-x;/);
  });

  it('requests and lays out video frames at speed-adjusted source density', () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === videoClip.id
          ? {
              ...clip,
              durationUs: secondsToMicroseconds(2),
              speed: 2,
            }
          : clip,
      ),
    }));

    renderTimeline();

    const request = useFramePreviewStripMock.mock.calls
      .map(([candidate]) => candidate)
      .filter((candidate) => candidate?.src === videoClip.src)
      .at(-1);
    expect(request).toEqual(
      expect.objectContaining({
        pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND / 2,
      }),
    );
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    expect(
      clip.querySelector('.ec-timeline-clip__preview-strip'),
    ).toHaveStyle({ transform: 'translate3d(0px, -50%, 0)' });
  });

  it('keeps stale preview frames visible at their original width during zoom', () => {
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
    const previewStripRule = editorStyles.match(
      /\.ec-timeline-clip__preview-strip\s*\{([^}]*)\}/,
    )?.[1];
    const thumbnailRule = editorStyles.match(
      /\.ec-timeline-clip__thumbnail\s*\{([^}]*)\}/,
    )?.[1];

    expect(previewStripRule).toMatch(/top:\s*50%;/);
    expect(previewStripRule).toMatch(/will-change:\s*transform;/);
    expect(thumbnailRule).toMatch(/max-width:\s*none;/);
    expect(thumbnailRule).toMatch(/object-fit:\s*cover;/);
    expect(
      [
        ...clip.querySelectorAll<HTMLImageElement>(
          '.ec-timeline-clip__thumbnail',
        ),
      ].map((image) => ({
        left: image.style.left,
        width: image.style.width,
      })),
    ).toEqual([
      { left: '0px', width: '85px' },
      { left: '85px', width: '85px' },
    ]);
  });

  it('uses the standard video label for non-main video tracks', () => {
    testTimelineStore.setState({
      tracks: [audioTrack, videoTrack, overlayVideoTrack],
    });
    renderTimeline();

    const overlayIcon = screen.getByTitle('视频轨道');
    expect(overlayIcon.closest('.ec-timeline-track__control')).not.toHaveAttribute(
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
    expect(hint).toHaveClass('ec-timeline-track__empty-hint');
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
      tracks: [audioTrack, videoTrack, overlayVideoTrack],
    });
    renderTimeline();

    expect(
      screen.queryByText('主轨道：可将素材拖放到这里'),
    ).not.toBeInTheDocument();
  });

  it('highlights video gaps in the corner and ruler at the current zoom', () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          durationUs: secondsToMicroseconds(2),
          trimEndUs: secondsToMicroseconds(2),
        }),
        createClip({
          id: 'video-clip-2',
          name: 'ending.mp4',
          sourceId: 'video-source-2',
          startUs: secondsToMicroseconds(4),
        }),
      ],
    });
    renderTimeline();

    expect(screen.getByText('有视频空隙')).toHaveClass(
      'ec-timeline-gap-status',
    );
    const gap = document.querySelector('.ec-timeline-ruler__gap');
    expect(gap).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 2 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${2 * DEFAULT_PIXELS_PER_SECOND}px`,
    });
    const ruler = screen.getByRole('slider', { name: '时间标尺' });
    expect(ruler.querySelector('time[datetime="PT2S"]')).toHaveClass(
      'ec-timeline-ruler__label--gap',
    );
    expect(ruler.querySelector('time[datetime="PT4S"]')).not.toHaveClass(
      'ec-timeline-ruler__label--gap',
    );

    act(() => {
      testTimelineStore.setState({ pixelsPerSecond: 100 });
    });

    expect(gap).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 200}px`,
      width: '200px',
    });
  });

  it('uses one absolute tick sequence for a later video gap', () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          durationUs: secondsToMicroseconds(2),
          trimEndUs: secondsToMicroseconds(2),
        }),
        createClip({
          id: 'video-clip-2',
          name: 'ending.mp4',
          sourceId: 'video-source-2',
          startUs: secondsToMicroseconds(4),
        }),
      ],
      pixelsPerSecond: 222,
    });
    renderTimeline();

    const ruler = screen.getByRole('slider', { name: '时间标尺' });
    const majorTick = ruler.querySelector(
      '.ec-timeline-ruler__tick[data-time-us="2000000"]',
    );
    const nextMinorTick = ruler.querySelector(
      '.ec-timeline-ruler__tick[data-time-us="2100000"]',
    );

    expect(majorTick).toHaveClass(
      'ec-timeline-ruler__tick--major',
      'ec-timeline-ruler__tick--gap',
    );
    expect(majorTick).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 2 * 222}px`,
    });
    expect(nextMinorTick).toHaveClass('ec-timeline-ruler__tick--gap');
    expect(nextMinorTick).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 2.1 * 222}px`,
    });
  });

  it('omits the status without a gap and marks an audio-only timeline', () => {
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'video-clip-2',
          name: 'ending.mp4',
          sourceId: 'video-source-2',
          startUs: secondsToMicroseconds(4),
        }),
      ],
    });
    renderTimeline();

    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
    expect(document.querySelector('.ec-timeline-ruler__gap')).toBeNull();

    act(() => {
      testTimelineStore.setState({ clips: [audioClip] });
    });

    expect(screen.getByText('有视频空隙')).toBeInTheDocument();
    expect(document.querySelector('.ec-timeline-ruler__gap')).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X}px`,
      width: `${4 * DEFAULT_PIXELS_PER_SECOND}px`,
    });
  });

  it('updates the video-gap status during a trim preview', () => {
    testTimelineStore.setState({
      clips: [
        videoClip,
        createClip({
          id: 'video-clip-2',
          name: 'middle.mp4',
          sourceId: 'video-source-2',
          startUs: secondsToMicroseconds(4),
        }),
        createClip({
          id: 'overlay-clip',
          name: 'ending.mp4',
          sourceId: 'overlay-source',
          startUs: secondsToMicroseconds(8),
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
    expect(document.querySelector('.ec-timeline-ruler__gap')).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 7 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${DEFAULT_PIXELS_PER_SECOND}px`,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(
      expect.objectContaining({ durationUs: secondsToMicroseconds(4) }),
    );

    fireEvent.pointerCancel(window, { pointerId: 27 });
    expect(screen.queryByText('有视频空隙')).not.toBeInTheDocument();
  });

  it('updates the video-gap status during a drag preview', () => {
    const overlayClip = createClip({
      id: 'overlay-clip',
      name: 'ending.mp4',
      sourceId: 'overlay-source',
      startUs: secondsToMicroseconds(4),
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
      clientY: 50,
      pointerId: 28,
    });
    fireEvent.pointerMove(window, {
      clientX: 528,
      clientY: 50,
      pointerId: 28,
    });

    expect(screen.getByText('有视频空隙')).toBeInTheDocument();
    expect(document.querySelector('.ec-timeline-ruler__gap')).toHaveStyle({
      left: `${TIMELINE_CONTENT_PADDING_X + 4 * DEFAULT_PIXELS_PER_SECOND}px`,
      width: `${DEFAULT_PIXELS_PER_SECOND}px`,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === overlayClip.id),
    ).toEqual(
      expect.objectContaining({ startUs: secondsToMicroseconds(4) }),
    );

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
    expect(testTimelineStore.getState().currentTimeUs).toBe(
      secondsToMicroseconds(2.5),
    );
    expect(testTimelineStore.getState().selectedClipId).toBeNull();
    expect(document.querySelector('.ec-timeline-shell')).toHaveAttribute(
      'data-scrubbing',
      'true',
    );
    fireEvent.pointerUp(window, {
      clientX: 308,
      clientY: 10,
      pointerId: 1,
    });
    expect(document.querySelector('.ec-timeline-shell')).toHaveAttribute(
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

    expect(testTimelineStore.getState().currentTimeUs).toBe(
      secondsToMicroseconds(4),
    );
    const playhead = document.querySelector('.ec-timeline-playhead');
    expect(playhead).toHaveStyle({ left: '332px' });
    expect(playhead?.children).toHaveLength(2);
    expect(playhead?.children[0]).toHaveClass(
      'ec-timeline-playhead__handle',
    );
    expect(playhead?.children[1]).toHaveClass('ec-timeline-playhead__line');
  });

  it('keeps the selected clip while scrubbing from the playhead', () => {
    renderTimeline();

    const playhead = document.querySelector('.ec-timeline-playhead');
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
    const playhead = document.querySelector('.ec-timeline-playhead');

    expect(playhead?.parentElement).toHaveClass('ec-timeline-playhead-layer');
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

  it('centers a new clip start and track when both axes are outside', () => {
    const { controlsViewport, rulerCanvas, viewport } = renderTimeline();
    const clipId = 'clip-reveal-both';
    setViewportScrollSize(viewport, { height: 800, width: 2_000 });
    mockRevealElementRects({
      clipId,
      clipRect: createRect({ height: 40, left: 900, top: 300, width: 120 }),
      trackId: audioTrack.id,
      trackRect: createRect({ height: 40, left: 96, top: 290, width: 2_000 }),
    });
    viewport.scrollLeft = 100;
    viewport.scrollTop = 20;
    fireEvent.scroll(viewport);

    act(() => addRevealAudioClip('reveal-both'));

    expect(viewport.scrollLeft).toBe(552);
    expect(viewport.scrollTop).toBe(194);
    expect(rulerCanvas).toHaveStyle({
      transform: 'translate3d(-552px, 0, 0)',
    });
    expect(controlsViewport.firstElementChild).toHaveStyle({
      transform: 'translate3d(0, -194px, 0)',
    });
    expect(document.querySelector('.ec-timeline-playhead')).toHaveStyle({
      left: '-540px',
    });
    expect(testTimelineStore.getState().pendingClipRevealId).toBeNull();

    viewport.scrollLeft = 0;
    fireEvent.scroll(viewport);
    act(() => testTimelineStore.getState().setCurrentTimeUs(1));
    expect(viewport.scrollLeft).toBe(0);
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
      document.querySelector('.ec-timeline-ruler-canvas'),
    ).toHaveStyle({
      transform: 'translate3d(-32px, 0, 0)',
    });
  });

  it('keeps short timeline content width independent from viewport resize state', () => {
    testTimelineStore.setState({ clips: [] });
    const { grid, viewport } = renderTimeline();
    const contentLaneWidth =
      12 * DEFAULT_PIXELS_PER_SECOND + TIMELINE_CONTENT_PADDING_X * 2;

    expect(grid.style.getPropertyValue('--ec-timeline-lane-width')).toBe(
      `${contentLaneWidth}px`,
    );
    expect(grid.style.width).toBe('');

    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      value: 1_200,
    });
    fireEvent(window, new Event('resize'));

    expect(grid.style.getPropertyValue('--ec-timeline-lane-width')).toBe(
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

  it('keeps clip content visible when a zoom scroll target is clamped', () => {
    const { viewport } = renderTimeline();
    let actualScrollLeft = 400;
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get: () => actualScrollLeft,
      set: () => {
        actualScrollLeft = 0;
      },
    });

    fireEvent.wheel(viewport, {
      clientX: 96,
      ctrlKey: true,
      deltaY: 40,
    });

    expect(viewport.scrollLeft).toBe(0);
    expect(
      useFramePreviewStripMock.mock.calls.map(([request]) => request).at(-2),
    ).toEqual(
      expect.objectContaining({
        pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND - TIMELINE_ZOOM_STEP,
        src: videoClip.src,
      }),
    );
    expect(
      screen
        .getByRole('article', { name: 'video clip: opening.mp4' })
        .querySelectorAll('.ec-timeline-clip__thumbnail'),
    ).toHaveLength(2);
    expect(
      screen
        .getByRole('article', { name: 'audio clip: background.mp3' })
        .querySelector('.ec-timeline-clip__waveform-canvas'),
    ).toBeInTheDocument();
  });

  it('keeps a pointer-anchored playhead stable while zooming', () => {
    testTimelineStore.setState({
      currentTimeUs: secondsToMicroseconds(2.4),
    });
    const { viewport } = renderTimeline();
    const playhead = document.querySelector('.ec-timeline-playhead');

    expect(playhead).toHaveStyle({ left: '204px' });

    fireEvent.wheel(viewport, {
      clientX: 300,
      ctrlKey: true,
      deltaY: -40,
    });

    expect(viewport.scrollLeft).toBeCloseTo(24);
    expect(playhead).toHaveStyle({ left: '204px' });
  });

  it('follows the playhead only after it reaches the right edge during playback', () => {
    const { viewport } = renderTimeline();

    act(() => {
      testTimelineStore.setState({
        currentTimeUs: secondsToMicroseconds(8),
        isPlaying: true,
      });
    });

    expect(viewport.scrollLeft).toBe(0);

    act(() => {
      testTimelineStore.setState({
        currentTimeUs: secondsToMicroseconds(9),
      });
    });

    expect(viewport.scrollLeft).toBe(528);
  });

  it('does not follow the playhead when playback follow is disabled', () => {
    testTimelineStore.setState({ playheadFollowEnabled: false });
    const { viewport } = renderTimeline();

    act(() => {
      testTimelineStore.setState({
        currentTimeUs: secondsToMicroseconds(9),
        isPlaying: true,
      });
    });

    expect(viewport.scrollLeft).toBe(0);
  });

  it('reuses fixed waveform tiles while scrolling during playback', () => {
    const longAudioClip = createClip({
      durationUs: secondsToMicroseconds(60),
      id: 'long-audio-clip',
      name: 'long-background.mp3',
      sourceDurationUs: secondsToMicroseconds(60),
      sourceId: 'long-audio-source',
      src: '/long-background.mp3',
      startUs: 0,
      trackId: audioTrack.id,
      trimEndUs: secondsToMicroseconds(60),
      type: 'audio',
      volume: 0.5,
    });
    testTimelineStore.setState({
      clips: [videoClip, longAudioClip],
      currentTimeUs: secondsToMicroseconds(5),
      isPlaying: true,
    });
    const { viewport } = renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'audio clip: long-background.mp3',
    });
    const initialTileZero = clip.querySelector<HTMLCanvasElement>(
      '[data-waveform-tile-index="0"]',
    );
    const initialTileOne = clip.querySelector<HTMLCanvasElement>(
      '[data-waveform-tile-index="1"]',
    );
    if (!initialTileZero || !initialTileOne) {
      throw new Error('initial waveform tiles were not rendered');
    }
    initialTileZero.width = 2_048;
    initialTileZero.height = 72;

    for (const [scrollLeft, currentTimeUs] of [
      [360, secondsToMicroseconds(5.1)],
      [400, secondsToMicroseconds(5.2)],
      [440, secondsToMicroseconds(5.6)],
    ] as const) {
      viewport.scrollLeft = scrollLeft;
      fireEvent.scroll(viewport);
      act(() => {
        testTimelineStore.setState({ currentTimeUs });
      });

      const tileZero = clip.querySelector<HTMLCanvasElement>(
        '[data-waveform-tile-index="0"]',
      );
      const tileOne = clip.querySelector<HTMLCanvasElement>(
        '[data-waveform-tile-index="1"]',
      );
      expect(tileZero).toBe(initialTileZero);
      expect(tileOne).toBe(initialTileOne);
      expect(tileZero).toHaveStyle({ left: '0px', width: '1024px' });
      expect(tileZero?.width).toBe(2_048);
      expect(tileZero?.height).toBe(72);
    }
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
    expect(document.querySelector('.ec-timeline-drag-ghost')).toHaveStyle({
      left: '412px',
      width: '240px',
    });
    expect(
      document.querySelector('.ec-timeline-clip-placeholder'),
    ).toBeInTheDocument();
    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toHaveStyle({
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
      durationUs: secondsToMicroseconds(3),
      startUs: secondsToMicroseconds(5),
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({ startUs: secondsToMicroseconds(1) }),
    );
    fireEvent.pointerUp(window, {
      clientX: 528,
      clientY: 100,
      pointerId: 7,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(5),
        trackId: audioTrack.id,
      }),
    );
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

    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toHaveStyle({
      left: '412px',
      top: '0px',
    });
    expect(document.querySelector('.ec-timeline-drag-ghost')).toHaveStyle({
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

    expect(document.querySelector('.ec-timeline-drag-ghost')).toHaveAttribute(
      'data-snapped',
      'true',
    );
    expect(document.querySelector('.ec-timeline-snap-line')).toHaveStyle({
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
    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toBeNull();
  });

  it('toggles clip visibility from the context menu and dims hidden clips', () => {
    renderTimeline();
    const clip = screen.getByRole('article', {
      name: 'video clip: opening.mp4',
    });
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );

    fireEvent.contextMenu(clip, { clientX: 300, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: '隐藏片段' }));

    const hiddenClip = screen.getByRole('article', {
      name: 'video clip: opening.mp4，已隐藏',
    });
    expect(hiddenClip).toHaveAttribute('data-hidden', 'true');
    expect(testTimelineStore.getState().clips[0]?.hidden).toBe(true);
    expect(editorStyles).toMatch(
      /\.ec-timeline-clip\[data-hidden='true'\]\s*\{[^}]*opacity:\s*0\.45/,
    );

    vi.spyOn(hiddenClip, 'getBoundingClientRect').mockReturnValue(
      createRect({ left: 100, width: 400 }),
    );
    fireEvent.contextMenu(hiddenClip, { clientX: 300, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: '显示片段' }));

    expect(
      screen.getByRole('article', { name: 'video clip: opening.mp4' }),
    ).toHaveAttribute('data-hidden', 'false');
    expect(testTimelineStore.getState().clips[0]?.hidden).toBe(false);
  });

  it('splits a clip at the context-menu pointer without moving the playhead', () => {
    testTimelineStore.setState({
      currentTimeUs: secondsToMicroseconds(0.25),
      selectedClipId: null,
    });
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

    expect(testTimelineStore.getState().currentTimeUs).toBe(
      secondsToMicroseconds(0.25),
    );
    expect(
      testTimelineStore
        .getState()
        .clips.filter(({ type }) => type === 'video')
        .map(({ durationUs, startUs }) => [startUs, durationUs]),
    ).toEqual([
      [0, secondsToMicroseconds(2)],
      [secondsToMicroseconds(2), secondsToMicroseconds(2)],
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
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(1),
        zIndex: 0,
      }),
    );
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
    expect(document.querySelector('.ec-timeline-track-insert-line')).toHaveStyle({
      top: '102px',
    });
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(2);

    fireEvent.pointerMove(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });
    expect(document.querySelector('.ec-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.ec-timeline-drag-ghost')).toBeInTheDocument();
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(2);
    fireEvent.pointerUp(window, {
      clientX: 208,
      clientY: 100,
      pointerId: 14,
    });

    expect(testTimelineStore.getState().tracks).toHaveLength(2);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(1),
        trackId: audioTrack.id,
      }),
    );
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

    const insertLine = document.querySelector('.ec-timeline-track-insert-line');
    expect(insertLine).toHaveStyle({ top: '102px' });
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(2);

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
      'audio-track-2',
      MAIN_VIDEO_TRACK_ID,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(2.65),
        trackId: 'audio-track-2',
      }),
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
      document.querySelector('.ec-timeline-track-insert-line'),
    ).toHaveAttribute('data-leading', 'true');
    expect(document.querySelector('.ec-timeline-track-insert-line')).toHaveStyle({
      top: '0px',
    });
    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toHaveStyle({
      top: '0px',
    });
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(2);

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 31,
      pointerId: 24,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-1',
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
      startUs: secondsToMicroseconds(5),
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

    expect(document.querySelector('.ec-timeline-track-insert-line')).toHaveStyle({
      top: '58px',
    });

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 25,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      'audio-track-2',
      MAIN_VIDEO_TRACK_ID,
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
      tracks: [audioTrack, videoTrack, overlayTrack],
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

    expect(document.querySelector('.ec-timeline-track-insert-line')).toHaveStyle({
      top: '58px',
    });
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(3);

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 90,
      pointerId: 18,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      MAIN_VIDEO_TRACK_ID,
      'video-overlay-2',
      'video-overlay-1',
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));
  });

  it('creates an audio track from the gap between two audio tracks', () => {
    const secondAudioTrack: TimelineTrack = {
      ...audioTrack,
      id: 'audio-track-2',
      zIndex: 2,
    };
    const remainingAudioClip = createClip({
      ...audioClip,
      id: 'remaining-audio-clip',
      name: 'remaining.mp3',
      sourceId: 'remaining-audio-source',
      startUs: secondsToMicroseconds(5),
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
      tracks: [
        audioTrack,
        { ...secondAudioTrack, zIndex: 1 },
        { ...videoTrack, zIndex: 2 },
      ],
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

    expect(document.querySelector('.ec-timeline-track-insert-line')).toHaveStyle({
      top: '102px',
    });
    expect(document.querySelectorAll('.ec-timeline-track')).toHaveLength(3);

    fireEvent.pointerUp(window, {
      clientX: 300,
      clientY: 134,
      pointerId: 19,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      'audio-track-3',
      secondAudioTrack.id,
      MAIN_VIDEO_TRACK_ID,
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
        audioTrack,
        { ...videoTrack, zIndex: 1 },
        { ...firstOverlayTrack, zIndex: 2 },
        { ...secondOverlayTrack, zIndex: 3 },
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
      clientY: 50,
      pointerId: 20,
    });

    expect(document.querySelector('.ec-timeline-track-insert-line')).toBeNull();
    expect(
      document.querySelector(`[data-track-id="${secondOverlayTrack.id}"]`),
    ).toHaveAttribute('data-drop-target', 'true');

    fireEvent.pointerUp(window, {
      clientX: 340,
      clientY: 50,
      pointerId: 20,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      MAIN_VIDEO_TRACK_ID,
      firstOverlayTrack.id,
      secondOverlayTrack.id,
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
      tracks: [audioTrack, videoTrack, overlayTrack],
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
    expect(document.querySelector('.ec-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toBeInTheDocument();
    fireEvent.pointerUp(window, {
      clientX: 208,
      clientY: 90,
      pointerId: 21,
    });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      audioTrack.id,
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({
        startUs: secondsToMicroseconds(1),
        trackId: audioTrack.id,
      }),
    );
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
    expect(document.querySelector('.ec-timeline-track-insert-line')).toBeInTheDocument();

    fireEvent.pointerCancel(window, { pointerId: 22 });

    expect(testTimelineStore.getState().tracks.map(({ id }) => id)).toEqual([
      MAIN_VIDEO_TRACK_ID,
      overlayTrack.id,
    ]);
    expect(document.querySelector('.ec-timeline-track-insert-line')).not.toBeInTheDocument();
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

    expect(document.querySelector('.ec-timeline-track-insert-line')).toBeNull();
    expect(document.querySelector('.ec-timeline-clip--drag-overlay')).toBeNull();
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

    const trackStack = document.querySelector('.ec-timeline-track-stack');
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
    expect(
      document.querySelector('.ec-trim-frame-preview__image'),
    ).toHaveAttribute(
      'src',
      `blob:trim-frame-${secondsToMicroseconds(4) - 1}`,
    );
    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean)
        .at(-1),
    ).toEqual({
      height: 90,
      sourceDurationUs: secondsToMicroseconds(6),
      src: '/opening.mp4',
      timeUs: secondsToMicroseconds(4) - 1,
    });
    fireEvent.pointerMove(window, {
      clientX: 348,
      clientY: 50,
      pointerId: 9,
    });
    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean)
        .at(-1),
    ).toEqual(
      expect.objectContaining({
        timeUs: secondsToMicroseconds(3) - 1,
      }),
    );
    expect(clip.querySelector('.ec-timeline-clip__duration')).toHaveAttribute(
      'dateTime',
      'PT3S',
    );
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith({
      clipId: videoClip.id,
      durationUs: secondsToMicroseconds(3),
      startUs: 0,
    });
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(
      expect.objectContaining({ durationUs: secondsToMicroseconds(4) }),
    );
    fireEvent.pointerUp(window, {
      clientX: 348,
      clientY: 50,
      pointerId: 9,
    });

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === videoClip.id),
    ).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(3),
        trimEndUs: secondsToMicroseconds(3),
        trimStartUs: 0,
      }),
    );
    expect(onClipTimingPreviewChange).toHaveBeenLastCalledWith(null);
    expect(testTimelineStore.getState().past).toHaveLength(1);
    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
  });

  it('maps a speed-adjusted start trim to the new first source frame', () => {
    const fastClip = createClip({
      durationUs: secondsToMicroseconds(2),
      speed: 2,
      trimEndUs: secondsToMicroseconds(4),
    });
    testTimelineStore.setState({ clips: [fastClip], selectedClipId: fastClip.id });
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim start of opening.mp4',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 108,
      clientY: 50,
      pointerId: 91,
    });
    fireEvent.pointerMove(window, {
      clientX: 148,
      clientY: 50,
      pointerId: 91,
    });

    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean)
        .at(-1),
    ).toEqual(
      expect.objectContaining({
        timeUs: secondsToMicroseconds(1),
      }),
    );
    fireEvent.pointerCancel(window, { pointerId: 91 });
    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it.each([
    { result: null, status: 'loading' },
    {
      result: { message: 'unsupported', status: 'unsupported' },
      status: 'unsupported',
    },
    {
      result: { message: 'decode failed', status: 'error' },
      status: 'error',
    },
  ])('does not render an empty $status trim frame preview', ({ result }) => {
    useSingleFramePreviewMock.mockReturnValue(result);
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of opening.mp4',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 428,
      clientY: 50,
      pointerId: 92,
    });

    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
    fireEvent.pointerCancel(window, { pointerId: 92 });
    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
  });

  it('sizes a portrait trim frame preview to its decoded dimensions', () => {
    useSingleFramePreviewMock.mockImplementation((request) =>
      request
        ? {
            height: 90,
            status: 'ready',
            timeUs: request.timeUs,
            url: 'blob:portrait-trim-frame',
            width: 51,
          }
        : null,
    );
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of opening.mp4',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 428,
      clientY: 50,
      pointerId: 93,
    });

    expect(document.querySelector('.ec-trim-frame-preview')).toHaveStyle({
      height: '90px',
      width: '51px',
    });
    expect(
      document.querySelector('.ec-trim-frame-preview__image'),
    ).toHaveAttribute('src', 'blob:portrait-trim-frame');
    fireEvent.pointerCancel(window, { pointerId: 93 });
  });

  it('snaps a video end trim to the playhead and commits one history entry', () => {
    testTimelineStore.setState({
      currentTimeUs: secondsToMicroseconds(3),
      snappingEnabled: true,
    });
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of opening.mp4',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 428,
      clientY: 50,
      pointerId: 41,
    });
    fireEvent.pointerMove(window, {
      clientX: 352,
      clientY: 50,
      pointerId: 41,
    });

    expect(document.querySelector('.ec-timeline-snap-line')).toHaveStyle({
      left: '252px',
    });
    expect(
      screen
        .getByRole('article', { name: 'video clip: opening.mp4' })
        .querySelector('.ec-timeline-clip__duration'),
    ).toHaveAttribute('dateTime', 'PT3S');

    fireEvent.pointerUp(window, {
      clientX: 352,
      clientY: 50,
      pointerId: 41,
    });

    expect(getStoreMediaClip(videoClip.id)).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(3),
        trimEndUs: secondsToMicroseconds(3),
      }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);
    expect(document.querySelector('.ec-timeline-snap-line')).toBeNull();
  });

  it('snaps an audio start trim to another clip edge and clears on cancel', () => {
    const longAudioClip = createClip({
      durationUs: secondsToMicroseconds(4),
      id: 'long-audio-clip',
      name: 'long-audio.mp3',
      sourceDurationUs: secondsToMicroseconds(5),
      sourceId: 'long-audio-source',
      startUs: secondsToMicroseconds(1),
      trackId: audioTrack.id,
      trimEndUs: secondsToMicroseconds(4),
      type: 'audio',
    });
    testTimelineStore.setState({
      clips: [videoClip, longAudioClip],
      selectedClipId: longAudioClip.id,
      snappingEnabled: true,
    });
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim start of long-audio.mp3',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 188,
      clientY: 100,
      pointerId: 42,
    });
    fireEvent.pointerMove(window, {
      clientX: 424,
      clientY: 100,
      pointerId: 42,
    });
    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean),
    ).toHaveLength(0);

    expect(document.querySelector('.ec-timeline-snap-line')).toHaveStyle({
      left: '332px',
    });
    expect(
      screen
        .getByRole('article', { name: 'audio clip: long-audio.mp3' })
        .querySelector('.ec-timeline-clip__duration'),
    ).toHaveAttribute('dateTime', 'PT1S');

    fireEvent.pointerCancel(window, { pointerId: 42 });

    expect(getStoreMediaClip(longAudioClip.id)).toEqual(longAudioClip);
    expect(testTimelineStore.getState().past).toHaveLength(0);
    expect(document.querySelector('.ec-timeline-snap-line')).toBeNull();
  });

  it('snaps and commits a text clip end trim to another clip edge', () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-1',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 2,
    };
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        {
          bold: false,
          durationUs: secondsToMicroseconds(5),
          fontColor: '#FFFFFFFF',
          fontSize: 120,
            fontType: 'SY_Black',
            hidden: false,
          id: 'text-clip-1',
          italic: false,
          layoutSize: { height: 200, width: 1_800 },
          position: { x: 60, y: 440 },
          startUs: 0,
          text: '我们的精彩旅程',
          trackId: textTrack.id,
          type: 'text',
          underline: false,
          zIndex: 0,
        },
      ],
      currentTimeUs: secondsToMicroseconds(2),
      selectedClipId: 'text-clip-1',
      snappingEnabled: true,
      tracks: [...state.tracks, textTrack],
    }));
    renderTimeline();
    const trimHandle = screen.getByRole('button', {
      name: 'Trim end of 我们的精彩旅程',
    });

    fireEvent.pointerDown(trimHandle, {
      button: 0,
      clientX: 508,
      clientY: 50,
      pointerId: 43,
    });
    expect(document.querySelector('.ec-trim-frame-preview')).toBeNull();
    expect(
      useSingleFramePreviewMock.mock.calls
        .map(([request]) => request)
        .filter(Boolean),
    ).toHaveLength(0);
    fireEvent.pointerMove(window, {
      clientX: 432,
      clientY: 50,
      pointerId: 43,
    });

    expect(document.querySelector('.ec-timeline-snap-line')).toHaveStyle({
      left: '332px',
    });

    fireEvent.pointerUp(window, {
      clientX: 432,
      clientY: 50,
      pointerId: 43,
    });

    expect(
      testTimelineStore
        .getState()
        .clips.find(({ id }) => id === 'text-clip-1'),
    ).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(4),
        startUs: 0,
      }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);
    expect(document.querySelector('.ec-timeline-snap-line')).toBeNull();
  });

  it('restores video and audio clip trims on double click', () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id === videoClip.id) {
          return {
            ...clip,
            durationUs: secondsToMicroseconds(3),
            trimEndUs: secondsToMicroseconds(4),
            trimStartUs: secondsToMicroseconds(1),
          };
        }
        if (clip.id === audioClip.id) {
          return {
            ...clip,
            durationUs: secondsToMicroseconds(2),
            trimEndUs: secondsToMicroseconds(2.5),
            trimStartUs: secondsToMicroseconds(0.5),
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
      expect.objectContaining({
        durationUs: secondsToMicroseconds(6),
        trimEndUs: secondsToMicroseconds(6),
        trimStartUs: 0,
      }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);

    doubleClickClip(
      screen.getByRole('article', { name: 'audio clip: background.mp3' }),
      { clientX: 200, clientY: 100, pointerId: 31 },
    );

    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === audioClip.id),
    ).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(3),
        trimEndUs: secondsToMicroseconds(3),
        trimStartUs: 0,
      }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(2);
  });

  it('adjusts audio volume by pointer position and commits the gesture', () => {
    testTimelineStore.setState({
      clips: [
        videoClip,
        audioClip,
        {
          ...audioClip,
          id: 'audio-clip-independent',
          startUs: secondsToMicroseconds(5),
          volume: 0.2,
        },
      ],
    });
    renderTimeline();
    const audio = document.querySelector<HTMLElement>(
      '[data-clip-id="audio-clip"]',
    );
    if (!audio) throw new Error('Expected primary audio clip');
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

    expect(getStoreMediaClip(audioClip.id).volume).toBe(1);
    expect(
      getStoreMediaClip('audio-clip-independent').volume,
    ).toBe(0.2);
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
      clips: [videoClip, { ...audioClip, volume: 0.75 }],
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

    expect(getStoreMediaClip(audioClip.id).volume).toBe(0.75);
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });
});
