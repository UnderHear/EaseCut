import { useMemo, type CSSProperties, type PointerEvent } from 'react';

import { useAudioWaveformSamples, useFramePreviewUrls } from '../media';
import { TIMELINE_AUDIO_CLIP_HEIGHT } from '../core/timeline-layout';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';
import { formatTimelineTime } from '../util/format-timeline-time';

const PREVIEW_TILE_WIDTH = 96;
const WAVEFORM_HEIGHT = 100;
const WAVEFORM_AMPLITUDE = 44;
const AUDIO_VOLUME_INSET = 8;

export type TimelineClipViewProps = {
  clip: TimelineClip;
  isSelected: boolean;
  left: number;
  onMoveStart: (event: PointerEvent<HTMLElement>, clip: TimelineClip) => void;
  onSelect: (clipId: string) => void;
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
    clip.type === 'video' && clip.thumbnailUrls.length === 0,
  );
  const waveformSamples = useAudioWaveformSamples(
    clip.waveformSrc ?? clip.src,
    clip.type === 'audio',
  );
  const previews = clip.thumbnailUrls.length
    ? clip.thumbnailUrls
    : generatedPreviews;
  const waveformPath = useMemo(
    () => createWaveformPath(getVisibleSamples(waveformSamples, clip)),
    [clip, waveformSamples],
  );

  return {
    previews,
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
        {clip.type === 'video' && (
          <time
            className='oc-timeline-clip__duration'
            dateTime={`PT${Math.max(0, clip.duration)}S`}
          >
            {formatTimelineTime(clip.duration)}
          </time>
        )}
      </header>
    </>
  );
}

export function TimelineClipView({
  clip,
  isSelected,
  left,
  onMoveStart,
  onSelect,
  onTrimStart,
  onVolumeStart,
  trackVolume,
  width,
}: TimelineClipViewProps) {
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

  return (
    <article
      aria-label={`${clip.type} clip: ${clip.name}`}
      className='oc-timeline-clip'
      data-clip-id={clip.id}
      data-selected={isSelected}
      data-type={clip.type}
      onClick={(event) => event.stopPropagation()}
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
            key={edge}
            onPointerDown={startTrim(edge)}
            type='button'
          />
        ))}
    </article>
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
