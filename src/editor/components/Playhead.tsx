import type Konva from 'konva';
import { Group, Line, Path, Rect } from 'react-konva';

const PLAYHEAD_HANDLE_HEIGHT = 14;

type PlayheadProps = {
  dragY: number;
  height: number;
  maxX: number;
  minX?: number;
  onCursorChange: (source: 'playhead', cursor: 'default' | 'ew-resize') => void;
  onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  x: number;
};

export function Playhead({
  dragY,
  height,
  maxX,
  minX = 0,
  onCursorChange,
  onDragMove,
  x,
}: PlayheadProps) {
  return (
    <Group
      draggable
      dragBoundFunc={(position) => ({
        x: Math.min(Math.max(minX, position.x), maxX),
        y: dragY,
      })}
      name='playhead'
      onDragMove={onDragMove}
      onMouseEnter={() => onCursorChange('playhead', 'ew-resize')}
      onMouseLeave={() => onCursorChange('playhead', 'default')}
      x={x}
      y={0}
    >
      <Rect
        fill='rgb(255 255 255 / 0.01)'
        height={height}
        width={16}
        x={-8}
        y={0}
      />
      <Path
        data='M -4.5 0 Q -5.5 0 -5.5 1 L -5.5 9.5 L -2.5 14 L 2.5 14 L 5.5 9.5 L 5.5 1 Q 5.5 0 4.5 0 Z'
        fill='#f8fafc'
        lineJoin='round'
        stroke='#020617'
        strokeWidth={1.5}
      />
      <Line
        listening={false}
        points={[0, PLAYHEAD_HANDLE_HEIGHT, 0, height]}
        stroke='#f8fafc'
        strokeWidth={1.5}
      />
    </Group>
  );
}
