import { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  MAIN_VIDEO_TRACK_ID,
} from '../store/timeline-store';
import type { TimelineClip, TimelineTrack } from '../types';
import { PreviewPanel } from './PreviewPanel';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';

const getObjectUrlMock = vi.hoisted(() =>
  vi.fn((src: string) => Promise.resolve(`blob:${src}`)),
);
vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();
  return {
    ...actual,
    useMediaRuntime: () => ({ getObjectUrl: getObjectUrlMock }),
  };
});

type ResizeObserverCallbackMock = (entries: ResizeObserverEntry[]) => void;
type CanvasDrawCall = {
  args: unknown[];
  kind:
    | 'beginPath'
    | 'clip'
    | 'drawImage'
    | 'fill'
    | 'fillRect'
    | 'rect'
    | 'restore'
    | 'roundRect'
    | 'save'
    | 'stroke'
    | 'strokeRect';
};

const mainTrack: TimelineTrack = {
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
const audioTrack: TimelineTrack = {
  id: 'audio-track-1',
  name: '音频轨 1',
  type: 'audio',
  volume: 0.35,
  zIndex: 2,
};

const createClip = (patch: Partial<TimelineClip>): TimelineClip => ({
  duration: 5,
  id: 'clip-main',
  name: 'clip.mp4',
  sourceId: 'source-main',
  sourceDuration: 5,
  src: '/clip.mp4',
  start: 0,
  thumbnailUrls: [],
  trackId: MAIN_VIDEO_TRACK_ID,
  trimEnd: 5,
  trimStart: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'video',
  zIndex: 0,
  ...patch,
});

describe('PreviewPanel', () => {
  const originalUserAgent = window.navigator.userAgent;
  const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'ResizeObserver',
  );
  const readyStateDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'readyState',
  );
  const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'setPointerCapture',
  );
  const releasePointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'releasePointerCapture',
  );
  let drawImageMock: ReturnType<typeof vi.fn>;
  let drawCalls: CanvasDrawCall[];
  let fillRectMock: ReturnType<typeof vi.fn>;
  let mediaReadyState: number;
  let resizeObserverCallback: ResizeObserverCallbackMock | null;
  let strokeRectMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetTestTimelineStore();
    drawCalls = [];
    const createCanvasCallMock = (kind: CanvasDrawCall['kind']) =>
      vi.fn((...args: unknown[]) => {
        drawCalls.push({ args, kind });
      });
    drawImageMock = createCanvasCallMock('drawImage');
    fillRectMock = createCanvasCallMock('fillRect');
    mediaReadyState = 4;
    resizeObserverCallback = null;
    strokeRectMock = createCanvasCallMock('strokeRect');
    getObjectUrlMock.mockClear();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Chrome',
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => mediaReadyState,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'releasePointerCapture',
      {
        configurable: true,
        value: vi.fn(),
      },
    );
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class ResizeObserverMock {
        constructor(callback: ResizeObserverCallbackMock) {
          resizeObserverCallback = callback;
        }

        disconnect = vi.fn();

        observe = vi.fn();
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
      contextId,
    ) =>
      contextId === '2d'
        ? {
            beginPath: createCanvasCallMock('beginPath'),
            clip: createCanvasCallMock('clip'),
            drawImage: drawImageMock,
            fill: createCanvasCallMock('fill'),
            fillRect: fillRectMock,
            fillStyle: '',
            lineWidth: 0,
            rect: createCanvasCallMock('rect'),
            restore: createCanvasCallMock('restore'),
            roundRect: createCanvasCallMock('roundRect'),
            save: createCanvasCallMock('save'),
            setLineDash: vi.fn(),
            stroke: createCanvasCallMock('stroke'),
            strokeRect: strokeRectMock,
            strokeStyle: '',
          }
        : null) as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    testTimelineStore.setState({
      canvasSize: DEFAULT_COMPOSITION_CANVAS_SIZE,
      clips: [
        createClip({
          id: 'clip-main',
          src: '/main.mp4',
          trackId: MAIN_VIDEO_TRACK_ID,
        }),
        createClip({
          id: 'clip-overlay',
          src: '/overlay.mp4',
          trackId: overlayTrack.id,
          transform: { height: 180, width: 320, x: 100, y: 80 },
          zIndex: 0,
        }),
      ],
      currentTime: 1,
      future: [],
      isPlaying: false,
      past: [],
      selectedClipId: 'clip-overlay',
      tracks: [mainTrack, overlayTrack],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    if (resizeObserverDescriptor) {
      Object.defineProperty(
        globalThis,
        'ResizeObserver',
        resizeObserverDescriptor,
      );
    } else {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }

    if (readyStateDescriptor) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        'readyState',
        readyStateDescriptor,
      );
    } else {
      delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)
        .readyState;
    }
    if (setPointerCaptureDescriptor) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'setPointerCapture',
        setPointerCaptureDescriptor,
      );
    } else {
      delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
        .setPointerCapture;
    }
    if (releasePointerCaptureDescriptor) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'releasePointerCapture',
        releasePointerCaptureDescriptor,
      );
    } else {
      delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
        .releasePointerCapture;
    }
  });

  const triggerPreviewResize = (width: number, height: number) => {
    if (!resizeObserverCallback) {
      throw new Error('ResizeObserver was not created');
    }

    act(() => {
      resizeObserverCallback?.([
        {
          contentRect: {
            bottom: height,
            height,
            left: 0,
            right: width,
            toJSON: () => undefined,
            top: 0,
            width,
            x: 0,
            y: 0,
          },
        } as ResizeObserverEntry,
      ]);
    });
  };
  const mockWidePreviewRect = (canvas: HTMLCanvasElement) => {
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      bottom: 740,
      height: 720,
      left: 10,
      right: 1610,
      toJSON: () => undefined,
      top: 20,
      width: 1600,
      x: 10,
      y: 20,
    });
  };
  const hasRectArgs = (
    args: unknown[],
    rect: [number, number, number, number],
  ) => rect.every((value, index) => args[index] === value);
  const findLastDrawCallIndex = (
    predicate: (call: CanvasDrawCall) => boolean,
  ) =>
    drawCalls.reduce(
      (lastIndex, call, index) => (predicate(call) ? index : lastIndex),
      -1,
    );

  it('renders the video preview as a canvas', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    expect(screen.getByLabelText('视频预览').tagName).toBe('CANVAS');
  });

  it('resizes the preview canvas to fill its parent container', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;

    triggerPreviewResize(1600, 900);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
  });

  it('draws active clips by track order so later tracks overlay earlier tracks', async () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    await waitFor(() => {
      expect(drawImageMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const drawRects = drawImageMock.mock.calls.map((call) => call.slice(1, 5));
    const mainDrawIndex = drawRects.findIndex(
      (rect) =>
        rect[0] === 0 && rect[1] === 0 && rect[2] === 1280 && rect[3] === 720,
    );
    const overlayDrawIndex = drawRects.findIndex(
      (rect) =>
        rect[0] === 100 && rect[1] === 80 && rect[2] === 320 && rect[3] === 180,
    );

    expect(mainDrawIndex).toBeGreaterThanOrEqual(0);
    expect(overlayDrawIndex).toBeGreaterThan(mainDrawIndex);
  });

  it('syncs preview media volume with each track mute state', async () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(2);
      expect(
        Array.from(document.querySelectorAll('video')).every(
          (video) => video.volume === 1 && !video.muted,
        ),
      ).toBe(true);
    });

    act(() => {
      testTimelineStore.getState().toggleTrackMute(overlayTrack.id);
    });

    await waitFor(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      expect(videos[0]).toMatchObject({ muted: false, volume: 1 });
      expect(videos[1]).toMatchObject({ muted: true, volume: 0 });
    });
  });

  it('plays active audio without drawing it into the preview canvas', async () => {
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        createClip({
          id: 'clip-audio',
          name: 'music.mp3',
          sourceId: 'audio-source',
          src: '/music.mp3',
          trackId: audioTrack.id,
          transform: { height: 720, width: 1280, x: 0, y: 0 },
          type: 'audio',
          zIndex: 0,
        }),
      ],
      tracks: [...state.tracks, audioTrack],
    }));

    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(2);
      expect(document.querySelectorAll('audio')).toHaveLength(1);
      expect(drawImageMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.volume).toBe(0.35);
    expect(drawImageMock.mock.calls.some((call) => call[0] === audio)).toBe(
      false,
    );

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });

    await waitFor(() => {
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });

  it('draws selected clip bounds after every active clip so overlays cannot cover the frame', async () => {
    testTimelineStore.setState({ selectedClipId: 'clip-main' });
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    await waitFor(() => {
      expect(drawImageMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const lastDrawImageIndex = drawCalls.reduce(
      (lastIndex, call, index) =>
        call.kind === 'drawImage' ? index : lastIndex,
      -1,
    );
    const selectedFrameIndex = drawCalls.reduce(
      (lastIndex, call, index) =>
        call.kind === 'strokeRect' && hasRectArgs(call.args, [0, 0, 1280, 720])
          ? index
          : lastIndex,
      -1,
    );

    expect(selectedFrameIndex).toBeGreaterThan(lastDrawImageIndex);
  });

  it('draws clips inside the centered composition frame when the parent is wider', async () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);

    await waitFor(() => {
      const drawRects = drawImageMock.mock.calls.map((call) =>
        call.slice(1, 5),
      );

      expect(drawRects).toContainEqual([160, 0, 1280, 720]);
      expect(drawRects).toContainEqual([260, 80, 320, 180]);
    });

    expect(fillRectMock.mock.calls).toContainEqual([0, 0, 1600, 720]);
    expect(fillRectMock.mock.calls).toContainEqual([160, 0, 1280, 720]);
  });

  it('keeps the previous preview frame while active videos are seeking during playhead scrubbing', async () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);

    await waitFor(() => {
      expect(drawImageMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    drawCalls = [];
    drawImageMock.mockClear();
    fillRectMock.mockClear();
    strokeRectMock.mockClear();
    mediaReadyState = 1;

    act(() => {
      testTimelineStore.getState().setCurrentTime(1.5);
    });

    expect(fillRectMock).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();
    expect(strokeRectMock).not.toHaveBeenCalled();

    mediaReadyState = 4;
    fireEvent.seeked(document.querySelector('video') as HTMLVideoElement);

    expect(fillRectMock).toHaveBeenCalled();
    expect(drawImageMock).toHaveBeenCalled();
  });

  it('selects the topmost visible clip when pointer starts on preview content', () => {
    testTimelineStore.setState({ selectedClipId: null });
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerMove(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    expect(canvas).toHaveStyle({ cursor: 'move' });

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });

    expect(testTimelineStore.getState().selectedClipId).toBe('clip-overlay');
  });

  it('does not select unclipped transform area outside the composition canvas', () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === 'clip-overlay'
          ? { ...clip, transform: { height: 180, width: 320, x: -80, y: 40 } }
          : clip,
      ),
      selectedClipId: null,
    }));
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 130, clientY: 120, pointerId: 1 });

    expect(testTimelineStore.getState().selectedClipId).toBeNull();
  });

  it('commits a moved selected clip transform on pointer up', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 370, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 370, clientY: 170, pointerId: 1 });

    expect(
      testTimelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-overlay')?.transform,
    ).toEqual({ height: 180, width: 320, x: 160, y: 110 });
  });

  it('commits a resized selected clip transform from a corner handle', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 640, clientY: 320, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 640, clientY: 320, pointerId: 1 });

    expect(
      testTimelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-overlay')?.transform,
    ).toEqual({ height: 220, width: 370, x: 100, y: 80 });
  });

  it('keeps the initial aspect ratio when shift-resizing from a corner handle', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    fireEvent.pointerMove(canvas, {
      clientX: 640,
      clientY: 320,
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(canvas, { clientX: 640, clientY: 320, pointerId: 1 });

    expect(
      testTimelineStore
        .getState()
        .clips.find((clip) => clip.id === 'clip-overlay')?.transform,
    ).toEqual({ height: 220, width: 391, x: 100, y: 80 });
  });

  it('updates the preview cursor when hovering selected clip handles and content', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerMove(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    expect(canvas).toHaveStyle({ cursor: 'nwse-resize' });

    fireEvent.pointerMove(canvas, { clientX: 590, clientY: 100, pointerId: 1 });
    expect(canvas).toHaveStyle({ cursor: 'nesw-resize' });

    fireEvent.pointerMove(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    expect(canvas).toHaveStyle({ cursor: 'move' });

    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 30, pointerId: 1 });
    expect(canvas).toHaveStyle({ cursor: 'default' });
  });

  it('draws selected clip bounds outside the centered composition frame', async () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === 'clip-overlay'
          ? { ...clip, transform: { height: 180, width: 320, x: -80, y: 40 } }
          : clip,
      ),
    }));
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);

    await waitFor(() => {
      const clipRectIndex = findLastDrawCallIndex(
        (call) =>
          call.kind === 'rect' && hasRectArgs(call.args, [160, 0, 1280, 720]),
      );
      const clipIndex = drawCalls.findIndex(
        (call, index) => index > clipRectIndex && call.kind === 'clip',
      );
      const restoreIndex = drawCalls.findIndex(
        (call, index) => index > clipIndex && call.kind === 'restore',
      );
      const overflowDrawIndex = drawCalls.findIndex(
        (call, index) =>
          index > clipIndex &&
          index < restoreIndex &&
          call.kind === 'drawImage' &&
          hasRectArgs(call.args.slice(1), [80, 40, 320, 180]),
      );
      const selectedFrameIndex = drawCalls.findIndex(
        (call, index) =>
          index > restoreIndex &&
          call.kind === 'strokeRect' &&
          hasRectArgs(call.args, [80, 40, 320, 180]),
      );

      expect(clipRectIndex).toBeGreaterThanOrEqual(0);
      expect(clipIndex).toBeGreaterThan(clipRectIndex);
      expect(restoreIndex).toBeGreaterThan(clipIndex);
      expect(overflowDrawIndex).toBeGreaterThan(clipIndex);
      expect(overflowDrawIndex).toBeLessThan(restoreIndex);
      expect(selectedFrameIndex).toBeGreaterThan(restoreIndex);
    });
  });
});

