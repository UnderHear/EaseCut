import * as Dialog from '@radix-ui/react-dialog';
import {
  FilePlus2,
  Keyboard,
  Maximize,
  Magnet,
  Pause,
  Play,
  Redo2,
  ScanLine,
  SquareSplitHorizontal,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { getTimelineDuration } from '../core/collision';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
} from '../core/timeline-math';
import { canSplitClipAtTime } from '../store/timeline-store';
import { useTimelineStore } from '../store/timeline-store-context';
import { formatTimelineTime } from '../util/format-timeline-time';

type TimelineToolbarProps = {
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

const timelineShortcutGroups = [
  {
    id: 'globe',
    title: 'Globe',
    items: [
      { action: '撤销', key: 'Ctrl + Z / ⌘ + Z' },
      { action: '重做', key: 'Ctrl + Y / ⌘ + ⇧ + Z' },
      { action: '复制选中片段', key: 'Ctrl + C / ⌘ + C' },
      { action: '粘贴到选中片段右侧', key: 'Ctrl + V / ⌘ + V' },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    items: [
      { action: '分割选中片段', key: 'Ctrl + B / ⌘ + B' },
      { action: '删除选中片段', key: 'Backspace' },
      { action: '后退 0.1 秒', key: 'Ctrl + ← / ⌘ + ←' },
      { action: '前进 0.1 秒', key: 'Ctrl + → / ⌘ + →' },
      { action: '缩放时间线', key: 'Ctrl + 滚轮 / ⌘ + 滚轮' },
      { action: '双击片段还原裁剪', key: '双击片段' },
      { action: '横向移动轨道', key: 'Shift + 滚轮' },
    ],
  },
  {
    id: 'canva',
    title: 'Canva',
    items: [
      { action: '播放 / 暂停', key: 'Space' },
      { action: '等比例缩放视频宽高', key: 'Shift + 左键拖拽' },
    ],
  },
] as const;

export function TimelineToolbar({
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelineToolbarProps) {
  const canRedo = useTimelineStore((state) => state.future.length > 0);
  const canUndo = useTimelineStore((state) => state.past.length > 0);
  const canvasSnappingEnabled = useTimelineStore(
    (state) => state.canvasSnappingEnabled,
  );
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
  const toggleCanvasSnapping = useTimelineStore(
    (state) => state.toggleCanvasSnapping,
  );
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
          <Maximize aria-hidden='true' />
        </ToolbarButton>
      </div>

      <div className='oc-timeline-toolbar__group oc-timeline-toolbar__group--end'>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              aria-label='查看快捷键'
              className='oc-icon-button'
              title='查看快捷键'
              type='button'
            >
              <Keyboard aria-hidden='true' />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className='oc-shortcuts-dialog__overlay' />
            <Dialog.Content className='oc-shortcuts-dialog'>
              <div className='oc-shortcuts-dialog__header'>
                <Dialog.Title className='oc-shortcuts-dialog__title'>
                  快捷键
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    aria-label='关闭快捷键弹窗'
                    className='oc-icon-button'
                    title='关闭'
                    type='button'
                  >
                    <X aria-hidden='true' size={17} />
                  </button>
                </Dialog.Close>
              </div>
              <div className='oc-shortcuts-dialog__groups'>
                {timelineShortcutGroups.map((group) => (
                  <section
                    aria-labelledby={`oc-shortcuts-group-${group.id}`}
                    className='oc-shortcuts-dialog__group'
                    key={group.id}
                  >
                    <h3 id={`oc-shortcuts-group-${group.id}`}>
                      {group.title}
                    </h3>
                    <dl className='oc-shortcuts__list'>
                      {group.items.map((item) => (
                        <div className='oc-shortcuts__item' key={item.action}>
                          <dt>{item.action}</dt>
                          <dd>
                            <kbd>{item.key}</kbd>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <ToolbarButton
          active={snappingEnabled}
          label='时间轴吸附'
          onClick={toggleSnapping}
          pressed={snappingEnabled}
        >
          <Magnet aria-hidden='true' />
        </ToolbarButton>
        <ToolbarButton
          active={canvasSnappingEnabled}
          label='画布辅助线'
          onClick={toggleCanvasSnapping}
          pressed={canvasSnappingEnabled}
        >
          <ScanLine aria-hidden='true' />
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
