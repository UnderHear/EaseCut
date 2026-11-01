import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
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
  const [isResizing, setIsResizing] = useState(false);

  const commitHeight = (height: number) => {
    const container = panelRef.current?.parentElement;
    if (!container) return;
    setPreferredHeight(
      clampTimelinePanelHeight(
        height,
        measureMaximumTimelinePanelHeight(container),
      ),
    );
  };

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
    if (pendingHeight !== null) commitHeight(pendingHeight);
  };

  const scheduleHeight = (height: number) => {
    pendingHeightRef.current = height;
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pendingHeight = pendingHeightRef.current;
      pendingHeightRef.current = null;
      if (pendingHeight !== null) commitHeight(pendingHeight);
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
    const panel = panelRef.current;
    if (!panel) return;

    event.preventDefault();
    resizeGestureRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: panel.getBoundingClientRect().height,
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
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const panelHeight = Math.round(panel.getBoundingClientRect().height);
    const maximumHeight = measureMaximumTimelinePanelHeight(container);
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
    commitHeight(nextHeight);
  };

  const syncResizeHandle = useCallback(() => {
    const panel = panelRef.current;
    const handle = resizeHandleRef.current;
    const container = panel?.parentElement;
    if (!panel || !handle || !container) return;
    const height = Math.round(panel.getBoundingClientRect().height);
    if (height <= 0) return;

    // CSS owns the actual height; observation only updates accessibility metadata.
    handle.setAttribute('aria-valuenow', String(height));
    handle.setAttribute(
      'aria-valuemax',
      String(measureMaximumTimelinePanelHeight(container)),
    );
    handle.setAttribute('aria-valuetext', `${height} 像素`);
  }, []);

  useLayoutEffect(syncResizeHandle, [preferredHeight, syncResizeHandle]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return undefined;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncResizeHandle);
      return () => window.removeEventListener('resize', syncResizeHandle);
    }

    const observer = new ResizeObserver(syncResizeHandle);
    observer.observe(container);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [syncResizeHandle]);

  useLayoutEffect(() => {
    const releaseGesture = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingHeightRef.current = null;
      const gesture = resizeGestureRef.current;
      const handle = resizeHandleRef.current;
      resizeGestureRef.current = null;
      if (
        gesture &&
        handle &&
        typeof handle.hasPointerCapture === 'function' &&
        handle.hasPointerCapture(gesture.pointerId)
      ) {
        handle.releasePointerCapture(gesture.pointerId);
      }
      return gesture;
    };
    const cancelResize = () => {
      const gesture = releaseGesture();
      if (!gesture) return;
      setPreferredHeight(gesture.startPreferredHeight);
      setIsResizing(false);
    };
    window.addEventListener('blur', cancelResize);
    return () => {
      window.removeEventListener('blur', cancelResize);
      releaseGesture();
    };
  }, []);

  return (
    <>
      <button
        aria-label='调整时间线面板高度'
        aria-orientation='horizontal'
        aria-valuemin={MIN_TIMELINE_PANEL_HEIGHT_PX}
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
        style={{ height: preferredHeight }}
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
}: TimelinePanelProps) {
  return (
    <ResizableTimelinePanel>
      <TimelineToolbar
        onRequestAddTitle={onRequestAddTitle}
        onRequestImport={onRequestImport}
      />
      <TimelineViewport
        onClipTimingPreviewChange={onClipTimingPreviewChange}
        onDownloadClip={onDownloadClip}
      />
    </ResizableTimelinePanel>
  );
}
