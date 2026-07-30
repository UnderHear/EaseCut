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
  CompositionExportMediaClip,
  CompositionExportPayload,
  CompositionExportSpeed,
  CompositionExportTransform,
  CompositionExportTrim,
  CompositionExportTextClip,
  CompositionExportVolume,
  TimelineClipPosition,
  TimelineClipSpeed,
  TimelineClipType,
  TimelineMediaClip,
  TimelineTextClip,
  TimelineTextFontPreset,
  TimelineTextFontType,
  TimelineTextLayoutSize,
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
