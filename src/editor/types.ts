import type { CSSProperties } from 'react';

import type {
  CompositionExportPayload,
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipTransform,
  TimelineMediaType,
  TimelineProject,
  TimelineTrack,
  TimelineClipVolume,
} from './core/model';

export type {
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipTimingPreview,
  TimelineClipTransform,
  TimelineMediaType,
  TimelineProject,
  TimelineSnapshot,
  TimelineTrack,
  TimelineClipVolume,
} from './core/model';

export type VideoTimelineMediaType = TimelineMediaType;
export type VideoTimelineClipTrimEdge = 'start' | 'end';
export type VideoTimelineClipVolume = TimelineClipVolume;
export type VideoTimelineTrack = TimelineTrack;
export type VideoTimelineTrackDraft = TimelineTrack;
export type VideoTimelineClipTransform = TimelineClipTransform;
export type VideoTimelineClip = TimelineClip;
export type VideoTimelineClipDraft = TimelineClip;
export type VideoTimelineCanvasSize = TimelineCanvasSize;

export type VideoTimelineSource = {
  durationUs?: number;
  fileName: string;
  height?: number;
  id: string;
  src: string;
  type: VideoTimelineMediaType;
  waveformSrc?: string;
  width?: number;
};

export type VideoTimelineDraft = TimelineProject;

export type VideoTimelineMediaMetadata = {
  durationUs?: number;
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

export type {
  CompositionExportCanvas,
  CompositionExportClip,
  CompositionExportPayload,
  CompositionExportTransform,
  CompositionExportTrim,
  CompositionExportVolume,
} from './core/model';

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
export type TimelineTrackDraft = VideoTimelineTrackDraft;
export type TimelineClipDraft = VideoTimelineClipDraft;
