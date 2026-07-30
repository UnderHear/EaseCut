import { timelineTimeToClipSourceTimeUs } from '../core/clip-speed';
import { microsecondsToSeconds } from '../core/time';
import type { TimelineMediaClip, TimelineTrack } from '../types';
import type {
  PreviewAudioConfiguration,
  PreviewAudioEngine,
} from './preview-audio-engine';

const MEDIA_SEEK_TOLERANCE_SECONDS = 0.001;
const PLAYBACK_START_SYNC_TOLERANCE_SECONDS = 0.05;

type PreviewPlaybackAudioEngine = Pick<
  PreviewAudioEngine,
  'configure' | 'resume'
>;

type PreviewPlaybackSession = {
  activeElements: Map<string, HTMLMediaElement>;
  audioConfigurationKeys: Map<string, string>;
  isPlaying: boolean;
  timingKeys: Map<string, string>;
};

export type PreviewPlaybackUpdate = {
  activeClips: readonly TimelineMediaClip[];
  audioEngine: PreviewPlaybackAudioEngine | null;
  currentTimeUs: number;
  isPlaying: boolean;
  mediaElements: ReadonlyMap<string, HTMLMediaElement>;
  objectUrls: Readonly<Record<string, string>>;
  tracksById: ReadonlyMap<string, TimelineTrack>;
};

export type PreviewPlaybackUpdateResult = {
  didSynchronize: boolean;
  startPromise: Promise<void> | null;
};

export const getPreviewAudioConfiguration = (
  clip: TimelineMediaClip,
  tracksById: ReadonlyMap<string, TimelineTrack>,
  forceMuted = false,
): PreviewAudioConfiguration => ({
  muted:
    forceMuted ||
    Boolean(tracksById.get(clip.trackId)?.muted) ||
    clip.volume === 0,
  speed: clip.speed,
  volume: clip.volume,
});

export const getPreviewMediaTimingKey = (clip: TimelineMediaClip) =>
  [
    clip.durationUs,
    clip.speed,
    clip.startUs,
    clip.trimEndUs,
    clip.trimStartUs,
  ].join(':');

export const seekPreviewMediaToTimelineTime = (
  media: HTMLMediaElement,
  clip: TimelineMediaClip,
  timelineTimeUs: number,
  timelineToleranceSeconds = MEDIA_SEEK_TOLERANCE_SECONDS,
) => {
  const targetTime = microsecondsToSeconds(
    timelineTimeToClipSourceTimeUs(clip, timelineTimeUs),
  );
  const sourceToleranceSeconds = timelineToleranceSeconds * clip.speed;
  if (Math.abs(media.currentTime - targetTime) <= sourceToleranceSeconds) {
    return false;
  }

  media.currentTime = targetTime;
  return true;
};

const getAudioConfigurationKey = (
  configuration: PreviewAudioConfiguration,
) =>
  [
    configuration.muted ? 1 : 0,
    configuration.speed,
    configuration.volume,
  ].join(':');

const createEmptySession = (): PreviewPlaybackSession => ({
  activeElements: new Map(),
  audioConfigurationKeys: new Map(),
  isPlaying: false,
  timingKeys: new Map(),
});

export class PreviewPlaybackController {
  private session = createEmptySession();

  release(clipId: string, element: HTMLMediaElement) {
    if (this.session.activeElements.get(clipId) !== element) return;

    this.session.activeElements.delete(clipId);
    this.session.audioConfigurationKeys.delete(clipId);
    this.session.timingKeys.delete(clipId);
  }

  update({
    activeClips,
    audioEngine,
    currentTimeUs,
    isPlaying,
    mediaElements,
    objectUrls,
    tracksById,
  }: PreviewPlaybackUpdate): PreviewPlaybackUpdateResult {
    if (!isPlaying) {
      for (const media of mediaElements.values()) {
        media.pause();
      }
      this.session = createEmptySession();
      return {
        didSynchronize: false,
        startPromise: null,
      };
    }

    const activeElements = new Map<string, HTMLMediaElement>();
    const audioConfigurationKeys = new Map<string, string>();
    const clipsById = new Map<string, TimelineMediaClip>();
    const configurationsById = new Map<
      string,
      PreviewAudioConfiguration
    >();
    const timingKeys = new Map<string, string>();

    for (const clip of activeClips) {
      const media = mediaElements.get(clip.id);
      if (!media || !objectUrls[clip.src]) continue;

      const configuration = getPreviewAudioConfiguration(
        clip,
        tracksById,
      );
      activeElements.set(clip.id, media);
      audioConfigurationKeys.set(
        clip.id,
        getAudioConfigurationKey(configuration),
      );
      clipsById.set(clip.id, clip);
      configurationsById.set(clip.id, configuration);
      timingKeys.set(clip.id, getPreviewMediaTimingKey(clip));
    }

    const previousSession = this.session;
    if (previousSession.isPlaying) {
      for (const [clipId, previousMedia] of previousSession.activeElements) {
        if (activeElements.get(clipId) !== previousMedia) {
          previousMedia.pause();
        }
      }
    }

    const mediaToStart: HTMLMediaElement[] = [];
    let didSynchronize = false;

    for (const [clipId, media] of activeElements) {
      const clip = clipsById.get(clipId);
      const configuration = configurationsById.get(clipId);
      if (!clip || !configuration) continue;

      const previousElement = previousSession.isPlaying
        ? previousSession.activeElements.get(clipId)
        : undefined;
      const isNewlyActive = previousElement !== media;
      const timingChanged =
        previousSession.timingKeys.get(clipId) !== timingKeys.get(clipId);
      const audioConfigurationChanged =
        previousSession.audioConfigurationKeys.get(clipId) !==
        audioConfigurationKeys.get(clipId);

      if (isNewlyActive || audioConfigurationChanged) {
        audioEngine?.configure(media, configuration);
      }
      if (isNewlyActive || timingChanged) {
        seekPreviewMediaToTimelineTime(
          media,
          clip,
          currentTimeUs,
          PLAYBACK_START_SYNC_TOLERANCE_SECONDS,
        );
        didSynchronize = true;
      }
      if (isNewlyActive) mediaToStart.push(media);
    }

    this.session = {
      activeElements,
      audioConfigurationKeys,
      isPlaying: true,
      timingKeys,
    };

    if (mediaToStart.length === 0) {
      return {
        didSynchronize,
        startPromise: null,
      };
    }

    const startPromises: Promise<unknown>[] = [];
    if (audioEngine) startPromises.push(audioEngine.resume());
    for (const media of mediaToStart) {
      try {
        startPromises.push(media.play());
      } catch (error: unknown) {
        startPromises.push(Promise.reject(error));
      }
    }

    return {
      didSynchronize,
      startPromise: Promise.all(startPromises).then(() => undefined),
    };
  }
}
