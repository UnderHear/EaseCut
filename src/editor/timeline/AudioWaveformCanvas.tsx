import { useLayoutEffect, useRef } from 'react';

import {
  getAudioWaveformBars,
  getAudioWaveformBitmapSize,
} from '../core/audio-waveform-bars';

type AudioWaveformCanvasProps = {
  left: number;
  pixelsPerSecond: number;
  renderWidth: number;
  samples: readonly number[];
  sourceDurationUs: number;
  sourceStartUs: number;
  volume: number;
};

const DEFAULT_WAVEFORM_BAR_COLOR = '#f5ebff';

export function AudioWaveformCanvas({
  left,
  pixelsPerSecond,
  renderWidth,
  samples,
  sourceDurationUs,
  sourceStartUs,
  volume,
}: AudioWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let animationFrame = 0;
    const draw = () => {
      animationFrame = 0;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;

      const bitmapSize = getAudioWaveformBitmapSize(
        bounds.width,
        bounds.height,
        window.devicePixelRatio,
      );
      if (canvas.width !== bitmapSize.width) canvas.width = bitmapSize.width;
      if (canvas.height !== bitmapSize.height) canvas.height = bitmapSize.height;

      const context = canvas.getContext('2d');
      if (!context) return;

      context.setTransform(
        bitmapSize.pixelRatio,
        0,
        0,
        bitmapSize.pixelRatio,
        0,
        0,
      );
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle =
        getComputedStyle(canvas)
          .getPropertyValue('--oc-timeline-waveform-bar')
          .trim() || DEFAULT_WAVEFORM_BAR_COLOR;

      for (const bar of getAudioWaveformBars(
        samples,
        {
          height: bounds.height,
          pixelsPerSecond,
          sourceDurationUs,
          sourceStartUs,
          volume,
          width: bounds.width,
        },
      )) {
        if (bar.height > 0) {
          context.fillRect(bar.x, bar.y, bar.width, bar.height);
        }
      }
    };
    const scheduleDraw = () => {
      if (animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(draw);
    };

    scheduleDraw();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleDraw);
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener('resize', scheduleDraw);
    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', scheduleDraw);
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
    };
  }, [
    pixelsPerSecond,
    renderWidth,
    samples,
    sourceDurationUs,
    sourceStartUs,
    volume,
  ]);

  return (
    <canvas
      aria-hidden='true'
      className='oc-timeline-clip__waveform-canvas'
      ref={canvasRef}
      style={{ left, width: renderWidth }}
    />
  );
}
