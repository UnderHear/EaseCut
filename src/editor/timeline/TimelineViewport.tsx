import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Music2,
  SquarePlay,
  Type as TypeIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';

import {
  createCompositionSnapshot,
  getCompositionVideoGaps,
} from '../core/composition';
import {
  TIMELINE_CONTENT_PADDING_X,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_GAP,
  TIMELINE_TRACK_HEADER_WIDTH,
  getTimelineClipHeight,
  getTimelineTrackLayouts,
} from '../core/timeline-layout';
import { MAIN_VIDEO_TRACK_ID } from '../core/timeline-tracks';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
  calcTickScale,
  durationUsToWidth,
  timeUsToX,
  xToTimeUs,
} from '../core/timeline-math';
import { secondsToMicroseconds } from '../core/time';
import { canSplitClipAtTime } from '../core/timeline-commands';
import {
  useTimelineStore,
  useTimelineStoreApi,
} from '../store/timeline-store-context';
import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import {
  TimelineClipDragOverlay,
  TimelineClipView,
} from './TimelineClip';
import { TimelineDragGhost } from './TimelineDragGhost';
import { TimelineRuler } from './TimelineRuler';
import { getTimelineContentDurationUs } from './timeline-interaction';
import { useTimelineController } from './useTimelineController';

const PLAYBACK_FOLLOW_RIGHT_OFFSET_PX = 500;

type TimelineViewportProps = {
  onClipTimingPreviewChange?: (
    preview: TimelineClipTimingPreview | null,
  ) => void;
  onDownloadClip?: (clip: TimelineClip) => void | Promise<void>;
};

export function TimelineViewport({
  onClipTimingPreviewChange,
  onDownloadClip,
}: TimelineViewportProps) {
  const canvasSize = useTimelineStore((state) => state.canvasSize);
  const clips = useTimelineStore((state) => state.clips);
  const copiedClip = useTimelineStore((state) => state.copiedClip);
  const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const playheadFollowEnabled = useTimelineStore(
    (state) => state.playheadFollowEnabled,
  );
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const tracks = useTimelineStore((state) => state.tracks);
  const selectClip = useTimelineStore((state) => state.selectClip);
  const toggleTrackMute = useTimelineStore((state) => state.toggleTrackMute);
  const store = useTimelineStoreApi();
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(900);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const controlsStackRef = useRef<HTMLDivElement | null>(null);
  const rulerCanvasRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const pendingZoomRef = useRef<{
    pixelsPerSecond: number;
    scrollLeft: number;
  } | null>(null);
  const trackLayouts = useMemo(
    () => getTimelineTrackLayouts(tracks),
    [tracks],
  );
  const controller = useTimelineController({
    gridRef,
    onClipTimingPreviewChange,
    viewportRef,
  });
  const { displayClips } = controller;
  const dropPreview = controller.dropPreview;
  const draggedClip = dropPreview
    ? clips.find(({ id }) => id === dropPreview.clipId)
    : undefined;
  const videoGapClips = useMemo(
    () => {
      const clipsById = new Map(
        displayClips.map((clip) => [clip.id, clip]),
      );
      if (dropPreview && draggedClip) {
        clipsById.set(draggedClip.id, {
          ...draggedClip,
          startUs: dropPreview.startUs,
        });
      }
      return [...clipsById.values()];
    },
    [displayClips, draggedClip, dropPreview],
  );
  const videoGaps = useMemo(
    () =>
      getCompositionVideoGaps(
        createCompositionSnapshot({
          canvasSize,
          clips: videoGapClips,
          tracks,
        }),
      ),
    [canvasSize, tracks, videoGapClips],
  );
  const dragWidth = draggedClip
    ? durationUsToWidth(draggedClip.durationUs, pixelsPerSecond)
    : 0;
  const contentDurationUs = Math.max(
    getTimelineContentDurationUs(displayClips),
    dropPreview && draggedClip
      ? dropPreview.rawStartUs +
        draggedClip.durationUs +
        secondsToMicroseconds(2)
      : 0,
  );
  const laneViewportWidth = Math.max(0, viewportWidth);
  const visibleTimeStartUs = xToTimeUs(
    scrollLeft - TIMELINE_CONTENT_PADDING_X,
    pixelsPerSecond,
  );
  const visibleTimeEndUs = Math.max(
    visibleTimeStartUs,
    xToTimeUs(
      scrollLeft + laneViewportWidth - TIMELINE_CONTENT_PADDING_X,
      pixelsPerSecond,
    ),
  );
  const contentLaneWidth =
    durationUsToWidth(contentDurationUs, pixelsPerSecond) +
    TIMELINE_CONTENT_PADDING_X * 2;
  const rulerWidth = Math.max(laneViewportWidth, contentLaneWidth);
  const rulerDurationUs = Math.max(
    contentDurationUs,
    xToTimeUs(
      rulerWidth - TIMELINE_CONTENT_PADDING_X * 2,
      pixelsPerSecond,
    ),
  );
  const { majorIntervalUs } = calcTickScale(pixelsPerSecond);
  const clipsByTrack = useMemo(() => {
    const grouped = new Map<string, typeof displayClips>();
    displayClips.forEach((clip) => {
      const group = grouped.get(clip.trackId) ?? [];
      group.push(clip);
      grouped.set(clip.trackId, group);
    });
    return grouped;
  }, [displayClips]);
  const shellStyle = {
    '--ec-timeline-header-width': `${TIMELINE_TRACK_HEADER_WIDTH}px`,
    '--ec-timeline-ruler-height': `${TIMELINE_RULER_HEIGHT}px`,
    '--ec-timeline-track-gap': `${TIMELINE_TRACK_GAP}px`,
  } as CSSProperties;
  const gridStyle = {
    '--ec-timeline-lane-width': `${contentLaneWidth}px`,
    '--ec-timeline-grid-step': `${durationUsToWidth(
      majorIntervalUs,
      pixelsPerSecond,
    )}px`,
  } as CSSProperties;
  const playheadLeft =
    TIMELINE_CONTENT_PADDING_X +
    timeUsToX(currentTimeUs, pixelsPerSecond);
  const syncPlayheadHorizontalPosition = useCallback(() => {
    const viewport = viewportRef.current;
    const playhead = playheadRef.current;
    if (!viewport || !playhead) return;

    playhead.style.left = `${playheadLeft - viewport.scrollLeft}px`;
  }, [playheadLeft]);
  const syncScrollLayers = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (rulerCanvasRef.current) {
      rulerCanvasRef.current.style.transform =
        `translate3d(${-viewport.scrollLeft}px, 0, 0)`;
    }
    if (controlsStackRef.current) {
      controlsStackRef.current.style.transform =
        `translate3d(0, ${-viewport.scrollTop}px, 0)`;
    }
    syncPlayheadHorizontalPosition();
  }, [syncPlayheadHorizontalPosition]);
  const handleViewportScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setScrollLeft(viewport.scrollLeft);
    syncScrollLayers();
  }, [syncScrollLayers]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const update = () => {
      setViewportWidth(element.clientWidth || 900);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    const pendingZoom = pendingZoomRef.current;

    if (element && pendingZoom?.pixelsPerSecond === pixelsPerSecond) {
      element.scrollLeft = pendingZoom.scrollLeft;
      setScrollLeft(element.scrollLeft);
      pendingZoomRef.current = null;
    }
    syncScrollLayers();
  }, [pixelsPerSecond, syncScrollLayers]);

  useEffect(() => {
    const shell = shellRef.current;
    const element = viewportRef.current;
    if (!shell || !element) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (controller.isInteracting) {
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.deltaY === 0) return;
        const state = store.getState();
        const baseZoom = pendingZoomRef.current ?? {
          pixelsPerSecond: state.pixelsPerSecond,
          scrollLeft: element.scrollLeft,
        };
        const nextZoom = Math.min(
          MAX_PIXELS_PER_SECOND,
          Math.max(
            MIN_PIXELS_PER_SECOND,
            baseZoom.pixelsPerSecond +
              (event.deltaY < 0
                ? TIMELINE_ZOOM_STEP
                : -TIMELINE_ZOOM_STEP),
          ),
        );
        if (nextZoom === baseZoom.pixelsPerSecond) return;

        const rect = element.getBoundingClientRect();
        const pointerX = Math.min(
          element.clientWidth,
          Math.max(0, event.clientX - rect.left),
        );
        const timelineX = Math.max(
          0,
          baseZoom.scrollLeft +
            pointerX -
            TIMELINE_CONTENT_PADDING_X,
        );
        const anchorTimeUs = xToTimeUs(
          timelineX,
          baseZoom.pixelsPerSecond,
        );
        pendingZoomRef.current = {
          pixelsPerSecond: nextZoom,
          scrollLeft: Math.max(
            0,
              TIMELINE_CONTENT_PADDING_X +
              timeUsToX(anchorTimeUs, nextZoom) -
              pointerX,
          ),
        };
        state.setPixelsPerSecond(nextZoom);
        return;
      }

      if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        element.scrollLeft += event.deltaY;
        return;
      }

      if (
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        event.preventDefault();
        element.scrollLeft += event.deltaX;
        element.scrollTop += event.deltaY;
      }
    };

    shell.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      shell.removeEventListener('wheel', handleWheel);
      pendingZoomRef.current = null;
    };
  }, [controller.isInteracting, store]);

  useEffect(() => {
    if (
      !isPlaying ||
      !playheadFollowEnabled ||
      controller.isInteracting
    ) {
      return;
    }
    const element = viewportRef.current;
    if (!element) return;
    const left = playheadLeft;
    const viewportLeft = element.scrollLeft;
    const viewportRight = element.scrollLeft + element.clientWidth;

    if (left >= viewportRight) {
      element.scrollLeft = Math.max(
        0,
        left - element.clientWidth + PLAYBACK_FOLLOW_RIGHT_OFFSET_PX,
      );
    } else if (left < viewportLeft + 20) {
      element.scrollLeft = Math.max(0, left - 48);
    }
  }, [
    controller.isInteracting,
    isPlaying,
    playheadFollowEnabled,
    playheadLeft,
  ]);

  return (
    <div
      className='ec-timeline-shell'
      data-interacting={controller.isInteracting}
      data-scrubbing={controller.isScrubbing}
      ref={shellRef}
      style={shellStyle}
    >
      <div className='ec-timeline-corner'>
        {videoGaps.length > 0 && (
          <span className='ec-timeline-gap-status'>有视频空隙</span>
        )}
      </div>

      <div className='ec-timeline-controls-viewport'>
        <div className='ec-timeline-controls-stack' ref={controlsStackRef}>
          {trackLayouts.map(({ height, track }) => {
            const isMainVideoTrack = track.id === MAIN_VIDEO_TRACK_ID;
            const muted = track.muted;
            const TrackIcon =
              track.type === 'audio'
                ? Music2
                : track.type === 'text'
                  ? TypeIcon
                  : SquarePlay;
            const trackLabel =
              isMainVideoTrack
                ? '主视频轨道'
                : track.type === 'video'
                  ? '视频轨道'
                  : track.type === 'text'
                    ? '文字轨道'
                    : track.name;

            return (
              <div
                className='ec-timeline-track__control'
                data-control-track-id={track.id}
                data-main-track={isMainVideoTrack ? 'true' : undefined}
                data-type={track.type}
                key={track.id}
                style={{ height }}
              >
                <span
                  className='ec-timeline-track__icon'
                  title={trackLabel}
                >
                  <TrackIcon aria-hidden='true' />
                </span>
                {track.type !== 'text' && (
                  <button
                    aria-label={`${trackLabel}${muted ? '取消静音' : '静音'}`}
                    aria-pressed={muted}
                    className='ec-timeline-track__mute'
                    onClick={() => toggleTrackMute(track.id)}
                    title={muted ? '取消静音' : '静音'}
                    type='button'
                  >
                    {muted ? (
                      <VolumeX aria-hidden='true' />
                    ) : (
                      <Volume2 aria-hidden='true' />
                    )}
                  </button>
                )}
              </div>
            );
          })}

          <div
            aria-hidden='true'
            className='ec-timeline-track__control ec-timeline-track__control--tail'
          />
        </div>
      </div>

      <div className='ec-timeline-ruler-viewport'>
        <div
          className='ec-timeline-ruler-canvas'
          ref={rulerCanvasRef}
          style={{ width: rulerWidth }}
        >
          <TimelineRuler
            currentTimeUs={currentTimeUs}
            durationUs={rulerDurationUs}
            gaps={videoGaps}
            onPointerDown={controller.beginScrub}
            pixelsPerSecond={pixelsPerSecond}
            visibleTimeEndUs={visibleTimeEndUs}
            visibleTimeStartUs={visibleTimeStartUs}
          />
        </div>
      </div>

      <div
        aria-label='时间线轨道区域'
        className='ec-timeline-viewport ec-scrollbar'
        onScroll={handleViewportScroll}
        ref={viewportRef}
      >
        <div className='ec-timeline-grid' ref={gridRef} style={gridStyle}>
          <div className='ec-timeline-track-stack'>
            {trackLayouts.map(({ height, track }) => {
              const trackClips = clipsByTrack.get(track.id) ?? [];
              const isMainVideoTrack = track.id === MAIN_VIDEO_TRACK_ID;
              const isDropSource = dropPreview?.originTrackId === track.id;
              const isDropTarget =
                dropPreview?.target?.kind === 'existing' &&
                dropPreview.target.trackId === track.id;

              return (
                <div
                  className='ec-timeline-track'
                  data-main-track={isMainVideoTrack ? 'true' : undefined}
                  data-type={track.type}
                  key={track.id}
                  style={{ height }}
                >
                  <div
                    className='ec-timeline-track__lane'
                    data-drop-source={isDropSource}
                    data-drop-target={isDropTarget}
                    data-track-id={track.id}
                    data-type={track.type}
                    onPointerDown={controller.beginScrub}
                  >
                    {isMainVideoTrack && trackClips.length === 0 && (
                      <span className='ec-timeline-track__empty-hint'>
                        主轨道：可将素材拖放到这里
                      </span>
                    )}
                    {isDropSource && dropPreview && (
                      <div
                        aria-hidden='true'
                        className='ec-timeline-clip-placeholder'
                        style={{
                          left:
                            TIMELINE_CONTENT_PADDING_X +
                            timeUsToX(
                              dropPreview.originStartUs,
                              pixelsPerSecond,
                            ),
                          width: dragWidth,
                        }}
                      />
                    )}
                    {isDropTarget && dropPreview && (
                      <TimelineDragGhost
                        left={
                          TIMELINE_CONTENT_PADDING_X +
                          timeUsToX(dropPreview.startUs, pixelsPerSecond)
                        }
                        snapped={dropPreview.snapTimeUs !== null}
                        trackChanged={dropPreview.originTrackId !== track.id}
                        width={dragWidth}
                      />
                    )}
                    {trackClips.map((clip) => (
                      <TimelineClipView
                        canPaste={Boolean(
                          copiedClip && copiedClip.type === clip.type,
                        )}
                        canSplitAt={(timeUs) =>
                          canSplitClipAtTime(clips, timeUs, clip.id)
                        }
                        clip={clip}
                        isSelected={selectedClipId === clip.id}
                        key={clip.id}
                        left={
                          TIMELINE_CONTENT_PADDING_X +
                          timeUsToX(clip.startUs, pixelsPerSecond)
                        }
                        onMoveStart={controller.beginMove}
                        onCopy={() => store.getState().copySelectedClip()}
                        onDelete={() => store.getState().deleteSelectedClip()}
                        onDownload={() => onDownloadClip?.(clip)}
                        onPaste={() => store.getState().pasteCopiedClip()}
                        onSelect={selectClip}
                        onSplit={(timeUs) =>
                          store.getState().splitClipAtTime(clip.id, timeUs)
                        }
                        onTrimStart={controller.beginTrim}
                        onVolumeStart={controller.beginVolume}
                        pixelsPerSecond={pixelsPerSecond}
                        visibleTimeEndUs={visibleTimeEndUs}
                        visibleTimeStartUs={visibleTimeStartUs}
                        width={durationUsToWidth(
                          clip.durationUs,
                          pixelsPerSecond,
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className='ec-timeline-tail-row'>
              <div
                className='ec-timeline-tail'
                onPointerDown={controller.beginScrub}
              />
            </div>
          </div>

          {dropPreview?.insertLineY !== null &&
            dropPreview?.insertLineY !== undefined && (
              <div
                aria-hidden='true'
                className='ec-timeline-track-insert-line'
                data-leading={
                  dropPreview.insertLineY === TIMELINE_RULER_HEIGHT
                }
                style={{
                  top: dropPreview.insertLineY - TIMELINE_RULER_HEIGHT,
                }}
              />
            )}

          {dropPreview && draggedClip && (
            <TimelineClipDragOverlay
              clip={draggedClip}
              height={getTimelineClipHeight(draggedClip.type)}
              left={
                TIMELINE_CONTENT_PADDING_X +
                timeUsToX(dropPreview.rawStartUs, pixelsPerSecond)
              }
              pixelsPerSecond={pixelsPerSecond}
              timelineStartUs={dropPreview.rawStartUs}
              top={dropPreview.dragTop - TIMELINE_RULER_HEIGHT}
              visibleTimeEndUs={visibleTimeEndUs}
              visibleTimeStartUs={visibleTimeStartUs}
              width={dragWidth}
            />
          )}

          {dropPreview?.snapTimeUs !== null &&
            dropPreview?.snapTimeUs !== undefined && (
              <div
                aria-hidden='true'
                className='ec-timeline-snap-line'
                style={{
                  left:
                    TIMELINE_CONTENT_PADDING_X +
                    timeUsToX(dropPreview.snapTimeUs, pixelsPerSecond),
                }}
              />
            )}
        </div>
      </div>
      <div
        aria-hidden='true'
        className='ec-timeline-playhead-layer'
      >
        <div
          className='ec-timeline-playhead'
          onPointerDown={controller.beginPlayheadScrub}
          ref={playheadRef}
          style={{ left: playheadLeft }}
        >
          <svg
            aria-hidden='true'
            className='ec-timeline-playhead__handle'
            viewBox='0 0 12 18'
          >
            <path
              d='M0 3C0 1.34314 1.34315 0 3 0h6c1.6569 0 3 1.34315 3 3v8.8287c0 .9207-.4228 1.7904-1.1469 2.3592L6 18l-4.8531-3.8121C.4228 13.6191 0 12.7494 0 11.8287V3Z'
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
            />
          </svg>
          <span className='ec-timeline-playhead__line' />
        </div>
      </div>
    </div>
  );
}
