import { Line, Rect, Text } from 'react-konva';

import { calcTickScale, timeToX } from '../core/timeline-math';

type TimelineRulerProps = {
  duration: number;
  height: number;
  pixelsPerSecond: number;
  width: number;
  x?: number;
};

export function TimelineRuler({
  duration,
  height,
  pixelsPerSecond,
  width,
  x = 0,
}: TimelineRulerProps) {
  const { majorInterval, minorDivisions, formatTick } =
    calcTickScale(pixelsPerSecond);
  const numMajorTicks = Math.ceil(duration / majorInterval) + 1;
  const majorTicks: number[] = [];

  for (let index = 0; index <= numMajorTicks; index += 1) {
    majorTicks.push(roundToPrecision(index * majorInterval, majorInterval));
  }

  const minorTicks: number[] = [];
  for (let index = 0; index < majorTicks.length - 1; index += 1) {
    const step = majorInterval / minorDivisions;
    for (let division = 1; division < minorDivisions; division += 1) {
      minorTicks.push(
        roundToPrecision(majorTicks[index] + division * step, step),
      );
    }
  }

  return (
    <>
      <Rect
        fill='#171717'
        height={height}
        name='timeline-hit'
        width={width}
        x={x}
      />
      {minorTicks.map((tick) => {
        const tickX = x + timeToX(tick, pixelsPerSecond);
        return (
          <Line
            key={`minor-${tick}`}
            listening={false}
            points={[tickX, 3, tickX, 9]}
            stroke='rgb(255 255 255 / 14%)'
            strokeWidth={1}
          />
        );
      })}
      {majorTicks.map((tick) => {
        const tickX = x + timeToX(tick, pixelsPerSecond);
        return (
          <Line
            key={`major-${tick}`}
            listening={false}
            points={[tickX, 0, tickX, height - 7]}
            stroke='rgb(255 255 255 / 28%)'
            strokeWidth={1}
          />
        );
      })}
      {majorTicks.map((tick) => {
        const tickX = x + timeToX(tick, pixelsPerSecond);
        return (
          <Text
            key={`label-${tick}`}
            fill='rgb(255 255 255 / 46%)'
            fontSize={12}
            height={12}
            listening={false}
            text={formatTick(tick)}
            width={48}
            x={tickX + 4}
            y={11}
          />
        );
      })}
    </>
  );
}

function roundToPrecision(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) - 0.001));
  return Number(value.toFixed(decimals + 1));
}
