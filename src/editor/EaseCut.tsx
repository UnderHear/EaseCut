import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type SubmitEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CircleAlert, X } from 'lucide-react';
import { useStore } from 'zustand';

import {
  EaseCutApiProvider,
  useEaseCutApi,
} from './api/easecut-api-context';
import {
  createVideoTimelineSourceStore,
} from './api/source-store';
import type { EaseCutHandle } from './api';
import { ExportMenu } from './components/ExportMenu';
import { PreviewPanel } from './components/PreviewPanel';
import { FormDialog } from './components/FormDialog';
import { IconButton } from './components/ui/IconButton';
import { TextInput } from './components/ui/TextInput';
import { isTimelineMediaClip } from './core/model';
import {
  DEFAULT_TIMELINE_TEXT_FONT_SIZE,
  DEFAULT_TIMELINE_TEXT_FONT_TYPE,
} from './core/text-fonts';
import { millisecondsToMicroseconds } from './core/time';
import {
  MediaRuntimeProvider,
  TextLayoutError,
  useMediaRuntime,
} from './media';
import {
  createTimelineStore,
  createVideoTimelineDraft,
  selectTimelineDuration,
} from './store/timeline-store';
import {
  TimelineStoreProvider,
  useTimelineStore,
  useTimelineStoreApi,
} from './store/timeline-store-context';
import { EaseCutThemeProvider } from './theme-provider';
import type {
  CompositionExportPayload,
  TimelineClip,
  TimelineClipTimingPreview,
  VideoTimelineDraft,
  EaseCutProps,
} from './types';
import { TimelinePanel } from './timeline/TimelinePanel';
import { shouldIgnoreShortcutTarget } from './util/browser';
import { isHttpUrl, tryParseUrl } from './util/url';

const downloadBlob = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = fileName;
  anchor.href = url;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const downloadJson = (fileName: string, payload: unknown) => {
  downloadBlob(
    fileName,
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
};

export const EaseCut = forwardRef<
  EaseCutHandle,
  EaseCutProps
>(function EaseCut(
  {
    initialDraft,
    mediaLoader,
    onSourcesChange,
    ...props
  },
  ref,
) {
  const [sourceStore] = useState(() => createVideoTimelineSourceStore());
  const sources = useStore(sourceStore, (state) => state.sources);
  const [store] = useState(() =>
    createTimelineStore({
      draft: initialDraft,
    }),
  );
  const onSourcesChangeRef = useRef(onSourcesChange);

  useEffect(() => {
    onSourcesChangeRef.current = onSourcesChange;
  }, [onSourcesChange]);

  useEffect(
    () =>
      sourceStore.subscribe((state) => {
        onSourcesChangeRef.current?.(
          state.sources.map((source) => ({ ...source })),
        );
      }),
    [sourceStore],
  );

  return (
    <TimelineStoreProvider store={store}>
      <MediaRuntimeProvider mediaLoader={mediaLoader} sources={sources}>
        <EaseCutApiProvider apiRef={ref} sourceStore={sourceStore}>
          <EaseCutView {...props} />
        </EaseCutApiProvider>
      </MediaRuntimeProvider>
    </TimelineStoreProvider>
  );
});

type EaseCutViewProps = Omit<
  EaseCutProps,
  'initialDraft' | 'mediaLoader' | 'onSourcesChange'
>;

function EaseCutView({
  className = '',
  jsonFileName = 'video-composition.json',
  onClose,
  onDraftChange,
  onExport,
  style,
  theme = 'dark',
  title = 'EaseCut',
}: EaseCutViewProps) {
  const titleId = useId();
  const store = useTimelineStoreApi();
  const runtime = useMediaRuntime();
  const api = useEaseCutApi();
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTitleDialogOpen, setIsTitleDialogOpen] = useState(false);
  const [isAddingTitle, setIsAddingTitle] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [titleTextError, setTitleTextError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [clipTimingPreview, setClipTimingPreview] =
    useState<TimelineClipTimingPreview | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const importDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const importUrlInputRef = useRef<HTMLInputElement | null>(null);
  const titleDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const titleTextInputRef = useRef<HTMLInputElement | null>(null);
  const titleLayoutRequestRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const importErrorId = useId();
  const titleTextErrorId = useId();

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    if (!isImportDialogOpen) return undefined;

    const focusTimer = window.setTimeout(() => {
      importUrlInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [isImportDialogOpen]);

  useEffect(() => {
    if (!isTitleDialogOpen) return undefined;
    const focusTimer = window.setTimeout(() => {
      titleTextInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [isTitleDialogOpen]);

  useEffect(
    () => () => {
      titleLayoutRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const initialState = store.getState();
    let previousCanvasSize = initialState.canvasSize;
    let previousClips = initialState.clips;
    let previousTracks = initialState.tracks;
    let previousDraftJson = JSON.stringify(
      createVideoTimelineDraft(initialState),
    );

    return store.subscribe((state) => {
      if (
        state.canvasSize === previousCanvasSize &&
        state.clips === previousClips &&
        state.tracks === previousTracks
      ) {
        return;
      }
      previousCanvasSize = state.canvasSize;
      previousClips = state.clips;
      previousTracks = state.tracks;
      const nextDraft = createVideoTimelineDraft(state);
      const nextDraftJson = JSON.stringify(nextDraft);
      if (nextDraftJson === previousDraftJson) return;

      previousDraftJson = nextDraftJson;
      onDraftChangeRef.current?.(nextDraft);
    });
  }, [store]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    let animationFrame = 0;
    let lastFrameAt = performance.now();
    const tick = (frameAt: number) => {
      const state = store.getState();
      const duration = selectTimelineDuration(state);
      const elapsedUs = millisecondsToMicroseconds(
        Math.max(0, frameAt - lastFrameAt),
      );
      const nextTimeUs = state.currentTimeUs + elapsedUs;
      lastFrameAt = frameAt;

      if (nextTimeUs >= duration) {
        state.setCurrentTimeUs(duration);
        state.setIsPlaying(false);
        return;
      }

      state.setCurrentTimeUs(nextTimeUs);
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

  const resetImportForm = () => {
    setImportError(null);
    setImportUrl('');
  };

  const closeImportDialog = () => {
    if (isImporting) return;
    setIsImportDialogOpen(false);
    resetImportForm();
  };

  const openImportDialog = () => {
    importDialogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    resetImportForm();
    setIsImportDialogOpen(true);
  };

  const closeTitleDialog = () => {
    titleLayoutRequestRef.current?.abort();
    titleLayoutRequestRef.current = null;
    setIsAddingTitle(false);
    setIsTitleDialogOpen(false);
    setTitleText('');
    setTitleTextError(null);
  };

  const openTitleDialog = () => {
    titleDialogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setTitleText('');
    setTitleTextError(null);
    setIsTitleDialogOpen(true);
  };

  const submitTitle = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAddingTitle) return;
    const text = titleText.trim();
    if (text === '') {
      setTitleTextError('请输入标题内容。');
      return;
    }
    const startUs = store.getState().currentTimeUs;
    const controller = new AbortController();
    titleLayoutRequestRef.current?.abort();
    titleLayoutRequestRef.current = controller;
    setTitleTextError(null);
    setIsAddingTitle(true);
    try {
      const layoutSize = await runtime.measureTextLayout(
        {
          bold: false,
          fontSize: DEFAULT_TIMELINE_TEXT_FONT_SIZE,
          fontType: DEFAULT_TIMELINE_TEXT_FONT_TYPE,
          italic: false,
          text,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      store.getState().addTextClip({ layoutSize, startUs, text });
      closeTitleDialog();
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setTitleTextError(
        error instanceof TextLayoutError
          ? error.message
          : '文字尺寸计算失败，请重试。',
      );
    } finally {
      if (titleLayoutRequestRef.current === controller) {
        titleLayoutRequestRef.current = null;
        setIsAddingTitle(false);
      }
    }
  };

  const submitMediaImport = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isImporting) return;

    const url = importUrl.trim();
    const parsedUrl = tryParseUrl(url);
    if (!parsedUrl || !isHttpUrl(parsedUrl)) {
      setImportError('请输入有效的 http 或 https 素材地址。');
      return;
    }

    setImportError(null);
    setIsImporting(true);
    let sourceId: string | null = null;
    try {
      const source = await api.source.add(parsedUrl.href);
      sourceId = source.id;
      await api.clip.add({ sourceId });
      setIsImportDialogOpen(false);
      resetImportForm();
    } catch (error) {
      if (sourceId) {
        api.source.remove(sourceId);
      }
      setImportError(
        error instanceof Error ? error.message : '该素材上传失败',
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isImportDialogOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeImportDialog();
      return;
    }
    if (isTitleDialogOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeTitleDialog();
      return;
    }
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
    if (commandKey && !event.altKey && !event.shiftKey && key === 'arrowleft') {
      event.preventDefault();
      event.stopPropagation();
      state.setCurrentTimeUs(
        Math.max(0, state.currentTimeUs - millisecondsToMicroseconds(100)),
      );
      return;
    }
    if (commandKey && !event.altKey && !event.shiftKey && key === 'arrowright') {
      event.preventDefault();
      event.stopPropagation();
      state.setCurrentTimeUs(
        state.currentTimeUs + millisecondsToMicroseconds(100),
      );
      return;
    }
    if (commandKey && !event.altKey && !event.shiftKey && key === 'c') {
      event.preventDefault();
      event.stopPropagation();
      state.copySelectedClip();
      return;
    }
    if (commandKey && !event.altKey && !event.shiftKey && key === 'v') {
      event.preventDefault();
      event.stopPropagation();
      state.pasteCopiedClip();
      return;
    }
    if (commandKey || event.altKey) return;

    if (!event.shiftKey && !event.repeat && key === 'h') {
      const selectedClip = state.clips.find(
        (clip) => clip.id === state.selectedClipId,
      );
      if (selectedClip) {
        event.preventDefault();
        event.stopPropagation();
        state.setClipHidden(selectedClip.id, !selectedClip.hidden);
      }
      return;
    }
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

  const downloadOriginalClip = async (clip: TimelineClip) => {
    if (!isTimelineMediaClip(clip)) return;
    try {
      const blob = await runtime.getBlob({ src: clip.src, type: clip.type });
      downloadBlob(clip.name, blob);
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? `素材下载失败：${error.message}`
          : '素材下载失败，请稍后重试。',
      );
    }
  };

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

  const rootClassName = `ec-editor${className ? ` ${className}` : ''}`;

  return (
    <EaseCutThemeProvider theme={theme}>
      <Toast.Provider label='编辑器提示'>
        <div
          ref={rootRef}
          aria-labelledby={titleId}
          className={rootClassName}
          data-light-theme={theme}
          onKeyDown={handleKeyDown}
          onPointerDownCapture={(event) => {
            if (!(event.target instanceof Element)) return;
            if (
              !event.target.closest(
                'button, input, select, textarea, summary, a[href], [role="dialog"], [role="menu"]',
              )
            ) {
              rootRef.current?.focus({ preventScroll: true });
            }
          }}
          style={style}
          tabIndex={0}
          role='region'
        >
      <header className='ec-editor__header'>
        <h1 id={titleId}>{title}</h1>
        <div className='ec-editor__header-actions'>
          <ExportMenu
            isExporting={isExporting}
            onExportJson={() =>
              downloadJson(jsonFileName, getExportState().payload)
            }
            onExportLocal={onExport ? () => void submitExport() : undefined}
          />
          {onClose && (
            <IconButton
              aria-label='关闭 EaseCut'
              onClick={onClose}
              title='关闭'
            >
              <X aria-hidden='true' size={17} />
            </IconButton>
          )}
        </div>
      </header>

      <main className='ec-editor__main'>
        <PreviewPanel
          clipTimingPreview={clipTimingPreview}
          previewRef={previewRef}
        />

        <TimelinePanel
          onClipTimingPreviewChange={setClipTimingPreview}
          onDownloadClip={downloadOriginalClip}
          onRequestAddTitle={openTitleDialog}
          onRequestImport={openImportDialog}
          onRequestPreviewFullscreen={() => void requestPreviewFullscreen()}
        />
      </main>

      <FormDialog
        actions={
          <>
            <button
              className='ec-button ec-button--secondary'
              disabled={isImporting}
              onClick={closeImportDialog}
              type='button'
            >
              取消
            </button>
            <button
              className='ec-button ec-button--primary'
              disabled={isImporting}
              type='submit'
            >
              {isImporting ? '导入中…' : '确认导入'}
            </button>
          </>
        }
        closeLabel='关闭导入素材弹窗'
        describedBy={importError ? importErrorId : undefined}
        disabled={isImporting}
        onClose={closeImportDialog}
        onSubmit={(event) => void submitMediaImport(event)}
        open={isImportDialogOpen}
        returnFocusRef={importDialogReturnFocusRef}
        title='导入在线素材'
      >
        <label className='ec-import-dialog__field' htmlFor='ec-import-url'>
          <span>素材 URL</span>
          <TextInput
            aria-invalid={Boolean(importError)}
            autoComplete='url'
            id='ec-import-url'
            onChange={(event) => setImportUrl(event.target.value)}
            placeholder='https://example.com/video.mp4'
            ref={importUrlInputRef}
            required
            size='large'
            type='url'
            value={importUrl}
          />
        </label>
        {importError && (
          <p className='ec-import-dialog__error' id={importErrorId} role='alert'>
            {importError}
          </p>
        )}
      </FormDialog>
      <FormDialog
        actions={
          <>
            <button
              className='ec-button ec-button--secondary'
              onClick={closeTitleDialog}
              type='button'
            >
              取消
            </button>
            <button
              className='ec-button ec-button--primary'
              disabled={isAddingTitle}
              type='submit'
            >
              {isAddingTitle ? '计算尺寸中…' : '确认添加'}
            </button>
          </>
        }
        closeLabel='关闭添加文字标题弹窗'
        describedBy={titleTextError ? titleTextErrorId : undefined}
        onClose={closeTitleDialog}
        onSubmit={submitTitle}
        open={isTitleDialogOpen}
        returnFocusRef={titleDialogReturnFocusRef}
        title='添加文字标题'
      >
        <label className='ec-import-dialog__field' htmlFor='ec-title-text'>
          <span>标题内容</span>
          <TextInput
            aria-invalid={Boolean(titleTextError)}
            id='ec-title-text'
            disabled={isAddingTitle}
            onChange={(event) => {
              setTitleText(event.target.value);
              if (titleTextError) setTitleTextError(null);
            }}
            placeholder='请输入文字标题'
            ref={titleTextInputRef}
            required
            size='large'
            type='text'
            value={titleText}
          />
        </label>
        {titleTextError && (
          <p
            className='ec-import-dialog__error'
            id={titleTextErrorId}
            role='alert'
          >
            {titleTextError}
          </p>
        )}
      </FormDialog>
        <Toast.Root
          className='ec-editor__toast ec-editor__toast--error'
          duration={Infinity}
          onOpenChange={(open) => {
            if (!open) setExportError(null);
          }}
          open={Boolean(exportError)}
          role='alert'
          type='foreground'
        >
          <CircleAlert aria-hidden='true' className='ec-editor__toast-icon' size={16} />
          <Toast.Description className='ec-editor__toast-description'>
            {exportError}
          </Toast.Description>
          <Toast.Close aria-label='关闭提示' className='ec-editor__toast-close'>
            <X aria-hidden='true' size={16} />
          </Toast.Close>
        </Toast.Root>
        <Toast.Root
          className='ec-editor__toast ec-editor__toast--error'
          duration={5000}
          onOpenChange={(open) => {
            if (!open) setMediaError(null);
          }}
          open={Boolean(mediaError)}
          role='status'
          type='background'
        >
          <CircleAlert aria-hidden='true' className='ec-editor__toast-icon' size={16} />
          <Toast.Description className='ec-editor__toast-description'>
            {mediaError}
          </Toast.Description>
          <Toast.Close aria-label='关闭提示' className='ec-editor__toast-close'>
            <X aria-hidden='true' size={16} />
          </Toast.Close>
        </Toast.Root>
        <Toast.Viewport className='ec-editor__toast-viewport' />
        </div>
      </Toast.Provider>
    </EaseCutThemeProvider>
  );
}
