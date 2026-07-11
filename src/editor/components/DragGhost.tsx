import { Rect } from 'react-konva';

type DragGhostProps = {
  height: number;
  placeholderX?: number;
  placeholderY?: number;
  width: number;
  x: number;
  y: number;
};

export function DragGhost({
  height,
  placeholderX,
  placeholderY,
  width,
  x,
  y,
}: DragGhostProps) {
  return (
    <>
      {placeholderX !== undefined && placeholderY !== undefined && (
        <Rect
          cornerRadius={6}
          dash={[6, 5]}
          fill='rgb(255 255 255 / 5%)'
          height={height}
          listening={false}
          name='drag-placeholder'
          stroke='rgb(255 255 255 / 22%)'
          width={width}
          x={placeholderX}
          y={placeholderY}
        />
      )}
      <Rect
        cornerRadius={6}
        fill='rgb(103 232 249 / 18%)'
        height={height}
        listening={false}
        name='drag-ghost'
        shadowBlur={12}
        shadowColor='#67e8f9'
        shadowOpacity={0.25}
        stroke='rgb(103 232 249 / 70%)'
        strokeWidth={1.5}
        width={width}
        x={x}
        y={y}
      />
    </>
  );
}
