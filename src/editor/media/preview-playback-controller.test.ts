import { describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import type { TimelineTimedMediaClip, TimelineTrack } from '../types';
import { PreviewPlaybackController } from './preview-playback-controller';

const videoTrack: TimelineTrack = {
  id: 'video-track',
  muted: false,
  name: '视频轨',
  type: 'video',
  zIndex: 0,
};

const overlayTrack: TimelineTrack = {
  id: 'overlay-track',
  muted: false,
  name: '叠加轨',
  type: 'video',
  zIndex: 1,
};

const createClip = (
  patch: Partial<TimelineTimedMediaClip> = {},
): TimelineTimedMediaClip => ({
  durationUs: secondsToMicroseconds(10),
  id: 'base-clip',
  name: 'base.mp4',
  sourceDurationUs: secondsToMicroseconds(10),
  sourceId: 'base-source',
  speed: 1,
  src: '/base.mp4',
  startUs: 0,
  trackId: videoTrack.id,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  trimEndUs: secondsToMicroseconds(10),
  trimStartUs: 0,
  type: 'video',
  volume: 1,
  zIndex: 0,
  ...patch,
  hidden: patch.hidden ?? false,
});

const createMedia = () => {
  const media = document.createElement('video');
  const pause = vi.spyOn(media, 'pause').mockImplementation(() => undefined);
  const play = vi
    .spyOn(media, 'play')
    .mockImplementation(() => Promise.resolve());
  return { media, pause, play };
};

const createAudioEngine = () => ({
  configure: vi.fn(),
  resume: vi.fn(() => Promise.resolve(true)),
});

describe('PreviewPlaybackController', () => {
  it('leaves continuing media untouched across unrelated clip boundaries', async () => {
    const controller = new PreviewPlaybackController();
    const audioEngine = createAudioEngine();
    const baseClip = createClip();
    const overlayClip = createClip({
      durationUs: secondsToMicroseconds(1),
      id: 'overlay-clip',
      name: 'overlay.mp4',
      sourceDurationUs: secondsToMicroseconds(1),
      sourceId: 'overlay-source',
      src: '/overlay.mp4',
      startUs: secondsToMicroseconds(4),
      trackId: overlayTrack.id,
      trimEndUs: secondsToMicroseconds(1),
      zIndex: 1,
    });
    const base = createMedia();
    const overlay = createMedia();
    const mediaElements = new Map([
      [baseClip.id, base.media],
      [overlayClip.id, overlay.media],
    ]);
    const objectUrls = {
      [baseClip.src]: 'blob:base',
      [overlayClip.src]: 'blob:overlay',
    };
    const tracksById = new Map([
      [videoTrack.id, videoTrack],
      [overlayTrack.id, overlayTrack],
    ]);

    const initial = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: secondsToMicroseconds(3.9),
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    await initial.startPromise;
    expect(base.play).toHaveBeenCalledOnce();

    base.media.currentTime = 3.95;
    const unrelatedBoundary = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: secondsToMicroseconds(4),
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    expect(unrelatedBoundary).toMatchObject({
      didSynchronize: false,
      startPromise: null,
    });
    expect(base.media.currentTime).toBe(3.95);
    expect(base.pause).not.toHaveBeenCalled();
    expect(base.play).toHaveBeenCalledOnce();
    expect(audioEngine.configure).toHaveBeenCalledTimes(1);

    const overlayStart = controller.update({
      activeClips: [baseClip, overlayClip],
      audioEngine,
      currentTimeUs: secondsToMicroseconds(4),
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    await overlayStart.startPromise;
    expect(base.media.currentTime).toBe(3.95);
    expect(base.pause).not.toHaveBeenCalled();
    expect(base.play).toHaveBeenCalledOnce();
    expect(overlay.play).toHaveBeenCalledOnce();

    base.media.currentTime = 4.95;
    const overlayEnd = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: secondsToMicroseconds(5),
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    expect(overlayEnd.startPromise).toBeNull();
    expect(base.media.currentTime).toBe(4.95);
    expect(base.pause).not.toHaveBeenCalled();
    expect(base.play).toHaveBeenCalledOnce();
    expect(overlay.pause).toHaveBeenCalledOnce();
  });

  it('seeks timing changes without replaying the active element', async () => {
    const controller = new PreviewPlaybackController();
    const audioEngine = createAudioEngine();
    const media = createMedia();
    const baseClip = createClip();
    const mediaElements = new Map([[baseClip.id, media.media]]);
    const objectUrls = { [baseClip.src]: 'blob:base' };
    const tracksById = new Map([[videoTrack.id, videoTrack]]);

    const initial = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: 0,
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    await initial.startPromise;

    const retrimmedClip = createClip({
      durationUs: secondsToMicroseconds(9),
      trimStartUs: secondsToMicroseconds(1),
    });
    const timingChange = controller.update({
      activeClips: [retrimmedClip],
      audioEngine,
      currentTimeUs: 0,
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });

    expect(timingChange.didSynchronize).toBe(true);
    expect(timingChange.startPromise).toBeNull();
    expect(media.media.currentTime).toBe(1);
    expect(media.pause).not.toHaveBeenCalled();
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('stops every mounted element when playback pauses', async () => {
    const controller = new PreviewPlaybackController();
    const audioEngine = createAudioEngine();
    const baseClip = createClip();
    const base = createMedia();
    const inactive = createMedia();
    const mediaElements = new Map([
      [baseClip.id, base.media],
      ['inactive-clip', inactive.media],
    ]);
    const objectUrls = { [baseClip.src]: 'blob:base' };
    const tracksById = new Map([[videoTrack.id, videoTrack]]);

    const playing = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: 0,
      isPlaying: true,
      mediaElements,
      objectUrls,
      tracksById,
    });
    await playing.startPromise;

    const paused = controller.update({
      activeClips: [baseClip],
      audioEngine,
      currentTimeUs: 0,
      isPlaying: false,
      mediaElements,
      objectUrls,
      tracksById,
    });

    expect(paused).toEqual({
      didSynchronize: false,
      startPromise: null,
    });
    expect(base.pause).toHaveBeenCalledOnce();
    expect(inactive.pause).toHaveBeenCalledOnce();
  });
});
