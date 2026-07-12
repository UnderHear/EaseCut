import type { CSSProperties, PointerEvent } from 'react';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import { calcTickScale, timeToX } from '../core/timeline-math';

type TimelineRulerProps = {
  currentTime: number;
  duration: number;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  pixelsPerSecond: number;
  width: number;
};

export function TimelineRuler({
  currentTime,
  duration,
  onPointerDown,
  pixelsPerSecond,
  width,
}: TimelineRulerProps) {
  const { majorInterval, minorDivisions, formatTick } =
    calcTickScale(pixelsPerSecond);
  const majorTicks = Array.from(
    { length: Math.floor(duration / majorInterval) + 1 },
    (_, index) => index * majorInterval,
  );
  const style = {
    '--oc-timeline-major-step': `${majorInterval * pixelsPerSecond}px`,
    '--oc-timeline-minor-step': `${
      (majorInterval * pixelsPerSecond) / minorDivisions
    }px`,
    width,
  } as CSSProperties;

  return (
    <div
      aria-label='时间标尺'
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={currentTime}
      className='oc-timeline-ruler'
      onPointerDown={onPointerDown}
      role='slider'
      style={style}
    >
      {majorTicks.map((tick) => (
        <time
          className='oc-timeline-ruler__label'
          dateTime={`PT${tick}S`}
          key={tick}
          style={{ left: TIMELINE_CONTENT_PADDING_X + timeToX(tick, pixelsPerSecond) }}
        >
          {formatTick(tick)}
        </time>
      ))}
    </div>
  );
}
