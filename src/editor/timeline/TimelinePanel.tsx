import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { TimelineToolbar } from '../components/TimelineToolbar';
import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import { TimelineViewport } from './TimelineViewport';

const DEFAULT_TIMELINE_PANEL_HEIGHT_PX = 360;
const MIN_TIMELINE_PANEL_HEIGHT_PX = 210;
const MIN_PREVIEW_PANEL_HEIGHT_PX = 300;
const TIMELINE_PANEL_RESIZE_HANDLE_HEIGHT_PX = 8;
const KEYBOARD_RESIZE_STEP_PX = 10;

type TimelinePanelResizeGesture = {
  pointerId: number;
  startClientY: number;
  startHeight: number;
  startPreferredHeight: number;
};

const readPixelValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampTimelinePanelHeight = (
  height: number,
  maximumHeight: number,
): number =>
  Math.min(
    Math.max(MIN_TIMELINE_PANEL_HEIGHT_PX, maximumHeight),
    Math.max(MIN_TIMELINE_PANEL_HEIGHT_PX, Math.round(height)),
  );

const measureMaximumTimelinePanelHeight = (
  container: HTMLElement,
): number => {
  const styles = window.getComputedStyle(container);
  const contentHeight =
    container.clientHeight -
    readPixelValue(styles.paddingTop) -
    readPixelValue(styles.paddingBottom);

  return Math.max(
    MIN_TIMELINE_PANEL_HEIGHT_PX,
    Math.floor(
      contentHeight -
        TIMELINE_PANEL_RESIZE_HANDLE_HEIGHT_PX -
        MIN_PREVIEW_PANEL_HEIGHT_PX,
    ),
  );
};

type TimelinePanelProps = {
  onRequestAddTitle: () => void;
  onClipTimingPreviewChange?: (
    preview: TimelineClipTimingPreview | null,
  ) => void;
  onDownloadClip: (clip: TimelineClip) => void | Promise<void>;
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

type ResizableTimelinePanelProps = {
  children: ReactNode;
};

function ResizableTimelinePanel({ children }: ResizableTimelinePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLButtonElement>(null);
  const resizeGestureRef = useRef<TimelinePanelResizeGesture | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [preferredHeight, setPreferredHeight] = useState(
    DEFAULT_TIMELINE_PANEL_HEIGHT_PX,
  );
  const [maximumHeight, setMaximumHeight] = useState(
    DEFAULT_TIMELINE_PANEL_HEIGHT_PX,
  );
  const [isResizing, setIsResizing] = useState(false);
  const panelHeight = clampTimelinePanelHeight(
    preferredHeight,
    maximumHeight,
  );

  const cancelScheduledHeight = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    pendingHeightRef.current = null;
  };

  const flushScheduledHeight = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const pendingHeight = pendingHeightRef.current;
    pendingHeightRef.current = null;
    if (pendingHeight !== null) setPreferredHeight(pendingHeight);
  };

  const scheduleHeight = (height: number) => {
    pendingHeightRef.current = clampTimelinePanelHeight(
      height,
      maximumHeight,
    );
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pendingHeight = pendingHeightRef.current;
      pendingHeightRef.current = null;
      if (pendingHeight !== null) setPreferredHeight(pendingHeight);
    });
  };

  const releasePointerCapture = (
    handle: HTMLButtonElement,
    pointerId: number,
  ) => {
    if (
      typeof handle.hasPointerCapture === 'function' &&
      handle.hasPointerCapture(pointerId)
    ) {
      handle.releasePointerCapture(pointerId);
    }
  };

  const finishResize = (
    event: PointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (cancelled) {
      cancelScheduledHeight();
      setPreferredHeight(gesture.startPreferredHeight);
    } else {
      flushScheduledHeight();
    }
    resizeGestureRef.current = null;
    setIsResizing(false);
    releasePointerCapture(event.currentTarget, event.pointerId);
  };

  const handleResizePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (!event.isPrimary || event.button !== 0) return;

    event.preventDefault();
    resizeGestureRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: panelHeight,
      startPreferredHeight: preferredHeight,
    };
    setIsResizing(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleResizePointerMove = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.preventDefault();
    scheduleHeight(
      gesture.startHeight + gesture.startClientY - event.clientY,
    );
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextHeight: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
        nextHeight = panelHeight + KEYBOARD_RESIZE_STEP_PX;
        break;
      case 'ArrowDown':
        nextHeight = panelHeight - KEYBOARD_RESIZE_STEP_PX;
        break;
      case 'Home':
        nextHeight = MIN_TIMELINE_PANEL_HEIGHT_PX;
        break;
      case 'End':
        nextHeight = maximumHeight;
        break;
      default:
        return;
    }

    event.preventDefault();
    cancelScheduledHeight();
    setPreferredHeight(
      clampTimelinePanelHeight(nextHeight, maximumHeight),
    );
  };

  useLayoutEffect(() => {
    const container = panelRef.current?.parentElement;
    if (!container) return undefined;

    const updateMaximumHeight = () => {
      setMaximumHeight(measureMaximumTimelinePanelHeight(container));
    };
    updateMaximumHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMaximumHeight);
      return () => window.removeEventListener('resize', updateMaximumHeight);
    }

    const observer = new ResizeObserver(updateMaximumHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingHeightRef.current = null;
      const gesture = resizeGestureRef.current;
      const handle = resizeHandleRef.current;
      if (
        gesture &&
        handle &&
        typeof handle.hasPointerCapture === 'function' &&
        handle.hasPointerCapture(gesture.pointerId)
      ) {
        handle.releasePointerCapture(gesture.pointerId);
      }
      resizeGestureRef.current = null;
    },
    [],
  );

  return (
    <>
      <button
        aria-label='调整时间线面板高度'
        aria-orientation='horizontal'
        aria-valuemax={maximumHeight}
        aria-valuemin={MIN_TIMELINE_PANEL_HEIGHT_PX}
        aria-valuenow={panelHeight}
        aria-valuetext={`${panelHeight} 像素`}
        className='ec-timeline-panel__resize-handle'
        data-resizing={isResizing ? 'true' : undefined}
        onKeyDown={handleResizeKeyDown}
        onLostPointerCapture={(event) => {
          const gesture = resizeGestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          flushScheduledHeight();
          resizeGestureRef.current = null;
          setIsResizing(false);
        }}
        onPointerCancel={(event) => finishResize(event, true)}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={(event) => finishResize(event, false)}
        ref={resizeHandleRef}
        role='separator'
        type='button'
      />
      <section
        aria-label='时间线编辑区域'
        className='ec-timeline-panel'
        data-resizing={isResizing ? 'true' : undefined}
        ref={panelRef}
        style={{ height: panelHeight }}
      >
        {children}
      </section>
    </>
  );
}

export function TimelinePanel({
  onRequestAddTitle,
  onClipTimingPreviewChange,
  onDownloadClip,
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelinePanelProps) {
  return (
    <ResizableTimelinePanel>
      <TimelineToolbar
        onRequestAddTitle={onRequestAddTitle}
        onRequestImport={onRequestImport}
        onRequestPreviewFullscreen={onRequestPreviewFullscreen}
      />
      <TimelineViewport
        onClipTimingPreviewChange={onClipTimingPreviewChange}
        onDownloadClip={onDownloadClip}
      />
    </ResizableTimelinePanel>
  );
}
