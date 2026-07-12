import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Film,
  Layers3,
  Music2,
  Volume2,
  VolumeX,
} from 'lucide-react';

import {
  TIMELINE_CONTENT_PADDING_X,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_HEADER_WIDTH,
  getTimelineTrackHeight,
} from '../core/timeline-layout';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_ZOOM_STEP,
  calcTickScale,
  durationToWidth,
  timeToX,
} from '../core/timeline-math';
import {
  MAIN_VIDEO_TRACK_ID,
  NEW_AUDIO_TRACK_DROP_ID,
  NEW_VIDEO_TRACK_DROP_ID,
  getVisibleTimelineTracks,
  type PendingTimelineTrack,
} from '../store/timeline-store';
import {
  useTimelineStore,
  useTimelineStoreApi,
} from '../store/timeline-store-context';
import type { TimelineTrack } from '../types';
import { TimelineClipView } from './TimelineClip';
import { TimelineDragGhost } from './TimelineDragGhost';
import { TimelineRuler } from './TimelineRuler';
import { getTimelineContentDuration } from './timeline-interaction';
import { useTimelineController } from './useTimelineController';

const isPendingTrack = ({ id }: TimelineTrack) =>
  id === NEW_VIDEO_TRACK_DROP_ID || id === NEW_AUDIO_TRACK_DROP_ID;

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
  const [pendingTrack, setPendingTrack] =
    useState<PendingTimelineTrack | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{
    pixelsPerSecond: number;
    scrollLeft: number;
  } | null>(null);
  const visibleTracks = useMemo(
    () => getVisibleTimelineTracks(tracks, pendingTrack),
    [pendingTrack, tracks],
  );
  const controller = useTimelineController({
    gridRef,
    setPendingTrack,
    visibleTracks,
  });
  const { displayClips } = controller;
  const dropPreview = controller.dropPreview;
  const draggedClip = dropPreview
    ? clips.find(({ id }) => id === dropPreview.clipId)
    : undefined;
  const dragWidth = draggedClip
    ? durationToWidth(draggedClip.duration, pixelsPerSecond)
    : 0;
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
  const rowTemplate = `${TIMELINE_RULER_HEIGHT}px ${visibleTracks
    .map((track) => `${getTimelineTrackHeight(track)}px`)
    .join(' ')} minmax(72px, 1fr)`;
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
    '--oc-timeline-ruler-height': `${TIMELINE_RULER_HEIGHT}px`,
    '--oc-timeline-grid-step': `${majorInterval * pixelsPerSecond}px`,
    gridTemplateColumns: `${TIMELINE_TRACK_HEADER_WIDTH}px ${laneWidth}px`,
    gridTemplateRows: rowTemplate,
    width: TIMELINE_TRACK_HEADER_WIDTH + laneWidth,
  } as CSSProperties;
  const playheadLeft =
    TIMELINE_TRACK_HEADER_WIDTH +
    TIMELINE_CONTENT_PADDING_X +
    timeToX(currentTime, pixelsPerSecond);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;

    const update = () => setViewportWidth(element.clientWidth || 900);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
        if (zoomFrameRef.current !== null) {
          cancelAnimationFrame(zoomFrameRef.current);
        }
        zoomFrameRef.current = requestAnimationFrame(() => {
          const pending = pendingZoomRef.current;
          if (pending) element.scrollLeft = pending.scrollLeft;
          pendingZoomRef.current = null;
          zoomFrameRef.current = null;
        });
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
      if (zoomFrameRef.current !== null) {
        cancelAnimationFrame(zoomFrameRef.current);
        zoomFrameRef.current = null;
        pendingZoomRef.current = null;
      }
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
    <div
      aria-label='时间线轨道区域'
      className='oc-timeline-viewport oc-scrollbar'
      data-interacting={controller.isInteracting}
      ref={viewportRef}
    >
      <div className='oc-timeline-grid' ref={gridRef} style={gridStyle}>
        <div className='oc-timeline-corner'>
          <span>轨道</span>
          <span>{tracks.length}</span>
        </div>
        <TimelineRuler
          currentTime={currentTime}
          duration={rulerDuration}
          onPointerDown={controller.beginScrub}
          pixelsPerSecond={pixelsPerSecond}
          width={laneWidth}
        />

        {visibleTracks.map((track, index) => {
          const pending = isPendingTrack(track);
          const muted = track.volume === 0;
          const isDropSource = dropPreview?.originTrackId === track.id;
          const isDropTarget = dropPreview?.targetTrackId === track.id;
          const TrackIcon =
            track.type === 'audio'
              ? Music2
              : track.id === MAIN_VIDEO_TRACK_ID
                ? Film
                : Layers3;

          return (
            <div className='oc-timeline-track' key={track.id}>
              <div
                className='oc-timeline-track__control'
                data-pending={pending}
                style={{ gridRow: index + 2 }}
              >
                <span className='oc-timeline-track__icon'>
                  <TrackIcon aria-hidden='true' />
                </span>
                <span className='oc-timeline-track__name' title={track.name}>
                  {track.name}
                </span>
                <button
                  aria-label={`${track.name}${muted ? '取消静音' : '静音'}`}
                  aria-pressed={muted}
                  className='oc-timeline-track__mute'
                  disabled={pending}
                  onClick={() => toggleTrackMute(track.id)}
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
                data-pending={pending}
                data-track-id={track.id}
                data-type={track.type}
                onPointerDown={controller.beginScrub}
                style={{ gridRow: index + 2 }}
              >
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
                    trackChanged={
                      dropPreview.originTrackId !== dropPreview.targetTrackId
                    }
                    width={dragWidth}
                  />
                )}
                {(clipsByTrack.get(track.id) ?? []).map((clip) => (
                  <TimelineClipView
                    clip={clip}
                    isDragging={dropPreview?.clipId === clip.id}
                    isSelected={selectedClipId === clip.id}
                    key={clip.id}
                    left={
                      TIMELINE_CONTENT_PADDING_X +
                      timeToX(
                        dropPreview?.clipId === clip.id
                          ? dropPreview.rawStart
                          : clip.start,
                        pixelsPerSecond,
                      )
                    }
                    onMoveStart={controller.beginMove}
                    onSelect={selectClip}
                    onTrimStart={controller.beginTrim}
                    onVolumeStart={controller.beginVolume}
                    trackVolume={track.volume}
                    width={durationToWidth(clip.duration, pixelsPerSecond)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <div
          aria-hidden='true'
          className='oc-timeline-track__control oc-timeline-track__control--tail'
          style={{ gridRow: visibleTracks.length + 2 }}
        />
        <div
          className='oc-timeline-tail'
          onPointerDown={controller.beginScrub}
          style={{ gridRow: visibleTracks.length + 2 }}
        />
        <div
          aria-hidden='true'
          className='oc-timeline-playhead-line'
          style={{ left: playheadLeft }}
        />
        {dropPreview?.snapTime !== null &&
          dropPreview?.snapTime !== undefined && (
            <div
              aria-hidden='true'
              className='oc-timeline-snap-line'
              style={{
                left:
                  TIMELINE_TRACK_HEADER_WIDTH +
                  TIMELINE_CONTENT_PADDING_X +
                  timeToX(
                    dropPreview.snapTime,
                    pixelsPerSecond,
                  ),
              }}
            />
          )}
      </div>
    </div>
  );
}
