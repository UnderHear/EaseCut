export { VideoTimelineEditor } from './editor/VideoTimelineEditor';
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
  CompositionExportPayload,
  CompositionExportTransform,
  CompositionExportTrim,
  CompositionExportVolume,
  VideoTimelineCanvasSize,
  VideoTimelineClip,
  VideoTimelineClipDraft,
  VideoTimelineClipTransform,
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
  VideoTimelineTrackVolume,
} from './editor/types';
