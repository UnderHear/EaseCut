import type { CSSProperties } from 'react';

export type VideoTimelineMediaType = 'video' | 'audio';
export type VideoTimelineClipTrimEdge = 'start' | 'end';
export type VideoTimelineTrackVolume = number;

export type VideoTimelineTrack = {
  id: string;
  type: VideoTimelineMediaType;
  name: string;
  volume: VideoTimelineTrackVolume;
  zIndex: number;
};

export type VideoTimelineTrackDraft = Omit<VideoTimelineTrack, 'volume'> & {
  volume?: VideoTimelineTrackVolume;
};

export type VideoTimelineClipTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoTimelineClip = {
  id: string;
  type: VideoTimelineMediaType;
  sourceId: string;
  src: string;
  waveformSrc?: string;
  name: string;
  trackId: string;
  start: number;
  duration: number;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  transform: VideoTimelineClipTransform;
  zIndex: number;
};

export type VideoTimelineClipDraft = Omit<
  VideoTimelineClip,
  'sourceId' | 'transform'
> & {
  sourceId?: string;
  transform?: VideoTimelineClipTransform;
};

export type VideoTimelineCanvasSize = {
  height: number;
  width: number;
};

export type VideoTimelineSource = {
  durationSeconds?: number;
  fileName: string;
  height?: number;
  id: string;
  src: string;
  type: VideoTimelineMediaType;
  waveformSrc?: string;
  width?: number;
};

export type VideoTimelineDraft = {
  canvasSize: VideoTimelineCanvasSize;
  clips: VideoTimelineClipDraft[];
  schemaVersion: 1 | 2 | 3 | 4;
  tracks: VideoTimelineTrackDraft[];
};

export type VideoTimelineMediaMetadata = {
  durationSeconds?: number;
  height?: number;
  width?: number;
};

export interface VideoTimelineMediaLoader {
  loadBlob(
    url: string,
    options: {
      signal: AbortSignal;
      source?: VideoTimelineSource;
    },
  ): Promise<Blob>;
  loadMetadata?(
    source: VideoTimelineSource,
    options: { signal: AbortSignal },
  ): Promise<VideoTimelineMediaMetadata | null>;
}

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
  Volume: VideoTimelineTrackVolume;
};

export type CompositionExportClip = {
  Extra: Array<
    CompositionExportTrim | CompositionExportTransform | CompositionExportVolume
  >;
  Source: string;
  TargetTime: [number, number];
  Type: VideoTimelineMediaType;
};

export type CompositionExportPayload = {
  Canvas: CompositionExportCanvas;
  Track: CompositionExportClip[][];
};

export type VideoTimelineExportRequest = {
  draft: VideoTimelineDraft;
  payload: CompositionExportPayload;
};

export type VideoTimelineImportRequest = {
  type: VideoTimelineMediaType;
  url: string;
};

export type VideoTimelineEditorProps = {
  sources: VideoTimelineSource[];
  initialDraft?: VideoTimelineDraft;
  title?: string;
  className?: string;
  style?: CSSProperties;
  jsonFileName?: string;
  mediaLoader?: VideoTimelineMediaLoader;
  onDraftChange?: (draft: VideoTimelineDraft) => void;
  onExport?: (request: VideoTimelineExportRequest) => void | Promise<void>;
  onImportMedia?: (
    request: VideoTimelineImportRequest,
  ) => void | Promise<void>;
  onClose?: () => void;
};

/** Internal aliases retained to keep the timeline implementation concise. */
export type TimelineClipType = VideoTimelineMediaType;
export type TimelineClipTrimEdge = VideoTimelineClipTrimEdge;
export type TimelineTrackVolume = VideoTimelineTrackVolume;
export type TimelineTrack = VideoTimelineTrack;
export type TimelineTrackDraft = VideoTimelineTrackDraft;
export type TimelineClipTransform = VideoTimelineClipTransform;
export type TimelineClip = VideoTimelineClip;
export type TimelineClipDraft = VideoTimelineClipDraft;
export type TimelineCanvasSize = VideoTimelineCanvasSize;
export type TimelineClipTimingPreview = {
  clipId: string;
  duration: number;
  start: number;
};
export type TimelineSnapshot = {
  clips: TimelineClip[];
  selectedClipId: string | null;
  tracks: TimelineTrack[];
};
