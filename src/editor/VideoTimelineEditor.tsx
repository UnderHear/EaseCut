import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { FileJson, FileVideo, X } from 'lucide-react';

import { PreviewPanel } from './components/PreviewPanel';
import { TimelineCanvas } from './components/TimelineCanvas';
import { TimelineToolbar } from './components/TimelineToolbar';
import { TrackHeader } from './components/TrackHeader';
import {
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TRACK_HEADER_WIDTH,
} from './core/timeline-layout';
import { MediaRuntimeProvider, useMediaRuntime } from './media';
import {
  createTimelineStore,
  createVideoTimelineDraft,
  getVisibleTimelineTracks,
  selectTimelineDuration,
  type PendingTimelineTrack,
} from './store/timeline-store';
import {
  TimelineStoreProvider,
  useTimelineStore,
  useTimelineStoreApi,
} from './store/timeline-store-context';
import type {
  CompositionExportPayload,
  VideoTimelineDraft,
  VideoTimelineEditorProps,
  VideoTimelineSource,
} from './types';

const isPositiveNumber = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const hasCompleteSourceMetadata = (source: VideoTimelineSource) =>
  source.type === 'audio'
    ? isPositiveNumber(source.durationSeconds)
    : isPositiveNumber(source.durationSeconds) &&
      isPositiveNumber(source.height) &&
      isPositiveNumber(source.width);

const shouldIgnoreShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return Boolean(
    target.closest(
      'input, textarea, select, button, a[href], summary, [role="button"], [contenteditable="true"]',
    ),
  );
};

const downloadJson = (fileName: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = fileName;
  anchor.href = url;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function VideoTimelineEditor({
  sources,
  initialDraft,
  mediaLoader,
  ...props
}: VideoTimelineEditorProps) {
  const [store] = useState(() =>
    createTimelineStore({
      draft: initialDraft,
      sources,
    }),
  );

  return (
    <TimelineStoreProvider store={store}>
      <MediaRuntimeProvider mediaLoader={mediaLoader} sources={sources}>
        <VideoTimelineEditorView {...props} sources={sources} />
      </MediaRuntimeProvider>
    </TimelineStoreProvider>
  );
}

type VideoTimelineEditorViewProps = Omit<
  VideoTimelineEditorProps,
  'initialDraft' | 'mediaLoader'
>;

function VideoTimelineEditorView({
  className = '',
  jsonFileName = 'video-composition.json',
  onClose,
  onDraftChange,
  onExport,
  sources,
  style,
  title = '视频合成',
}: VideoTimelineEditorViewProps) {
  const titleId = useId();
  const store = useTimelineStoreApi();
  const runtime = useMediaRuntime();
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const syncSources = useTimelineStore((state) => state.syncSources);
  const toggleTrackMute = useTimelineStore((state) => state.toggleTrackMute);
  const tracks = useTimelineStore((state) => state.tracks);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<PendingTimelineTrack | null>(
    null,
  );
  const [timelineScrollElement, setTimelineScrollElement] =
    useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const visibleTracks = useMemo(
    () => getVisibleTimelineTracks(tracks, pendingTrack),
    [pendingTrack, tracks],
  );

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    let previousDraftJson = JSON.stringify(
      createVideoTimelineDraft(store.getState()),
    );

    return store.subscribe((state) => {
      const nextDraft = createVideoTimelineDraft(state);
      const nextDraftJson = JSON.stringify(nextDraft);
      if (nextDraftJson === previousDraftJson) return;

      previousDraftJson = nextDraftJson;
      onDraftChangeRef.current?.(nextDraft);
    });
  }, [store]);

  useEffect(() => {
    syncSources(sources);
  }, [sources, syncSources]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      sources.map(async (source) => {
        if (hasCompleteSourceMetadata(source)) return source;

        try {
          const metadata = await runtime.getMetadata(source);
          if (!metadata) return source;

          return {
            ...source,
            ...(!isPositiveNumber(source.durationSeconds) &&
            isPositiveNumber(metadata.durationSeconds)
              ? { durationSeconds: metadata.durationSeconds }
              : {}),
            ...(!isPositiveNumber(source.height) &&
            isPositiveNumber(metadata.height)
              ? { height: metadata.height }
              : {}),
            ...(!isPositiveNumber(source.width) &&
            isPositiveNumber(metadata.width)
              ? { width: metadata.width }
              : {}),
          };
        } catch {
          return source;
        }
      }),
    ).then((resolvedSources) => {
      if (cancelled) return;

      const failedCount = resolvedSources.filter(
        (source) => !hasCompleteSourceMetadata(source),
      ).length;
      setMediaError(
        failedCount > 0
          ? `${failedCount} 个素材的元数据读取失败，已使用默认时长或画布尺寸。`
          : null,
      );
      syncSources(resolvedSources);
    });

    return () => {
      cancelled = true;
    };
  }, [runtime, sources, syncSources]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    let animationFrame = 0;
    let lastFrameAt = performance.now();
    const tick = (frameAt: number) => {
      const state = store.getState();
      const duration = selectTimelineDuration(state);
      const elapsedSeconds = (frameAt - lastFrameAt) / 1000;
      const nextTime = state.currentTime + elapsedSeconds;
      lastFrameAt = frameAt;

      if (nextTime >= duration) {
        state.setCurrentTime(duration);
        state.setIsPlaying(false);
        return;
      }

      state.setCurrentTime(nextTime);
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, store]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const preventNativeZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    root.addEventListener('wheel', preventNativeZoom, { passive: false });
    return () => root.removeEventListener('wheel', preventNativeZoom);
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (shouldIgnoreShortcutTarget(event.target)) return;

    const state = store.getState();
    const commandKey = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (commandKey && !event.altKey && key === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) state.redo();
      else state.undo();
      return;
    }
    if (commandKey && !event.altKey && key === 'y') {
      event.preventDefault();
      event.stopPropagation();
      state.redo();
      return;
    }
    if (commandKey && !event.altKey && key === 'b') {
      event.preventDefault();
      event.stopPropagation();
      state.splitAtPlayhead();
      return;
    }
    if (commandKey || event.altKey) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      state.deleteSelectedClip();
      return;
    }
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      state.setIsPlaying(!state.isPlaying);
    }
  };

  const getExportState = (): {
    draft: VideoTimelineDraft;
    payload: CompositionExportPayload;
  } => ({
    draft: createVideoTimelineDraft(store.getState()),
    payload: store.getState().createExportPayload(),
  });

  const submitExport = async () => {
    if (!onExport || isExporting) return;

    setExportError(null);
    setIsExporting(true);
    try {
      await onExport(getExportState());
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : '视频导出失败，请稍后重试。',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const requestPreviewFullscreen = async () => {
    const preview = previewRef.current;
    if (!preview?.requestFullscreen) {
      setExportError('当前浏览器不支持全屏预览。');
      return;
    }

    try {
      await preview.requestFullscreen();
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : '无法进入全屏预览。',
      );
    }
  };

  const rootClassName = `oc-editor${className ? ` ${className}` : ''}`;

  return (
    <div
      ref={rootRef}
      aria-labelledby={titleId}
      className={rootClassName}
      onKeyDown={handleKeyDown}
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (!event.target.closest('button, input, summary, a[href]')) {
          rootRef.current?.focus({ preventScroll: true });
        }
      }}
      style={style}
      tabIndex={0}
      role='region'
    >
      <header className='oc-editor__header'>
        <h1 id={titleId}>{title}</h1>
        <div className='oc-editor__header-actions'>
          <button
            className='oc-button oc-button--secondary'
            onClick={() => downloadJson(jsonFileName, getExportState().payload)}
            type='button'
          >
            <FileJson aria-hidden='true' size={16} />
            导出 JSON
          </button>
          {onExport && (
            <button
              className='oc-button oc-button--primary'
              disabled={isExporting}
              onClick={() => void submitExport()}
              type='button'
            >
              <FileVideo aria-hidden='true' size={16} />
              {isExporting ? '导出中…' : '导出视频'}
            </button>
          )}
          {onClose && (
            <button
              aria-label='关闭视频编辑器'
              className='oc-icon-button'
              onClick={onClose}
              title='关闭'
              type='button'
            >
              <X aria-hidden='true' size={17} />
            </button>
          )}
        </div>
      </header>

      <main className='oc-editor__main'>
        {(exportError || mediaError) && (
          <div
            className={`oc-editor__notice${exportError ? ' oc-is-error' : ''}`}
            role={exportError ? 'alert' : 'status'}
          >
            {exportError ?? mediaError}
          </div>
        )}

        <PreviewPanel previewRef={previewRef} />

        <section className='oc-timeline-panel' aria-label='时间线编辑区域'>
          <TimelineToolbar
            onRequestPreviewFullscreen={() => void requestPreviewFullscreen()}
          />
          <div
            ref={setTimelineScrollElement}
            className='oc-timeline-panel__body oc-scrollbar'
            style={{
              gridTemplateColumns: `${TIMELINE_TRACK_HEADER_WIDTH}px minmax(0, 1fr)`,
            }}
          >
            <TrackHeader
              onToggleTrackMute={toggleTrackMute}
              rulerHeight={TIMELINE_RULER_HEIGHT}
              tracks={visibleTracks}
            />
            <TimelineCanvas
              onPendingTrackChange={setPendingTrack}
              pendingTrack={pendingTrack}
              verticalScrollContainer={timelineScrollElement}
              visibleTracks={visibleTracks}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
