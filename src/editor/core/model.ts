export type TimelineMediaType = 'video' | 'audio';
export type TimelineClipType = TimelineMediaType | 'text';
export type TimelineClipTrimEdge = 'start' | 'end';
export type TimelineClipSpeed = number;
export type TimelineClipVolume = number;

export type TimelineTrack = {
  id: string;
  muted: boolean;
  name: string;
  type: TimelineClipType;
  zIndex: number;
};

export type TimelineClipTransform = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type TimelineClipPosition = {
  x: number;
  y: number;
};

export type TimelineTextLayoutSize = {
  height: number;
  width: number;
};

type TimelineClipBase = {
  durationUs: number;
  id: string;
  startUs: number;
  trackId: string;
  zIndex: number;
};

type TimelineMediaClipFields = TimelineClipBase & {
  name: string;
  sourceDurationUs: number;
  sourceId: string;
  speed: TimelineClipSpeed;
  src: string;
  trimEndUs: number;
  trimStartUs: number;
  transform: TimelineClipTransform;
  volume: TimelineClipVolume;
  waveformSrc?: string;
};

export type TimelineVideoClip = TimelineMediaClipFields & {
  type: 'video';
};

export type TimelineAudioClip = TimelineMediaClipFields & {
  type: 'audio';
};

export type TimelineMediaClip = TimelineVideoClip | TimelineAudioClip;

export type TimelineTextClip = TimelineClipBase & {
  fontColor: string;
  fontSize: number;
  fontType: TimelineTextFontType;
  layoutSize: TimelineTextLayoutSize;
  position: TimelineClipPosition;
  text: string;
  type: 'text';
};

export type TimelineClip = TimelineMediaClip | TimelineTextClip;

export const isTimelineMediaClip = (
  clip: TimelineClip,
): clip is TimelineMediaClip => clip.type !== 'text';

export const isTimelineTextClip = (
  clip: TimelineClip,
): clip is TimelineTextClip => clip.type === 'text';

export const getTimelineClipTransform = (
  clip: TimelineClip,
): TimelineClipTransform =>
  isTimelineTextClip(clip)
    ? {
        height: clip.layoutSize.height,
        width: clip.layoutSize.width,
        x: clip.position.x,
        y: clip.position.y,
      }
    : clip.transform;

export const getTimelineClipLabel = (clip: TimelineClip) =>
  clip.type === 'text' ? clip.text : clip.name;

export type TimelineCanvasSize = {
  height: number;
  width: number;
};

export type TimelineProject = {
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  schemaVersion: 9;
  /** Bottom-to-top layer order. Track zIndex equals its array index. */
  tracks: TimelineTrack[];
};

export type TimelineSnapshot = {
  clips: TimelineClip[];
  selectedClipId: string | null;
  tracks: TimelineTrack[];
};

export type TimelineClipTimingPreview = {
  clipId: string;
  durationUs: number;
  startUs: number;
};

export type CompositionExportCanvas = {
  Height: number;
  Width: number;
};

export type CompositionExportTrim = {
  EndTime: number;
  StartTime: number;
  Type: 'trim';
};

export type CompositionExportSpeed = {
  Speed: TimelineClipSpeed;
  Type: 'speed';
};

export type CompositionExportTransform = {
  Height: number;
  PosX: number;
  PosY: number;
  Type: 'transform';
  Width: number;
};

export type CompositionExportVolume = {
  Type: 'a_volume';
  Volume: TimelineClipVolume;
};

export type CompositionExportMediaClip = {
  Extra: Array<
    | CompositionExportSpeed
    | CompositionExportTransform
    | CompositionExportTrim
    | CompositionExportVolume
  >;
  Source: string;
  TargetTime: [number, number];
  Type: TimelineMediaType;
};

export type CompositionExportTextClip = {
  Extra: [CompositionExportTransform];
  FontColor: string;
  FontSize: number;
  FontType: TimelineTextFontType;
  TargetTime: [number, number];
  Text: string;
  Type: 'text';
};

export type CompositionExportClip =
  | CompositionExportMediaClip
  | CompositionExportTextClip;

export type CompositionExportPayload = {
  Canvas: CompositionExportCanvas;
  /** Bottom-to-top layer order. Track[0] is the lowest layer. */
  Track: CompositionExportClip[][];
};

export type VideoTimelineDraft = TimelineProject;
import type { TimelineTextFontType } from './text-fonts';
