export type FramePreviewWorkerFrame = {
  index: number;
  time: number;
};

export type FramePreviewWorkerRequest =
  | {
      blob: Blob;
      captureHeight: number;
      frames: FramePreviewWorkerFrame[];
      requestId: number;
      type: 'extract';
    }
  | {
      requestId: number;
      type: 'cancel';
    };

export type FramePreviewWorkerResponse =
  | {
      blob: Blob;
      index: number;
      requestId: number;
      type: 'frame';
    }
  | {
      requestId: number;
      type: 'complete';
    }
  | {
      code: 'decode' | 'internal' | 'invalid-media' | 'unsupported';
      message: string;
      requestId: number;
      type: 'error';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

const isWorkerFrame = (value: unknown): value is FramePreviewWorkerFrame =>
  isRecord(value) &&
  isNonNegativeInteger(value.index) &&
  isFiniteNumber(value.time) &&
  value.time >= 0;

export const isFramePreviewWorkerRequest = (
  value: unknown,
): value is FramePreviewWorkerRequest => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.requestId)
  ) {
    return false;
  }
  if (value.type === 'cancel') return true;
  return (
    value.type === 'extract' &&
    value.blob instanceof Blob &&
    isNonNegativeInteger(value.captureHeight) &&
    value.captureHeight > 0 &&
    Array.isArray(value.frames) &&
    value.frames.every(isWorkerFrame)
  );
};

export const isFramePreviewWorkerResponse = (
  value: unknown,
): value is FramePreviewWorkerResponse => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.requestId)
  ) {
    return false;
  }
  if (value.type === 'complete') return true;
  if (value.type === 'frame') {
    return (
      isNonNegativeInteger(value.index) &&
      value.blob instanceof Blob
    );
  }
  return (
    value.type === 'error' &&
    (value.code === 'decode' ||
      value.code === 'internal' ||
      value.code === 'invalid-media' ||
      value.code === 'unsupported') &&
    typeof value.message === 'string'
  );
};
