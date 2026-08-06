import * as Dialog from '@radix-ui/react-dialog';
import {
  FilePlus2,
  Eye,
  EyeOff,
  Keyboard,
  Maximize,
  Magnet,
  Pause,
  Play,
  Redo2,
  ScanLine,
  SquareSplitHorizontal,
  Type as TypeIcon,
  TextCursorInput,
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
import { canSplitClipAtTime } from '../core/timeline-commands';
import { useTimelineStore } from '../store/timeline-store-context';
import {
  formatTimelineDateTime,
  formatTimelineTime,
} from '../util/format-timeline-time';
import { IconButton } from './ui/IconButton';

type TimelineToolbarProps = {
  onRequestAddTitle?: () => void;
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
  onRequestAddTitle,
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelineToolbarProps) {
  const canRedo = useTimelineStore((state) => state.future.length > 0);
  const canUndo = useTimelineStore((state) => state.past.length > 0);
  const canvasSnappingEnabled = useTimelineStore(
    (state) => state.canvasSnappingEnabled,
  );
  const clips = useTimelineStore((state) => state.clips);
  const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const playheadFollowEnabled = useTimelineStore(
    (state) => state.playheadFollowEnabled,
  );
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const deleteSelectedClip = useTimelineStore(
    (state) => state.deleteSelectedClip,
  );
  const redo = useTimelineStore((state) => state.redo);
  const setIsPlaying = useTimelineStore((state) => state.setIsPlaying);
  const setPixelsPerSecond = useTimelineStore(
    (state) => state.setPixelsPerSecond,
  );
  const setClipHidden = useTimelineStore((state) => state.setClipHidden);
  const splitAtPlayhead = useTimelineStore((state) => state.splitAtPlayhead);
  const toggleCanvasSnapping = useTimelineStore(
    (state) => state.toggleCanvasSnapping,
  );
  const togglePlayheadFollow = useTimelineStore(
    (state) => state.togglePlayheadFollow,
  );
  const toggleSnapping = useTimelineStore((state) => state.toggleSnapping);
  const undo = useTimelineStore((state) => state.undo);
  const canSplitAtPlayhead = canSplitClipAtTime(
    clips,
    currentTimeUs,
    selectedClipId,
  );
  const duration = getTimelineDuration(clips);

  return (
    <div className='ec-timeline-toolbar' role='toolbar' aria-label='时间线工具栏'>
      <div className='ec-timeline-toolbar__group ec-timeline-toolbar__group--start'>
        <IconButton
          aria-label='撤销'
          disabled={!canUndo}
          onClick={undo}
          title='撤销 Ctrl+Z'
        >
          <Undo2 aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label='重做'
          disabled={!canRedo}
          onClick={redo}
          title='重做 Ctrl+Y'
        >
          <Redo2 aria-hidden='true' />
        </IconButton>
        <span aria-hidden='true' className='ec-timeline-toolbar__separator' />
        <IconButton
          aria-label='分割片段'
          disabled={!canSplitAtPlayhead}
          onClick={splitAtPlayhead}
          title='分割片段 Ctrl+B'
        >
          <SquareSplitHorizontal aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label='删除选中片段'
          disabled={!selectedClipId}
          onClick={deleteSelectedClip}
          title='删除选中片段 Backspace'
        >
          <Trash2 aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label={selectedClip?.hidden ? '显示选中片段' : '隐藏选中片段'}
          aria-pressed={selectedClip?.hidden ?? false}
          disabled={!selectedClip}
          onClick={() => {
            if (selectedClip) {
              setClipHidden(selectedClip.id, !selectedClip.hidden);
            }
          }}
          title={selectedClip?.hidden ? '显示选中片段' : '隐藏选中片段'}
        >
          {selectedClip?.hidden ? (
            <Eye aria-hidden='true' />
          ) : (
            <EyeOff aria-hidden='true' />
          )}
        </IconButton>
        {onRequestImport && (
          <IconButton
            aria-label='导入素材'
            onClick={onRequestImport}
            title='导入素材'
          >
            <FilePlus2 aria-hidden='true' />
          </IconButton>
        )}
        <IconButton
          aria-label='添加标题'
          onClick={() => onRequestAddTitle?.()}
          title='添加标题'
        >
          <TypeIcon aria-hidden='true' />
        </IconButton>
      </div>

      <div className='ec-timeline-toolbar__transport'>
        <time
          className='ec-timeline-toolbar__time'
          dateTime={formatTimelineDateTime(currentTimeUs)}
        >
          {formatTimelineTime(currentTimeUs)}
        </time>
        <IconButton
          aria-label={isPlaying ? '暂停时间线' : '播放时间线'}
          onClick={() => setIsPlaying(!isPlaying)}
          title={`${isPlaying ? '暂停时间线' : '播放时间线'} Space`}
        >
          {isPlaying ? <Pause aria-hidden='true' /> : <Play aria-hidden='true' />}
        </IconButton>
        <time
          className='ec-timeline-toolbar__time ec-timeline-toolbar__time--muted'
          dateTime={formatTimelineDateTime(duration)}
        >
          {formatTimelineTime(duration)}
        </time>
        <IconButton
          aria-label='全屏预览'
          onClick={onRequestPreviewFullscreen}
          title='全屏预览'
        >
          <Maximize aria-hidden='true' />
        </IconButton>
      </div>

      <div className='ec-timeline-toolbar__group ec-timeline-toolbar__group--end'>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <IconButton
              aria-label='查看快捷键'
              title='查看快捷键'
            >
              <Keyboard aria-hidden='true' />
            </IconButton>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className='ec-shortcuts-dialog__overlay' />
            <Dialog.Content className='ec-shortcuts-dialog'>
              <div className='ec-shortcuts-dialog__header'>
                <Dialog.Title className='ec-shortcuts-dialog__title'>
                  快捷键
                </Dialog.Title>
                <Dialog.Close asChild>
                  <IconButton
                    aria-label='关闭快捷键弹窗'
                    title='关闭'
                  >
                    <X aria-hidden='true' size={17} />
                  </IconButton>
                </Dialog.Close>
              </div>
              <div className='ec-shortcuts-dialog__groups'>
                {timelineShortcutGroups.map((group) => (
                  <section
                    aria-labelledby={`ec-shortcuts-group-${group.id}`}
                    className='ec-shortcuts-dialog__group'
                    key={group.id}
                  >
                    <h3 id={`ec-shortcuts-group-${group.id}`}>
                      {group.title}
                    </h3>
                    <dl className='ec-shortcuts__list'>
                      {group.items.map((item) => (
                        <div className='ec-shortcuts__item' key={item.action}>
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
        <IconButton
          aria-label='播放头跟随'
          aria-pressed={playheadFollowEnabled}
          onClick={togglePlayheadFollow}
          title='播放头跟随'
        >
          <TextCursorInput aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label='时间轴吸附'
          aria-pressed={snappingEnabled}
          onClick={toggleSnapping}
          title='时间轴吸附'
        >
          <Magnet aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label='画布辅助线'
          aria-pressed={canvasSnappingEnabled}
          onClick={toggleCanvasSnapping}
          title='画布辅助线'
        >
          <ScanLine aria-hidden='true' />
        </IconButton>
        <IconButton
          aria-label='缩小'
          disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
          onClick={() =>
            setPixelsPerSecond(
              Math.max(
                MIN_PIXELS_PER_SECOND,
                pixelsPerSecond - TIMELINE_ZOOM_STEP,
              ),
            )
          }
          title='缩小'
        >
          <ZoomOut aria-hidden='true' />
        </IconButton>
        <input
          aria-label='时间轴缩放'
          className='ec-range-input ec-timeline-toolbar__zoom'
          max={MAX_PIXELS_PER_SECOND}
          min={MIN_PIXELS_PER_SECOND}
          onChange={(event) => setPixelsPerSecond(Number(event.target.value))}
          type='range'
          value={pixelsPerSecond}
        />
        <IconButton
          aria-label='放大'
          disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
          onClick={() =>
            setPixelsPerSecond(
              Math.min(
                MAX_PIXELS_PER_SECOND,
                pixelsPerSecond + TIMELINE_ZOOM_STEP,
              ),
            )
          }
          title='放大'
        >
          <ZoomIn aria-hidden='true' />
        </IconButton>
      </div>
    </div>
  );
}
