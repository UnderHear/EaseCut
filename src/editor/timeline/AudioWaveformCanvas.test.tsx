import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import { AudioWaveformCanvas } from './AudioWaveformCanvas';

const createRect = (width: number, height: number): DOMRect => ({
  bottom: height,
  height,
  left: 0,
  right: width,
  toJSON: () => ({}),
  top: 0,
  width,
  x: 0,
  y: 0,
});

describe('AudioWaveformCanvas', () => {
  const clearRect = vi.fn();
  const fillRect = vi.fn();
  const setTransform = vi.fn();
  const context = {
    clearRect,
    fillRect,
    fillStyle: '',
    setTransform,
  };
  let scheduledFrame: FrameRequestCallback | null = null;
  const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
    scheduledFrame = callback;
    return 1;
  });

  beforeEach(() => {
    clearRect.mockReset();
    fillRect.mockReset();
    setTransform.mockReset();
    requestAnimationFrameMock.mockReset();
    scheduledFrame = null;
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect',
    ).mockImplementation(function getCanvasBounds(this: HTMLCanvasElement) {
      return createRect(Number.parseFloat(this.style.width), 36);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) =>
        contextId === '2d'
          ? (context as unknown as CanvasRenderingContext2D)
          : null) as HTMLCanvasElement['getContext'],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('synchronizes the backing bitmap before the layout effect completes', () => {
    const { container, rerender } = render(
      <AudioWaveformCanvas
        left={0}
        pixelsPerSecond={80}
        samples={[0.2, 0.8, 0.4]}
        sourceDurationUs={secondsToMicroseconds(40)}
        sourceStartUs={0}
        tileIndex={0}
        volume={1}
        width={1_024}
      />,
    );
    const canvas = container.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('waveform canvas was not rendered');

    expect(canvas.width).toBe(2_048);
    expect(canvas.height).toBe(72);
    expect(clearRect).toHaveBeenLastCalledWith(0, 0, 1_024, 36);
    expect(fillRect).toHaveBeenCalled();
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();

    clearRect.mockClear();
    rerender(
      <AudioWaveformCanvas
        left={1_024}
        pixelsPerSecond={80}
        samples={[0.2, 0.8, 0.4]}
        sourceDurationUs={secondsToMicroseconds(40)}
        sourceStartUs={secondsToMicroseconds(12.8)}
        tileIndex={1}
        volume={1}
        width={512}
      />,
    );

    expect(canvas.width).toBe(1_024);
    expect(canvas.height).toBe(72);
    expect(clearRect).toHaveBeenLastCalledWith(0, 0, 512, 36);
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('coalesces content-only waveform updates into one animation frame', () => {
    const samples = [0.2, 0.8, 0.4];
    const renderWaveform = (volume: number) => (
      <AudioWaveformCanvas
        left={0}
        pixelsPerSecond={80}
        samples={samples}
        sourceDurationUs={secondsToMicroseconds(40)}
        sourceStartUs={0}
        tileIndex={0}
        volume={volume}
        width={1_024}
      />
    );
    const { rerender } = render(renderWaveform(1));
    clearRect.mockClear();
    fillRect.mockClear();

    rerender(renderWaveform(0.5));
    rerender(renderWaveform(0));

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(clearRect).not.toHaveBeenCalled();
    const frame = scheduledFrame;
    if (!frame) throw new Error('waveform redraw was not scheduled');

    act(() => frame(16));

    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(fillRect).not.toHaveBeenCalled();
  });
});
