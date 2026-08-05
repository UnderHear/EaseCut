export type TimelineMediaType = 'video' | 'audio' | 'image';
export type TimelineTimedMediaType = Exclude<TimelineMediaType, 'image'>;
export type TimelineClipType = TimelineMediaType | 'text';
export type TimelineTrackType = TimelineTimedMediaType | 'text';
export type TimelineClipTrimEdge = 'start' | 'end';
export type TimelineClipSpeed = number;
export type TimelineClipVolume = number;

export type TimelineTrack = {
  id: string;
  muted: boolean;
  name: string;
  type: TimelineTrackType;
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
  hidden: boolean;
  id: string;
  startUs: number;
  trackId: string;
  zIndex: number;
};

type TimelineSourceClipFields = TimelineClipBase & {
  name: string;
  sourceId: string;
  src: string;
};

type TimelineTimedMediaClipFields = TimelineSourceClipFields & {
  sourceDurationUs: number;
  speed: TimelineClipSpeed;
  trimEndUs: number;
  trimStartUs: number;
  transform: TimelineClipTransform;
  volume: TimelineClipVolume;
  waveformSrc?: string;
};

export type TimelineVideoClip = TimelineTimedMediaClipFields & {
  type: 'video';
};

export type TimelineAudioClip = TimelineTimedMediaClipFields & {
  type: 'audio';
};

export type TimelineImageClip = TimelineSourceClipFields & {
  transform: TimelineClipTransform;
  type: 'image';
};

export type TimelineTimedMediaClip = TimelineVideoClip | TimelineAudioClip;
export type TimelineVisualMediaClip = TimelineVideoClip | TimelineImageClip;
export type TimelineMediaClip = TimelineTimedMediaClip | TimelineImageClip;

export type TimelineTextClip = TimelineClipBase & {
  bold: boolean;
  fontColor: string;
  fontSize: number;
  fontType: TimelineTextFontType;
  italic: boolean;
  layoutSize: TimelineTextLayoutSize;
  position: TimelineClipPosition;
  text: string;
  type: 'text';
  underline: boolean;
};

export type TimelineClip = TimelineMediaClip | TimelineTextClip;

export const isTimelineMediaClip = (
  clip: TimelineClip,
): clip is TimelineMediaClip => clip.type !== 'text';

export const isTimelineTimedMediaClip = (
  clip: TimelineClip,
): clip is TimelineTimedMediaClip =>
  clip.type === 'video' || clip.type === 'audio';

export const isTimelineVisualMediaClip = (
  clip: TimelineClip,
): clip is TimelineVisualMediaClip =>
  clip.type === 'video' || clip.type === 'image';

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

export const getTimelineTrackTypeForClipType = (
  type: TimelineClipType,
): TimelineTrackType => (type === 'image' ? 'video' : type);

export type TimelineCanvasSize = {
  height: number;
  width: number;
};

export type TimelineCanvasPreset =
  | '16:9'
  | '4:3'
  | '2:1'
  | '9:16'
  | '1:1'
  | '3:4';

export type TimelineCanvasSelection = 'original' | TimelineCanvasPreset;

export type TimelineProject = {
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  schemaVersion: 12;
  /** Bottom-to-top layer order. Track zIndex equals its array index. */
  tracks: TimelineTrack[];
};

export type TimelineSnapshot = {
  canvasSelection: TimelineCanvasSelection | null;
  canvasSize: TimelineCanvasSize;
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

export type CompositionExportTimedMediaClip = {
  Extra: Array<
    | CompositionExportSpeed
    | CompositionExportTransform
    | CompositionExportTrim
    | CompositionExportVolume
  >;
  Source: string;
  TargetTime: [number, number];
  Type: TimelineTimedMediaType;
};

export type CompositionExportImageClip = {
  Extra: [CompositionExportTransform];
  Source: string;
  TargetTime: [number, number];
  Type: 'image';
};

export type CompositionExportMediaClip =
  | CompositionExportTimedMediaClip
  | CompositionExportImageClip;

export type CompositionExportTextClip = {
  Bold?: boolean;
  Extra: [CompositionExportTransform];
  FontColor: string;
  FontSize: number;
  FontType: TimelineTextFontType;
  Italic?: boolean;
  TargetTime: [number, number];
  Text: string;
  Type: 'text';
  Underline?: boolean;
};

export type CompositionExportClip =
  | CompositionExportMediaClip
  | CompositionExportTextClip;

export type CompositionExportPayload = {
  Canvas: CompositionExportCanvas;
  /** Composition duration in milliseconds, including hidden tail clips. */
  Duration: number;
  /** Bottom-to-top layer order. Track[0] is the lowest layer. */
  Track: CompositionExportClip[][];
};

export type VideoTimelineDraft = TimelineProject;
import type { TimelineTextFontType } from './text-fonts';
