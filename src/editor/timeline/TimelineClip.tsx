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
  FRAME_PREVIEW_CHUNK_DURATION_US,
  HIGH_RESOLUTION_AUDIO_WAVEFORM_SAMPLE_COUNT,
  useAudioWaveformSamples,
  useFramePreviewStrip,
  type FramePreviewRequest,
  type FramePreviewStrip,
} from '../media';
import {
  getAudioWaveformRenderWindow,
  type AudioWaveformRenderWindow,
} from '../core/audio-waveform-bars';
import { TIMELINE_AUDIO_CLIP_HEIGHT } from '../core/timeline-layout';
import {
  durationUsToWidth,
  normalizeTimelineTimeUs,
} from '../core/timeline-math';
import { microsecondsToSeconds } from '../core/time';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';
import { formatTimelineTime } from '../util/format-timeline-time';
import { AudioWaveformCanvas } from './AudioWaveformCanvas';

const AUDIO_VOLUME_INSET = 8;

export type TimelineClipViewProps = {
  canPaste: boolean;
  canSplitAt: (timeUs: number) => boolean;
  clip: TimelineClip;
  isSelected: boolean;
  left: number;
  onCopy: () => void;
  onDelete: () => void;
  onDownload: () => void | Promise<void>;
  onMoveStart: (event: PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  onPaste: () => void;
  onSelect: (clipId: string) => void;
  onSplit: (timeUs: number) => void;
  onTrimStart: (
    event: PointerEvent<HTMLElement>,
    clip: TimelineClip,
    edge: TimelineClipTrimEdge,
  ) => void;
  onVolumeStart: (event: PointerEvent<HTMLElement>, trackId: string) => void;
  pixelsPerSecond: number;
  trackVolume: number;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
  width: number;
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const useTimelineClipPresentation = (
  clip: TimelineClip,
  pixelsPerSecond: number,
  timelineStartUs: number,
  trackVolume: number,
  visibleTimeEndUs: number,
  visibleTimeStartUs: number,
) => {
  const previewRequest = useMemo<FramePreviewRequest | null>(() => {
    if (
      clip.type !== 'video' ||
      timelineStartUs >= visibleTimeEndUs ||
      timelineStartUs + clip.durationUs <= visibleTimeStartUs
    ) {
      return null;
    }

    const viewportDurationUs = Math.max(
      0,
      visibleTimeEndUs - visibleTimeStartUs,
    );
    const sourceTimelineStartUs = timelineStartUs - clip.trimStartUs;
    const rawRangeStartUs = Math.max(
      0,
      visibleTimeStartUs - sourceTimelineStartUs - viewportDurationUs,
    );
    const rawRangeEndUs = Math.min(
      clip.sourceDurationUs,
      visibleTimeEndUs - sourceTimelineStartUs + viewportDurationUs,
    );
    const rangeStartUs = Math.max(
      0,
      Math.floor(
        rawRangeStartUs / FRAME_PREVIEW_CHUNK_DURATION_US,
      ) * FRAME_PREVIEW_CHUNK_DURATION_US,
    );
    const rangeEndUs = Math.min(
      clip.sourceDurationUs,
      Math.ceil(rawRangeEndUs / FRAME_PREVIEW_CHUNK_DURATION_US) *
        FRAME_PREVIEW_CHUNK_DURATION_US,
    );
    if (rangeEndUs <= rangeStartUs) return null;

    return {
      pixelsPerSecond,
      rangeEndUs,
      rangeStartUs,
      sourceDurationUs: clip.sourceDurationUs,
      src: clip.src,
    };
  }, [
    clip.durationUs,
    clip.sourceDurationUs,
    clip.src,
    clip.trimStartUs,
    clip.type,
    pixelsPerSecond,
    timelineStartUs,
    visibleTimeEndUs,
    visibleTimeStartUs,
  ]);
  const previewStrip = useFramePreviewStrip(previewRequest);
  const waveformRenderWindow = useMemo(
    () =>
      clip.type === 'audio'
        ? getAudioWaveformRenderWindow({
            clipDurationUs: clip.durationUs,
            pixelsPerSecond,
            timelineStartUs,
            trimStartUs: clip.trimStartUs,
            visibleTimeEndUs,
            visibleTimeStartUs,
          })
        : null,
    [
      clip.durationUs,
      clip.trimStartUs,
      clip.type,
      pixelsPerSecond,
      timelineStartUs,
      visibleTimeEndUs,
      visibleTimeStartUs,
    ],
  );
  const waveformSamples = useAudioWaveformSamples(
    clip.waveformSrc ?? clip.src,
    waveformRenderWindow !== null,
    HIGH_RESOLUTION_AUDIO_WAVEFORM_SAMPLE_COUNT,
  );

  return {
    previewOffset: durationUsToWidth(clip.trimStartUs, pixelsPerSecond),
    previewStrip,
    volume: clampUnit(trackVolume),
    waveformRenderWindow,
    waveformSamples,
  };
};

type TimelineClipVisualProps = {
  clip: TimelineClip;
  pixelsPerSecond: number;
  previewOffset: number;
  previewStrip: FramePreviewStrip | null;
  waveformRenderWindow: AudioWaveformRenderWindow | null;
  waveformSamples: readonly number[];
  volume: number;
};

function TimelineClipVisual({
  clip,
  pixelsPerSecond,
  previewOffset,
  previewStrip,
  waveformRenderWindow,
  waveformSamples,
  volume,
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
        ) : waveformRenderWindow ? (
          <AudioWaveformCanvas
            left={waveformRenderWindow.left}
            pixelsPerSecond={pixelsPerSecond}
            renderWidth={waveformRenderWindow.width}
            samples={waveformSamples}
            sourceDurationUs={clip.sourceDurationUs}
            sourceStartUs={waveformRenderWindow.sourceStartUs}
            volume={volume}
          />
        ) : null}
      </div>

      <header className='oc-timeline-clip__meta'>
        <span className='oc-timeline-clip__name' title={clip.name}>
          {clip.name}
        </span>
        <time
          className='oc-timeline-clip__duration'
          dateTime={`PT${microsecondsToSeconds(
            Math.max(0, clip.durationUs),
          )}S`}
        >
          {formatTimelineTime(clip.durationUs)}
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
  visibleTimeEndUs,
  visibleTimeStartUs,
  width,
}: TimelineClipViewProps) {
  const [contextMenuTimeUs, setContextMenuTimeUs] = useState(clip.startUs);
  const {
    previewOffset,
    previewStrip,
    volume,
    waveformRenderWindow,
    waveformSamples,
  } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      clip.startUs,
      trackVolume,
      visibleTimeEndUs,
      visibleTimeStartUs,
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
      ? clip.trimStartUs > 0
      : clip.trimEndUs < clip.sourceDurationUs;
  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerRatio =
      bounds.width > 0
        ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
        : 0;
    setContextMenuTimeUs(
      normalizeTimelineTimeUs(clip.startUs + clip.durationUs * pointerRatio),
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
            waveformRenderWindow={waveformRenderWindow}
            waveformSamples={waveformSamples}
            volume={volume}
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
            disabled={!canSplitAt(contextMenuTimeUs)}
            onSelect={() => onSplit(contextMenuTimeUs)}
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
  timelineStartUs: number;
  top: number;
  trackVolume: number;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
  width: number;
};

export function TimelineClipDragOverlay({
  clip,
  height,
  left,
  pixelsPerSecond,
  timelineStartUs,
  top,
  trackVolume,
  visibleTimeEndUs,
  visibleTimeStartUs,
  width,
}: TimelineClipDragOverlayProps) {
  const {
    previewOffset,
    previewStrip,
    volume,
    waveformRenderWindow,
    waveformSamples,
  } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      timelineStartUs,
      trackVolume,
      visibleTimeEndUs,
      visibleTimeStartUs,
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
        waveformRenderWindow={waveformRenderWindow}
        waveformSamples={waveformSamples}
        volume={volume}
      />
    </div>
  );
}
