import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Music2, SquarePlay, Volume2, VolumeX } from 'lucide-react';

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
  durationToWidth,
  timeToX,
} from '../core/timeline-math';
import {
  useTimelineStore,
  useTimelineStoreApi,
} from '../store/timeline-store-context';
import {
  TimelineClipDragOverlay,
  TimelineClipView,
} from './TimelineClip';
import { TimelineDragGhost } from './TimelineDragGhost';
import { TimelineRuler } from './TimelineRuler';
import { getTimelineContentDuration } from './timeline-interaction';
import { useTimelineController } from './useTimelineController';
import { getVideoGaps } from './video-gaps';

export function TimelineViewport() {
  const clips = useTimelineStore((state) => state.clips);
  const currentTime = useTimelineStore((state) => state.currentTime);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const tracks = useTimelineStore((state) => state.tracks);
  const selectClip = useTimelineStore((state) => state.selectClip);
  const toggleTrackMute = useTimelineStore((state) => state.toggleTrackMute);
  const store = useTimelineStoreApi();
  const [viewportWidth, setViewportWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const pendingZoomRef = useRef<{
    pixelsPerSecond: number;
    scrollLeft: number;
  } | null>(null);
  const trackLayouts = useMemo(
    () => getTimelineTrackLayouts(tracks),
    [tracks],
  );
  const controller = useTimelineController({ gridRef });
  const { displayClips } = controller;
  const dropPreview = controller.dropPreview;
  const draggedClip = dropPreview
    ? clips.find(({ id }) => id === dropPreview.clipId)
    : undefined;
  const videoGapClips = useMemo(
    () =>
      dropPreview && draggedClip
        ? [...displayClips, { ...draggedClip, start: dropPreview.start }]
        : displayClips,
    [displayClips, draggedClip, dropPreview],
  );
  const videoGaps = useMemo(() => getVideoGaps(videoGapClips), [videoGapClips]);
  const dragWidth = draggedClip
    ? durationToWidth(draggedClip.duration, pixelsPerSecond)
    : 0;
  const draggedTrackVolume = draggedClip
    ? tracks.find(({ id }) => id === draggedClip.trackId)?.volume ?? 1
    : 1;
  const contentDuration = Math.max(
    getTimelineContentDuration(displayClips),
    dropPreview && draggedClip
      ? dropPreview.rawStart + draggedClip.duration + 2
      : 0,
  );
  const laneViewportWidth = Math.max(
    0,
    viewportWidth - TIMELINE_TRACK_HEADER_WIDTH,
  );
  const laneWidth = Math.max(
    laneViewportWidth,
    durationToWidth(contentDuration, pixelsPerSecond) +
      TIMELINE_CONTENT_PADDING_X * 2,
  );
  const rulerDuration = Math.max(
    contentDuration,
    (laneWidth - TIMELINE_CONTENT_PADDING_X * 2) / pixelsPerSecond,
  );
  const { majorInterval } = calcTickScale(pixelsPerSecond);
  const clipsByTrack = useMemo(() => {
    const grouped = new Map<string, typeof displayClips>();
    displayClips.forEach((clip) => {
      const group = grouped.get(clip.trackId) ?? [];
      group.push(clip);
      grouped.set(clip.trackId, group);
    });
    return grouped;
  }, [displayClips]);
  const gridStyle = {
    '--oc-timeline-header-width': `${TIMELINE_TRACK_HEADER_WIDTH}px`,
    '--oc-timeline-lane-width': `${laneWidth}px`,
    '--oc-timeline-ruler-height': `${TIMELINE_RULER_HEIGHT}px`,
    '--oc-timeline-track-gap': `${TIMELINE_TRACK_GAP}px`,
    '--oc-timeline-grid-step': `${majorInterval * pixelsPerSecond}px`,
    width: TIMELINE_TRACK_HEADER_WIDTH + laneWidth,
  } as CSSProperties;
  const playheadLeft =
    TIMELINE_TRACK_HEADER_WIDTH +
    TIMELINE_CONTENT_PADDING_X +
    timeToX(currentTime, pixelsPerSecond);
  const playheadLayerStyle = {
    '--oc-timeline-header-width': `${TIMELINE_TRACK_HEADER_WIDTH}px`,
    height: viewportHeight,
    width: viewportWidth,
  } as CSSProperties;
  const syncPlayheadHorizontalPosition = useCallback(() => {
    const viewport = viewportRef.current;
    const playhead = playheadRef.current;
    if (!viewport || !playhead) return;

    playhead.style.left = `${playheadLeft - viewport.scrollLeft}px`;
  }, [playheadLeft]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const update = () => {
      setViewportHeight(element.clientHeight);
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
      pendingZoomRef.current = null;
    }
    syncPlayheadHorizontalPosition();
  }, [pixelsPerSecond, syncPlayheadHorizontalPosition]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

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
        const pointerX = event.clientX - rect.left;
        const timelineX = Math.max(
          0,
          baseZoom.scrollLeft +
            pointerX -
            TIMELINE_TRACK_HEADER_WIDTH -
            TIMELINE_CONTENT_PADDING_X,
        );
        const anchorTime = timelineX / baseZoom.pixelsPerSecond;
        pendingZoomRef.current = {
          pixelsPerSecond: nextZoom,
          scrollLeft: Math.max(
            0,
            TIMELINE_TRACK_HEADER_WIDTH +
              TIMELINE_CONTENT_PADDING_X +
              anchorTime * nextZoom -
              pointerX,
          ),
        };
        state.setPixelsPerSecond(nextZoom);
        return;
      }

      if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        element.scrollLeft += event.deltaY;
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
      pendingZoomRef.current = null;
    };
  }, [controller.isInteracting, store]);

  useEffect(() => {
    if (!isPlaying || controller.isInteracting) return;
    const element = viewportRef.current;
    if (!element) return;
    const left = playheadLeft;
    const viewportLeft = element.scrollLeft + TIMELINE_TRACK_HEADER_WIDTH;
    const viewportRight = element.scrollLeft + element.clientWidth;

    if (left > viewportRight - 56) {
      element.scrollLeft = Math.max(0, left - element.clientWidth + 112);
    } else if (left < viewportLeft + 20) {
      element.scrollLeft = Math.max(0, left - TIMELINE_TRACK_HEADER_WIDTH - 48);
    }
  }, [controller.isInteracting, isPlaying, playheadLeft]);

  return (
    <div className='oc-timeline-shell'>
      <div
        aria-label='时间线轨道区域'
        className='oc-timeline-viewport oc-scrollbar'
        data-interacting={controller.isInteracting}
        data-scrubbing={controller.isScrubbing}
        onScroll={syncPlayheadHorizontalPosition}
        ref={viewportRef}
      >
        <div className='oc-timeline-grid' ref={gridRef} style={gridStyle}>
          <div className='oc-timeline-corner'>
            {videoGaps.length > 0 && (
              <span className='oc-timeline-gap-status'>有视频空隙</span>
            )}
          </div>
          <TimelineRuler
            currentTime={currentTime}
            duration={rulerDuration}
            gaps={videoGaps}
            onPointerDown={controller.beginScrub}
            pixelsPerSecond={pixelsPerSecond}
            width={laneWidth}
          />

          <div className='oc-timeline-track-stack'>
            {trackLayouts.map(({ height, track }) => {
              const trackClips = clipsByTrack.get(track.id) ?? [];
              const isMainVideoTrack = track.id === MAIN_VIDEO_TRACK_ID;
              const muted = track.volume === 0;
              const isDropSource = dropPreview?.originTrackId === track.id;
              const isDropTarget =
                dropPreview?.target?.kind === 'existing' &&
                dropPreview.target.trackId === track.id;
              const TrackIcon = track.type === 'audio' ? Music2 : SquarePlay;
              const trackLabel =
                isMainVideoTrack
                  ? '主视频轨道'
                  : track.type === 'video'
                    ? '视频轨道'
                    : track.name;

              return (
                <div
                  className='oc-timeline-track'
                  data-main-track={isMainVideoTrack ? 'true' : undefined}
                  data-type={track.type}
                  key={track.id}
                  style={{ height }}
                >
                  <div className='oc-timeline-track__control'>
                    <span
                      className='oc-timeline-track__icon'
                      title={trackLabel}
                    >
                      <TrackIcon aria-hidden='true' />
                    </span>
                    <button
                      aria-label={`${trackLabel}${muted ? '取消静音' : '静音'}`}
                      aria-pressed={muted}
                      className='oc-timeline-track__mute'
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
                  </div>
                  <div
                    className='oc-timeline-track__lane'
                    data-drop-source={isDropSource}
                    data-drop-target={isDropTarget}
                    data-track-id={track.id}
                    data-type={track.type}
                    onPointerDown={controller.beginScrub}
                  >
                    {isMainVideoTrack && trackClips.length === 0 && (
                      <span className='oc-timeline-track__empty-hint'>
                        主轨道：可将素材拖放到这里
                      </span>
                    )}
                    {isDropSource && dropPreview && (
                      <div
                        aria-hidden='true'
                        className='oc-timeline-clip-placeholder'
                        style={{
                          left:
                            TIMELINE_CONTENT_PADDING_X +
                            timeToX(
                              dropPreview.originStart,
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
                          timeToX(dropPreview.start, pixelsPerSecond)
                        }
                        snapped={dropPreview.snapTime !== null}
                        trackChanged={dropPreview.originTrackId !== track.id}
                        width={dragWidth}
                      />
                    )}
                    {trackClips.map((clip) => (
                      <TimelineClipView
                        clip={clip}
                        isSelected={selectedClipId === clip.id}
                        key={clip.id}
                        left={
                          TIMELINE_CONTENT_PADDING_X +
                          timeToX(clip.start, pixelsPerSecond)
                        }
                        onMoveStart={controller.beginMove}
                        onSelect={selectClip}
                        onTrimStart={controller.beginTrim}
                        onVolumeStart={controller.beginVolume}
                        trackVolume={track.volume}
                        width={durationToWidth(
                          clip.duration,
                          pixelsPerSecond,
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className='oc-timeline-tail-row'>
              <div
                aria-hidden='true'
                className='oc-timeline-track__control oc-timeline-track__control--tail'
              />
              <div
                className='oc-timeline-tail'
                onPointerDown={controller.beginScrub}
              />
            </div>
          </div>

          {dropPreview?.insertLineY !== null &&
            dropPreview?.insertLineY !== undefined && (
              <div
                aria-hidden='true'
                className='oc-timeline-track-insert-line'
                style={{ top: dropPreview.insertLineY }}
              />
            )}

          {dropPreview && draggedClip && (
            <TimelineClipDragOverlay
              clip={draggedClip}
              height={getTimelineClipHeight(draggedClip.type)}
              left={
                TIMELINE_TRACK_HEADER_WIDTH +
                TIMELINE_CONTENT_PADDING_X +
                timeToX(dropPreview.rawStart, pixelsPerSecond)
              }
              top={dropPreview.dragTop}
              trackVolume={draggedTrackVolume}
              width={dragWidth}
            />
          )}

          {dropPreview?.snapTime !== null &&
            dropPreview?.snapTime !== undefined && (
              <div
                aria-hidden='true'
                className='oc-timeline-snap-line'
                style={{
                  left:
                    TIMELINE_TRACK_HEADER_WIDTH +
                    TIMELINE_CONTENT_PADDING_X +
                    timeToX(dropPreview.snapTime, pixelsPerSecond),
                }}
              />
            )}
        </div>
      </div>
      <div
        aria-hidden='true'
        className='oc-timeline-playhead-layer'
        style={playheadLayerStyle}
      >
        <div
          className='oc-timeline-playhead'
          onPointerDown={controller.beginScrub}
          ref={playheadRef}
          style={{ left: playheadLeft }}
        >
          <svg
            aria-hidden='true'
            className='oc-timeline-playhead__handle'
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
          <span className='oc-timeline-playhead__line' />
        </div>
      </div>
    </div>
  );
}
