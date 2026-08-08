import { describe, expect, it } from 'vitest';

import { isFramePreviewWorkerRequest } from './frame-preview-protocol';

describe('frame preview worker protocol', () => {
  it('accepts an open request with a bounded integer output height', () => {
    expect(
      isFramePreviewWorkerRequest({
        blob: new Blob(['video']),
        outputHeight: 90,
        type: 'open',
      }),
    ).toBe(true);
  });

  it.each([0, 90.5, 257, Number.NaN])(
    'rejects invalid output height %s',
    (outputHeight) => {
      expect(
        isFramePreviewWorkerRequest({
          blob: new Blob(['video']),
          outputHeight,
          type: 'open',
        }),
      ).toBe(false);
    },
  );

  it('rejects an open request that omits its output height', () => {
    expect(
      isFramePreviewWorkerRequest({
        blob: new Blob(['video']),
        type: 'open',
      }),
    ).toBe(false);
  });
});
