export type TimelineMediaType = 'video' | 'audio';
export type TimelineClipTrimEdge = 'start' | 'end';
export type TimelineTrackVolume = number;

export type TimelineTrack = {
  id: string;
  name: string;
  type: TimelineMediaType;
  volume: TimelineTrackVolume;
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
  src: string;
  startUs: number;
  trackId: string;
  transform: TimelineClipTransform;
  trimEndUs: number;
  trimStartUs: number;
  type: TimelineMediaType;
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
  schemaVersion: 5;
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

export type CompositionExportTransform = {
  Height: number;
  PosX: number;
  PosY: number;
  Type: 'transform';
  Width: number;
};

export type CompositionExportVolume = {
  Type: 'a_volume';
  Volume: TimelineTrackVolume;
};

export type CompositionExportClip = {
  Extra: Array<
    CompositionExportTrim | CompositionExportTransform | CompositionExportVolume
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
