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
  Eye,
  EyeOff,
  SquareSplitHorizontal,
  Trash2,
} from 'lucide-react';

import {
  FRAME_PREVIEW_CHUNK_DURATION_US,
  HIGH_RESOLUTION_AUDIO_WAVEFORM_SAMPLE_COUNT,
  useAudioWaveformSamples,
  useFramePreviewStrip,
  useMediaObjectUrl,
  type FramePreviewRequest,
  type FramePreviewStrip,
} from '../media';
import {
  getAudioWaveformTiles,
  type AudioWaveformTile,
} from '../core/audio-waveform-bars';
import {
  getSpeedAdjustedPixelsPerSecond,
  scaleTimelineOffsetToSourceUs,
} from '../core/clip-speed';
import {
  isTimelineMediaClip,
  isTimelineTimedMediaClip,
} from '../core/model';
import { TIMELINE_AUDIO_CLIP_HEIGHT } from '../core/timeline-layout';
import {
  durationUsToWidth,
  normalizeTimelineTimeUs,
} from '../core/timeline-math';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';
import { getTimelineClipLabel } from '../util/format-media-label';
import {
  formatTimelineDateTime,
  formatTimelineTime,
} from '../util/format-timeline-time';
import { clampNumber } from '../util/number';
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
  onHiddenChange: (hidden: boolean) => void;
  onMoveStart: (event: PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  onPaste: () => void;
  onSelect: (clipId: string) => void;
  onSplit: (timeUs: number) => void;
  onTrimStart: (
    event: PointerEvent<HTMLElement>,
    clip: TimelineClip,
    edge: TimelineClipTrimEdge,
  ) => void;
  onVolumeStart: (event: PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  pixelsPerSecond: number;
  showClipInfo: boolean;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
  width: number;
};

const useTimelineClipPresentation = (
  clip: TimelineClip,
  pixelsPerSecond: number,
  timelineStartUs: number,
  visibleTimeEndUs: number,
  visibleTimeStartUs: number,
) => {
  const mediaSourceDurationUs = isTimelineTimedMediaClip(clip)
    ? clip.sourceDurationUs
    : 0;
  const mediaSpeed = isTimelineTimedMediaClip(clip) ? clip.speed : 1;
  const mediaSrc = clip.type === 'text' ? '' : clip.src;
  const imageSrc = clip.type === 'image' ? clip.src : '';
  const imageInput = useMemo(
    () => ({
      src: imageSrc,
      type: 'image' as const,
    }),
    [imageSrc],
  );
  const mediaTrimStartUs = isTimelineTimedMediaClip(clip)
    ? clip.trimStartUs
    : 0;
  const imageUrl = useMediaObjectUrl(imageInput, clip.type === 'image');
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
    const sourcePixelsPerSecond = getSpeedAdjustedPixelsPerSecond(
      pixelsPerSecond,
      mediaSpeed,
    );
    const visibleSourceStartUs =
      mediaTrimStartUs +
      scaleTimelineOffsetToSourceUs(
        visibleTimeStartUs - timelineStartUs,
        mediaSpeed,
      );
    const visibleSourceEndUs =
      mediaTrimStartUs +
      scaleTimelineOffsetToSourceUs(
        visibleTimeEndUs - timelineStartUs,
        mediaSpeed,
      );
    const sourceOverscanUs = scaleTimelineOffsetToSourceUs(
      viewportDurationUs,
      mediaSpeed,
    );
    const rawRangeStartUs = Math.max(
      0,
      visibleSourceStartUs - sourceOverscanUs,
    );
    const rawRangeEndUs = Math.min(
      mediaSourceDurationUs,
      visibleSourceEndUs + sourceOverscanUs,
    );
    const rangeStartUs = Math.max(
      0,
      Math.floor(
        rawRangeStartUs / FRAME_PREVIEW_CHUNK_DURATION_US,
      ) * FRAME_PREVIEW_CHUNK_DURATION_US,
    );
    const rangeEndUs = Math.min(
      mediaSourceDurationUs,
      Math.ceil(rawRangeEndUs / FRAME_PREVIEW_CHUNK_DURATION_US) *
        FRAME_PREVIEW_CHUNK_DURATION_US,
    );
    if (rangeEndUs <= rangeStartUs) return null;

    return {
      pixelsPerSecond: sourcePixelsPerSecond,
      rangeEndUs,
      rangeStartUs,
      sourceDurationUs: mediaSourceDurationUs,
      src: mediaSrc,
    };
  }, [
    clip.durationUs,
    mediaSourceDurationUs,
    mediaSpeed,
    mediaSrc,
    mediaTrimStartUs,
    clip.type,
    pixelsPerSecond,
    timelineStartUs,
    visibleTimeEndUs,
    visibleTimeStartUs,
  ]);
  const previewStrip = useFramePreviewStrip(previewRequest);
  const waveformTiles = useMemo(
    () =>
      clip.type === 'audio'
        ? getAudioWaveformTiles({
            clipDurationUs: clip.durationUs,
            pixelsPerSecond,
            speed: mediaSpeed,
            timelineStartUs,
            trimStartUs: mediaTrimStartUs,
            visibleTimeEndUs,
            visibleTimeStartUs,
          })
        : [],
    [
      clip.durationUs,
      mediaSpeed,
      mediaTrimStartUs,
      clip.type,
      pixelsPerSecond,
      timelineStartUs,
      visibleTimeEndUs,
      visibleTimeStartUs,
    ],
  );
  const waveformSamples = useAudioWaveformSamples(
    clip.type === 'audio' ? (clip.waveformSrc ?? clip.src) : '',
    waveformTiles.length > 0,
    HIGH_RESOLUTION_AUDIO_WAVEFORM_SAMPLE_COUNT,
  );

  return {
    imageUrl,
    previewStrip,
    volume: isTimelineTimedMediaClip(clip)
      ? clampNumber(clip.volume, 0, 1)
      : 1,
    waveformTiles,
    waveformSamples,
  };
};

type TimelineClipVisualProps = {
  clip: TimelineClip;
  imageUrl: string | null;
  pixelsPerSecond: number;
  previewStrip: FramePreviewStrip | null;
  showClipInfo: boolean;
  waveformTiles: readonly AudioWaveformTile[];
  waveformSamples: readonly number[];
  volume: number;
};

function TimelineClipVisual({
  clip,
  imageUrl,
  pixelsPerSecond,
  previewStrip,
  showClipInfo,
  waveformTiles,
  waveformSamples,
  volume,
}: TimelineClipVisualProps) {
  const previewPixelsPerSecond =
    previewStrip?.pixelsPerSecond ??
    getSpeedAdjustedPixelsPerSecond(
      pixelsPerSecond,
      isTimelineTimedMediaClip(clip) ? clip.speed : 1,
    );
  const previewOffset = durationUsToWidth(
    isTimelineTimedMediaClip(clip) ? clip.trimStartUs : 0,
    previewPixelsPerSecond,
  );

  return (
    <>
      <div className='ec-timeline-clip__media'>
        {clip.type === 'text' ? (
          <div aria-hidden='true' className='ec-timeline-clip__text-preview'>
            {clip.text}
          </div>
        ) : clip.type === 'video' ? (
          <div
            className='ec-timeline-clip__preview-strip'
            aria-hidden='true'
            style={{ transform: `translate3d(${-previewOffset}px, -50%, 0)` }}
          >
            {previewStrip?.frames.map((frame) => (
              <img
                alt=''
                className='ec-timeline-clip__thumbnail'
                decoding='async'
                draggable={false}
                key={frame.index}
                src={frame.url}
                style={{
                  left: frame.index * previewStrip.frameWidth,
                  width: previewStrip.frameWidth,
                }}
              />
            ))}
          </div>
        ) : clip.type === 'image' ? (
          <div
            aria-hidden='true'
            className='ec-timeline-clip__image-preview'
            style={{
              backgroundImage: imageUrl
                ? `url(${JSON.stringify(imageUrl)})`
                : undefined,
            }}
          />
        ) : (
          waveformTiles.map((tile) => (
            <AudioWaveformCanvas
              key={`${pixelsPerSecond}:${clip.speed}:${tile.sourceStartUs}:${tile.index}:${tile.width}`}
              left={tile.left}
              pixelsPerSecond={getSpeedAdjustedPixelsPerSecond(
                pixelsPerSecond,
                clip.speed,
              )}
              samples={waveformSamples}
              sourceDurationUs={clip.sourceDurationUs}
              sourceStartUs={tile.sourceStartUs}
              tileIndex={tile.index}
              volume={volume}
              width={tile.width}
            />
          ))
        )}
      </div>

      {showClipInfo ? (
        <header className='ec-timeline-clip__meta'>
          <span
            className='ec-timeline-clip__name'
            title={getTimelineClipLabel(clip)}
          >
            {getTimelineClipLabel(clip)}
          </span>
          <time
            className='ec-timeline-clip__duration'
            dateTime={formatTimelineDateTime(Math.max(0, clip.durationUs))}
          >
            {formatTimelineTime(clip.durationUs)}
          </time>
        </header>
      ) : null}
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
  onHiddenChange,
  onMoveStart,
  onPaste,
  onSelect,
  onSplit,
  onTrimStart,
  onVolumeStart,
  pixelsPerSecond,
  showClipInfo,
  visibleTimeEndUs,
  visibleTimeStartUs,
  width,
}: TimelineClipViewProps) {
  const [contextMenuTimeUs, setContextMenuTimeUs] = useState(clip.startUs);
  const {
    imageUrl,
    previewStrip,
    volume,
    waveformTiles,
    waveformSamples,
  } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      clip.startUs,
      visibleTimeEndUs,
      visibleTimeStartUs,
    );
  const style = {
    '--ec-timeline-clip-volume-y': `${
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
    isTimelineTimedMediaClip(clip) &&
    (
      edge === 'start'
        ? clip.trimStartUs > 0
        : clip.trimEndUs < clip.sourceDurationUs
    );
  const clipLabel = getTimelineClipLabel(clip);
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
          aria-label={`${clip.type} clip: ${clipLabel}${clip.hidden ? '，已隐藏' : ''}`}
          className='ec-timeline-clip'
          data-clip-id={clip.id}
          data-hidden={clip.hidden}
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
            imageUrl={imageUrl}
            pixelsPerSecond={pixelsPerSecond}
            previewStrip={previewStrip}
            showClipInfo={showClipInfo}
            waveformTiles={waveformTiles}
            waveformSamples={waveformSamples}
            volume={volume}
          />

          {clip.type === 'audio' && (
            <button
              aria-label={`Adjust ${clipLabel} volume, ${Math.round(volume * 100)} percent`}
              className='ec-timeline-clip__volume'
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button === 0) onVolumeStart(event, clip);
              }}
              type='button'
            >
              <span className='ec-timeline-clip__volume-line' />
            </button>
          )}

          {isSelected &&
            (['start', 'end'] as const).map((edge) => (
              <button
                aria-label={`Trim ${edge} of ${clipLabel}`}
                className='ec-timeline-clip__trim-handle'
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
          aria-label={`${clipLabel} 操作菜单`}
          className='ec-clip-context-menu'
          collisionPadding={8}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ContextMenu.Item
            className='ec-clip-context-menu__item'
            disabled={!canSplitAt(contextMenuTimeUs)}
            onSelect={() => onSplit(contextMenuTimeUs)}
          >
            <SquareSplitHorizontal aria-hidden='true' />
            <span>分割</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className='ec-clip-context-menu__separator' />
          <ContextMenu.Item
            className='ec-clip-context-menu__item'
            onSelect={onCopy}
          >
            <Copy aria-hidden='true' />
            <span>复制</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className='ec-clip-context-menu__item'
            disabled={!canPaste}
            onSelect={onPaste}
          >
            <ClipboardPaste aria-hidden='true' />
            <span>粘贴</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className='ec-clip-context-menu__separator' />
          <ContextMenu.Item
            className='ec-clip-context-menu__item'
            onSelect={() => onHiddenChange(!clip.hidden)}
          >
            {clip.hidden ? (
              <Eye aria-hidden='true' />
            ) : (
              <EyeOff aria-hidden='true' />
            )}
            <span>{clip.hidden ? '显示片段' : '隐藏片段'}</span>
          </ContextMenu.Item>
          {isTimelineMediaClip(clip) && (
            <>
              <ContextMenu.Item
                className='ec-clip-context-menu__item'
                onSelect={() => void onDownload()}
              >
                <Download aria-hidden='true' />
                <span>下载原始素材</span>
              </ContextMenu.Item>
              <ContextMenu.Separator className='ec-clip-context-menu__separator' />
            </>
          )}
          <ContextMenu.Item
            className='ec-clip-context-menu__item ec-clip-context-menu__item--danger'
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
  showClipInfo: boolean;
  timelineStartUs: number;
  top: number;
  visibleTimeEndUs: number;
  visibleTimeStartUs: number;
  width: number;
};

export function TimelineClipDragOverlay({
  clip,
  height,
  left,
  pixelsPerSecond,
  showClipInfo,
  timelineStartUs,
  top,
  visibleTimeEndUs,
  visibleTimeStartUs,
  width,
}: TimelineClipDragOverlayProps) {
  const {
    imageUrl,
    previewStrip,
    volume,
    waveformTiles,
    waveformSamples,
  } =
    useTimelineClipPresentation(
      clip,
      pixelsPerSecond,
      timelineStartUs,
      visibleTimeEndUs,
      visibleTimeStartUs,
    );
  const style = {
    '--ec-timeline-clip-volume-y': `${
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
      className='ec-timeline-clip ec-timeline-clip--drag-overlay'
      data-hidden={clip.hidden}
      data-type={clip.type}
      style={style}
    >
      <TimelineClipVisual
        clip={clip}
        imageUrl={imageUrl}
        pixelsPerSecond={pixelsPerSecond}
        previewStrip={previewStrip}
        showClipInfo={showClipInfo}
        waveformTiles={waveformTiles}
        waveformSamples={waveformSamples}
        volume={volume}
      />
    </div>
  );
}
