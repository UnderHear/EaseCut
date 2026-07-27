import type {
  TimelineCanvasSize,
  TimelineClipTransform,
} from './model';

export const PREVIEW_SNAP_THRESHOLD_PX = 6;

export type PreviewResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
export type PreviewInteractionMode = 'move' | PreviewResizeHandle;
export type PreviewSnapGuide = {
  axis: 'x' | 'y';
  position: number;
};

type PreviewAxis = PreviewSnapGuide['axis'];
type PreviewAnchorKind = 'center' | 'edge';
type PreviewSnapTarget = {
  anchorKind: PreviewAnchorKind;
  axis: PreviewAxis;
  position: number;
  source: 'canvas' | 'clip';
};
type PreviewSourceAnchor = {
  anchorKind: PreviewAnchorKind;
  position: number;
};
type PreviewSnapCandidate = {
  axis: PreviewAxis;
  distance: number;
  sourceAnchor: PreviewSourceAnchor;
  target: PreviewSnapTarget;
};

type GetPreviewInteractionUpdateParams = {
  canvasSize: TimelineCanvasSize;
  deltaX: number;
  deltaY: number;
  initialTransform: TimelineClipTransform;
  keepAspectRatio: boolean;
  minimumSize: number;
  mode: PreviewInteractionMode;
  previewScale: number;
  snappingEnabled: boolean;
  targetTransforms: TimelineClipTransform[];
};

export type PreviewInteractionUpdate = {
  guides: PreviewSnapGuide[];
  transform: TimelineClipTransform;
};

const DISTANCE_EPSILON = 1e-9;

const getTargetSourcePriority = (target: PreviewSnapTarget) =>
  target.source === 'canvas' ? 0 : 1;

const getAnchorPriority = (anchorKind: PreviewAnchorKind) =>
  anchorKind === 'center' ? 0 : 1;

const compareNumbers = (left: number, right: number) => {
  if (Math.abs(left - right) <= DISTANCE_EPSILON) return 0;
  return left < right ? -1 : 1;
};

const compareTargets = (
  left: PreviewSnapTarget,
  right: PreviewSnapTarget,
) =>
  getTargetSourcePriority(left) - getTargetSourcePriority(right) ||
  getAnchorPriority(left.anchorKind) - getAnchorPriority(right.anchorKind) ||
  compareNumbers(left.position, right.position) ||
  (left.axis === right.axis ? 0 : left.axis === 'x' ? -1 : 1);

const compareSnapCandidates = (
  left: PreviewSnapCandidate,
  right: PreviewSnapCandidate,
) =>
  compareNumbers(left.distance, right.distance) ||
  compareTargets(left.target, right.target) ||
  getAnchorPriority(left.sourceAnchor.anchorKind) -
    getAnchorPriority(right.sourceAnchor.anchorKind) ||
  compareNumbers(left.sourceAnchor.position, right.sourceAnchor.position) ||
  (left.axis === right.axis ? 0 : left.axis === 'x' ? -1 : 1);

const isTransformVisibleInCanvas = (
  transform: TimelineClipTransform,
  canvasSize: TimelineCanvasSize,
) =>
  transform.x < canvasSize.width &&
  transform.x + transform.width > 0 &&
  transform.y < canvasSize.height &&
  transform.y + transform.height > 0;

const getAxisAnchors = (
  transform: TimelineClipTransform,
  axis: PreviewAxis,
): PreviewSourceAnchor[] => {
  const start = axis === 'x' ? transform.x : transform.y;
  const size = axis === 'x' ? transform.width : transform.height;

  return [
    { anchorKind: 'center', position: start + size / 2 },
    { anchorKind: 'edge', position: start },
    { anchorKind: 'edge', position: start + size },
  ];
};

const getPreviewSnapTargets = (
  canvasSize: TimelineCanvasSize,
  transforms: TimelineClipTransform[],
): PreviewSnapTarget[] => {
  const targets: PreviewSnapTarget[] = [
    {
      anchorKind: 'center',
      axis: 'x',
      position: canvasSize.width / 2,
      source: 'canvas',
    },
    { anchorKind: 'edge', axis: 'x', position: 0, source: 'canvas' },
    {
      anchorKind: 'edge',
      axis: 'x',
      position: canvasSize.width,
      source: 'canvas',
    },
    {
      anchorKind: 'center',
      axis: 'y',
      position: canvasSize.height / 2,
      source: 'canvas',
    },
    { anchorKind: 'edge', axis: 'y', position: 0, source: 'canvas' },
    {
      anchorKind: 'edge',
      axis: 'y',
      position: canvasSize.height,
      source: 'canvas',
    },
  ];

  for (const transform of transforms) {
    if (!isTransformVisibleInCanvas(transform, canvasSize)) continue;

    for (const axis of ['x', 'y'] as const) {
      const axisLimit = axis === 'x' ? canvasSize.width : canvasSize.height;
      for (const anchor of getAxisAnchors(transform, axis)) {
        if (anchor.position < 0 || anchor.position > axisLimit) continue;
        targets.push({
          anchorKind: anchor.anchorKind,
          axis,
          position: anchor.position,
          source: 'clip',
        });
      }
    }
  }

  const uniqueTargets = new Map<string, PreviewSnapTarget>();
  for (const target of targets) {
    const key = `${target.axis}:${target.position}`;
    const existing = uniqueTargets.get(key);
    if (!existing || compareTargets(target, existing) < 0) {
      uniqueTargets.set(key, target);
    }
  }

  return Array.from(uniqueTargets.values()).sort(compareTargets);
};

const findClosestSnap = (
  axis: PreviewAxis,
  sourceAnchors: PreviewSourceAnchor[],
  targets: PreviewSnapTarget[],
  threshold: number,
  isTargetValid: (target: PreviewSnapTarget) => boolean = () => true,
): PreviewSnapCandidate | null => {
  let closest: PreviewSnapCandidate | null = null;

  for (const sourceAnchor of sourceAnchors) {
    for (const target of targets) {
      if (target.axis !== axis || !isTargetValid(target)) continue;

      const candidate: PreviewSnapCandidate = {
        axis,
        distance: Math.abs(target.position - sourceAnchor.position),
        sourceAnchor,
        target,
      };
      if (candidate.distance > threshold + DISTANCE_EPSILON) continue;
      if (!closest || compareSnapCandidates(candidate, closest) < 0) {
        closest = candidate;
      }
    }
  }

  return closest;
};

const normalizePreviewTransform = (
  transform: TimelineClipTransform,
  minimumSize: number,
): TimelineClipTransform => ({
  height: Math.max(minimumSize, Math.round(transform.height)),
  width: Math.max(minimumSize, Math.round(transform.width)),
  x: Math.round(transform.x),
  y: Math.round(transform.y),
});

const getMovedTransform = (
  initialTransform: TimelineClipTransform,
  deltaX: number,
  deltaY: number,
): TimelineClipTransform => ({
  ...initialTransform,
  x: initialTransform.x + deltaX,
  y: initialTransform.y + deltaY,
});

const getResizeGeometry = (
  initialTransform: TimelineClipTransform,
  handle: PreviewResizeHandle,
) => ({
  directionX: handle.endsWith('w') ? -1 : 1,
  directionY: handle.startsWith('n') ? -1 : 1,
  fixedX: handle.endsWith('w')
    ? initialTransform.x + initialTransform.width
    : initialTransform.x,
  fixedY: handle.startsWith('n')
    ? initialTransform.y + initialTransform.height
    : initialTransform.y,
});

const normalizeResizeTransform = (
  fixedX: number,
  fixedY: number,
  movingX: number,
  movingY: number,
  directionX: number,
  directionY: number,
  minimumSize: number,
): TimelineClipTransform => {
  const height = Math.max(minimumSize, Math.round(Math.abs(movingY - fixedY)));
  const width = Math.max(minimumSize, Math.round(Math.abs(movingX - fixedX)));
  const normalizedFixedX = Math.round(fixedX);
  const normalizedFixedY = Math.round(fixedY);

  return {
    height,
    width,
    x: directionX < 0 ? normalizedFixedX - width : normalizedFixedX,
    y: directionY < 0 ? normalizedFixedY - height : normalizedFixedY,
  };
};

const getFreeResizeUpdate = (
  initialTransform: TimelineClipTransform,
  handle: PreviewResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumSize: number,
  targets: PreviewSnapTarget[],
  threshold: number,
  snappingEnabled: boolean,
): PreviewInteractionUpdate => {
  const { directionX, directionY, fixedX, fixedY } = getResizeGeometry(
    initialTransform,
    handle,
  );
  const requestedX =
    (handle.endsWith('w')
      ? initialTransform.x
      : initialTransform.x + initialTransform.width) + deltaX;
  const requestedY =
    (handle.startsWith('n')
      ? initialTransform.y
      : initialTransform.y + initialTransform.height) + deltaY;
  let movingX =
    directionX < 0
      ? Math.min(requestedX, fixedX - minimumSize)
      : Math.max(requestedX, fixedX + minimumSize);
  let movingY =
    directionY < 0
      ? Math.min(requestedY, fixedY - minimumSize)
      : Math.max(requestedY, fixedY + minimumSize);
  const guides: PreviewSnapGuide[] = [];

  if (snappingEnabled) {
    const xSnap = findClosestSnap(
      'x',
      [{ anchorKind: 'edge', position: movingX }],
      targets,
      threshold,
      (target) => directionX * (target.position - fixedX) >= minimumSize,
    );
    if (xSnap) {
      movingX = xSnap.target.position;
      guides.push({ axis: 'x', position: xSnap.target.position });
    }

    const ySnap = findClosestSnap(
      'y',
      [{ anchorKind: 'edge', position: movingY }],
      targets,
      threshold,
      (target) => directionY * (target.position - fixedY) >= minimumSize,
    );
    if (ySnap) {
      movingY = ySnap.target.position;
      guides.push({ axis: 'y', position: ySnap.target.position });
    }
  }

  return {
    guides,
    transform: normalizeResizeTransform(
      fixedX,
      fixedY,
      movingX,
      movingY,
      directionX,
      directionY,
      minimumSize,
    ),
  };
};

const getAspectRatioResizeUpdate = (
  initialTransform: TimelineClipTransform,
  handle: PreviewResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumSize: number,
  targets: PreviewSnapTarget[],
  threshold: number,
  snappingEnabled: boolean,
): PreviewInteractionUpdate => {
  const { directionX, directionY, fixedX, fixedY } = getResizeGeometry(
    initialTransform,
    handle,
  );
  const initialVectorX = directionX * initialTransform.width;
  const initialVectorY = directionY * initialTransform.height;
  const pointerVectorX = initialVectorX + deltaX;
  const pointerVectorY = initialVectorY + deltaY;
  const minimumScale = Math.max(
    minimumSize / initialTransform.width,
    minimumSize / initialTransform.height,
  );
  const projectedScale =
    (pointerVectorX * initialVectorX + pointerVectorY * initialVectorY) /
    (initialVectorX ** 2 + initialVectorY ** 2);
  const requestedScale = Math.max(minimumScale, projectedScale);
  const requestedMovingX =
    fixedX + directionX * initialTransform.width * requestedScale;
  const requestedMovingY =
    fixedY + directionY * initialTransform.height * requestedScale;
  let snappedScale = requestedScale;
  let scaleSnap: (PreviewSnapCandidate & { scale: number }) | null = null;

  if (snappingEnabled) {
    for (const axis of ['x', 'y'] as const) {
      const sourcePosition = axis === 'x' ? requestedMovingX : requestedMovingY;
      const fixedPosition = axis === 'x' ? fixedX : fixedY;
      const direction = axis === 'x' ? directionX : directionY;
      const initialSize =
        axis === 'x' ? initialTransform.width : initialTransform.height;

      for (const target of targets) {
        if (target.axis !== axis) continue;

        const distance = Math.abs(target.position - sourcePosition);
        if (distance > threshold + DISTANCE_EPSILON) continue;
        const scale =
          (direction * (target.position - fixedPosition)) / initialSize;
        if (scale < minimumScale - DISTANCE_EPSILON) continue;

        const candidate = {
          axis,
          distance,
          scale,
          sourceAnchor: { anchorKind: 'edge' as const, position: sourcePosition },
          target,
        };
        if (!scaleSnap || compareSnapCandidates(candidate, scaleSnap) < 0) {
          scaleSnap = candidate;
        }
      }
    }
  }

  if (scaleSnap) snappedScale = scaleSnap.scale;

  const movingX =
    fixedX + directionX * initialTransform.width * snappedScale;
  const movingY =
    fixedY + directionY * initialTransform.height * snappedScale;
  const guides: PreviewSnapGuide[] = [];

  if (scaleSnap) {
    for (const axis of ['x', 'y'] as const) {
      const finalPosition = axis === 'x' ? movingX : movingY;
      const matchingTarget = targets
        .filter(
          (target) =>
            target.axis === axis &&
            Math.abs(target.position - finalPosition) <= DISTANCE_EPSILON,
        )
        .sort(compareTargets)[0];
      if (matchingTarget) {
        guides.push({ axis, position: matchingTarget.position });
      }
    }
  }

  return {
    guides,
    transform: normalizeResizeTransform(
      fixedX,
      fixedY,
      movingX,
      movingY,
      directionX,
      directionY,
      minimumSize,
    ),
  };
};

const getMoveUpdate = (
  initialTransform: TimelineClipTransform,
  deltaX: number,
  deltaY: number,
  minimumSize: number,
  targets: PreviewSnapTarget[],
  threshold: number,
  snappingEnabled: boolean,
): PreviewInteractionUpdate => {
  const transform = getMovedTransform(initialTransform, deltaX, deltaY);
  const guides: PreviewSnapGuide[] = [];

  if (snappingEnabled) {
    const xSnap = findClosestSnap(
      'x',
      getAxisAnchors(transform, 'x'),
      targets,
      threshold,
    );
    if (xSnap) {
      transform.x += xSnap.target.position - xSnap.sourceAnchor.position;
      guides.push({ axis: 'x', position: xSnap.target.position });
    }

    const ySnap = findClosestSnap(
      'y',
      getAxisAnchors(transform, 'y'),
      targets,
      threshold,
    );
    if (ySnap) {
      transform.y += ySnap.target.position - ySnap.sourceAnchor.position;
      guides.push({ axis: 'y', position: ySnap.target.position });
    }
  }

  return {
    guides,
    transform: normalizePreviewTransform(transform, minimumSize),
  };
};

export const getPreviewInteractionUpdate = ({
  canvasSize,
  deltaX,
  deltaY,
  initialTransform,
  keepAspectRatio,
  minimumSize,
  mode,
  previewScale,
  snappingEnabled,
  targetTransforms,
}: GetPreviewInteractionUpdateParams): PreviewInteractionUpdate => {
  const targets = snappingEnabled
    ? getPreviewSnapTargets(canvasSize, targetTransforms)
    : [];
  const threshold =
    PREVIEW_SNAP_THRESHOLD_PX / Math.max(previewScale, Number.EPSILON);

  if (mode === 'move') {
    return getMoveUpdate(
      initialTransform,
      deltaX,
      deltaY,
      minimumSize,
      targets,
      threshold,
      snappingEnabled,
    );
  }

  return keepAspectRatio
    ? getAspectRatioResizeUpdate(
        initialTransform,
        mode,
        deltaX,
        deltaY,
        minimumSize,
        targets,
        threshold,
        snappingEnabled,
      )
    : getFreeResizeUpdate(
        initialTransform,
        mode,
        deltaX,
        deltaY,
        minimumSize,
        targets,
        threshold,
        snappingEnabled,
      );
};
