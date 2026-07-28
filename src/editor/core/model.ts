export type TimelineMediaType = 'video' | 'audio';
export type TimelineClipTrimEdge = 'start' | 'end';
export type TimelineClipSpeed = number;
export type TimelineClipVolume = number;

export type TimelineTrack = {
  id: string;
  muted: boolean;
  name: string;
  type: TimelineMediaType;
  zIndex: number;
};

export type TimelineClipTransform = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type TimelineClip = {
  durationUs: number;
  id: string;
  name: string;
  sourceDurationUs: number;
  sourceId: string;
  speed: TimelineClipSpeed;
  src: string;
  startUs: number;
  trackId: string;
  transform: TimelineClipTransform;
  trimEndUs: number;
  trimStartUs: number;
  type: TimelineMediaType;
  volume: TimelineClipVolume;
  waveformSrc?: string;
  zIndex: number;
};

export type TimelineCanvasSize = {
  height: number;
  width: number;
};

export type TimelineProject = {
  canvasSize: TimelineCanvasSize;
  clips: TimelineClip[];
  schemaVersion: 7;
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

export type CompositionExportClip = {
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

export type CompositionExportPayload = {
  Canvas: CompositionExportCanvas;
  Track: CompositionExportClip[][];
};

export type TimelineClipType = TimelineMediaType;
export type VideoTimelineDraft = TimelineProject;
