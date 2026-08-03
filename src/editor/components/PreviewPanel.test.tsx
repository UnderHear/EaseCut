import { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  MAIN_VIDEO_TRACK_ID,
} from '../store/timeline-store';
import type {
  TimelineMediaClip,
  TimelineTextClip,
  TimelineTextLayoutSize,
  TimelineTrack,
} from '../types';
import type { TextLayoutRequest } from '../media/text-layout-runtime';
import { PreviewAudioEngine } from '../media/preview-audio-engine';
import { PreviewPanel } from './PreviewPanel';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';

const {
  acquireObjectUrlMock,
  mediaRuntimeMock,
  measureTextLayoutMock,
  releaseObjectUrlMock,
} = vi.hoisted(() => {
  const releaseObjectUrl = vi.fn();
  const acquireObjectUrl = vi.fn((src: string) => ({
    release: () => releaseObjectUrl(src),
    url: Promise.resolve(`blob:${src}`),
  }));
  const measureTextLayout = vi.fn<
    (request: TextLayoutRequest) => Promise<TimelineTextLayoutSize>
  >(() => Promise.resolve({ height: 120, width: 800 }));
  return {
    acquireObjectUrlMock: acquireObjectUrl,
    mediaRuntimeMock: {
      acquireObjectUrl,
      measureTextLayout,
    },
    measureTextLayoutMock: measureTextLayout,
    releaseObjectUrlMock: releaseObjectUrl,
  };
});
vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();
  return {
    ...actual,
    useMediaRuntime: () => mediaRuntimeMock,
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
    | 'fillText'
    | 'fillRect'
    | 'lineTo'
    | 'moveTo'
    | 'rect'
    | 'restore'
    | 'roundRect'
    | 'save'
    | 'stroke'
    | 'strokeRect';
};

const createDeferred = <Value,>() => {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: Value) {
      if (!resolvePromise) {
        throw new Error('Deferred promise resolver is unavailable');
      }
      resolvePromise(value);
    },
  };
};

const mainTrack: TimelineTrack = {
  id: MAIN_VIDEO_TRACK_ID,
  name: '视频轨',
  type: 'video',
  muted: false,
  zIndex: 0,
};
const overlayTrack: TimelineTrack = {
  id: 'video-overlay-1',
  name: '视频轨 2',
  type: 'video',
  muted: false,
  zIndex: 1,
};
const targetTrack: TimelineTrack = {
  id: 'video-overlay-2',
  name: '视频轨 3',
  type: 'video',
  muted: false,
  zIndex: 2,
};
const audioTrack: TimelineTrack = {
  id: 'audio-track-1',
  name: '音频轨道',
  type: 'audio',
  muted: false,
  zIndex: 2,
};

const createClip = (
  patch: Partial<TimelineMediaClip>,
): TimelineMediaClip => {
  const clip = {
  durationUs: secondsToMicroseconds(5),
  id: 'clip-main',
  name: 'clip.mp4',
  sourceId: 'source-main',
  sourceDurationUs: secondsToMicroseconds(5),
  speed: 1,
  src: '/clip.mp4',
  startUs: 0,
  trackId: MAIN_VIDEO_TRACK_ID,
  trimEndUs: secondsToMicroseconds(5),
  trimStartUs: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
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

const getMediaClipById = (clipId: string) => {
  const clip = testTimelineStore
    .getState()
    .clips.find((candidate) => candidate.id === clipId);
  if (!clip || clip.type === 'text') {
    throw new Error(`Expected media clip ${clipId}`);
  }
  return clip;
};

describe('PreviewPanel', () => {
  const originalUserAgent = window.navigator.userAgent;
  const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'ResizeObserver',
  );
  const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
  const readyStateDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'readyState',
  );
  const seekingDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'seeking',
  );
  const preservesPitchDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'preservesPitch',
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
  let drawnTextColors: string[];
  let drawnTextFonts: string[];
  let fillRectMock: ReturnType<typeof vi.fn>;
  let fillTextMock: ReturnType<typeof vi.fn>;
  let currentCanvasFillStyle: string;
  let measureTextMock: ReturnType<typeof vi.fn>;
  let currentCanvasFont: string;
  let mediaReadyState: number;
  let preservesPitchByMedia: WeakMap<HTMLMediaElement, boolean>;
  let preservesPitchWrites: Array<{
    media: HTMLMediaElement;
    value: boolean;
  }>;
  let resizeObserverCallback: ResizeObserverCallbackMock | null;
  let seekingMediaElements: WeakSet<HTMLMediaElement>;
  let strokeRectMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetTestTimelineStore();
    measureTextLayoutMock.mockReset();
    measureTextLayoutMock.mockResolvedValue({ height: 120, width: 800 });
    drawCalls = [];
    drawnTextColors = [];
    drawnTextFonts = [];
    currentCanvasFillStyle = '';
    currentCanvasFont = '';
    const createCanvasCallMock = (kind: CanvasDrawCall['kind']) =>
      vi.fn((...args: unknown[]) => {
        drawCalls.push({ args, kind });
      });
    drawImageMock = createCanvasCallMock('drawImage');
    fillRectMock = createCanvasCallMock('fillRect');
    fillTextMock = vi.fn((...args: unknown[]) => {
      drawCalls.push({ args, kind: 'fillText' });
      drawnTextColors.push(currentCanvasFillStyle);
      drawnTextFonts.push(currentCanvasFont);
    });
    measureTextMock = vi.fn(
      () => ({ actualBoundingBoxDescent: 24 }) as TextMetrics,
    );
    mediaReadyState = 4;
    preservesPitchByMedia = new WeakMap();
    preservesPitchWrites = [];
    resizeObserverCallback = null;
    seekingMediaElements = new WeakSet();
    strokeRectMock = createCanvasCallMock('strokeRect');
    acquireObjectUrlMock.mockClear();
    releaseObjectUrlMock.mockClear();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Chrome',
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => mediaReadyState,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'seeking', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return seekingMediaElements.has(this);
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'preservesPitch', {
      configurable: true,
      get() {
        return preservesPitchByMedia.get(this) ?? false;
      },
      set(value: boolean) {
        preservesPitchByMedia.set(this, value);
        preservesPitchWrites.push({ media: this, value });
      },
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
            get fillStyle() {
              return currentCanvasFillStyle;
            },
            set fillStyle(value: string) {
              currentCanvasFillStyle = value;
            },
            fillText: fillTextMock,
            get font() {
              return currentCanvasFont;
            },
            set font(value: string) {
              currentCanvasFont = value;
            },
            lineWidth: 0,
            lineTo: createCanvasCallMock('lineTo'),
            measureText: measureTextMock,
            moveTo: createCanvasCallMock('moveTo'),
            rect: createCanvasCallMock('rect'),
            restore: createCanvasCallMock('restore'),
            roundRect: createCanvasCallMock('roundRect'),
            save: createCanvasCallMock('save'),
            setLineDash: vi.fn(),
            stroke: createCanvasCallMock('stroke'),
            strokeRect: strokeRectMock,
            strokeStyle: '',
            textAlign: 'start',
            textBaseline: 'alphabetic',
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
      currentTimeUs: secondsToMicroseconds(1),
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
    if (fontsDescriptor) {
      Object.defineProperty(document, 'fonts', fontsDescriptor);
    } else {
      Reflect.deleteProperty(document, 'fonts');
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
    if (seekingDescriptor) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        'seeking',
        seekingDescriptor,
      );
    } else {
      delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)
        .seeking;
    }
    if (preservesPitchDescriptor) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        'preservesPitch',
        preservesPitchDescriptor,
      );
    } else {
      delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)
        .preservesPitch;
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
    drawCalls = [];

    triggerPreviewResize(1600, 900);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
    expect(
      drawCalls.some(
        ({ args, kind }) =>
          kind === 'fillRect' && hasRectArgs(args, [0, 0, 1600, 900]),
      ),
    ).toBe(true);
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

  it('does not preload hidden video, audio, or text clips', async () => {
    const textTrack: TimelineTrack = {
      id: 'hidden-text-track',
      muted: false,
      name: '文字轨',
      type: 'text',
      zIndex: 3,
    };
    testTimelineStore.setState({
      clips: [
        createClip({ id: 'visible-video', src: '/visible.mp4' }),
        createClip({ hidden: true, id: 'hidden-video', src: '/hidden.mp4' }),
        createClip({
          hidden: true,
          id: 'hidden-audio',
          src: '/hidden.mp3',
          trackId: audioTrack.id,
          type: 'audio',
        }),
        {
          bold: false,
          durationUs: secondsToMicroseconds(5),
          fontColor: '#FFFFFFFF',
          fontSize: 120,
          fontType: 'SY_Black',
          hidden: true,
          id: 'hidden-text',
          italic: false,
          layoutSize: { height: 120, width: 800 },
          position: { x: 240, y: 300 },
          startUs: 0,
          text: '隐藏标题',
          trackId: textTrack.id,
          type: 'text',
          underline: false,
          zIndex: 0,
        },
      ],
      selectedClipId: 'visible-video',
      tracks: [mainTrack, overlayTrack, audioTrack, textTrack],
    });

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(1);
      expect(acquireObjectUrlMock).toHaveBeenCalledWith('/visible.mp4');
    });
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(acquireObjectUrlMock).not.toHaveBeenCalledWith('/hidden.mp4');
    expect(acquireObjectUrlMock).not.toHaveBeenCalledWith('/hidden.mp3');
    expect(measureTextLayoutMock).not.toHaveBeenCalled();
  });

  it('stops and unmounts an active media element when its clip is hidden', async () => {
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );
    const overlayVideo = await waitFor(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      expect(videos).toHaveLength(2);
      return videos[1]!;
    });
    const pause = vi.spyOn(overlayVideo, 'pause');
    pause.mockClear();

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });
    await waitFor(() => {
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
    releaseObjectUrlMock.mockClear();

    act(() => {
      testTimelineStore.getState().setClipHidden('clip-overlay', true);
    });

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(1);
      expect(pause).toHaveBeenCalled();
      expect(releaseObjectUrlMock).toHaveBeenCalledWith('/overlay.mp4');
    });
    expect(releaseObjectUrlMock).not.toHaveBeenCalledWith('/main.mp4');
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
          volume: 0.35,
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
      expect(document.querySelector('audio')).toHaveProperty(
        'volume',
        0.35,
      );
    });

    const audio = document.querySelector('audio') as HTMLAudioElement;
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

  it('draws styled active text at its natural layout without a maximum width', async () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-1',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 3,
    };
    const textClip: TimelineTextClip = {
      bold: true,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#12345680',
      fontSize: 120,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip-1',
      italic: true,
      layoutSize: { height: 200, width: 2_000 },
      position: { x: -100, y: 300 },
      startUs: 0,
      text: '我们的精彩旅程',
      trackId: textTrack.id,
      type: 'text',
      underline: true,
      zIndex: 0,
    };
    testTimelineStore.setState((state) => ({
      clips: [...state.clips, textClip],
      selectedClipId: textClip.id,
      tracks: [...state.tracks, textTrack],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    expect(fillTextMock).toHaveBeenCalledWith(
      '我们的精彩旅程',
      -100,
      400,
    );
    expect(drawnTextColors).toContain(
      `rgba(18, 52, 86, ${128 / 255})`,
    );
    await waitFor(() => {
      expect(drawnTextFonts).toContain(
        'italic 700 120px "Source Han Sans SC", sans-serif',
      );
    });
    const underlineCall = fillRectMock.mock.calls.find(
      ([x, , width]) => x === -100 && width === 2_000,
    );
    expect(measureTextMock).toHaveBeenCalledWith('我们的精彩旅程');
    expect(underlineCall?.[1]).toBeCloseTo(442);
    expect(underlineCall?.[3]).toBeCloseTo(7.2);
    expect(strokeRectMock).toHaveBeenCalledWith(-100, 300, 2_000, 200);
    expect(
      drawCalls.some(
        (call) =>
          call.kind === 'rect' &&
          hasRectArgs(call.args, [-100, 300, 2_000, 200]),
      ),
    ).toBe(false);
    expect(drawCalls.some((call) => call.kind === 'roundRect')).toBe(false);

    act(() => {
      const token = testTimelineStore
        .getState()
        .beginTextStyleEdit(textClip.id);
      if (token === null) throw new Error('Expected a text style edit token');
      testTimelineStore
        .getState()
        .previewTextStyleEdit(textClip.id, token, '#ABCDEFFF');
    });

    expect(drawnTextColors.at(-1)).toBe('rgba(171, 205, 239, 1)');
    expect(
      testTimelineStore.getState().clips.find(({ id }) => id === textClip.id),
    ).toEqual(textClip);
    expect(testTimelineStore.getState().past).toEqual([]);

    act(() => {
      testTimelineStore.getState().cancelTextStyleEdit(textClip.id);
    });
    expect(drawnTextColors.at(-1)).toBe(
      `rgba(18, 52, 86, ${128 / 255})`,
    );
  });

  it('preloads an upcoming text font and draws a fallback on its first active frame', async () => {
    const upcomingFontLoad = createDeferred<{ height: number; width: number }>();
    measureTextLayoutMock.mockImplementation((request) =>
      request.fontType === 'ALi_PuHui'
        ? upcomingFontLoad.promise
        : Promise.resolve({ height: 120, width: 800 }),
    );
    const textTrack: TimelineTrack = {
      id: 'text-track-upcoming-font',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 3,
    };
    const textClip: TimelineTextClip = {
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
          fontType: 'ALi_PuHui',
          hidden: false,
      id: 'text-clip-upcoming-font',
      italic: false,
      layoutSize: { height: 200, width: 1_000 },
      position: { x: 100, y: 300 },
      startUs: secondsToMicroseconds(4),
      text: '交界首帧文字',
      trackId: textTrack.id,
      type: 'text',
      underline: false,
      zIndex: 0,
    };
    testTimelineStore.setState((state) => ({
      clips: [...state.clips, textClip],
      currentTimeUs: secondsToMicroseconds(1),
      tracks: [...state.tracks, textTrack],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(measureTextLayoutMock).toHaveBeenCalledWith({
        bold: false,
        fontSize: 120,
        fontType: 'ALi_PuHui',
        italic: false,
        text: '交界首帧文字',
      });
    });
    expect(fillTextMock).not.toHaveBeenCalledWith(
      '交界首帧文字',
      expect.any(Number),
      expect.any(Number),
    );
    fillTextMock.mockClear();
    drawnTextFonts = [];

    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(4));
    });

    expect(fillTextMock).toHaveBeenCalledWith(
      '交界首帧文字',
      100,
      400,
    );
    expect(drawnTextFonts).toContain(
      '120px "Microsoft YaHei", sans-serif',
    );

    upcomingFontLoad.resolve({ height: 120, width: 800 });
    await waitFor(() => {
      expect(drawnTextFonts).toContain(
        '120px "Alibaba PuHuiTi", sans-serif',
      );
    });
  });

  it('keeps the last rendered font until a newly selected font is ready', async () => {
    const alibabaFontLoad = createDeferred<{ height: number; width: number }>();
    const zcoolFontLoad = createDeferred<{ height: number; width: number }>();
    measureTextLayoutMock.mockImplementation((request) => {
      if (request.fontType === 'SY_Black') {
        return Promise.resolve({ height: 120, width: 800 });
      }
      if (request.fontType === 'ALi_PuHui') {
        return alibabaFontLoad.promise;
      }
      if (request.fontType === '1187221') {
        return zcoolFontLoad.promise;
      }
      return Promise.reject(new Error('Unexpected font'));
    });
    const textTrack: TimelineTrack = {
      id: 'text-track-font-loading',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 3,
    };
    const textClip: TimelineTextClip = {
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip-font-loading',
      italic: false,
      layoutSize: { height: 200, width: 1_000 },
      position: { x: 100, y: 300 },
      startUs: 0,
      text: '字体切换预览',
      trackId: textTrack.id,
      type: 'text',
      underline: false,
      zIndex: 0,
    };
    testTimelineStore.setState((state) => ({
      clips: [...state.clips, textClip],
      selectedClipId: textClip.id,
      tracks: [...state.tracks, textTrack],
    }));
    const setTextFont = (fontType: TimelineTextClip['fontType']) => {
      act(() => {
        testTimelineStore.setState((state) => ({
          clips: state.clips.map((clip) =>
            clip.id === textClip.id && clip.type === 'text'
              ? { ...clip, fontType }
              : clip,
          ),
        }));
      });
    };

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(drawnTextFonts).toContain(
        '120px "Source Han Sans SC", sans-serif',
      );
    });
    fillTextMock.mockClear();
    drawnTextFonts = [];

    setTextFont('ALi_PuHui');
    await waitFor(() => {
      expect(measureTextLayoutMock).toHaveBeenCalledWith({
        bold: false,
        fontSize: 120,
        fontType: 'ALi_PuHui',
        italic: false,
        text: '字体切换预览',
      });
    });
    expect(drawnTextFonts).not.toContain(
      '120px "Alibaba PuHuiTi", sans-serif',
    );
    expect(drawnTextFonts).toContain(
      '120px "Source Han Sans SC", sans-serif',
    );

    setTextFont('1187221');
    await waitFor(() => {
      expect(measureTextLayoutMock).toHaveBeenCalledWith({
        bold: false,
        fontSize: 120,
        fontType: '1187221',
        italic: false,
        text: '字体切换预览',
      });
    });
    expect(drawnTextFonts).not.toContain(
      '120px "ZCOOL GaoDuanHei", sans-serif',
    );

    alibabaFontLoad.resolve({ height: 120, width: 800 });
    await alibabaFontLoad.promise;
    await Promise.resolve();
    expect(drawnTextFonts).not.toContain(
      '120px "Alibaba PuHuiTi", sans-serif',
    );
    expect(drawnTextFonts).not.toContain(
      '120px "ZCOOL GaoDuanHei", sans-serif',
    );

    zcoolFontLoad.resolve({ height: 120, width: 800 });
    await waitFor(() => {
      expect(drawnTextFonts).toContain(
        '120px "ZCOOL GaoDuanHei", sans-serif',
      );
    });
  });

  it('maps timeline time and playback rate for speed-adjusted video and audio', async () => {
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips.map((clip) =>
          clip.id === 'clip-main'
            ? {
                ...clip,
                durationUs: secondsToMicroseconds(2.5),
                speed: 2,
              }
            : clip,
        ),
        createClip({
          durationUs: secondsToMicroseconds(10),
          id: 'clip-audio-speed',
          name: 'slow.mp3',
          sourceId: 'audio-speed-source',
          speed: 0.5,
          src: '/slow.mp3',
          trackId: audioTrack.id,
          type: 'audio',
        }),
      ],
      tracks: [...state.tracks, audioTrack],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const audio = document.querySelector('audio');
      expect(videos).toHaveLength(2);
      expect(audio).not.toBeNull();
      expect(videos[0]).toMatchObject({
        currentTime: 2,
        playbackRate: 2,
        preservesPitch: true,
      });
      expect(videos[1]).toMatchObject({
        currentTime: 1,
        playbackRate: 1,
        preservesPitch: true,
      });
      expect(audio).toMatchObject({
        currentTime: 0.5,
        playbackRate: 0.5,
        preservesPitch: true,
      });
      expect(preservesPitchWrites).toContainEqual({
        media: audio,
        value: true,
      });
    });
  });

  it('uses the browser pitch fallback when preservesPitch is unavailable', async () => {
    Reflect.deleteProperty(
      HTMLMediaElement.prototype,
      'preservesPitch',
    );
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        createClip({
          durationUs: secondsToMicroseconds(2.5),
          id: 'clip-audio-pitch-fallback',
          name: 'fallback.mp3',
          sourceId: 'audio-pitch-fallback-source',
          speed: 2,
          src: '/fallback.mp3',
          trackId: audioTrack.id,
          type: 'audio',
        }),
      ],
      tracks: [...state.tracks, audioTrack],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      const audio = document.querySelector('audio');
      expect(audio).toMatchObject({
        currentTime: 2,
        playbackRate: 2,
      });
      expect(audio && 'preservesPitch' in audio).toBe(false);
      expect(screen.getByRole('status')).toHaveTextContent(
        '高质量变速音频不可用，已使用浏览器兼容模式',
      );
    });
  });

  it('does not restart or seek active media on every playing clock update', async () => {
    const releaseAudioSpy = vi.spyOn(
      PreviewAudioEngine.prototype,
      'release',
    );
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const video = await waitFor(() => {
      const element = document.querySelector('video');
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error('视频预览元素尚未挂载');
      }
      return element;
    });

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });
    await waitFor(() => {
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    const playCallCount = vi.mocked(HTMLMediaElement.prototype.play).mock
      .calls.length;
    video.currentTime = 0.6;

    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(2));
    });

    expect(video.currentTime).toBe(0.6);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(
      playCallCount,
    );
    expect(releaseAudioSpy).not.toHaveBeenCalled();
  });

  it('does not touch continuous video when a text clip starts or ends', async () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-media-continuity',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 2,
    };
    const textClip: TimelineTextClip = {
      bold: false,
      durationUs: secondsToMicroseconds(1),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip-media-continuity',
      italic: false,
      layoutSize: { height: 200, width: 1_000 },
      position: { x: 100, y: 300 },
      startUs: secondsToMicroseconds(4),
      text: '不打断视频',
      trackId: textTrack.id,
      type: 'text',
      underline: false,
      zIndex: 0,
    };
    testTimelineStore.setState({
      clips: [
        createClip({
          durationUs: secondsToMicroseconds(10),
          id: 'clip-continuous-under-text',
          sourceDurationUs: secondsToMicroseconds(10),
          sourceId: 'source-continuous-under-text',
          src: '/continuous-under-text.mp4',
          trimEndUs: secondsToMicroseconds(10),
        }),
        textClip,
      ],
      currentTimeUs: secondsToMicroseconds(3.9),
      selectedClipId: 'clip-continuous-under-text',
      tracks: [mainTrack, textTrack],
    });

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const video = await waitFor(() => {
      const element = document.querySelector('video');
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error('连续视频尚未完成预加载');
      }
      return element;
    });
    const pausedMedia: HTMLMediaElement[] = [];
    const playedMedia: HTMLMediaElement[] = [];
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(
      function pause(this: HTMLMediaElement) {
        pausedMedia.push(this);
      },
    );
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      function play(this: HTMLMediaElement) {
        playedMedia.push(this);
        return Promise.resolve();
      },
    );

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });
    await waitFor(() => {
      expect(playedMedia).toContain(video);
    });

    const crossTextBoundary = (
      mediaTime: number,
      timelineTime: number,
    ) => {
      video.currentTime = mediaTime;
      pausedMedia.length = 0;
      playedMedia.length = 0;

      act(() => {
        testTimelineStore
          .getState()
          .setCurrentTimeUs(secondsToMicroseconds(timelineTime));
      });

      expect(video.currentTime).toBe(mediaTime);
      expect(pausedMedia).not.toContain(video);
      expect(playedMedia).not.toContain(video);
    };

    crossTextBoundary(3.7, 4);
    crossTextBoundary(4.6, 5);
  });

  it('only switches changed media when an overlay video starts or ends', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          durationUs: secondsToMicroseconds(10),
          id: 'clip-continuous-under-overlay',
          sourceDurationUs: secondsToMicroseconds(10),
          sourceId: 'source-continuous-under-overlay',
          src: '/continuous-under-overlay.mp4',
          trimEndUs: secondsToMicroseconds(10),
        }),
        createClip({
          durationUs: secondsToMicroseconds(1),
          id: 'clip-short-overlay',
          sourceDurationUs: secondsToMicroseconds(1),
          sourceId: 'source-short-overlay',
          src: '/short-overlay.mp4',
          startUs: secondsToMicroseconds(4),
          trackId: overlayTrack.id,
          trimEndUs: secondsToMicroseconds(1),
          transform: { height: 180, width: 320, x: 100, y: 80 },
        }),
      ],
      currentTimeUs: secondsToMicroseconds(3.9),
      selectedClipId: 'clip-continuous-under-overlay',
      tracks: [mainTrack, overlayTrack],
    });

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const [continuousVideo, overlayVideo] = await waitFor(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      expect(videos).toHaveLength(2);
      return videos;
    });
    const pausedMedia: HTMLMediaElement[] = [];
    const playedMedia: HTMLMediaElement[] = [];
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(
      function pause(this: HTMLMediaElement) {
        pausedMedia.push(this);
      },
    );
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      function play(this: HTMLMediaElement) {
        playedMedia.push(this);
        return Promise.resolve();
      },
    );

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });
    await waitFor(() => {
      expect(playedMedia).toContain(continuousVideo);
    });
    expect(playedMedia).not.toContain(overlayVideo);

    continuousVideo.currentTime = 3.7;
    pausedMedia.length = 0;
    playedMedia.length = 0;
    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(4));
    });

    expect(continuousVideo.currentTime).toBe(3.7);
    expect(pausedMedia).not.toContain(continuousVideo);
    expect(playedMedia).not.toContain(continuousVideo);
    expect(playedMedia).toContain(overlayVideo);

    continuousVideo.currentTime = 4.6;
    pausedMedia.length = 0;
    playedMedia.length = 0;
    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(5));
    });

    expect(continuousVideo.currentTime).toBe(4.6);
    expect(pausedMedia).not.toContain(continuousVideo);
    expect(playedMedia).not.toContain(continuousVideo);
    expect(pausedMedia).toContain(overlayVideo);
  });

  it('keeps a continuing overlay media node stable when a later main clip starts', async () => {
    const sharedSource = '/shared-source.mp4';
    testTimelineStore.setState({
      clips: [
        createClip({
          durationUs: secondsToMicroseconds(10),
          id: 'clip-continuing-overlay',
          sourceDurationUs: secondsToMicroseconds(10),
          sourceId: 'shared-source',
          src: sharedSource,
          trackId: overlayTrack.id,
          trimEndUs: secondsToMicroseconds(10),
          transform: { height: 180, width: 320, x: 100, y: 80 },
        }),
        createClip({
          id: 'clip-later-main',
          sourceId: 'shared-source',
          src: sharedSource,
          startUs: secondsToMicroseconds(4),
        }),
      ],
      currentTimeUs: secondsToMicroseconds(3.9),
      selectedClipId: 'clip-continuing-overlay',
      tracks: [mainTrack, overlayTrack],
    });

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const [continuingOverlay, laterMain] = await waitFor(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      expect(videos).toHaveLength(2);
      return videos;
    });
    const pausedMedia: HTMLMediaElement[] = [];
    const playedMedia: HTMLMediaElement[] = [];
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(
      function pause(this: HTMLMediaElement) {
        pausedMedia.push(this);
      },
    );
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      function play(this: HTMLMediaElement) {
        playedMedia.push(this);
        return Promise.resolve();
      },
    );

    act(() => {
      testTimelineStore.getState().setIsPlaying(true);
    });
    await waitFor(() => {
      expect(playedMedia).toContain(continuingOverlay);
    });
    expect(playedMedia).not.toContain(laterMain);

    continuingOverlay.currentTime = 3.7;
    pausedMedia.length = 0;
    playedMedia.length = 0;
    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(4));
    });

    const videosAfterBoundary = Array.from(
      document.querySelectorAll('video'),
    );
    expect(videosAfterBoundary[0]).toBe(continuingOverlay);
    expect(videosAfterBoundary[1]).toBe(laterMain);
    expect(continuingOverlay.currentTime).toBe(3.7);
    expect(pausedMedia).not.toContain(continuingOverlay);
    expect(playedMedia).not.toContain(continuingOverlay);
    expect(playedMedia).toContain(laterMain);
  });

  it('preloads at most the next nearby clip on each track', async () => {
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        createClip({
          id: 'clip-main-next',
          sourceId: 'source-main-next',
          src: '/main-next.mp4',
          startUs: secondsToMicroseconds(5),
          trackId: MAIN_VIDEO_TRACK_ID,
        }),
        createClip({
          id: 'clip-main-later',
          sourceId: 'source-main-later',
          src: '/main-later.mp4',
          startUs: secondsToMicroseconds(10),
          trackId: MAIN_VIDEO_TRACK_ID,
        }),
      ],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(3);
      expect(acquireObjectUrlMock).toHaveBeenCalledWith('/main-next.mp4');
    });
    expect(acquireObjectUrlMock).not.toHaveBeenCalledWith('/main-later.mp4');
  });

  it('keeps the previous frame until the preloaded clip is ready at an adjacent boundary', async () => {
    testTimelineStore.setState({
      clips: [
        createClip({
          id: 'clip-before-boundary',
          sourceId: 'source-before-boundary',
          src: '/before-boundary.mp4',
        }),
        createClip({
          id: 'clip-after-boundary',
          sourceDurationUs: secondsToMicroseconds(7),
          sourceId: 'source-after-boundary',
          src: '/after-boundary.mp4',
          startUs: secondsToMicroseconds(5),
          trimEndUs: secondsToMicroseconds(7),
          trimStartUs: secondsToMicroseconds(2),
        }),
      ],
      currentTimeUs: secondsToMicroseconds(4.9),
      selectedClipId: 'clip-before-boundary',
      tracks: [mainTrack],
    });

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const nextVideo = await waitFor(() => {
      const element = Array.from(document.querySelectorAll('video')).find(
        (video) =>
          video.getAttribute('src') === 'blob:/after-boundary.mp4',
      );
      if (!element) throw new Error('相邻片段尚未完成预加载');
      expect(element.currentTime).toBe(2);
      return element;
    });
    await waitFor(() => {
      expect(drawImageMock).toHaveBeenCalled();
    });

    seekingMediaElements.add(nextVideo);
    drawImageMock.mockClear();
    fillRectMock.mockClear();

    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(5));
    });

    expect(fillRectMock).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();

    seekingMediaElements.delete(nextVideo);
    fireEvent.seeked(nextVideo);

    expect(drawImageMock).toHaveBeenCalledWith(
      nextVideo,
      0,
      0,
      1280,
      720,
    );
    expect(nextVideo.currentTime).toBe(2);
  });

  it('prepares retimed audio for an upcoming clip while keeping it muted', async () => {
    const prepareAudioSpy = vi
      .spyOn(PreviewAudioEngine.prototype, 'prepare')
      .mockResolvedValue(true);
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        createClip({
          durationUs: secondsToMicroseconds(10),
          id: 'clip-audio-next',
          name: 'slow-next.mp3',
          sourceId: 'audio-next-source',
          speed: 0.5,
          src: '/slow-next.mp3',
          startUs: secondsToMicroseconds(5),
          trackId: audioTrack.id,
          type: 'audio',
          volume: 0.6,
        }),
      ],
      tracks: [...state.tracks, audioTrack],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(prepareAudioSpy).toHaveBeenCalledWith(
        expect.any(HTMLAudioElement),
        {
          muted: true,
          speed: 0.5,
          volume: 0.6,
        },
      );
    });
    expect(document.querySelector('audio')).toHaveProperty('muted', true);
  });

  it('globally caps preloaded media to the four nearest clips', async () => {
    const futureTracks = Array.from({ length: 6 }, (_, index) => ({
      id: `future-track-${index}`,
      muted: false,
      name: `未来视频轨 ${index + 1}`,
      type: 'video' as const,
      zIndex: index + 2,
    }));
    const futureClips = futureTracks.map((track, index) =>
      createClip({
        id: `future-clip-${index}`,
        sourceId: `future-source-${index}`,
        src: `/future-${index}.mp4`,
        startUs: secondsToMicroseconds(2 + index * 0.5),
        trackId: track.id,
      }),
    );
    testTimelineStore.setState((state) => ({
      clips: [...state.clips, ...futureClips],
      tracks: [...state.tracks, ...futureTracks],
    }));

    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll('video')).toHaveLength(6);
    });
    for (let index = 0; index < 4; index += 1) {
      expect(acquireObjectUrlMock).toHaveBeenCalledWith(
        `/future-${index}.mp4`,
      );
    }
    expect(acquireObjectUrlMock).not.toHaveBeenCalledWith('/future-4.mp4');
    expect(acquireObjectUrlMock).not.toHaveBeenCalledWith('/future-5.mp4');
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

  it('shows the inspector only for a selected clip and allows it to be closed', () => {
    testTimelineStore.setState({ selectedClipId: null });
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    expect(
      screen.queryByRole('navigation', { name: '属性分类' }),
    ).not.toBeInTheDocument();

    act(() => testTimelineStore.getState().selectClip('clip-main'));

    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '关闭属性面板' }));

    expect(testTimelineStore.getState().selectedClipId).toBe('clip-main');
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(
      document.querySelector('.ec-floating-inspector__panel'),
    ).not.toBeVisible();

    act(() => testTimelineStore.getState().selectClip('clip-overlay'));

    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
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
      testTimelineStore.getState().setCurrentTimeUs(
        secondsToMicroseconds(1.5),
      );
    });

    expect(fillRectMock).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();
    expect(strokeRectMock).not.toHaveBeenCalled();

    mediaReadyState = 4;
    fireEvent.seeked(document.querySelector('video') as HTMLVideoElement);

    expect(fillRectMock).toHaveBeenCalled();
    expect(drawImageMock).toHaveBeenCalled();
  });

  it('keeps the previous video frame while scrubbing under an active text clip', async () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-scrub',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 1,
    };
    const textClip: TimelineTextClip = {
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip-scrub',
      italic: false,
      layoutSize: { height: 200, width: 1_000 },
      position: { x: 100, y: 300 },
      startUs: 0,
      text: '拖动时保持视频',
      trackId: textTrack.id,
      type: 'text',
      underline: false,
      zIndex: 0,
    };
    testTimelineStore.setState({
      clips: [
        createClip({
          id: 'clip-under-text',
          sourceId: 'source-under-text',
          src: '/under-text.mp4',
        }),
        textClip,
      ],
      selectedClipId: 'clip-under-text',
      tracks: [mainTrack, textTrack],
    });
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );

    const video = await waitFor(() => {
      const element = document.querySelector('video');
      if (!(element instanceof HTMLVideoElement)) {
        throw new Error('文字下方的视频预览元素尚未挂载');
      }
      expect(fillTextMock).toHaveBeenCalledWith(
        textClip.text,
        textClip.position.x,
        textClip.position.y + textClip.layoutSize.height / 2,
      );
      return element;
    });

    seekingMediaElements.add(video);
    drawImageMock.mockClear();
    fillRectMock.mockClear();
    fillTextMock.mockClear();

    act(() => {
      testTimelineStore
        .getState()
        .setCurrentTimeUs(secondsToMicroseconds(1.5));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fillRectMock).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();
    expect(fillTextMock).not.toHaveBeenCalled();

    seekingMediaElements.delete(video);
    fireEvent.seeked(video);

    expect(drawImageMock).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(fillTextMock).toHaveBeenCalledWith(
      textClip.text,
      textClip.position.x,
      textClip.position.y + textClip.layoutSize.height / 2,
    );
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

  it('clears the selected clip when pointer starts on empty composition content', () => {
    testTimelineStore.setState((state) => ({
      clips: state.clips.filter((clip) => clip.id === 'clip-overlay'),
    }));
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);
    const initialTransform = getMediaClipById('clip-overlay').transform;

    expect(
      screen.getByRole('navigation', { name: '属性分类' }),
    ).toBeVisible();

    fireEvent.pointerDown(canvas, { clientX: 810, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 810, clientY: 400, pointerId: 1 });

    expect(testTimelineStore.getState().selectedClipId).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: '属性分类' }),
    ).not.toBeInTheDocument();
    expect(canvas).toHaveStyle({ cursor: 'default' });
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    expect(testTimelineStore.getState().past).toHaveLength(0);
    expect(getMediaClipById('clip-overlay').transform).toEqual(initialTransform);
  });

  it('clears the selected clip when pointer starts on preview letterboxing', () => {
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 130, clientY: 120, pointerId: 1 });

    expect(testTimelineStore.getState().selectedClipId).toBeNull();
    expect(testTimelineStore.getState().past).toHaveLength(0);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
  });

  it('selects another visible clip instead of clearing the selection', () => {
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 810, clientY: 400, pointerId: 1 });

    expect(testTimelineStore.getState().selectedClipId).toBe('clip-main');
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
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

  it('shows a moved transform live and commits it once on pointer up', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 370, clientY: 170, pointerId: 1 });

    expect(screen.getByLabelText('X 位置')).toHaveValue(160);
    expect(screen.getByLabelText('Y 位置')).toHaveValue(110);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 100,
      y: 80,
    });
    expect(testTimelineStore.getState().past).toHaveLength(0);

    fireEvent.pointerUp(canvas, { clientX: 370, clientY: 170, pointerId: 1 });

    expect(screen.getByLabelText('X 位置')).toHaveValue(160);
    expect(screen.getByLabelText('Y 位置')).toHaveValue(110);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 160,
      y: 110,
    });
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('treats a selected text corner as move-only and preserves natural size', () => {
    const textTrack: TimelineTrack = {
      id: 'text-track-move-only',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 3,
    };
    const textClip: TimelineTextClip = {
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
          fontType: 'SY_Black',
          hidden: false,
      id: 'text-clip-move-only',
      italic: false,
      layoutSize: { height: 180, width: 320 },
      position: { x: 100, y: 80 },
      startUs: 0,
      text: '只能移动',
      trackId: textTrack.id,
      type: 'text',
      underline: false,
      zIndex: 0,
    };
    testTimelineStore.setState((state) => ({
      clips: [...state.clips, textClip],
      selectedClipId: textClip.id,
      tracks: [...state.tracks, textTrack],
    }));
    renderWithEditorProviders(
      <PreviewPanel previewRef={createRef<HTMLDivElement>()} />,
    );
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);
    drawCalls = [];

    fireEvent.pointerDown(canvas, {
      clientX: 590,
      clientY: 280,
      pointerId: 1,
    });
    expect(canvas).toHaveStyle({ cursor: 'move' });
    fireEvent.pointerMove(canvas, {
      clientX: 650,
      clientY: 310,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 650,
      clientY: 310,
      pointerId: 1,
    });

    const movedClip = testTimelineStore
      .getState()
      .clips.find(({ id }) => id === textClip.id);
    if (!movedClip || movedClip.type !== 'text') {
      throw new Error('Expected moved text clip');
    }
    expect(movedClip.position).toEqual({ x: 160, y: 110 });
    expect(movedClip.layoutSize).toEqual({ height: 180, width: 320 });
    expect(drawCalls.some((call) => call.kind === 'roundRect')).toBe(false);
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('restores inspector values without committing a cancelled move', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 370, clientY: 170, pointerId: 1 });

    expect(screen.getByLabelText('X 位置')).toHaveValue(160);
    expect(screen.getByLabelText('Y 位置')).toHaveValue(110);

    fireEvent.pointerCancel(canvas, { pointerId: 1 });

    expect(screen.getByLabelText('X 位置')).toHaveValue(100);
    expect(screen.getByLabelText('Y 位置')).toHaveValue(80);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 100,
      y: 80,
    });
    expect(testTimelineStore.getState().past).toHaveLength(0);
  });

  it('snaps a moved clip to the canvas center and draws a full-height guide', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 688, clientY: 140, pointerId: 1 });

    expect(drawCalls).toContainEqual({ args: [800.5, 0], kind: 'moveTo' });
    expect(drawCalls).toContainEqual({ args: [800.5, 720], kind: 'lineTo' });
    expect(strokeRectMock).toHaveBeenLastCalledWith(640, 80, 320, 180);

    drawCalls = [];
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 140, pointerId: 1 });
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);

    fireEvent.pointerMove(canvas, { clientX: 688, clientY: 140, pointerId: 1 });
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(true);

    drawCalls = [];
    fireEvent.pointerUp(canvas, { clientX: 688, clientY: 140, pointerId: 1 });

    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 480,
      y: 80,
    });

    fireEvent.pointerDown(canvas, { clientX: 650, clientY: 140, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 650, clientY: 140, pointerId: 2 });
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(true);

    drawCalls = [];
    fireEvent.pointerCancel(canvas, {
      clientX: 650,
      clientY: 140,
      pointerId: 2,
    });
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);
  });

  it('clears an active guide immediately when canvas snapping is disabled', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 688, clientY: 140, pointerId: 1 });
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(true);

    drawCalls = [];
    act(() => testTimelineStore.getState().toggleCanvasSnapping());
    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);

    fireEvent.pointerCancel(canvas, {
      clientX: 688,
      clientY: 140,
      pointerId: 1,
    });
  });

  it('snaps a moved clip to another active video clip', () => {
    testTimelineStore.setState((state) => ({
      clips: [
        ...state.clips,
        createClip({
          id: 'clip-target',
          src: '/target.mp4',
          trackId: targetTrack.id,
          transform: { height: 100, width: 100, x: 500, y: 350 },
        }),
      ],
      tracks: [...state.tracks, targetTrack],
    }));
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 388, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 388, clientY: 140, pointerId: 1 });

    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 180,
      y: 80,
    });
  });

  it('ignores the selected clip, inactive video clips and audio clips as targets', () => {
    testTimelineStore.setState((state) => ({
      clips: [
        state.clips.find((clip) => clip.id === 'clip-overlay')!,
        createClip({
          id: 'clip-inactive',
          src: '/inactive.mp4',
          startUs: secondsToMicroseconds(2),
          trackId: targetTrack.id,
          transform: { height: 100, width: 100, x: 100, y: 400 },
        }),
        createClip({
          id: 'clip-audio',
          src: '/audio.mp3',
          trackId: audioTrack.id,
          transform: { height: 100, width: 100, x: 100, y: 400 },
          type: 'audio',
        }),
      ],
      tracks: [overlayTrack, targetTrack, audioTrack],
    }));
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    drawCalls = [];
    fireEvent.pointerMove(canvas, { clientX: 314, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 314, clientY: 140, pointerId: 1 });

    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 104,
      y: 80,
    });
  });

  it('moves freely and does not draw guides when canvas snapping is disabled', () => {
    testTimelineStore.setState({ canvasSnappingEnabled: false });
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 310, clientY: 140, pointerId: 1 });
    drawCalls = [];
    fireEvent.pointerMove(canvas, { clientX: 688, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 688, clientY: 140, pointerId: 1 });

    expect(drawCalls.some((call) => call.kind === 'moveTo')).toBe(false);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 478,
      y: 80,
    });
  });

  it('shows a resized transform live and commits it from a corner handle', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 640, clientY: 320, pointerId: 1 });

    expect(screen.getByLabelText('宽度')).toHaveValue(370);
    expect(screen.getByLabelText('高度')).toHaveValue(220);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 180,
      width: 320,
      x: 100,
      y: 80,
    });

    fireEvent.pointerUp(canvas, { clientX: 640, clientY: 320, pointerId: 1 });

    expect(screen.getByLabelText('宽度')).toHaveValue(370);
    expect(screen.getByLabelText('高度')).toHaveValue(220);
    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 220,
      width: 370,
      x: 100,
      y: 80,
    });
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

    expect(getMediaClipById('clip-overlay').transform).toEqual({
      height: 211,
      width: 375,
      x: 100,
      y: 80,
    });
  });

  it('resizes continuously when opposing pointer axes cross the control threshold', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    fireEvent.pointerMove(canvas, {
      clientX: 670,
      clientY: 235,
      pointerId: 1,
      shiftKey: true,
    });
    expect(strokeRectMock).toHaveBeenLastCalledWith(260, 80, 362, 203);

    fireEvent.pointerMove(canvas, {
      clientX: 670,
      clientY: 234,
      pointerId: 1,
      shiftKey: true,
    });
    expect(strokeRectMock).toHaveBeenLastCalledWith(260, 80, 361, 203);
  });

  it('stays at the minimum aspect-ratio size after crossing the fixed corner', () => {
    renderWithEditorProviders(<PreviewPanel previewRef={createRef<HTMLDivElement>()} />);
    triggerPreviewResize(1600, 720);
    const canvas = screen.getByLabelText('视频预览') as HTMLCanvasElement;
    mockWidePreviewRect(canvas);

    fireEvent.pointerDown(canvas, { clientX: 590, clientY: 280, pointerId: 1 });
    fireEvent.pointerMove(canvas, {
      clientX: 270,
      clientY: 100,
      pointerId: 1,
      shiftKey: true,
    });
    expect(strokeRectMock).toHaveBeenLastCalledWith(260, 80, 71, 40);

    fireEvent.pointerMove(canvas, {
      clientX: 170,
      clientY: 50,
      pointerId: 1,
      shiftKey: true,
    });
    expect(strokeRectMock).toHaveBeenLastCalledWith(260, 80, 71, 40);
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
