import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CircleAlert, FileJson, FileVideo, X } from 'lucide-react';

import { PreviewPanel } from './components/PreviewPanel';
import { FormDialog } from './components/FormDialog';
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
import type {
  CompositionExportPayload,
  TimelineClip,
  TimelineClipTimingPreview,
  VideoTimelineDraft,
  VideoTimelineEditorProps,
  VideoTimelineMediaType,
  VideoTimelineSource,
} from './types';
import { TimelinePanel } from './timeline/TimelinePanel';

const isPositiveNumber = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const hasCompleteSourceMetadata = (source: VideoTimelineSource) =>
  source.type === 'audio'
    ? isPositiveNumber(source.durationUs)
    : isPositiveNumber(source.durationUs) &&
      isPositiveNumber(source.height) &&
      isPositiveNumber(source.width);

const VIDEO_FILE_EXTENSIONS = new Set([
  '3g2',
  '3gp',
  'avi',
  'm2ts',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'm3u8',
  'ogv',
  'ts',
  'webm',
]);

const AUDIO_FILE_EXTENSIONS = new Set([
  'aac',
  'aif',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'weba',
  'wma',
]);

const detectOnlineMediaType = (url: URL): VideoTimelineMediaType => {
  const fileName = url.pathname.split('/').at(-1)?.toLowerCase() ?? '';
  const extension = fileName.match(/\.([a-z0-9]+)$/)?.[1];

  if (!extension) {
    throw new Error('无法从 URL 文件后缀识别素材类型。');
  }
  if (VIDEO_FILE_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_FILE_EXTENSIONS.has(extension)) return 'audio';

  throw new Error(`不支持的素材文件后缀：.${extension}。`);
};

const shouldIgnoreShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return Boolean(
    target.closest(
      'input, textarea, select, button, a[href], summary, [role="button"], [contenteditable="true"]',
    ),
  );
};

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
  onImportMedia,
  sources,
  style,
  title = '视频合成',
}: VideoTimelineEditorViewProps) {
  const titleId = useId();
  const store = useTimelineStoreApi();
  const runtime = useMediaRuntime();
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const syncSources = useTimelineStore((state) => state.syncSources);
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
  const notifiedMetadataFailureSourceIdsRef = useRef(new Set<string>());
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
    const activeSourceIds = new Set(sources.map((source) => source.id));
    for (const sourceId of notifiedMetadataFailureSourceIdsRef.current) {
      if (!activeSourceIds.has(sourceId)) {
        notifiedMetadataFailureSourceIdsRef.current.delete(sourceId);
      }
    }

    void Promise.all(
      sources.map(async (source) => {
        if (hasCompleteSourceMetadata(source)) return source;

        try {
          const metadata = await runtime.getMetadata(source);
          if (!metadata) return source;

          return {
            ...source,
            ...(!isPositiveNumber(source.durationUs) &&
            isPositiveNumber(metadata.durationUs)
              ? { durationUs: metadata.durationUs }
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

      const hasNewMetadataFailure = resolvedSources.some((source) => {
        if (hasCompleteSourceMetadata(source)) return false;
        if (notifiedMetadataFailureSourceIdsRef.current.has(source.id)) {
          return false;
        }

        notifiedMetadataFailureSourceIdsRef.current.add(source.id);
        return true;
      });
      if (hasNewMetadataFailure) setMediaError('该素材上传失败');
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

  const submitTitle = async (event: FormEvent<HTMLFormElement>) => {
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

  const submitMediaImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onImportMedia || isImporting) return;

    const url = importUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new TypeError('Unsupported protocol');
      }
    } catch {
      setImportError('请输入有效的 http 或 https 素材地址。');
      return;
    }

    let type: VideoTimelineMediaType;
    try {
      type = detectOnlineMediaType(parsedUrl);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : '无法识别素材类型。',
      );
      return;
    }

    setImportError(null);
    setIsImporting(true);
    try {
      await onImportMedia({ type, url });
      setIsImportDialogOpen(false);
      resetImportForm();
    } catch {
      setImportError('该素材上传失败');
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
      const blob = await runtime.getBlob(clip.src);
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
    <Toast.Provider label='编辑器提示'>
      <div
        ref={rootRef}
        aria-labelledby={titleId}
        className={rootClassName}
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
          <button
            className='ec-button ec-button--secondary'
            onClick={() => downloadJson(jsonFileName, getExportState().payload)}
            type='button'
          >
            <FileJson aria-hidden='true' size={16} />
            导出 JSON
          </button>
          {onExport && (
            <button
              className='ec-button ec-button--primary'
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
              className='ec-icon-button'
              onClick={onClose}
              title='关闭'
              type='button'
            >
              <X aria-hidden='true' size={17} />
            </button>
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
          onRequestImport={onImportMedia ? openImportDialog : undefined}
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
  );
}
