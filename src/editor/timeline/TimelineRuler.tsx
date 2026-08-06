import type { CSSProperties, PointerEvent } from 'react';

import { TIMELINE_CONTENT_PADDING_X } from '../core/timeline-layout';
import {
  calcTickScale,
  durationUsToWidth,
  timeUsToX,
} from '../core/timeline-math';
import type { CompositionVideoGap } from '../core/composition';
import {
  formatTimelineDateTime,
  formatTimelineRulerTime,
} from '../util/format-timeline-time';

type TimelineRulerProps = {
  currentTimeUs: number;
  durationUs: number;
  gaps: readonly CompositionVideoGap[];
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  pixelsPerSecond: number;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
};

export function TimelineRuler({
  currentTimeUs,
  durationUs,
  gaps,
  onPointerDown,
  pixelsPerSecond,
  visibleTimeEndUs,
  visibleTimeStartUs,
}: TimelineRulerProps) {
  const { majorIntervalUs, minorDivisions } = calcTickScale(pixelsPerSecond);
  const minorIntervalUs = majorIntervalUs / minorDivisions;
  const bufferedStartUs = Math.max(0, visibleTimeStartUs - majorIntervalUs);
  const bufferedEndUs = Math.min(
    durationUs,
    visibleTimeEndUs + majorIntervalUs,
  );
  const firstTickIndex = Math.floor(bufferedStartUs / minorIntervalUs);
  const lastTickIndex = Math.ceil(bufferedEndUs / minorIntervalUs);
  const ticks = Array.from(
    { length: lastTickIndex - firstTickIndex + 1 },
    (_, offset) => {
      const index = firstTickIndex + offset;
      const timeUs = index * minorIntervalUs;

      return {
        isGap: gaps.some(
          (gap) => timeUs >= gap.startUs && timeUs < gap.endUs,
        ),
        isMajor: index % minorDivisions === 0,
        timeUs,
      };
    },
  );

  return (
    <div
      aria-label='时间标尺'
      aria-valuemax={durationUs}
      aria-valuemin={0}
      aria-valuenow={currentTimeUs}
      className='ec-timeline-ruler'
      onPointerDown={onPointerDown}
      role='slider'
    >
      {gaps.map((gap) => (
        <span
          aria-hidden='true'
          className='ec-timeline-ruler__gap'
          key={`${gap.startUs}-${gap.endUs}`}
          style={
            {
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
      {ticks.map((tick) => (
        <span
          aria-hidden='true'
          className={`ec-timeline-ruler__tick${
            tick.isMajor ? ' ec-timeline-ruler__tick--major' : ''
          }${tick.isGap ? ' ec-timeline-ruler__tick--gap' : ''}`}
          data-time-us={tick.timeUs}
          key={tick.timeUs}
          style={{
            left:
              TIMELINE_CONTENT_PADDING_X +
              timeUsToX(tick.timeUs, pixelsPerSecond),
          }}
        />
      ))}
      {ticks
        .filter((tick) => tick.isMajor)
        .map((tick) => (
          <time
            className={`ec-timeline-ruler__label${
              tick.isGap ? ' ec-timeline-ruler__label--gap' : ''
            }`}
            dateTime={formatTimelineDateTime(tick.timeUs)}
            key={tick.timeUs}
            style={{
              left:
                TIMELINE_CONTENT_PADDING_X +
                timeUsToX(tick.timeUs, pixelsPerSecond),
            }}
          >
            {formatTimelineRulerTime(tick.timeUs)}
          </time>
        ))}
    </div>
  );
}
