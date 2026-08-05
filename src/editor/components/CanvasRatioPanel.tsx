import * as Separator from '@radix-ui/react-separator';
import {
  Check,
  Ratio,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  SquareDashed,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  COMPOSITION_CANVAS_PRESETS,
  DEFAULT_COMPOSITION_CANVAS_SIZE,
  type CompositionCanvasPreset,
  type CompositionCanvasSelection,
} from '../core/canvas-size';
import { useTimelineStore } from '../store/timeline-store-context';
import type { TimelineCanvasSize } from '../types';
import { FloatingInspectorShell } from './FloatingInspectorShell';

type CanvasRatioOption = {
  icon: ReactNode;
  id: CompositionCanvasSelection;
  label: string;
  size: TimelineCanvasSize;
};

const landscapePresets: CompositionCanvasPreset[] = ['16:9', '4:3', '2:1'];
const portraitPresets: CompositionCanvasPreset[] = ['9:16', '1:1', '3:4'];

const getPresetIcon = (preset: CompositionCanvasPreset) => {
  if (preset === '1:1') return <Square aria-hidden='true' size={21} />;
  if (landscapePresets.includes(preset)) {
    return <RectangleHorizontal aria-hidden='true' size={21} />;
  }
  return <RectangleVertical aria-hidden='true' size={21} />;
};

const createPresetOption = (
  preset: CompositionCanvasPreset,
): CanvasRatioOption => ({
  icon: getPresetIcon(preset),
  id: preset,
  label: preset,
  size: COMPOSITION_CANVAS_PRESETS[preset],
});

export function CanvasRatioPanel() {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const canvasSelection = useTimelineStore((state) => state.canvasSelection);
  const commitCanvasSize = useTimelineStore((state) => state.commitCanvasSize);
  const originalCanvasSize = useTimelineStore(
    (state) => state.originalCanvasSize,
  );
  const originalOption: CanvasRatioOption = {
    icon: <SquareDashed aria-hidden='true' size={21} />,
    id: 'original',
    label: '原纵横比',
    size: originalCanvasSize ?? DEFAULT_COMPOSITION_CANVAS_SIZE,
  };
  const landscapeOptions = landscapePresets.map(createPresetOption);
  const portraitOptions = portraitPresets.map(createPresetOption);

  const renderOption = (option: CanvasRatioOption) => {
    const isActive = option.id === canvasSelection;

    return (
      <button
        aria-pressed={isActive}
        className={`ec-canvas-ratio-inspector__option${isActive ? ' ec-is-active' : ''}`}
        key={option.id}
        onClick={() => commitCanvasSize(option.id)}
        title={`${option.label}（${option.size.width} × ${option.size.height}）`}
        type='button'
      >
        <span className='ec-canvas-ratio-inspector__option-icon'>
          {option.icon}
        </span>
        <span>{option.label}</span>
        {isActive && (
          <Check
            aria-hidden='true'
            className='ec-canvas-ratio-inspector__check'
            size={19}
          />
        )}
      </button>
    );
  };

  return (
    <FloatingInspectorShell
      ariaLabel='画布比例面板'
      closeLabel='关闭画布比例面板'
      isPanelOpen={isPanelOpen}
      navigationLabel='画布设置'
      onClose={() => setIsPanelOpen(false)}
      railItems={
        <button
          aria-current={isPanelOpen ? 'page' : undefined}
          className={`ec-floating-inspector__rail-item${isPanelOpen ? ' ec-is-active' : ''}`}
          onClick={() => setIsPanelOpen(true)}
          type='button'
        >
          <Ratio aria-hidden='true' size={20} />
          <span>纵横比</span>
        </button>
      }
      sectionTitle='纵横比'
      side='left'
    >
      <Separator.Root
        className='ec-floating-inspector__separator ec-floating-inspector__separator--header'
        decorative
        orientation='horizontal'
      />
      <div className='ec-floating-inspector__body ec-scrollbar ec-canvas-ratio-inspector__body'>
        <div aria-label='原始比例' role='group'>
          {renderOption(originalOption)}
        </div>
        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <div aria-label='横屏比例' role='group'>
          {landscapeOptions.map(renderOption)}
        </div>
        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <div aria-label='竖屏比例' role='group'>
          {portraitOptions.map(renderOption)}
        </div>
      </div>
    </FloatingInspectorShell>
  );
}
