import type { CSSProperties } from 'react';

type TimelineDragGhostProps = {
  left: number;
  snapped: boolean;
  trackChanged: boolean;
  width: number;
};

export function TimelineDragGhost({
  left,
  snapped,
  trackChanged,
  width,
}: TimelineDragGhostProps) {
  return (
    <div
      aria-hidden='true'
      className='oc-timeline-drag-ghost'
      data-snapped={snapped}
      data-track-changed={trackChanged}
      style={{ left, width } as CSSProperties}
    />
  );
}
