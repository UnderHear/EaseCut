import { describe, expect, it } from 'vitest';

import type { TimelineClipTransform } from './model';
import {
  getPreviewInteractionUpdate,
  PREVIEW_SNAP_THRESHOLD_PX,
  type PreviewResizeHandle,
} from './preview-snapping';

const canvasSize = { height: 600, width: 1000 };
const initialTransform: TimelineClipTransform = {
  height: 100,
  width: 200,
  x: 100,
  y: 100,
};

const getUpdate = (
  patch: Partial<Parameters<typeof getPreviewInteractionUpdate>[0]> = {},
) =>
  getPreviewInteractionUpdate({
    canvasSize,
    deltaX: 0,
    deltaY: 0,
    initialTransform,
    keepAspectRatio: false,
    minimumSize: 40,
    mode: 'move',
    previewScale: 1,
    snappingEnabled: true,
    targetTransforms: [],
    ...patch,
  });

describe('getPreviewInteractionUpdate', () => {
  it('snaps move anchors independently to both canvas centers', () => {
    expect(getUpdate({ deltaX: 298, deltaY: 147 })).toEqual({
      guides: [
        { axis: 'x', position: 500 },
        { axis: 'y', position: 300 },
      ],
      transform: { height: 100, width: 200, x: 400, y: 250 },
    });
  });

  it('snaps a moved edge to another visible clip', () => {
    expect(
      getUpdate({
        deltaX: 48,
        targetTransforms: [{ height: 100, width: 100, x: 350, y: 350 }],
      }),
    ).toEqual({
      guides: [{ axis: 'x', position: 350 }],
      transform: { height: 100, width: 200, x: 150, y: 100 },
    });
  });

  it('keeps the snap threshold constant in preview pixels', () => {
    expect(PREVIEW_SNAP_THRESHOLD_PX).toBe(6);
    expect(getUpdate({ deltaX: 388, previewScale: 1 })).toEqual({
      guides: [],
      transform: { height: 100, width: 200, x: 488, y: 100 },
    });
    expect(getUpdate({ deltaX: 388, previewScale: 0.5 })).toEqual({
      guides: [{ axis: 'x', position: 500 }],
      transform: { height: 100, width: 200, x: 500, y: 100 },
    });
  });

  it('prefers a canvas target when clip and canvas targets are equally close', () => {
    expect(
      getUpdate({
        deltaX: 297,
        targetTransforms: [{ height: 80, width: 100, x: 444, y: 400 }],
      }),
    ).toEqual({
      guides: [{ axis: 'x', position: 500 }],
      transform: { height: 100, width: 200, x: 400, y: 100 },
    });
  });

  it('prefers a center target over an edge target at the same distance', () => {
    expect(
      getUpdate({
        canvasSize: { height: 800, width: 1200 },
        deltaX: 197,
        targetTransforms: [
          { height: 80, width: 100, x: 350, y: 500 },
          { height: 80, width: 50, x: 394, y: 600 },
        ],
      }),
    ).toEqual({
      guides: [{ axis: 'x', position: 400 }],
      transform: { height: 100, width: 200, x: 300, y: 100 },
    });
  });

  it('ignores target clips that do not intersect the canvas', () => {
    expect(
      getUpdate({
        deltaX: 48,
        targetTransforms: [{ height: 100, width: 100, x: 350, y: 700 }],
      }),
    ).toEqual({
      guides: [],
      transform: { height: 100, width: 200, x: 148, y: 100 },
    });
  });

  it('bypasses snapping without changing free movement when disabled', () => {
    expect(
      getUpdate({
        deltaX: 298,
        deltaY: 147,
        snappingEnabled: false,
      }),
    ).toEqual({
      guides: [],
      transform: { height: 100, width: 200, x: 398, y: 247 },
    });
  });

  it.each<{
    deltaX: number;
    deltaY: number;
    expected: TimelineClipTransform;
    handle: PreviewResizeHandle;
  }>([
    {
      deltaX: -98,
      deltaY: -97,
      expected: { height: 200, width: 300, x: 0, y: 0 },
      handle: 'nw',
    },
    {
      deltaX: 698,
      deltaY: -97,
      expected: { height: 200, width: 900, x: 100, y: 0 },
      handle: 'ne',
    },
    {
      deltaX: -98,
      deltaY: 397,
      expected: { height: 500, width: 300, x: 0, y: 100 },
      handle: 'sw',
    },
    {
      deltaX: 698,
      deltaY: 397,
      expected: { height: 500, width: 900, x: 100, y: 100 },
      handle: 'se',
    },
  ])(
    'snaps free $handle resize edges while preserving the opposite corner',
    ({ deltaX, deltaY, expected, handle }) => {
      expect(getUpdate({ deltaX, deltaY, mode: handle })).toEqual({
        guides: [
          { axis: 'x', position: handle.endsWith('w') ? 0 : 1000 },
          { axis: 'y', position: handle.startsWith('n') ? 0 : 600 },
        ],
        transform: expected,
      });
    },
  );

  it('rejects a resize snap that would violate the minimum size', () => {
    expect(
      getUpdate({
        deltaX: 180,
        mode: 'nw',
        targetTransforms: [{ height: 100, width: 100, x: 265, y: 400 }],
      }),
    ).toEqual({
      guides: [],
      transform: { height: 100, width: 40, x: 260, y: 100 },
    });
  });

  it('keeps the opposite resize corner fixed when fractional movement rounds', () => {
    const result = getUpdate({
      deltaX: -0.5,
      deltaY: -0.5,
      mode: 'nw',
      snappingEnabled: false,
    });

    expect(result.transform).toEqual({
      height: 101,
      width: 201,
      x: 99,
      y: 99,
    });
    expect(result.transform.x + result.transform.width).toBe(300);
    expect(result.transform.y + result.transform.height).toBe(200);
  });

  it.each<{
    deltaX: number;
    deltaY: number;
    expected: TimelineClipTransform;
    handle: PreviewResizeHandle;
    targetX: number;
    targetY: number;
  }>([
    {
      deltaX: -100,
      deltaY: -50,
      expected: { height: 150, width: 300, x: 0, y: 50 },
      handle: 'nw',
      targetX: 0,
      targetY: 50,
    },
    {
      deltaX: 100,
      deltaY: -50,
      expected: { height: 150, width: 300, x: 100, y: 50 },
      handle: 'ne',
      targetX: 400,
      targetY: 50,
    },
    {
      deltaX: -100,
      deltaY: 50,
      expected: { height: 150, width: 300, x: 0, y: 100 },
      handle: 'sw',
      targetX: 0,
      targetY: 250,
    },
    {
      deltaX: 100,
      deltaY: 50,
      expected: { height: 150, width: 300, x: 100, y: 100 },
      handle: 'se',
      targetX: 400,
      targetY: 250,
    },
  ])(
    'snaps proportional $handle resize without moving its opposite corner',
    ({ deltaX, deltaY, expected, handle, targetX, targetY }) => {
      const result = getUpdate({
        deltaX,
        deltaY,
        keepAspectRatio: true,
        mode: handle,
        targetTransforms: [
          { height: 80, width: 80, x: targetX, y: targetY },
        ],
      });

      expect(result).toEqual({
        guides: [
          { axis: 'x', position: targetX },
          { axis: 'y', position: targetY },
        ],
        transform: expected,
      });
      expect(result.transform.width / result.transform.height).toBe(2);
    },
  );

  it('uses one proportional scale when only one resize axis can align', () => {
    expect(
      getUpdate({
        canvasSize: { height: 800, width: 1200 },
        deltaX: 197,
        deltaY: 98,
        keepAspectRatio: true,
        mode: 'se',
        targetTransforms: [{ height: 100, width: 100, x: 500, y: 500 }],
      }),
    ).toEqual({
      guides: [{ axis: 'x', position: 500 }],
      transform: { height: 200, width: 400, x: 100, y: 100 },
    });
  });

  it('preserves the aspect ratio at minimum size after crossing the fixed corner', () => {
    expect(
      getUpdate({
        deltaX: -500,
        deltaY: -500,
        keepAspectRatio: true,
        mode: 'se',
      }),
    ).toEqual({
      guides: [],
      transform: { height: 40, width: 80, x: 100, y: 100 },
    });
  });
});
