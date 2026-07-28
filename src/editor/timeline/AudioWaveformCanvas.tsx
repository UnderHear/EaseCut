import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  getAudioWaveformBars,
  getAudioWaveformBitmapSize,
} from '../core/audio-waveform-bars';

type AudioWaveformCanvasProps = {
  left: number;
  pixelsPerSecond: number;
  samples: readonly number[];
  sourceDurationUs: number;
  sourceStartUs: number;
  tileIndex: number;
  volume: number;
  width: number;
};

const DEFAULT_WAVEFORM_BAR_COLOR = '#f5ebff';

type AudioWaveformRenderInput = Readonly<{
  pixelsPerSecond: number;
  samples: readonly number[];
  sourceDurationUs: number;
  sourceStartUs: number;
  volume: number;
}>;

type AudioWaveformDrawState = AudioWaveformRenderInput &
  Readonly<{
    height: number;
    pixelRatio: number;
    width: number;
  }>;

export function AudioWaveformCanvas({
  left,
  pixelsPerSecond,
  samples,
  sourceDurationUs,
  sourceStartUs,
  tileIndex,
  volume,
  width,
}: AudioWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef(0);
  const renderInputRef = useRef<AudioWaveformRenderInput>({
    pixelsPerSecond,
    samples,
    sourceDurationUs,
    sourceStartUs,
    volume,
  });
  const lastDrawStateRef = useRef<AudioWaveformDrawState | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const renderInput = renderInputRef.current;
    const bitmapSize = getAudioWaveformBitmapSize(
      bounds.width,
      bounds.height,
      window.devicePixelRatio,
    );
    const nextDrawState: AudioWaveformDrawState = {
      ...renderInput,
      height: bounds.height,
      pixelRatio: bitmapSize.pixelRatio,
      width: bounds.width,
    };
    const previousDrawState = lastDrawStateRef.current;
    if (
      previousDrawState &&
      previousDrawState.height === nextDrawState.height &&
      previousDrawState.pixelRatio === nextDrawState.pixelRatio &&
      previousDrawState.pixelsPerSecond ===
        nextDrawState.pixelsPerSecond &&
      previousDrawState.samples === nextDrawState.samples &&
      previousDrawState.sourceDurationUs ===
        nextDrawState.sourceDurationUs &&
      previousDrawState.sourceStartUs === nextDrawState.sourceStartUs &&
      previousDrawState.volume === nextDrawState.volume &&
      previousDrawState.width === nextDrawState.width
    ) {
      return;
    }

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

    for (const bar of getAudioWaveformBars(renderInput.samples, {
      height: bounds.height,
      pixelsPerSecond: renderInput.pixelsPerSecond,
      sourceDurationUs: renderInput.sourceDurationUs,
      sourceStartUs: renderInput.sourceStartUs,
      volume: renderInput.volume,
      width: bounds.width,
    })) {
      if (bar.height > 0) {
        context.fillRect(bar.x, bar.y, bar.width, bar.height);
      }
    }
    lastDrawStateRef.current = nextDrawState;
  }, []);

  useLayoutEffect(() => {
    renderInputRef.current = {
      pixelsPerSecond,
      samples,
      sourceDurationUs,
      sourceStartUs,
      volume,
    };
  }, [
    pixelsPerSecond,
    samples,
    sourceDurationUs,
    sourceStartUs,
    volume,
  ]);

  useLayoutEffect(() => {
    if (animationFrameRef.current !== 0) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    draw();
  }, [draw, pixelsPerSecond, sourceDurationUs, sourceStartUs, width]);

  useLayoutEffect(() => {
    const previousDrawState = lastDrawStateRef.current;
    if (
      previousDrawState?.samples === samples &&
      previousDrawState.volume === volume
    ) {
      return;
    }
    if (animationFrameRef.current !== 0) return;

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = 0;
      draw();
    });
  }, [draw, samples, volume]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(draw);
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener('resize', draw);
    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', draw);
      if (animationFrameRef.current !== 0) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
    };
  }, [draw]);

  return (
    <canvas
      aria-hidden='true'
      className='oc-timeline-clip__waveform-canvas'
      data-waveform-tile-index={tileIndex}
      ref={canvasRef}
      style={{ left, width }}
    />
  );
}
