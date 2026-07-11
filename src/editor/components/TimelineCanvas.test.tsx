import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import {
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  MAIN_VIDEO_TRACK_ID,
  getVisibleTimelineTracks,
  type PendingTimelineTrack,
} from '../store/timeline-store';
import { useTimelineStore } from '../store/timeline-store-context';
import {
  TIMELINE_AUDIO_CLIP_HEIGHT,
  TIMELINE_AUDIO_TRACK_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_HEIGHT,
  getTimelineClipY,
} from '../core/timeline-layout';
import type { TimelineClip, TimelineTrack } from '../types';
import { TrackHeader } from './TrackHeader';
import { TimelineCanvas } from './TimelineCanvas';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';

const konvaMockState = vi.hoisted(() => ({
  clipMounts: 0,
  clipUnmounts: 0,
  pointerPosition: null as { x: number; y: number } | null,
  positionCalls: [] as { x: number; y: number }[],
}));

vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();
  return {
    ...actual,
    useAudioWaveformSamples: () => [],
    useFramePreviewUrls: () => [],
  };
});

vi.mock('react-konva', async () => {
  const React = await import('react');

  type MockKonvaProps = {
    children?: ReactNode;
    image?: unknown;
    text?: ReactNode;
  } & Record<string, unknown>;

  const createKonvaEvent = (props: MockKonvaProps) => ({
    cancelBubble: false,
    target: {
      getStage: () => ({
        container: () => ({
          dataset: {} as Record<string, string>,
          style: { cursor: 'default' },
        }),
        getPointerPosition: () => konvaMockState.pointerPosition,
      }),
      moveToTop: vi.fn(),
      name: () => String(props.name ?? ''),
      position: vi.fn((position: { x: number; y: number }) => {
        konvaMockState.positionCalls.push(position);
      }),
      x: () => Number(konvaMockState.pointerPosition?.x ?? props.x ?? 0),
      y: () => Number(konvaMockState.pointerPosition?.y ?? props.y ?? 0),
    },
  });

  const createKonvaNode =
    (name: string) =>
    ({ children, text, ...props }: MockKonvaProps) => {
      React.useEffect(() => {
        if (props.name !== 'clip') return undefined;

        konvaMockState.clipMounts += 1;
        return () => {
          konvaMockState.clipUnmounts += 1;
        };
      }, [props.name]);

      const createHandler =
        (handlerName: string) => (event: React.SyntheticEvent) => {
          const handler = props[handlerName];
          if (typeof handler === 'function') {
            const konvaEvent = createKonvaEvent(props);
            handler(konvaEvent);
            if (konvaEvent.cancelBubble) {
              event.stopPropagation();
            }
          }
        };

      return React.createElement(
        'div',
        {
          'data-name': props.name,
          'data-height': props.height,
          'data-testid': `konva-${name}`,
          'data-width': props.width,
          'data-x': props.x,
          'data-y': props.y,
          draggable: Boolean(props.draggable),
          onDrag: createHandler('onDragMove'),
          onDragEnd: createHandler('onDragEnd'),
          onDragStart: createHandler('onDragStart'),
          onMouseDown: createHandler('onMouseDown'),
          onTouchStart: createHandler('onTouchStart'),
        },
        text ?? children,
      );
    };

  return {
    Group: createKonvaNode('group'),
    Image: createKonvaNode('image'),
    Layer: createKonvaNode('layer'),
    Line: createKonvaNode('line'),
    Path: createKonvaNode('path'),
    Rect: createKonvaNode('rect'),
    Stage: createKonvaNode('stage'),
    Text: createKonvaNode('text'),
  };
});

class FakeImage {
  crossOrigin = '';
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  private imageSrc = '';

  get src() {
    return this.imageSrc;
  }

  set src(value: string) {
    this.imageSrc = value;
    queueMicrotask(() => {
      this.onload?.(new Event('load'));
    });
  }
}

const track: TimelineTrack = {
  id: MAIN_VIDEO_TRACK_ID,
  name: '视频轨',
  type: 'video',
  volume: 1,
  zIndex: 0,
};
const overlayTrack: TimelineTrack = {
  id: 'video-overlay-1',
  name: '视频轨 2',
  type: 'video',
  volume: 1,
  zIndex: 1,
};
const audioTrackOne: TimelineTrack = {
  id: 'audio-track-1',
  name: '音频轨 1',
  type: 'audio',
  volume: 1,
  zIndex: 1,
};
const audioTrackTwo: TimelineTrack = {
  id: 'audio-track-2',
  name: '音频轨 2',
  type: 'audio',
  volume: 1,
  zIndex: 2,
};

const createClip = (patch: Partial<TimelineClip>): TimelineClip => ({
  duration: 4,
  id: 'clip-1',
  name: 'clip-1.mp4',
  sourceId: 'source-1',
  sourceDuration: 4,
  src: '/clip-1.mp4',
  start: 0,
  thumbnailUrls: ['frame-a'],
  trackId: MAIN_VIDEO_TRACK_ID,
  trimEnd: 4,
  trimStart: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'video',
  zIndex: 0,
  ...patch,
});

function TimelineCanvasHarness() {
  const tracks = useTimelineStore((state) => state.tracks);
  const toggleTrackMute = useTimelineStore((state) => state.toggleTrackMute);
  const [pendingTrack, setPendingTrack] = useState<PendingTimelineTrack | null>(
    null,
  );
  const visibleTracks = getVisibleTimelineTracks(tracks, pendingTrack);

  return (
    <>
      <TrackHeader
        onToggleTrackMute={toggleTrackMute}
        rulerHeight={TIMELINE_RULER_HEIGHT}
        tracks={visibleTracks}
      />
      <TimelineCanvas
        onPendingTrackChange={setPendingTrack}
        pendingTrack={pendingTrack}
        visibleTracks={visibleTracks}
      />
      <div data-testid='visible-track-count'>{visibleTracks.length}</div>
    </>
  );
}

function StickyTimelineCanvasHarness() {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null,
  );

  return (
    <div ref={setScrollContainer} data-testid='timeline-scroll-container'>
      <TimelineCanvas verticalScrollContainer={scrollContainer} />
    </div>
  );
}

const getSelectedClipElement = (container: HTMLElement) => {
  const clips = container.querySelectorAll('[data-name="clip"]');
  return clips[clips.length - 1] as Element;
};

describe('TimelineCanvas interactions', () => {
  const originalUserAgent = window.navigator.userAgent;

  beforeEach(() => {
    resetTestTimelineStore();
    konvaMockState.clipMounts = 0;
    konvaMockState.clipUnmounts = 0;
    konvaMockState.pointerPosition = null;
    konvaMockState.positionCalls = [];
    vi.stubGlobal('Image', FakeImage);
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Chrome',
    });
    testTimelineStore.setState({
      canvasSize: DEFAULT_COMPOSITION_CANVAS_SIZE,
      clips: [
        createClip({
          duration: 3,
          id: 'clip-1',
          name: 'clip-1.mp4',
          trimEnd: 4,
          trimStart: 1,
        }),
        createClip({
          duration: 2,
          id: 'clip-2',
          name: 'clip-2.mp4',
          sourceDuration: 2,
          src: '/clip-2.mp4',
          start: 4,
          thumbnailUrls: ['frame-b'],
          trimEnd: 2,
          trimStart: 0,
          zIndex: 1,
        }),
      ],
      currentTime: 0,
      future: [],
      isPlaying: false,
      layoutRevision: 0,
      past: [],
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
      selectedClipId: 'clip-1',
      snappingEnabled: true,
      tracks: [track],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it('keeps the ruler and playhead layer fixed during vertical scrolling', async () => {
    const { container } = renderWithEditorProviders(<StickyTimelineCanvasHarness />);

    const scrollContainer = screen.getByTestId('timeline-scroll-container');
    scrollContainer.scrollTop = 72;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="overlayLayer"]'),
      ).toHaveAttribute('data-y', '72');
    });
  });

  it('scrolls horizontally with a normal wheel without changing timeline zoom', () => {
    renderWithEditorProviders(<TimelineCanvas />);

    const trackArea = screen.getByLabelText('时间线轨道区域');
    fireEvent.wheel(trackArea, { deltaX: 8, deltaY: 40 });

    expect(trackArea.scrollLeft).toBe(48);
    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      DEFAULT_PIXELS_PER_SECOND,
    );
  });

  it('zooms the timeline with Ctrl+wheel and clamps the zoom range', () => {
    renderWithEditorProviders(<TimelineCanvas />);

    const trackArea = screen.getByLabelText('时间线轨道区域');
    fireEvent.wheel(trackArea, { ctrlKey: true, deltaY: -40 });

    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      DEFAULT_PIXELS_PER_SECOND + TIMELINE_ZOOM_STEP,
    );
    expect(trackArea.scrollLeft).toBe(0);

    fireEvent.wheel(trackArea, { ctrlKey: true, deltaY: 40 });

    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      DEFAULT_PIXELS_PER_SECOND,
    );

    act(() => {
      testTimelineStore.setState({ pixelsPerSecond: MAX_PIXELS_PER_SECOND });
    });
    fireEvent.wheel(trackArea, { ctrlKey: true, deltaY: -40 });

    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      MAX_PIXELS_PER_SECOND,
    );

    act(() => {
      testTimelineStore.setState({ pixelsPerSecond: MIN_PIXELS_PER_SECOND });
    });
    fireEvent.wheel(trackArea, { ctrlKey: true, deltaY: 40 });

    expect(testTimelineStore.getState().pixelsPerSecond).toBe(
      MIN_PIXELS_PER_SECOND,
    );
  });

  it('renders a temporary bottom track and creates a dynamic track on drop', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });
    const mainTrackHeader = screen.getByRole('img', { name: '视频轨' });
    expect(
      mainTrackHeader.querySelector('.lucide-square-play'),
    ).toBeInTheDocument();
    expect(
      mainTrackHeader.querySelector('.lucide-picture-in-picture-2'),
    ).not.toBeInTheDocument();

    konvaMockState.pointerPosition = { x: 12, y: 120 };
    fireEvent.dragStart(getSelectedClipElement(container));

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('2');
    });
    const pendingTrackHeader = screen.getByRole('img', { name: '视频轨 2' });
    expect(
      pendingTrackHeader.querySelector('.lucide-picture-in-picture-2'),
    ).toBeInTheDocument();
    expect(
      pendingTrackHeader.querySelector('.lucide-square-play'),
    ).not.toBeInTheDocument();
    const pendingMuteButton = screen.getByRole('button', {
      name: '视频轨 2静音',
    });
    expect(pendingMuteButton).toBeDisabled();
    expect(pendingMuteButton.querySelector('.lucide-volume-2')).toHaveAttribute(
      'width',
      '16',
    );
    expect(screen.queryByText('视频轨 2')).not.toBeInTheDocument();
    expect(screen.queryByText('画面')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-name="timeline-hit"]'),
    ).toHaveLength(4);

    fireEvent.dragEnd(getSelectedClipElement(container));

    await waitFor(() => {
      expect(
        testTimelineStore.getState().tracks.map((candidate) => candidate.id),
      ).toEqual([MAIN_VIDEO_TRACK_ID, 'video-overlay-1']);
    });
    expect(
      testTimelineStore.getState().clips.find((clip) => clip.id === 'clip-1'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-1' }));
  });

  it('keeps the empty middle track visible after dragging an overlay clip down', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          duration: 3,
          id: 'clip-1',
          name: 'clip-1.mp4',
          trimEnd: 4,
          trimStart: 1,
        }),
        createClip({
          duration: 2,
          id: 'clip-2',
          name: 'clip-2.mp4',
          sourceDuration: 2,
          src: '/clip-2.mp4',
          start: 0,
          thumbnailUrls: ['frame-b'],
          trackId: overlayTrack.id,
          trimEnd: 2,
          trimStart: 0,
          zIndex: 0,
        }),
      ],
      selectedClipId: 'clip-2',
      tracks: [track, overlayTrack],
    });
    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('2');
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 12, y: 180 };
    fireEvent.dragStart(selectedClip);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('3');
    });
    fireEvent.dragEnd(selectedClip);

    await waitFor(() => {
      expect(
        testTimelineStore.getState().tracks.map((candidate) => candidate.id),
      ).toEqual([MAIN_VIDEO_TRACK_ID, 'video-overlay-1', 'video-overlay-2']);
    });
    expect(screen.getByTestId('visible-track-count')).toHaveTextContent('3');
    expect(getSelectedClipElement(container)).toHaveAttribute(
      'data-y',
      String(getTimelineClipY(testTimelineStore.getState().tracks, 2)),
    );
    expect(
      testTimelineStore.getState().clips.find((clip) => clip.id === 'clip-2'),
    ).toEqual(expect.objectContaining({ trackId: 'video-overlay-2' }));
  });

  it('keeps the empty middle audio track visible after dragging a clip down', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          id: 'clip-audio-a',
          name: 'audio-a.mp3',
          sourceId: 'audio-a',
          src: '/audio-a.mp3',
          trackId: audioTrackOne.id,
          type: 'audio',
        }),
        createClip({
          id: 'clip-audio-b',
          name: 'audio-b.mp3',
          sourceId: 'audio-b',
          src: '/audio-b.mp3',
          trackId: audioTrackTwo.id,
          type: 'audio',
        }),
      ],
      selectedClipId: 'clip-audio-b',
      tracks: [track, audioTrackOne, audioTrackTwo],
    });
    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('3');
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 12, y: 210 };
    fireEvent.dragStart(selectedClip);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('4');
    });
    fireEvent.dragEnd(selectedClip);

    await waitFor(() => {
      expect(
        testTimelineStore.getState().tracks.map((candidate) => candidate.id),
      ).toEqual([
        MAIN_VIDEO_TRACK_ID,
        'audio-track-1',
        'audio-track-2',
        'audio-track-3',
      ]);
    });
    expect(screen.getByTestId('visible-track-count')).toHaveTextContent('4');
    expect(getSelectedClipElement(container)).toHaveAttribute(
      'data-y',
      String(getTimelineClipY(testTimelineStore.getState().tracks, 3)),
    );
    expect(
      testTimelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-audio-b'),
    ).toEqual(expect.objectContaining({ trackId: 'audio-track-3' }));
  });

  it('toggles the main track mute icon and volume state', () => {
    renderWithEditorProviders(<TimelineCanvasHarness />);

    const muteButton = screen.getByRole('button', { name: '视频轨静音' });
    expect(muteButton).toHaveAttribute('aria-pressed', 'false');
    expect(muteButton.querySelector('.lucide-volume-2')).toHaveAttribute(
      'width',
      '16',
    );

    fireEvent.click(muteButton);

    const unmuteButton = screen.getByRole('button', { name: '视频轨取消静音' });
    expect(unmuteButton).toHaveAttribute('aria-pressed', 'true');
    expect(unmuteButton.querySelector('.lucide-volume-x')).toHaveAttribute(
      'width',
      '16',
    );
    expect(testTimelineStore.getState().tracks[0]?.volume).toBe(0);

    fireEvent.click(unmuteButton);

    expect(screen.getByRole('button', { name: '视频轨静音' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(testTimelineStore.getState().tracks[0]?.volume).toBe(1);
  });

  it('renders only a mute button in the audio track header', () => {
    testTimelineStore.setState({
      clips: [
        ...testTimelineStore.getState().clips,
        createClip({
          id: 'clip-audio',
          name: 'music.mp3',
          sourceId: 'audio-source',
          src: '/music.mp3',
          trackId: 'audio-track-1',
          type: 'audio',
        }),
      ],
      tracks: [
        track,
        {
          id: 'audio-track-1',
          name: '音频轨 1',
          type: 'audio',
          volume: 0.42,
          zIndex: 1,
        },
      ],
    });

    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    const audioTrackHeader = screen.getByRole('img', { name: '音频轨 1' });
    expect(audioTrackHeader.querySelector('.lucide-music-2')).toHaveAttribute(
      'width',
      '16',
    );
    expect(audioTrackHeader.parentElement).toHaveStyle({
      height: `${TIMELINE_AUDIO_TRACK_HEIGHT}px`,
    });
    const muteButton = screen.getByRole('button', { name: '音频轨 1静音' });
    expect(muteButton).toHaveAttribute('aria-pressed', 'false');
    expect(muteButton.querySelector('.lucide-volume-2')).toHaveAttribute(
      'width',
      '16',
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByText('音频轨 1')).not.toBeInTheDocument();

    fireEvent.click(muteButton);

    expect(
      screen.getByRole('button', { name: '音频轨 1取消静音' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(testTimelineStore.getState().tracks[1]?.volume).toBe(0);

    const trackBackgrounds = container.querySelectorAll(
      '[data-name="timeline-hit"]',
    );
    expect(trackBackgrounds[2]).toHaveAttribute(
      'data-height',
      String(TIMELINE_AUDIO_TRACK_HEIGHT),
    );
    expect(trackBackgrounds[2]).toHaveAttribute(
      'data-y',
      String(TIMELINE_RULER_HEIGHT + TIMELINE_TRACK_HEIGHT),
    );
    const audioClip = Array.from(
      container.querySelectorAll('[data-name="clip"]'),
    ).find(
      (clip) =>
        clip.getAttribute('data-height') === String(TIMELINE_AUDIO_CLIP_HEIGHT),
    );
    expect(audioClip).toHaveAttribute('data-y', '99');
  });

  it('does not create a dynamic track after returning from the temporary track', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: 12, y: 120 };
    fireEvent.dragStart(getSelectedClipElement(container));

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('2');
    });

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.drag(getSelectedClipElement(container));

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('1');
    });
    fireEvent.dragEnd(getSelectedClipElement(container));

    expect(
      testTimelineStore.getState().tracks.map((candidate) => candidate.id),
    ).toEqual([MAIN_VIDEO_TRACK_ID]);
    expect(
      testTimelineStore.getState().clips.find((clip) => clip.id === 'clip-1'),
    ).toEqual(expect.objectContaining({ trackId: MAIN_VIDEO_TRACK_ID }));
  });

  it('snaps a moved clip by its end edge to another clip boundary', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          duration: 3,
          id: 'clip-1',
          name: 'clip-1.mp4',
          trimEnd: 3,
          trimStart: 0,
        }),
        createClip({
          duration: 2,
          id: 'clip-2',
          name: 'clip-2.mp4',
          sourceDuration: 2,
          src: '/clip-2.mp4',
          start: 4,
          thumbnailUrls: ['frame-b'],
          trimEnd: 2,
          trimStart: 0,
          zIndex: 1,
        }),
        createClip({
          duration: 2,
          id: 'clip-overlay',
          name: 'clip-overlay.mp4',
          sourceDuration: 2,
          src: '/clip-overlay.mp4',
          start: 0,
          thumbnailUrls: ['frame-c'],
          trackId: overlayTrack.id,
          trimEnd: 2,
          trimStart: 0,
          zIndex: 0,
        }),
      ],
      tracks: [track, overlayTrack],
    });
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragStart(getSelectedClipElement(container));

    konvaMockState.pointerPosition = { x: 95, y: 64 };
    fireEvent.drag(getSelectedClipElement(container));
    fireEvent.dragEnd(getSelectedClipElement(container));

    expect(
      testTimelineStore.getState().clips.find((clip) => clip.id === 'clip-1'),
    ).toEqual(expect.objectContaining({ start: 1 }));
  });

  it('clamps the trailing release landing area before compacting the only main video track', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragStart(selectedClip);

    konvaMockState.pointerPosition = { x: 1000, y: 64 };
    fireEvent.drag(selectedClip);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="drag-ghost"]'),
      ).toHaveAttribute('data-x', '492');
    });
    fireEvent.dragEnd(selectedClip);

    expect(konvaMockState.positionCalls.at(-1)).toEqual({ x: 492, y: 33 });
    expect(
      testTimelineStore.getState().clips.map((clip) => [clip.id, clip.start]),
    ).toEqual([
      ['clip-2', 0],
      ['clip-1', 2],
    ]);
  });

  it('keeps trailing free placement when another video track remains', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          duration: 3,
          id: 'clip-1',
          name: 'clip-1.mp4',
          trimEnd: 3,
          trimStart: 0,
        }),
        createClip({
          duration: 2,
          id: 'clip-2',
          name: 'clip-2.mp4',
          sourceDuration: 2,
          src: '/clip-2.mp4',
          start: 4,
          thumbnailUrls: ['frame-b'],
          trimEnd: 2,
          trimStart: 0,
          zIndex: 1,
        }),
        createClip({
          duration: 2,
          id: 'clip-overlay',
          name: 'clip-overlay.mp4',
          sourceDuration: 2,
          src: '/clip-overlay.mp4',
          start: 0,
          thumbnailUrls: ['frame-c'],
          trackId: overlayTrack.id,
          trimEnd: 2,
          trimStart: 0,
          zIndex: 0,
        }),
      ],
      tracks: [track, overlayTrack],
    });
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragStart(selectedClip);

    konvaMockState.pointerPosition = { x: 1000, y: 64 };
    fireEvent.drag(selectedClip);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="drag-ghost"]'),
      ).toHaveAttribute('data-x', '1000');
    });
    fireEvent.dragEnd(selectedClip);

    expect(
      testTimelineStore.getState().tracks.map((candidate) => candidate.id),
    ).toEqual([MAIN_VIDEO_TRACK_ID, overlayTrack.id]);
    expect(
      testTimelineStore.getState().clips.find((clip) => clip.id === 'clip-1')
        ?.start,
    ).toBe(12.35);
  });

  it('previews and commits a later clip before an earlier clip by insertion index', async () => {
    testTimelineStore.setState({
      selectedClipId: 'clip-2',
    });
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 332, y: 64 };
    fireEvent.dragStart(selectedClip);

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.drag(selectedClip);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="drag-ghost"]'),
      ).toHaveAttribute('data-x', '12');
    });
    fireEvent.dragEnd(selectedClip);

    expect(konvaMockState.positionCalls.at(-1)).toEqual({ x: 12, y: 33 });
    expect(
      testTimelineStore.getState().clips.map((clip) => [clip.id, clip.start]),
    ).toEqual([
      ['clip-2', 0],
      ['clip-1', 2],
    ]);
  });

  it('uses the release event position when the final drag move has not rendered yet', async () => {
    testTimelineStore.setState({
      selectedClipId: 'clip-2',
    });
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelector('[data-name="clip"]')).not.toBeNull();
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 332, y: 64 };
    fireEvent.dragStart(selectedClip);

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragEnd(selectedClip);

    expect(
      testTimelineStore.getState().clips.map((clip) => [clip.id, clip.start]),
    ).toEqual([
      ['clip-2', 0],
      ['clip-1', 2],
    ]);
  });

  it('compacts the main track after dropping the last dynamic clip back', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          duration: 3,
          id: 'clip-1',
          name: 'clip-1.mp4',
          trimEnd: 3,
          trimStart: 0,
        }),
        createClip({
          duration: 2,
          id: 'clip-2',
          name: 'clip-2.mp4',
          sourceDuration: 2,
          src: '/clip-2.mp4',
          start: 4,
          thumbnailUrls: ['frame-b'],
          trackId: overlayTrack.id,
          trimEnd: 2,
          trimStart: 0,
          zIndex: 0,
        }),
      ],
      selectedClipId: 'clip-2',
      tracks: [track, overlayTrack],
    });
    const { container } = renderWithEditorProviders(<TimelineCanvasHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('2');
    });

    const selectedClip = getSelectedClipElement(container);
    konvaMockState.pointerPosition = { x: 332, y: 94 };
    fireEvent.dragStart(selectedClip);

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.drag(selectedClip);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="drag-ghost"]'),
      ).toHaveAttribute('data-x', '252');
    });
    fireEvent.dragEnd(selectedClip);

    await waitFor(() => {
      expect(screen.getByTestId('visible-track-count')).toHaveTextContent('1');
    });
    expect(
      testTimelineStore.getState().tracks.map((candidate) => candidate.id),
    ).toEqual([MAIN_VIDEO_TRACK_ID]);
    expect(
      testTimelineStore
        .getState()
        .clips.map((clip) => [clip.id, clip.trackId, clip.start]),
    ).toEqual([
      ['clip-1', MAIN_VIDEO_TRACK_ID, 0],
      ['clip-2', MAIN_VIDEO_TRACK_ID, 3],
    ]);
  });

  it('keeps existing clip nodes mounted after a committed drop', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-name="clip"]')).toHaveLength(2);
    });
    expect(konvaMockState.clipMounts).toBe(2);

    testTimelineStore.getState().commitClipDrop({
      clipId: 'clip-2',
      freeStart: 0,
      insertionIndex: 0,
      targetTrackId: MAIN_VIDEO_TRACK_ID,
    });

    await waitFor(() => {
      expect(
        testTimelineStore.getState().clips.map((clip) => [clip.id, clip.start]),
      ).toEqual([
        ['clip-2', 0],
        ['clip-1', 2],
      ]);
    });
    expect(konvaMockState.clipMounts).toBe(2);
    expect(konvaMockState.clipUnmounts).toBe(0);
  });

  it('previews and commits right-edge trim by moving following same-track clips', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="clip-trim-end"]'),
      ).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragStart(
      container.querySelector('[data-name="clip-trim-end"]') as Element,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="clip-trim-end"]'),
      ).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: -68, y: 64 };
    fireEvent.drag(
      container.querySelector('[data-name="clip-trim-end"]') as Element,
    );

    await waitFor(() => {
      const clipElements = Array.from(
        container.querySelectorAll('[data-name="clip"]'),
      );
      expect(
        clipElements.map((clip) => [
          clip.getAttribute('data-x'),
          clip.getAttribute('data-width'),
        ]),
      ).toEqual([
        ['172', '160'],
        ['12', '160'],
      ]);
    });

    fireEvent.dragEnd(
      container.querySelector('[data-name="clip-trim-end"]') as Element,
    );

    const clips = testTimelineStore.getState().clips;
    expect(
      clips.map((clip) => [clip.id, clip.start, clip.duration, clip.trimEnd]),
    ).toEqual([
      ['clip-1', 0, 2, 3],
      ['clip-2', 2, 2, 2],
    ]);
  });

  it('previews left-edge trim overlap before compacting on commit', async () => {
    const { container } = renderWithEditorProviders(<TimelineCanvas />);

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="clip-trim-start"]'),
      ).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: 12, y: 64 };
    fireEvent.dragStart(
      container.querySelector('[data-name="clip-trim-start"]') as Element,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-name="clip-trim-start"]'),
      ).not.toBeNull();
    });

    konvaMockState.pointerPosition = { x: 92, y: 64 };
    fireEvent.drag(
      container.querySelector('[data-name="clip-trim-start"]') as Element,
    );

    await waitFor(() => {
      const clipElements = Array.from(
        container.querySelectorAll('[data-name="clip"]'),
      );
      expect(
        clipElements.map((clip) => [
          clip.getAttribute('data-x'),
          clip.getAttribute('data-width'),
        ]),
      ).toEqual([
        ['332', '160'],
        ['92', '160'],
      ]);
    });

    fireEvent.dragEnd(
      container.querySelector('[data-name="clip-trim-start"]') as Element,
    );

    const clips = testTimelineStore.getState().clips;
    expect(
      clips.map((clip) => [clip.id, clip.start, clip.duration, clip.trimStart]),
    ).toEqual([
      ['clip-1', 0, 2, 2],
      ['clip-2', 2, 2, 0],
    ]);
  });

  it.each([
    {
      endX: 62,
      expectedDuration: 3.625,
      expectedNextStart: 3.625,
      expectedTrimEnd: 3.625,
    },
    {
      endX: 112,
      expectedDuration: 4,
      expectedNextStart: 4,
      expectedTrimEnd: 4,
    },
  ])(
    'restores the initial end trim by following the pointer delta',
    async ({ endX, expectedDuration, expectedNextStart, expectedTrimEnd }) => {
      testTimelineStore.setState({
        clips: [
          createClip({
            duration: 3,
            id: 'clip-1',
            name: 'clip-1.mp4',
            trimEnd: 3,
            trimStart: 0,
          }),
          createClip({
            duration: 2,
            id: 'clip-2',
            name: 'clip-2.mp4',
            sourceDuration: 2,
            src: '/clip-2.mp4',
            start: 4,
            thumbnailUrls: ['frame-b'],
            trimEnd: 2,
            trimStart: 0,
            zIndex: 1,
          }),
        ],
      });
      const { container } = renderWithEditorProviders(<TimelineCanvas />);

      await waitFor(() => {
        expect(
          container.querySelector('[data-name="clip-trim-end"]'),
        ).not.toBeNull();
      });

      konvaMockState.pointerPosition = { x: 12, y: 64 };
      fireEvent.dragStart(
        container.querySelector('[data-name="clip-trim-end"]') as Element,
      );

      await waitFor(() => {
        expect(
          container.querySelector('[data-name="clip-trim-end"]'),
        ).not.toBeNull();
      });

      konvaMockState.pointerPosition = { x: endX, y: 64 };
      fireEvent.dragEnd(
        container.querySelector('[data-name="clip-trim-end"]') as Element,
      );

      const clips = testTimelineStore.getState().clips;
      expect(
        clips.map((clip) => [clip.id, clip.start, clip.duration, clip.trimEnd]),
      ).toEqual([
        ['clip-1', 0, expectedDuration, expectedTrimEnd],
        ['clip-2', expectedNextStart, 2, 2],
      ]);
    },
  );
});

