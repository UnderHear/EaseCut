import type { CSSProperties } from 'react';

import type {
  CompositionExportPayload,
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipSpeed,
  TimelineClipTransform,
  TimelineMediaType,
  TimelineProject,
  TimelineTrack,
  TimelineClipVolume,
} from './core/model';

export type {
  TimelineCanvasSize,
  TimelineClip,
  TimelineClipType,
  TimelineMediaClip,
  TimelineTimedMediaType,
  TimelineAudioClip,
  TimelineImageClip,
  TimelineTimedMediaClip,
  TimelineVideoClip,
  TimelineVisualMediaClip,
  TimelineClipPosition,
  TimelineClipSpeed,
  TimelineClipTimingPreview,
  TimelineClipTransform,
  TimelineMediaType,
  TimelineProject,
  TimelineTextClip,
  TimelineTextLayoutSize,
  TimelineSnapshot,
  TimelineTrack,
  TimelineTrackType,
  TimelineClipVolume,
} from './core/model';

export type VideoTimelineMediaType = TimelineMediaType;
export type {
  TimelineTextFontPreset,
  TimelineTextFontType,
} from './core/text-fonts';
export type VideoTimelineClipTrimEdge = 'start' | 'end';
export type VideoTimelineClipSpeed = TimelineClipSpeed;
export type VideoTimelineClipVolume = TimelineClipVolume;
export type VideoTimelineTrack = TimelineTrack;
export type VideoTimelineTrackDraft = TimelineTrack;
export type VideoTimelineClipTransform = TimelineClipTransform;
export type VideoTimelineClip = TimelineClip;
export type VideoTimelineClipDraft = TimelineClip;
export type VideoTimelineCanvasSize = TimelineCanvasSize;

type VideoTimelineSourceBase = {
  fileName: string;
  id: string;
  src: string;
};

type VideoTimelineTimedMediaSource = VideoTimelineSourceBase & {
  durationUs?: number;
  height?: number;
  type: Exclude<VideoTimelineMediaType, 'image'>;
  waveformSrc?: string;
  width?: number;
};

type VideoTimelineImageSource = VideoTimelineSourceBase & {
  durationUs?: number;
  height?: number;
  type: 'image';
  width?: number;
};

export type VideoTimelineSource =
  | VideoTimelineTimedMediaSource
  | VideoTimelineImageSource;

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
  CompositionExportImageClip,
  CompositionExportMediaClip,
  CompositionExportPayload,
  CompositionExportSpeed,
  CompositionExportTransform,
  CompositionExportTrim,
  CompositionExportTextClip,
  CompositionExportTimedMediaClip,
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
export type TimelineClipTrimEdge = VideoTimelineClipTrimEdge;
export type TimelineTrackDraft = VideoTimelineTrackDraft;
export type TimelineClipDraft = VideoTimelineClipDraft;
