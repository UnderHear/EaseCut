import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  ClipboardPaste,
  Copy,
  Download,
  SquareSplitHorizontal,
  Trash2,
} from 'lucide-react';

import {
  FRAME_PREVIEW_CHUNK_DURATION_SECONDS,
  useAudioWaveformSamples,
  useFramePreviewStrip,
  type FramePreviewRequest,
  type FramePreviewStrip,
} from '../media';
import { TIMELINE_AUDIO_CLIP_HEIGHT } from '../core/timeline-layout';
import { roundTimelineTime } from '../core/timeline-math';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';
import { formatTimelineTime } from '../util/format-timeline-time';

const WAVEFORM_HEIGHT = 100;
const WAVEFORM_AMPLITUDE = 44;
const AUDIO_VOLUME_INSET = 8;

export type TimelineClipViewProps = {
  canPaste: boolean;
  canSplitAt: (time: number) => boolean;
  clip: TimelineClip;
  isSelected: boolean;
  left: number;
  onCopy: () => void;
  onDelete: () => void;
  onDownload: () => void | Promise<void>;
  onMoveStart: (event: PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  onPaste: () => void;
  onSelect: (clipId: string) => void;
  onSplit: (time: number) => void;
  onTrimStart: (
    event: PointerEvent<HTMLElement>,
    clip: TimelineClip,
    edge: TimelineClipTrimEdge,
  ) => void;
  onVolumeStart: (event: PointerEvent<HTMLElement>, trackId: string) => void;
  pixelsPerSecond: number;
  trackVolume: number;
  visibleTimeEnd: number;
  visibleTimeStart: number;
  width: number;
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const createWaveformPath = (samples: readonly number[]) => {
  if (samples.length === 0) return '';

  const denominator = Math.max(1, samples.length - 1);
  const point = (sample: number, index: number, direction: -1 | 1) =>
    `${index === 0 ? 'M' : 'L'} ${(index / denominator) * 100} ${
      WAVEFORM_HEIGHT / 2 + direction * clampUnit(sample) * WAVEFORM_AMPLITUDE
    }`;
  const top = samples.map((sample, index) => point(sample, index, -1));
  const bottom = [...samples].reverse().map((sample, index) =>
    point(sample, samples.length - index - 1, 1).replace('M', 'L'),
  );

  return `${top.join(' ')} ${bottom.join(' ')} Z`;
};

const getVisibleSamples = (samples: readonly number[], clip: TimelineClip) => {
  if (samples.length === 0) return samples;

  const sourceDuration = Math.max(clip.sourceDuration, clip.trimEnd, 0.001);
  const start = Math.floor(
    clampUnit(clip.trimStart / sourceDuration) * samples.length,
  );
  const end = Math.ceil(
    clampUnit(clip.trimEnd / sourceDuration) * samples.length,
  );
  return samples.slice(start, Math.max(start + 1, end));
};

const useTimelineClipPresentation = (
  clip: TimelineClip,
  pixelsPerSecond: number,
  timelineStart: number,
  trackVolume: number,
  visibleTimeEnd: number,
  visibleTimeStart: number,
) => {
  const previewRequest = useMemo<FramePreviewRequest | null>(() => {
    if (
      clip.type !== 'video' ||
      timelineStart >= visibleTimeEnd ||
      timelineStart + clip.duration <= visibleTimeStart
    ) {
      return null;
    }

    const viewportDuration = Math.max(0, visibleTimeEnd - visibleTimeStart);
    const sourceTimelineStart = timelineStart - clip.trimStart;
    const rawRangeStart = Math.max(
      0,
      visibleTimeStart - sourceTimelineStart - viewportDuration,
    );
    const rawRangeEnd = Math.min(
      clip.sourceDuration,
      visibleTimeEnd - sourceTimelineStart + viewportDuration,
    );
    const rangeStart = Math.max(
      0,
      Math.floor(
        rawRangeStart / FRAME_PREVIEW_CHUNK_DURATION_SECONDS,
      ) * FRAME_PREVIEW_CHUNK_DURATION_SECONDS,
    );
    const rangeEnd = Math.min(
      clip.sourceDuration,
      Math.ceil(rawRangeEnd / FRAME_PREVIEW_CHUNK_DURATION_SECONDS) *
        FRAME_PREVIEW_CHUNK_DURATION_SECONDS,
    );
    if (rangeEnd <= rangeStart) return null;

    return {
      pixelsPerSecond,
      rangeEnd,
      rangeStart,
      sourceDuration: clip.sourceDuration,
      src: clip.src,
    };
  }, [
    clip.duration,
    clip.sourceDuration,
    clip.src,
    clip.trimStart,
    clip.type,
    pixelsPerSecond,
    timelineStart,
    visibleTimeEnd,
    visibleTimeStart,
  ]);
  const previewStrip = useFramePreviewStrip(previewRequest);
  const waveformSamples = useAudioWaveformSamples(
    clip.waveformSrc ?? clip.src,
    clip.type === 'audio',
  );
  const waveformPath = useMemo(
    () => createWaveformPath(getVisibleSamples(waveformSamples, clip)),
    [clip, waveformSamples],
  );

  return {
    previewOffset: clip.trimStart * pixelsPerSecond,
    previewStrip,
    volume: clampUnit(trackVolume),
    waveformPath,
  };
};

type TimelineClipVisualProps = {
  clip: TimelineClip;
  pixelsPerSecond: number;
  previewOffset: number;
  previewStrip: FramePreviewStrip | null;
  waveformPath: string;
};

function TimelineClipVisual({
  clip,
  pixelsPerSecond,
  previewOffset,
  previewStrip,
  waveformPath,
}: TimelineClipVisualProps) {
  const previewScale =
    previewStrip && previewStrip.pixelsPerSecond > 0
      ? pixelsPerSecond / previewStrip.pixelsPerSecond
      : 1;

  return (
    <>
      <div className='oc-timeline-clip__media'>
        {clip.type === 'video' ? (
          <div
            className='oc-timeline-clip__preview-strip'
            aria-hidden='true'
            style={{ transform: `translate3d(${-previewOffset}px, -50%, 0)` }}
          >
            {previewStrip?.frames.map((frame) => (
              <img
                alt=''
                className='oc-timeline-clip__thumbnail'
                decoding='async'
                draggable={false}
                key={frame.index}
                src={frame.url}
                style={{
                  left:
                    frame.index *
                    previewStrip.frameWidth *
                    previewScale,
                  width: previewStrip.frameWidth * previewScale,
                }}
              />
            ))}
          </div>
        ) : (
          <svg
            aria-hidden='true'
            className='oc-timeline-clip__waveform'
            preserveAspectRatio='none'
            viewBox={`0 0 100 ${WAVEFORM_HEIGHT}`}
          >
            <path className='oc-timeline-clip__waveform-shape' d={waveformPath} />
          </svg>
        )}
      </div>

      <header className='oc-timeline-clip__meta'>
        <span className='oc-timeline-clip__name' title={clip.name}>
          {clip.name}
        </span>
        <time
          className='oc-timeline-clip__duration'
          dateTime={`PT${Math.max(0, clip.duration)}S`}
        >
          {formatTimelineTime(clip.duration)}
        </time>
      </header>
    </>
  );
}

export function TimelineClipView({
  canPaste,
  canSplitAt,
  clip,
  isSelected,
  left,
  onCopy,
  onDelete,
  onDownload,
  onMoveStart,
  onPaste,
  onSelect,
  onSplit,
  onTrimStart,
  onVolumeStart,
  pixelsPerSecond,
  trackVolume,
  visibleTimeEnd,
  visibleTimeStart,
  width,
}: TimelineClipViewProps) {
  const [contextMenuTime, setContextMenuTime] = useState(clip.start);
  const { previewOffset, previewStrip, volume, waveformPath } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      clip.start,
      trackVolume,
      visibleTimeEnd,
      visibleTimeStart,
    );
  const style = {
    '--oc-timeline-clip-volume-y': `${
      AUDIO_VOLUME_INSET +
      (1 - volume) *
        (TIMELINE_AUDIO_CLIP_HEIGHT - AUDIO_VOLUME_INSET * 2)
    }px`,
    left,
    width,
  } as CSSProperties;
  const startTrim = (edge: TimelineClipTrimEdge) =>
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (event.button === 0) onTrimStart(event, clip, edge);
    };
  const isTrimmedAt = (edge: TimelineClipTrimEdge) =>
    edge === 'start'
      ? clip.trimStart > 0
      : clip.trimEnd < clip.sourceDuration;
  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerRatio =
      bounds.width > 0
        ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
        : 0;
    setContextMenuTime(
      roundTimelineTime(clip.start + clip.duration * pointerRatio),
    );
    onSelect(clip.id);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <article
          aria-label={`${clip.type} clip: ${clip.name}`}
          className='oc-timeline-clip'
          data-clip-id={clip.id}
          data-selected={isSelected}
          data-type={clip.type}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={handleContextMenu}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            onSelect(clip.id);
            onMoveStart(event, clip);
          }}
          style={style}
        >
          <TimelineClipVisual
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            previewOffset={previewOffset}
            previewStrip={previewStrip}
            waveformPath={waveformPath}
          />

          {clip.type === 'audio' && (
            <button
              aria-label={`Adjust ${clip.name} volume, ${Math.round(volume * 100)} percent`}
              className='oc-timeline-clip__volume'
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button === 0) onVolumeStart(event, clip.trackId);
              }}
              type='button'
            >
              <span className='oc-timeline-clip__volume-line' />
            </button>
          )}

          {isSelected &&
            (['start', 'end'] as const).map((edge) => (
              <button
                aria-label={`Trim ${edge} of ${clip.name}`}
                className='oc-timeline-clip__trim-handle'
                data-edge={edge}
                data-trimmed={isTrimmedAt(edge)}
                key={edge}
                onPointerDown={startTrim(edge)}
                type='button'
              />
            ))}
        </article>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`${clip.name} 操作菜单`}
          className='oc-clip-context-menu'
          collisionPadding={8}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ContextMenu.Item
            className='oc-clip-context-menu__item'
            disabled={!canSplitAt(contextMenuTime)}
            onSelect={() => onSplit(contextMenuTime)}
          >
            <SquareSplitHorizontal aria-hidden='true' />
            <span>分割</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className='oc-clip-context-menu__separator' />
          <ContextMenu.Item
            className='oc-clip-context-menu__item'
            onSelect={onCopy}
          >
            <Copy aria-hidden='true' />
            <span>复制</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className='oc-clip-context-menu__item'
            disabled={!canPaste}
            onSelect={onPaste}
          >
            <ClipboardPaste aria-hidden='true' />
            <span>粘贴</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className='oc-clip-context-menu__separator' />
          <ContextMenu.Item
            className='oc-clip-context-menu__item'
            onSelect={() => void onDownload()}
          >
            <Download aria-hidden='true' />
            <span>下载原始素材</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className='oc-clip-context-menu__separator' />
          <ContextMenu.Item
            className='oc-clip-context-menu__item oc-clip-context-menu__item--danger'
            onSelect={onDelete}
          >
            <Trash2 aria-hidden='true' />
            <span>删除</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

type TimelineClipDragOverlayProps = {
  clip: TimelineClip;
  height: number;
  left: number;
  pixelsPerSecond: number;
  timelineStart: number;
  top: number;
  trackVolume: number;
  visibleTimeEnd: number;
  visibleTimeStart: number;
  width: number;
};

export function TimelineClipDragOverlay({
  clip,
  height,
  left,
  pixelsPerSecond,
  timelineStart,
  top,
  trackVolume,
  visibleTimeEnd,
  visibleTimeStart,
  width,
}: TimelineClipDragOverlayProps) {
  const { previewOffset, previewStrip, volume, waveformPath } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      timelineStart,
      trackVolume,
      visibleTimeEnd,
      visibleTimeStart,
    );
  const style = {
    '--oc-timeline-clip-volume-y': `${
      AUDIO_VOLUME_INSET +
      (1 - volume) *
        (TIMELINE_AUDIO_CLIP_HEIGHT - AUDIO_VOLUME_INSET * 2)
    }px`,
    height,
    left,
    top,
    width,
  } as CSSProperties;

  return (
    <div
      aria-hidden='true'
      className='oc-timeline-clip oc-timeline-clip--drag-overlay'
      data-type={clip.type}
      style={style}
    >
      <TimelineClipVisual
        clip={clip}
        pixelsPerSecond={pixelsPerSecond}
        previewOffset={previewOffset}
        previewStrip={previewStrip}
        waveformPath={waveformPath}
      />
    </div>
  );
}
