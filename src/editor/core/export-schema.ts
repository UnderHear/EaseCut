import type {
  CompositionExportPayload,
  TimelineCanvasSize,
  TimelineClip,
  TimelineTrack,
  VideoTimelineClipDraft,
  VideoTimelineDraft,
  VideoTimelineTrackDraft,
} from '../types';

const secondsToMilliseconds = (time: number) => Math.round(time * 1000);

type ExportSource = {
  tracks: VideoTimelineTrackDraft[];
  clips: VideoTimelineClipDraft[];
  canvasSize: TimelineCanvasSize;
};

const createPayload = ({ tracks, clips, canvasSize }: ExportSource) => ({
  Canvas: {
    Height: Math.round(canvasSize.height),
    Width: Math.round(canvasSize.width),
  },
  Track: [
    ...tracks.filter((track) => track.type === 'video'),
    ...tracks.filter((track) => track.type === 'audio'),
  ].map((track) =>
    [...clips]
      .filter((clip) => clip.trackId === track.id)
      .sort(
        (left, right) =>
          left.start - right.start || left.zIndex - right.zIndex,
      )
      .map((clip) => {
        const trim = {
          EndTime: secondsToMilliseconds(clip.trimEnd),
          StartTime: secondsToMilliseconds(clip.trimStart),
          Type: 'trim' as const,
        };
        const volume = {
          Type: 'a_volume' as const,
          Volume: track.volume ?? 1,
        };
        const transform = clip.transform ?? {
          height: canvasSize.height,
          width: canvasSize.width,
          x: 0,
          y: 0,
        };

        return {
          Extra:
            clip.type === 'audio'
              ? [volume, trim]
              : [
                  trim,
                  {
                    Height: Math.round(transform.height),
                    PosX: Math.round(transform.x),
                    PosY: Math.round(transform.y),
                    Type: 'transform' as const,
                    Width: Math.round(transform.width),
                  },
                  volume,
                ],
          Source: clip.src,
          TargetTime: [
            secondsToMilliseconds(clip.start),
            secondsToMilliseconds(clip.start + clip.duration),
          ] as [number, number],
          Type: clip.type,
        };
      }),
  ),
}) satisfies CompositionExportPayload;

export function createCompositionExportPayload(
  draft: VideoTimelineDraft,
): CompositionExportPayload;
export function createCompositionExportPayload(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  canvasSize: TimelineCanvasSize,
): CompositionExportPayload;
export function createCompositionExportPayload(
  draftOrTracks: VideoTimelineDraft | TimelineTrack[],
  clips?: TimelineClip[],
  canvasSize?: TimelineCanvasSize,
): CompositionExportPayload {
  if (!Array.isArray(draftOrTracks)) {
    return createPayload(draftOrTracks);
  }

  if (!clips || !canvasSize) {
    throw new TypeError('tracks、clips 和 canvasSize 必须同时提供');
  }

  return createPayload({ tracks: draftOrTracks, clips, canvasSize });
}
