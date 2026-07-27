import type { CSSProperties, PointerEvent } from 'react';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import {
  calcTickScale,
  durationUsToWidth,
  timeUsToX,
} from '../core/timeline-math';
import { microsecondsToSeconds } from '../core/time';
import type { CompositionVideoGap } from '../core/composition';

type TimelineRulerProps = {
  currentTimeUs: number;
  durationUs: number;
  gaps: readonly CompositionVideoGap[];
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  pixelsPerSecond: number;
};

export function TimelineRuler({
  currentTimeUs,
  durationUs,
  gaps,
  onPointerDown,
  pixelsPerSecond,
}: TimelineRulerProps) {
  const { majorIntervalUs, minorDivisions, formatTick } =
    calcTickScale(pixelsPerSecond);
  const majorTicks = Array.from(
    { length: Math.floor(durationUs / majorIntervalUs) + 1 },
    (_, index) => index * majorIntervalUs,
  );
  const style = {
    '--oc-timeline-major-step': `${durationUsToWidth(
      majorIntervalUs,
      pixelsPerSecond,
    )}px`,
    '--oc-timeline-minor-step': `${
      durationUsToWidth(majorIntervalUs, pixelsPerSecond) / minorDivisions
    }px`,
  } as CSSProperties;

  return (
    <div
      aria-label='时间标尺'
      aria-valuemax={durationUs}
      aria-valuemin={0}
      aria-valuenow={currentTimeUs}
      className='oc-timeline-ruler'
      onPointerDown={onPointerDown}
      role='slider'
      style={style}
    >
      {gaps.map((gap) => (
        <span
          aria-hidden='true'
          className='oc-timeline-ruler__gap'
          key={`${gap.startUs}-${gap.endUs}`}
          style={
            {
              '--oc-timeline-gap-grid-offset': `${-timeUsToX(
                gap.startUs,
                pixelsPerSecond,
              )}px`,
              left:
                TIMELINE_CONTENT_PADDING_X +
                timeUsToX(gap.startUs, pixelsPerSecond),
              width: durationUsToWidth(
                gap.endUs - gap.startUs,
                pixelsPerSecond,
              ),
            } as CSSProperties
          }
        />
      ))}
      {majorTicks.map((tick) => (
        <time
          className={`oc-timeline-ruler__label${
            gaps.some(
              (gap) => tick >= gap.startUs && tick < gap.endUs,
            )
              ? ' oc-timeline-ruler__label--gap'
              : ''
          }`}
          dateTime={`PT${microsecondsToSeconds(tick)}S`}
          key={tick}
          style={{
            left:
              TIMELINE_CONTENT_PADDING_X +
              timeUsToX(tick, pixelsPerSecond),
          }}
        >
          {formatTick(tick)}
        </time>
      ))}
    </div>
  );
}
