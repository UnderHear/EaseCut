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
  TimelineSource,
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

export type VideoTimelineSource = TimelineSource;

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

export type VideoTimelineEditorProps = {
  initialDraft?: VideoTimelineDraft;
  title?: string;
  className?: string;
  style?: CSSProperties;
  jsonFileName?: string;
  mediaLoader?: VideoTimelineMediaLoader;
  onSourcesChange?: (sources: VideoTimelineSource[]) => void;
  onDraftChange?: (draft: VideoTimelineDraft) => void;
  onExport?: (request: VideoTimelineExportRequest) => void | Promise<void>;
  onClose?: () => void;
};

/** Internal aliases retained to keep the timeline implementation concise. */
export type TimelineClipTrimEdge = VideoTimelineClipTrimEdge;
export type TimelineTrackDraft = VideoTimelineTrackDraft;
export type TimelineClipDraft = VideoTimelineClipDraft;
