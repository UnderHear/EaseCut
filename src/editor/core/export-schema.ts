import type {
  CompositionExportPayload,
  TimelineCanvasSize,
  TimelineClip,
  TimelineTrack,
} from './model';
import { getTimelineClipTransform } from './model';
import {
  createCompositionSnapshot,
  getCompositionTrackClips,
  type CompositionSnapshotInput,
} from './composition';
import { microsecondsToMilliseconds } from './time';

const createPayload = (
  snapshot: ReturnType<typeof createCompositionSnapshot>,
) => ({
  Canvas: {
    Height: Math.round(snapshot.canvasSize.height),
    Width: Math.round(snapshot.canvasSize.width),
  },
  Track: snapshot.tracks.map((track) =>
    getCompositionTrackClips(snapshot, track.id)
      .map((clip) => {
        const clipTransform = getTimelineClipTransform(clip);
        const targetTime = [
          microsecondsToMilliseconds(clip.startUs),
          microsecondsToMilliseconds(clip.startUs + clip.durationUs),
        ] as [number, number];
        const transform = {
          Height: Math.round(clipTransform.height),
          PosX: Math.round(clipTransform.x),
          PosY: Math.round(clipTransform.y),
          Type: 'transform' as const,
          Width: Math.round(clipTransform.width),
        };
        if (clip.type === 'text') {
          return {
            Extra: [transform] as [typeof transform],
            FontColor: clip.fontColor.toUpperCase(),
            FontSize: clip.fontSize,
            FontType: clip.fontType,
            TargetTime: targetTime,
            Text: clip.text,
            Type: 'text' as const,
          };
        }
        const trim = {
          EndTime: microsecondsToMilliseconds(clip.trimEndUs),
          StartTime: microsecondsToMilliseconds(clip.trimStartUs),
          Type: 'trim' as const,
        };
        const volume = {
          Type: 'a_volume' as const,
          Volume: track.muted ? 0 : clip.volume,
        };
        const speed = {
          Speed: clip.speed,
          Type: 'speed' as const,
        };

        return {
          Extra:
            clip.type === 'audio'
              ? [volume, trim, speed]
              : [
                  trim,
                  speed,
                  transform,
                  volume,
                ],
          Source: clip.src,
          TargetTime: targetTime,
          Type: clip.type,
        };
      }),
  ),
}) satisfies CompositionExportPayload;

const isTrackArray = (
  value: CompositionSnapshotInput | readonly TimelineTrack[],
): value is readonly TimelineTrack[] => Array.isArray(value);

export function createCompositionExportPayload(
  snapshot: CompositionSnapshotInput,
): CompositionExportPayload;
export function createCompositionExportPayload(
  tracks: readonly TimelineTrack[],
  clips: readonly TimelineClip[],
  canvasSize: TimelineCanvasSize,
): CompositionExportPayload;
export function createCompositionExportPayload(
  snapshotOrTracks: CompositionSnapshotInput | readonly TimelineTrack[],
  clips?: readonly TimelineClip[],
  canvasSize?: TimelineCanvasSize,
): CompositionExportPayload {
  if (!isTrackArray(snapshotOrTracks)) {
    return createPayload(createCompositionSnapshot(snapshotOrTracks));
  }

  if (!clips || !canvasSize) {
    throw new TypeError('tracks、clips 和 canvasSize 必须同时提供');
  }

  return createPayload(
    createCompositionSnapshot({
      canvasSize,
      clips,
      tracks: snapshotOrTracks,
    }),
  );
}
