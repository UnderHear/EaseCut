import {
  FilePlus2,
  Keyboard,
  Maximize2,
  Magnet,
  Pause,
  Play,
  Redo2,
  SquareSplitHorizontal,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { getTimelineDuration } from '../core/collision';
import {
  formatTimelineTime,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import { canSplitClipAtTime } from '../store/timeline-store';
import { useTimelineStore } from '../store/timeline-store-context';

type TimelineToolbarProps = {
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

const timelineShortcutItems = [
  { action: '回退', keys: ['Ctrl', 'Z'] },
  { action: '前进', keys: ['Ctrl', 'Y'] },
  { action: '分割选中片段', keys: ['Ctrl', 'B'] },
  { action: '删除选中片段', keys: ['Backspace'] },
  { action: '缩放时间线', keys: ['Ctrl', '滚轮'] },
  { action: '播放 / 暂停', keys: ['Space'] },
] as const;

export function TimelineToolbar({
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelineToolbarProps) {
  const canRedo = useTimelineStore((state) => state.future.length > 0);
  const canUndo = useTimelineStore((state) => state.past.length > 0);
  const clips = useTimelineStore((state) => state.clips);
  const currentTime = useTimelineStore((state) => state.currentTime);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const deleteSelectedClip = useTimelineStore(
    (state) => state.deleteSelectedClip,
  );
  const redo = useTimelineStore((state) => state.redo);
  const setIsPlaying = useTimelineStore((state) => state.setIsPlaying);
  const setPixelsPerSecond = useTimelineStore(
    (state) => state.setPixelsPerSecond,
  );
  const splitAtPlayhead = useTimelineStore((state) => state.splitAtPlayhead);
  const toggleSnapping = useTimelineStore((state) => state.toggleSnapping);
  const undo = useTimelineStore((state) => state.undo);
  const canSplitAtPlayhead = canSplitClipAtTime(
    clips,
    currentTime,
    selectedClipId,
  );
  const duration = getTimelineDuration(clips);

  return (
    <div className='oc-timeline-toolbar' role='toolbar' aria-label='时间线工具栏'>
      <div className='oc-timeline-toolbar__group oc-timeline-toolbar__group--start'>
        <ToolbarButton
          disabled={!canUndo}
          label='撤销 Ctrl+Z'
          onClick={undo}
        >
          <Undo2 aria-hidden='true' />
        </ToolbarButton>
        <ToolbarButton
          disabled={!canRedo}
          label='重做 Ctrl+Y'
          onClick={redo}
        >
          <Redo2 aria-hidden='true' />
        </ToolbarButton>
        <span aria-hidden='true' className='oc-timeline-toolbar__separator' />
        <ToolbarButton
          disabled={!canSplitAtPlayhead}
          label='分割片段 Ctrl+B'
          onClick={splitAtPlayhead}
        >
          <SquareSplitHorizontal aria-hidden='true' />
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedClipId}
          label='删除选中片段 Backspace'
          onClick={deleteSelectedClip}
        >
          <Trash2 aria-hidden='true' />
        </ToolbarButton>
        {onRequestImport && (
          <ToolbarButton label='导入素材' onClick={onRequestImport}>
            <FilePlus2 aria-hidden='true' />
          </ToolbarButton>
        )}
      </div>

      <div className='oc-timeline-toolbar__transport'>
        <time className='oc-timeline-toolbar__time' dateTime={`PT${currentTime}S`}>
          {formatTimelineTime(currentTime)}
        </time>
        <ToolbarButton
          className='oc-icon-button--transport'
          label={`${isPlaying ? '暂停时间线' : '播放时间线'} Space`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause aria-hidden='true' /> : <Play aria-hidden='true' />}
        </ToolbarButton>
        <time
          className='oc-timeline-toolbar__time oc-timeline-toolbar__time--muted'
          dateTime={`PT${duration}S`}
        >
          {formatTimelineTime(duration)}
        </time>
        <ToolbarButton label='全屏预览' onClick={onRequestPreviewFullscreen}>
          <Maximize2 aria-hidden='true' />
        </ToolbarButton>
      </div>

      <div className='oc-timeline-toolbar__group oc-timeline-toolbar__group--end'>
        <details className='oc-shortcuts'>
          <summary
            aria-label='查看快捷键'
            className='oc-icon-button'
            role='button'
            title='查看快捷键'
          >
            <Keyboard aria-hidden='true' />
          </summary>
          <div className='oc-shortcuts__panel'>
            <strong className='oc-shortcuts__title'>快捷键</strong>
            <dl className='oc-shortcuts__list'>
              {timelineShortcutItems.map((item) => (
                <div className='oc-shortcuts__item' key={item.action}>
                  <dt>{item.action}</dt>
                  <dd>
                    {item.keys.map((key, index) => (
                      <span className='oc-shortcuts__key-group' key={`${item.action}-${key}`}>
                        {index > 0 && <span aria-hidden='true'>+</span>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
        <ToolbarButton
          active={snappingEnabled}
          label='吸附开关'
          onClick={toggleSnapping}
          pressed={snappingEnabled}
        >
          <Magnet aria-hidden='true' />
        </ToolbarButton>
        <ToolbarButton
          disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
          label='缩小'
          onClick={() =>
            setPixelsPerSecond(
              Math.max(
                MIN_PIXELS_PER_SECOND,
                pixelsPerSecond - TIMELINE_ZOOM_STEP,
              ),
            )
          }
        >
          <ZoomOut aria-hidden='true' />
        </ToolbarButton>
        <input
          aria-label='时间轴缩放'
          className='oc-timeline-toolbar__zoom'
          max={MAX_PIXELS_PER_SECOND}
          min={MIN_PIXELS_PER_SECOND}
          onChange={(event) => setPixelsPerSecond(Number(event.target.value))}
          type='range'
          value={pixelsPerSecond}
        />
        <ToolbarButton
          disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
          label='放大'
          onClick={() =>
            setPixelsPerSecond(
              Math.min(
                MAX_PIXELS_PER_SECOND,
                pixelsPerSecond + TIMELINE_ZOOM_STEP,
              ),
            )
          }
        >
          <ZoomIn aria-hidden='true' />
        </ToolbarButton>
        <output className='oc-timeline-toolbar__zoom-value'>
          {Math.round(pixelsPerSecond)}px/s
        </output>
      </div>
    </div>
  );
}

type ToolbarButtonProps = {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
};

function ToolbarButton({
  active = false,
  children,
  className = '',
  disabled = false,
  label,
  onClick,
  pressed,
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={label.split(' ')[0]}
      aria-pressed={pressed}
      className={`oc-icon-button${active ? ' oc-is-active' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type='button'
    >
      {children}
    </button>
  );
}
