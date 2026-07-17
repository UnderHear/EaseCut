import type { CSSProperties, PointerEvent } from 'react';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import {
  calcTickScale,
  durationToWidth,
  timeToX,
} from '../core/timeline-math';
import type { VideoGap } from './video-gaps';

type TimelineRulerProps = {
  currentTime: number;
  duration: number;
  gaps: VideoGap[];
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  pixelsPerSecond: number;
  width: number;
};

export function TimelineRuler({
  currentTime,
  duration,
  gaps,
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
      {gaps.map((gap) => (
        <span
          aria-hidden='true'
          className='oc-timeline-ruler__gap'
          key={`${gap.start}-${gap.end}`}
          style={
            {
              '--oc-timeline-gap-grid-offset': `${-timeToX(
                gap.start,
                pixelsPerSecond,
              )}px`,
              left:
                TIMELINE_CONTENT_PADDING_X +
                timeToX(gap.start, pixelsPerSecond),
              width: durationToWidth(
                gap.end - gap.start,
                pixelsPerSecond,
              ),
            } as CSSProperties
          }
        />
      ))}
      {majorTicks.map((tick) => (
        <time
          className={`oc-timeline-ruler__label${
            gaps.some((gap) => tick >= gap.start && tick < gap.end)
              ? ' oc-timeline-ruler__label--gap'
              : ''
          }`}
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
