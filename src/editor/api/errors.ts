export type EaseCutApiErrorCode =
  | 'CLIP_INVALID'
  | 'CLIP_NOT_FOUND'
  | 'SOURCE_ALREADY_EXISTS'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_IN_USE'
  | 'SOURCE_INVALID'
  | 'SOURCE_NOT_FOUND';

export class EaseCutApiError extends Error {
  readonly code: EaseCutApiErrorCode;

  constructor(code: EaseCutApiErrorCode, message: string) {
    super(message);
    this.name = 'EaseCutApiError';
    this.code = code;
  }
}
