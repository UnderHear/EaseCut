export type VideoTimelineEditorApiErrorCode =
  | 'CLIP_INVALID'
  | 'CLIP_NOT_FOUND'
  | 'SOURCE_ALREADY_EXISTS'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_IN_USE'
  | 'SOURCE_INVALID'
  | 'SOURCE_NOT_FOUND';

export class VideoTimelineEditorApiError extends Error {
  readonly code: VideoTimelineEditorApiErrorCode;

  constructor(code: VideoTimelineEditorApiErrorCode, message: string) {
    super(message);
    this.name = 'VideoTimelineEditorApiError';
    this.code = code;
  }
}
