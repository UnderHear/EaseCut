import { isValidTimeUs } from '../core/time';

export type FramePreviewWorkerFrame = {
  index: number;
  timeUs: number;
};

export type FramePreviewWorkerRequest =
  | {
      blob: Blob;
      type: 'open';
    }
  | {
      frames: FramePreviewWorkerFrame[];
      type: 'extract';
    }
  | {
      type: 'dispose';
    };

export type FramePreviewWorkerResponse =
  | {
      frameWidth: number;
      mediaDurationUs: number;
      type: 'ready';
    }
  | {
      blob: Blob;
      index: number;
      timeUs: number;
      type: 'frame';
    }
  | {
      type: 'complete';
    }
  | {
      type: 'disposed';
    }
  | {
      code: 'decode' | 'invalid-media' | 'unsupported';
      message: string;
      type: 'error';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFrameIndex = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0;

const isFrame = (value: unknown): value is FramePreviewWorkerFrame =>
  isRecord(value) &&
  isFrameIndex(value.index) &&
  typeof value.timeUs === 'number' &&
  isValidTimeUs(value.timeUs);

export const isFramePreviewWorkerRequest = (
  value: unknown,
): value is FramePreviewWorkerRequest => {
  if (!isRecord(value)) return false;
  if (value.type === 'dispose') return true;
  if (value.type === 'open') return value.blob instanceof Blob;
  return (
    value.type === 'extract' &&
    Array.isArray(value.frames) &&
    value.frames.every(isFrame)
  );
};

export const isFramePreviewWorkerResponse = (
  value: unknown,
): value is FramePreviewWorkerResponse => {
  if (!isRecord(value)) return false;
  if (value.type === 'complete' || value.type === 'disposed') return true;
  if (value.type === 'ready') {
    return (
      isFrameIndex(value.frameWidth) &&
      value.frameWidth > 0 &&
      typeof value.mediaDurationUs === 'number' &&
      isValidTimeUs(value.mediaDurationUs) &&
      value.mediaDurationUs > 0
    );
  }
  if (value.type === 'frame') {
    return (
      value.blob instanceof Blob &&
      isFrameIndex(value.index) &&
      typeof value.timeUs === 'number' &&
      isValidTimeUs(value.timeUs)
    );
  }
  return (
    value.type === 'error' &&
    (value.code === 'decode' ||
      value.code === 'invalid-media' ||
      value.code === 'unsupported') &&
    typeof value.message === 'string'
  );
};
