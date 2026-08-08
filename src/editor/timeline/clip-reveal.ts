type Bounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type TrackBounds = Pick<Bounds, 'bottom' | 'top'>;

type TimelineViewportGeometry = {
  height: number;
  left: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  top: number;
  width: number;
};

export type ClipRevealGeometry = {
  clip: Bounds;
  track: TrackBounds;
  viewport: TimelineViewportGeometry;
};

export type ClipRevealScrollPosition = {
  left: number;
  top: number;
};

const rangesIntersect = (
  start: number,
  end: number,
  viewportStart: number,
  viewportEnd: number,
) => end > viewportStart && start < viewportEnd;

const clampScrollPosition = (
  value: number,
  scrollSize: number,
  clientSize: number,
) => Math.min(Math.max(0, value), Math.max(0, scrollSize - clientSize));

export const getClipRevealScrollPosition = ({
  clip,
  track,
  viewport,
}: ClipRevealGeometry): ClipRevealScrollPosition => {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const left = rangesIntersect(
    clip.left,
    clip.right,
    viewport.left,
    viewportRight,
  )
    ? viewport.scrollLeft
    : clampScrollPosition(
        viewport.scrollLeft +
          clip.left -
          (viewport.left + viewport.width / 2),
        viewport.scrollWidth,
        viewport.width,
      );
  const top = rangesIntersect(
    clip.top,
    clip.bottom,
    viewport.top,
    viewportBottom,
  )
    ? viewport.scrollTop
    : clampScrollPosition(
        viewport.scrollTop +
          (track.top + track.bottom) / 2 -
          (viewport.top + viewport.height / 2),
        viewport.scrollHeight,
        viewport.height,
      );

  return { left, top };
};
