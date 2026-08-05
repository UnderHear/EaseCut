import { describe, expect, it } from 'vitest';

import type { TimelineClip } from './model';
import {
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  getOriginalCanvasSize,
  resizeClipsForCanvas,
} from './canvas-size';

describe('canvas size', () => {
  it('uses the first video with dimensions as the original canvas', () => {
    expect(
      getOriginalCanvasSize([
        { height: 1600, type: 'image', width: 1200 },
        { type: 'video' },
        { height: 1920, type: 'video', width: 1080 },
        { height: 1080, type: 'video', width: 1920 },
      ]),
    ).toEqual({ height: 1920, width: 1080 });
  });

  it('falls back to the default landscape canvas without a sized video', () => {
    expect(
      getOriginalCanvasSize([
        { height: 1600, type: 'image', width: 1200 },
        { type: 'audio' },
      ]),
    ).toEqual(DEFAULT_COMPOSITION_CANVAS_SIZE);
  });

  it('fits visual content within the next canvas and leaves audio unchanged', () => {
    const videoClip: TimelineClip = {
      durationUs: 5_000_000,
      hidden: false,
      id: 'video-clip',
      name: 'video.mp4',
      sourceDurationUs: 5_000_000,
      sourceId: 'video-source',
      speed: 1,
      src: '/video.mp4',
      startUs: 0,
      trackId: 'video-track',
      transform: { height: 1080, width: 1920, x: 0, y: 0 },
      trimEndUs: 5_000_000,
      trimStartUs: 0,
      type: 'video',
      volume: 1,
      zIndex: 0,
    };
    const audioClip: TimelineClip = {
      ...videoClip,
      id: 'audio-clip',
      name: 'audio.mp3',
      sourceId: 'audio-source',
      src: '/audio.mp3',
      trackId: 'audio-track',
      transform: { height: 0, width: 0, x: 0, y: 0 },
      type: 'audio',
    };
    const textClip: TimelineClip = {
      bold: false,
      durationUs: 5_000_000,
      fontColor: '#FFFFFFFF',
      fontSize: 120,
      fontType: 'SY_Black',
      hidden: false,
      id: 'text-clip',
      italic: false,
      layoutSize: { height: 120, width: 600 },
      position: { x: 660, y: 480 },
      startUs: 0,
      text: '标题',
      trackId: 'text-track',
      type: 'text',
      underline: false,
      zIndex: 0,
    };

    const resized = resizeClipsForCanvas(
      [videoClip, audioClip, textClip],
      { height: 1080, width: 1920 },
      { height: 1080, width: 1920 },
      { height: 1280, width: 720 },
    );

    expect(resized[0]).toEqual(
      expect.objectContaining({
        transform: { height: 405, width: 720, x: 0, y: 437.5 },
      }),
    );
    expect(resized[1]).toBe(audioClip);
    expect(resized[2]).toEqual(
      expect.objectContaining({
        fontSize: 45,
        layoutSize: { height: 45, width: 225 },
        position: { x: 247.5, y: 617.5 },
      }),
    );
  });

  it('keeps text layout values valid when the canvas scale is fractional', () => {
    const clip: TimelineClip = {
      bold: false,
      durationUs: 5_000_000,
      fontColor: '#FFFFFFFF',
      fontSize: 101,
      fontType: 'SY_Black',
      hidden: false,
      id: 'text-clip',
      italic: false,
      layoutSize: { height: 101, width: 501 },
      position: { x: 390, y: 310 },
      startUs: 0,
      text: '标题',
      trackId: 'text-track',
      type: 'text',
      underline: false,
      zIndex: 0,
    };

    const [resized] = resizeClipsForCanvas(
      [clip],
      { height: 720, width: 1280 },
      { height: 720, width: 1280 },
      { height: 1280, width: 720 },
    );

    expect(resized).toEqual(
      expect.objectContaining({
        fontSize: 57,
        layoutSize: { height: 57, width: 282 },
      }),
    );
  });

  it('keeps minimum-sized visual content proportional and reversible', () => {
    const clip: TimelineClip = {
      durationUs: 5_000_000,
      hidden: false,
      id: 'small-overlay',
      name: 'overlay.png',
      sourceId: 'overlay-source',
      src: '/overlay.png',
      startUs: 0,
      trackId: 'video-track',
      transform: { height: 40, width: 40, x: 940, y: 520 },
      type: 'image',
      zIndex: 0,
    };
    const originalCanvas = { height: 1080, width: 1920 };
    const smallerCanvas = { height: 720, width: 1280 };

    const resized = resizeClipsForCanvas(
      [clip],
      originalCanvas,
      originalCanvas,
      smallerCanvas,
    );
    const resizedClip = resized[0];
    expect(resizedClip?.type).toBe('image');
    if (!resizedClip || resizedClip.type !== 'image') return;
    expect(resizedClip.transform.height).toBeCloseTo(80 / 3);
    expect(resizedClip.transform.width).toBeCloseTo(80 / 3);

    const restored = resizeClipsForCanvas(
      resized,
      originalCanvas,
      smallerCanvas,
      originalCanvas,
    )[0];
    expect(restored?.type).toBe('image');
    if (!restored || restored.type !== 'image') return;
    expect(restored.transform).toEqual(clip.transform);
  });

  it('does not compound scaling across repeated aspect-ratio changes', () => {
    const clip: TimelineClip = {
      durationUs: 5_000_000,
      hidden: false,
      id: 'video-clip',
      name: 'video.mp4',
      sourceDurationUs: 5_000_000,
      sourceId: 'video-source',
      speed: 1,
      src: '/video.mp4',
      startUs: 0,
      trackId: 'video-track',
      transform: { height: 720, width: 1280, x: 0, y: 0 },
      trimEndUs: 5_000_000,
      trimStartUs: 0,
      type: 'video',
      volume: 1,
      zIndex: 0,
    };
    const landscapeCanvas = { height: 720, width: 1280 };
    const portraitCanvas = { height: 1280, width: 720 };

    const portrait = resizeClipsForCanvas(
      [clip],
      landscapeCanvas,
      landscapeCanvas,
      portraitCanvas,
    );
    const restored = resizeClipsForCanvas(
      portrait,
      landscapeCanvas,
      portraitCanvas,
      landscapeCanvas,
    );
    const portraitAgain = resizeClipsForCanvas(
      restored,
      landscapeCanvas,
      landscapeCanvas,
      portraitCanvas,
    );

    expect(restored[0]).toEqual(clip);
    expect(portraitAgain).toEqual(portrait);
  });
});
