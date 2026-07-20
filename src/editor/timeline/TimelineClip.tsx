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

import { useAudioWaveformSamples, useFramePreviewUrls } from '../media';
import { TIMELINE_AUDIO_CLIP_HEIGHT } from '../core/timeline-layout';
import { roundTimelineTime } from '../core/timeline-math';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';
import { formatTimelineTime } from '../util/format-timeline-time';

const PREVIEW_TILE_WIDTH = 96;
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
  trackVolume: number;
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
  width: number,
  trackVolume: number,
) => {
  const previewCount = Math.max(
    1,
    Math.min(24, Math.ceil(Math.max(0, width) / PREVIEW_TILE_WIDTH)),
  );
  const generatedPreviews = useFramePreviewUrls(
    clip,
    previewCount,
    clip.type === 'video',
  );
  const waveformSamples = useAudioWaveformSamples(
    clip.waveformSrc ?? clip.src,
    clip.type === 'audio',
  );
  const waveformPath = useMemo(
    () => createWaveformPath(getVisibleSamples(waveformSamples, clip)),
    [clip, waveformSamples],
  );

  return {
    previews: generatedPreviews,
    volume: clampUnit(trackVolume),
    waveformPath,
  };
};

type TimelineClipVisualProps = {
  clip: TimelineClip;
  previews: readonly (string | null)[];
  waveformPath: string;
};

function TimelineClipVisual({
  clip,
  previews,
  waveformPath,
}: TimelineClipVisualProps) {
  return (
    <>
      <div className='oc-timeline-clip__media'>
        {clip.type === 'video' ? (
          <div className='oc-timeline-clip__preview-strip' aria-hidden='true'>
            {previews.map((url, index) =>
              url ? (
                <img
                  alt=''
                  className='oc-timeline-clip__thumbnail'
                  decoding='async'
                  draggable={false}
                  key={`${url}-${index}`}
                  src={url}
                />
              ) : null,
            )}
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
  trackVolume,
  width,
}: TimelineClipViewProps) {
  const [contextMenuTime, setContextMenuTime] = useState(clip.start);
  const { previews, volume, waveformPath } = useTimelineClipPresentation(
    clip,
    width,
    trackVolume,
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
            previews={previews}
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
  top: number;
  trackVolume: number;
  width: number;
};

export function TimelineClipDragOverlay({
  clip,
  height,
  left,
  top,
  trackVolume,
  width,
}: TimelineClipDragOverlayProps) {
  const { previews, volume, waveformPath } = useTimelineClipPresentation(
    clip,
    width,
    trackVolume,
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
        previews={previews}
        waveformPath={waveformPath}
      />
    </div>
  );
}
