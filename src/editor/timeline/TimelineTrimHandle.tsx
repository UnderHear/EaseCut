import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  TRIM_FRAME_PREVIEW_HEIGHT,
  useSingleFramePreview,
} from '../media';
import { useEaseCutTheme } from '../theme-context';
import type { TimelineClip, TimelineClipTrimEdge } from '../types';

const TRIM_FRAME_PREVIEW_GAP = 8;
const TRIM_FRAME_PREVIEW_VIEWPORT_MARGIN = 8;

type PreviewPosition = {
  arrowLeft: number;
  left: number;
  top: number;
};

export type TimelineTrimHandleProps = {
  active: boolean;
  clip: TimelineClip;
  edge: TimelineClipTrimEdge;
  label: string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  trimmed: boolean;
};

export function TimelineTrimHandle({
  active,
  clip,
  edge,
  label,
  onPointerDown,
  trimmed,
}: TimelineTrimHandleProps) {
  const theme = useEaseCutTheme();
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const previewTimeUs =
    clip.type === 'video'
      ? edge === 'start'
        ? clip.trimStartUs
        : Math.max(clip.trimStartUs, clip.trimEndUs - 1)
      : 0;
  const videoSourceDurationUs =
    clip.type === 'video' ? clip.sourceDurationUs : 0;
  const videoSrc = clip.type === 'video' ? clip.src : '';
  const previewRequest = useMemo(
    () =>
      active && clip.type === 'video'
        ? {
            height: TRIM_FRAME_PREVIEW_HEIGHT,
            sourceDurationUs: videoSourceDurationUs,
            src: videoSrc,
            timeUs: previewTimeUs,
          }
        : null,
    [
      active,
      clip.type,
      previewTimeUs,
      videoSourceDurationUs,
      videoSrc,
    ],
  );
  const preview = useSingleFramePreview(previewRequest);
  const previewHeight = preview?.status === 'ready' ? preview.height : 0;
  const previewWidth = preview?.status === 'ready' ? preview.width : 0;

  useLayoutEffect(() => {
    if (
      !active ||
      clip.type !== 'video' ||
      previewHeight <= 0 ||
      previewWidth <= 0
    ) {
      return undefined;
    }

    const updatePosition = () => {
      const handle = handleRef.current;
      if (!handle) return;
      const bounds = handle.getBoundingClientRect();
      const anchorX = bounds.left + bounds.width / 2;
      const maximumLeft = Math.max(
        TRIM_FRAME_PREVIEW_VIEWPORT_MARGIN,
        window.innerWidth -
          previewWidth -
          TRIM_FRAME_PREVIEW_VIEWPORT_MARGIN,
      );
      const left = Math.min(
        maximumLeft,
        Math.max(
          TRIM_FRAME_PREVIEW_VIEWPORT_MARGIN,
          anchorX - previewWidth / 2,
        ),
      );
      const arrowInset = Math.min(10, previewWidth / 2);
      setPosition({
        arrowLeft: Math.min(
          previewWidth - arrowInset,
          Math.max(arrowInset, anchorX - left),
        ),
        left,
        top: Math.max(
          TRIM_FRAME_PREVIEW_VIEWPORT_MARGIN,
          bounds.top -
            previewHeight -
            TRIM_FRAME_PREVIEW_GAP,
        ),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [
    active,
    clip.durationUs,
    clip.startUs,
    clip.type,
    edge,
    previewHeight,
    previewWidth,
  ]);

  const portal =
    active &&
    clip.type === 'video' &&
    preview?.status === 'ready' &&
    position &&
    typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden='true'
            className='ec-trim-frame-preview'
            data-light-theme={theme}
            style={{
              height: preview.height,
              left: position.left,
              top: position.top,
              width: preview.width,
            }}
          >
            <img
              alt=''
              className='ec-trim-frame-preview__image'
              decoding='async'
              draggable={false}
              src={preview.url}
            />
            <span
              className='ec-trim-frame-preview__arrow'
              style={{ left: position.arrowLeft }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        aria-label={label}
        className='ec-timeline-clip__trim-handle'
        data-edge={edge}
        data-trimmed={trimmed}
        onPointerDown={onPointerDown}
        ref={handleRef}
        type='button'
      />
      {portal}
    </>
  );
}
