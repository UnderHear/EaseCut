export { VideoTimelineEditor } from './editor/VideoTimelineEditor';
export {
  frameIndexToTimeUs,
  microsecondsToMilliseconds,
  microsecondsToSeconds,
  millisecondsToMicroseconds,
  secondsToMicroseconds,
  timeUsToFrameIndex,
  type RationalFrameRate,
} from './editor/core/time';
import { createCompositionExportPayload as createDraftExportPayload } from './editor/core/export-schema';
import type {
  CompositionExportPayload,
  VideoTimelineDraft,
} from './editor/types';

export const createCompositionExportPayload = (
  draft: VideoTimelineDraft,
): CompositionExportPayload => createDraftExportPayload(draft);

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
  TimelineClipPosition,
  TimelineClipSpeed,
  TimelineClipType,
  TimelineImageClip,
  TimelineMediaClip,
  TimelineMediaType,
  TimelineTimedMediaClip,
  TimelineTimedMediaType,
  TimelineTextClip,
  TimelineTextFontPreset,
  TimelineTextFontType,
  TimelineTextLayoutSize,
  TimelineTrackType,
  TimelineVisualMediaClip,
  VideoTimelineCanvasSize,
  VideoTimelineClip,
  VideoTimelineClipDraft,
  VideoTimelineClipTransform,
  VideoTimelineClipSpeed,
  VideoTimelineDraft,
  VideoTimelineEditorProps,
  VideoTimelineExportRequest,
  VideoTimelineImportRequest,
  VideoTimelineMediaLoader,
  VideoTimelineMediaMetadata,
  VideoTimelineMediaType,
  VideoTimelineSource,
  VideoTimelineTrack,
  VideoTimelineTrackDraft,
  VideoTimelineClipVolume,
} from './editor/types';
