import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimelineClip } from '../types';
import { useAudioWaveformSamples, useFramePreviewUrls } from '../media';
import { ClipNode } from './ClipNode';

let konvaPointerPosition: { x: number; y: number } | null = null;

vi.mock('../media', () => ({
  useAudioWaveformSamples: vi.fn(),
  useFramePreviewUrls: vi.fn(),
}));

vi.mock('react-konva', async () => {
  const React = await import('react');

  type MockKonvaProps = {
    children?: ReactNode;
    image?: unknown;
    text?: ReactNode;
  } & Record<string, unknown>;

  const getImageSrc = (image: unknown) => {
    if (typeof image !== 'object' || image === null || !('src' in image)) {
      return undefined;
    }

    return String((image as { src?: string }).src ?? '');
  };

  const createKonvaEvent = () => ({
    cancelBubble: false,
    target: {
      getStage: () => ({
        container: () => ({
          dataset: {} as Record<string, string>,
          style: { cursor: 'default' },
        }),
        getPointerPosition: () => konvaPointerPosition,
      }),
      position: vi.fn(),
    },
  });

  const createKonvaNode =
    (name: string) =>
    ({ children, image, text, ...props }: MockKonvaProps) => {
      const createDragHandler =
        (handlerName: 'onDragEnd' | 'onDragMove' | 'onDragStart') => () => {
          const handler = props[handlerName];
          if (typeof handler === 'function') {
            handler(createKonvaEvent());
          }
        };

      return React.createElement(
        'div',
        {
          'data-clip-height': props.clipHeight,
          'data-clip-width': props.clipWidth,
          'data-fill': props.fill,
          'data-height': props.height,
          'data-has-clip-func': typeof props.clipFunc === 'function',
          'data-image-src': getImageSrc(image),
          'data-name': props.name,
          'data-shadow-blur': props.shadowBlur,
          'data-stroke': props.stroke,
          'data-stroke-width': props.strokeWidth,
          'data-testid': `konva-${name}`,
          'data-width': props.width,
          'data-x': props.x,
          'data-y': props.y,
          draggable: Boolean(props.draggable),
          onDrag: createDragHandler('onDragMove'),
          onDragEnd: createDragHandler('onDragEnd'),
          onDragStart: createDragHandler('onDragStart'),
          onMouseDown: () => {
            const handler = props.onMouseDown;
            if (typeof handler === 'function') handler(createKonvaEvent());
          },
          onMouseEnter: () => {
            const handler = props.onMouseEnter;
            if (typeof handler === 'function') handler(createKonvaEvent());
          },
          onMouseLeave: () => {
            const handler = props.onMouseLeave;
            if (typeof handler === 'function') handler(createKonvaEvent());
          },
        },
        text ?? children,
      );
    };

  return {
    Group: createKonvaNode('group'),
    Image: createKonvaNode('image'),
    Line: createKonvaNode('line'),
    Rect: createKonvaNode('rect'),
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

const createClip = (
  thumbnailUrls = ['frame-a', 'frame-b', 'frame-c'],
  patch: Partial<TimelineClip> = {},
): TimelineClip => ({
  duration: 12,
  id: 'clip-1',
  name: 'clip.mp4',
  sourceId: 'source-1',
  sourceDuration: 12,
  src: '/clip.mp4',
  start: 0,
  thumbnailUrls,
  trackId: 'video-main',
  trimEnd: 12,
  trimStart: 0,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'video',
  zIndex: 0,
  ...patch,
});

describe('ClipNode', () => {
  beforeEach(() => {
    konvaPointerPosition = null;
    vi.mocked(useFramePreviewUrls).mockReset();
    vi.mocked(useFramePreviewUrls).mockReturnValue([]);
    vi.mocked(useAudioWaveformSamples).mockReset();
    vi.mocked(useAudioWaveformSamples).mockReturnValue([]);
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders timeline preview images once across the visible clip width', async () => {

    render(
      <ClipNode
        clip={createClip()}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={960}
        x={0}
        y={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('konva-image')).toHaveLength(3);
    });

    const images = screen.getAllByTestId('konva-image');
    expect(images.map((image) => image.getAttribute('data-image-src'))).toEqual(
      ['frame-a', 'frame-b', 'frame-c'],
    );
    expect(images.map((image) => image.getAttribute('data-x'))).toEqual([
      '1',
      '321',
      '641',
    ]);
    expect(images.map((image) => image.getAttribute('data-width'))).toEqual([
      '318',
      '318',
      '318',
    ]);
  });

  it('keeps timeline preview image width stable while the clip is trimmed', async () => {

    const { container } = render(
      <ClipNode
        clip={createClip(['frame-a', 'frame-b', 'frame-c'], {
          duration: 6,
          sourceDuration: 12,
          trimEnd: 9,
          trimStart: 3,
        })}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={480}
        x={0}
        y={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('konva-image')).toHaveLength(3);
    });

    const clipGroup = container.querySelector('[data-name="clip"]');
    const visualGroup = container.querySelector('[data-name="clip-visual"]');
    const contentGroup = container.querySelector('[data-name="clip-content"]');
    const previewStrip = container.querySelector(
      '[data-name="clip-preview-strip"]',
    );
    const images = screen.getAllByTestId('konva-image');

    expect(clipGroup?.getAttribute('data-clip-width')).toBeNull();
    expect(clipGroup?.getAttribute('data-clip-height')).toBeNull();
    expect(visualGroup?.getAttribute('data-width')).toBe('480');
    expect(visualGroup?.getAttribute('data-height')).toBe('58');
    expect(contentGroup?.getAttribute('data-has-clip-func')).toBe('true');
    expect(previewStrip?.getAttribute('data-x')).toBe('-240');
    expect(images.map((image) => image.getAttribute('data-x'))).toEqual([
      '1',
      '321',
      '641',
    ]);
    expect(images.map((image) => image.getAttribute('data-width'))).toEqual([
      '318',
      '318',
      '318',
    ]);
  });

  it('requests generated previews from the visible clip width without the old six-frame cap', async () => {
    const generatedUrls = Array.from(
      { length: 10 },
      (_, index) => `generated-frame-${index + 1}`,
    );
    vi.mocked(useFramePreviewUrls).mockReturnValue(generatedUrls);

    render(
      <ClipNode
        clip={createClip([])}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={960}
        x={0}
        y={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('konva-image')).toHaveLength(10);
    });

    expect(useFramePreviewUrls).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'clip-1' }),
      10,
      true,
    );
    expect(
      screen
        .getAllByTestId('konva-image')
        .map((image) => image.getAttribute('data-image-src')),
    ).toEqual(generatedUrls);
  });

  it('requests generated previews from the source width and full source range while trimmed', async () => {
    const generatedUrls = Array.from(
      { length: 10 },
      (_, index) => `generated-frame-${index + 1}`,
    );
    vi.mocked(useFramePreviewUrls).mockReturnValue(generatedUrls);

    render(
      <ClipNode
        clip={createClip([], {
          duration: 6,
          sourceDuration: 12,
          trimEnd: 9,
          trimStart: 3,
        })}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={480}
        x={0}
        y={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('konva-image')).toHaveLength(10);
    });

    expect(useFramePreviewUrls).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 12,
        id: 'clip-1',
        sourceDuration: 12,
        trimEnd: 12,
        trimStart: 0,
      }),
      10,
      true,
    );
  });

  it('renders a real audio waveform without requesting video frames', () => {
    vi.mocked(useAudioWaveformSamples).mockReturnValue([0, 0.5, 1, 0.25]);

    const { container } = render(
      <ClipNode
        clip={createClip([], {
          name: 'music.mp3',
          src: '/music.mp3',
          type: 'audio',
          waveformSrc: '/music.mp3?download=1',
        })}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={320}
        x={0}
        y={0}
      />,
    );

    expect(useAudioWaveformSamples).toHaveBeenCalledWith(
      '/music.mp3?download=1',
      true,
    );
    expect(
      container.querySelector('[data-name="clip-waveform"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-name="clip-waveform-shape"]'),
    ).toHaveAttribute('data-fill', '#2499e8');
    expect(
      container.querySelector('[data-name="clip-volume-control"]'),
    ).toHaveAttribute('data-y', '10');
    expect(
      container.querySelector('[data-name="clip-volume-line"]'),
    ).toHaveAttribute('data-stroke', 'rgb(255 255 255 / 30%)');
    expect(
      container.querySelector('[data-name="clip-preview-strip"]'),
    ).toBeNull();
  });

  it('allocates enough label width for Chinese audio names', () => {
    const { container } = render(
      <ClipNode
        clip={createClip([], {
          name: '音频节点 2',
          src: '/music.mp3',
          type: 'audio',
        })}
        dragBoundFunc={(position) => position}
        height={42}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={240}
        x={0}
        y={0}
      />,
    );

    expect(
      container.querySelector('[data-name="clip-audio-label-background"]'),
    ).toHaveAttribute('data-width', '80');
    expect(
      container.querySelector('[data-name="clip-audio-label"]'),
    ).toHaveAttribute('data-width', '70');
  });

  it('highlights and vertically drags the audio volume line', () => {
    const onTrackVolumeChange = vi.fn();
    const onTrackVolumeCommit = vi.fn();
    const onCursorChange = vi.fn();
    const { container } = render(
      <ClipNode
        clip={createClip([], {
          name: 'music.mp3',
          src: '/music.mp3',
          type: 'audio',
        })}
        dragBoundFunc={(position) => position}
        height={64}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={onCursorChange}
        onSelect={vi.fn()}
        onTrackVolumeChange={onTrackVolumeChange}
        onTrackVolumeCommit={onTrackVolumeCommit}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        trackVolume={0.5}
        width={320}
        x={12}
        y={33}
      />,
    );

    const control = container.querySelector(
      '[data-name="clip-volume-control"]',
    ) as Element;
    const line = () =>
      container.querySelector('[data-name="clip-volume-line"]');
    expect(control).toHaveAttribute('data-y', '33');

    fireEvent.mouseEnter(control);
    expect(line()).toHaveAttribute('data-stroke', '#5ebcff');
    expect(line()).toHaveAttribute('data-stroke-width', '2');
    expect(onCursorChange).toHaveBeenLastCalledWith('volume', 'ns-resize');

    konvaPointerPosition = { x: 120, y: 89 };
    fireEvent.dragStart(control);
    fireEvent.drag(control);
    fireEvent.dragEnd(control);

    expect(onTrackVolumeChange).toHaveBeenLastCalledWith(0);
    expect(onTrackVolumeCommit).toHaveBeenCalledWith(0.5, 0);
  });

  it('keeps partial generated previews in their timeline slots while frames are still loading', async () => {
    const generatedUrls = new Array<string | null>(10).fill(null);
    generatedUrls[0] = 'generated-frame-start';
    generatedUrls[5] = 'generated-frame-middle';
    generatedUrls[9] = 'generated-frame-end';
    vi.mocked(useFramePreviewUrls).mockReturnValue(generatedUrls);

    render(
      <ClipNode
        clip={createClip([])}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={960}
        x={0}
        y={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('konva-image')).toHaveLength(3);
    });

    const images = screen.getAllByTestId('konva-image');
    expect(images.map((image) => image.getAttribute('data-image-src'))).toEqual(
      [
        'generated-frame-start',
        'generated-frame-middle',
        'generated-frame-end',
      ],
    );
    expect(images.map((image) => image.getAttribute('data-x'))).toEqual([
      '1',
      '481',
      '865',
    ]);
    expect(images.map((image) => image.getAttribute('data-width'))).toEqual([
      '94',
      '94',
      '94',
    ]);
  });

  it('renders trim handles only while selected', () => {
    const { container, rerender } = render(
      <ClipNode
        clip={createClip()}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected={false}
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={240}
        x={0}
        y={0}
      />,
    );

    expect(
      container.querySelectorAll('[data-name^="clip-trim-"]'),
    ).toHaveLength(0);

    rerender(
      <ClipNode
        clip={createClip()}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={240}
        x={0}
        y={0}
      />,
    );

    const trimHandles = container.querySelectorAll('[data-name^="clip-trim-"]');
    expect(trimHandles).toHaveLength(2);
    expect(
      container
        .querySelector('[data-name="clip-trim-start"]')
        ?.getAttribute('data-x'),
    ).toBe('-6');
    expect(
      container
        .querySelector('[data-name="clip-trim-end"]')
        ?.getAttribute('data-x'),
    ).toBe('234');
  });

  it('marks trim handles that can restore clipped source', () => {
    const { container, rerender } = render(
      <ClipNode
        clip={createClip(undefined, {
          duration: 9,
          trimEnd: 12,
          trimStart: 3,
        })}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={240}
        x={0}
        y={0}
      />,
    );

    const startMarker = container.querySelector(
      '[data-name="clip-trim-restore-marker-start"]',
    );
    expect(startMarker).not.toBeNull();
    expect(startMarker).toHaveAttribute('data-fill', '#ef4444');
    expect(startMarker).toHaveAttribute('data-height', '10');
    expect(startMarker).toHaveAttribute('data-width', '2');
    expect(
      container.querySelector('[data-name="clip-trim-restore-marker-end"]'),
    ).toBeNull();

    rerender(
      <ClipNode
        clip={createClip(undefined, {
          duration: 9,
          trimEnd: 9,
          trimStart: 0,
        })}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={vi.fn()}
        onTrimDragMove={vi.fn()}
        onTrimDragStart={vi.fn()}
        width={240}
        x={0}
        y={0}
      />,
    );

    expect(
      container.querySelector('[data-name="clip-trim-restore-marker-start"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-name="clip-trim-restore-marker-end"]'),
    ).not.toBeNull();
  });

  it('sends trim handle drag events with propagation cancelled', () => {
    const onTrimDragEnd = vi.fn();
    const onTrimDragMove = vi.fn();
    const onTrimDragStart = vi.fn();
    const { container } = render(
      <ClipNode
        clip={createClip()}
        dragBoundFunc={(position) => position}
        height={58}
        isDragging={false}
        isSelected
        onDragEnd={vi.fn()}
        onDragMove={vi.fn()}
        onDragStart={vi.fn()}
        onCursorChange={vi.fn()}
        onSelect={vi.fn()}
        onTrimDragEnd={onTrimDragEnd}
        onTrimDragMove={onTrimDragMove}
        onTrimDragStart={onTrimDragStart}
        width={240}
        x={0}
        y={0}
      />,
    );

    const startHandle = container.querySelector(
      '[data-name="clip-trim-start"]',
    );
    expect(startHandle).not.toBeNull();

    fireEvent.dragStart(startHandle as Element);
    fireEvent.drag(startHandle as Element);
    fireEvent.dragEnd(startHandle as Element);

    expect(onTrimDragStart).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({ cancelBubble: true }),
    );
    expect(onTrimDragMove).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({ cancelBubble: true }),
    );
    expect(onTrimDragEnd).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({ cancelBubble: true }),
    );
  });
});


