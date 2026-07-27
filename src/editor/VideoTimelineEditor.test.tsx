import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from './core/time';
import type {
  TimelineClip,
  VideoTimelineDraft,
  VideoTimelineExportRequest,
  VideoTimelineImportRequest,
  VideoTimelineSource,
} from './types';

vi.mock('./components/PreviewPanel', () => ({
  PreviewPanel: () => <div data-testid='preview-panel' />,
}));

vi.mock('./timeline/TimelinePanel', async () => {
  const { useTimelineStore } = await import(
    './store/timeline-store-context'
  );
  const { TimelineToolbar } = await import('./components/TimelineToolbar');

  return {
    TimelinePanel: ({
      onDownloadClip,
      onRequestImport,
      onRequestPreviewFullscreen,
    }: {
      onDownloadClip: (clip: TimelineClip) => void | Promise<void>;
      onRequestImport?: () => void;
      onRequestPreviewFullscreen: () => void;
    }) => {
      const clips = useTimelineStore((state) => state.clips);
      const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
      const isPlaying = useTimelineStore((state) => state.isPlaying);
      const selectedClipId = useTimelineStore((state) => state.selectedClipId);
      const selectClip = useTimelineStore((state) => state.selectClip);
      const setIsPlaying = useTimelineStore((state) => state.setIsPlaying);
      const toggleTrackMute = useTimelineStore(
        (state) => state.toggleTrackMute,
      );
      const tracks = useTimelineStore((state) => state.tracks);
      const firstClip = clips[0];
      const firstClipTrack = tracks.find(
        (track) => track.id === firstClip?.trackId,
      );

      return (
        <>
          <TimelineToolbar
            onRequestImport={onRequestImport}
            onRequestPreviewFullscreen={onRequestPreviewFullscreen}
          />
          <div
            data-clip-count={clips.length}
            data-current-time={currentTimeUs}
            data-first-duration={firstClip?.durationUs ?? ''}
            data-first-transform={JSON.stringify(firstClip?.transform ?? null)}
            data-first-track-volume={firstClipTrack?.volume ?? ''}
            data-playing={String(isPlaying)}
            data-selected-clip-id={selectedClipId ?? ''}
            data-testid='timeline-state'
          >
            <button
              aria-label='测试：切换播放'
              onClick={() => setIsPlaying(!isPlaying)}
              type='button'
            />
            <button
              aria-label='测试：切换首个片段静音'
              disabled={!firstClip}
              onClick={() => {
                if (firstClip) toggleTrackMute(firstClip.trackId);
              }}
              type='button'
            />
            <button
              aria-label='测试：下载首个片段原始素材'
              disabled={!firstClip}
              onClick={() => {
                if (firstClip) void onDownloadClip(firstClip);
              }}
              type='button'
            />
            <button
              aria-label='测试：选择首个片段'
              disabled={!firstClip}
              onClick={() => selectClip(firstClip?.id ?? null)}
              type='button'
            />
            <input aria-label='测试：编辑器内输入框' />
          </div>
        </>
      );
    },
  };
});

import { VideoTimelineEditor } from './VideoTimelineEditor';

const videoSource: VideoTimelineSource = {
  durationUs: secondsToMicroseconds(5),
  fileName: 'video.mp4',
  height: 720,
  id: 'video-1',
  src: '/video.mp4',
  type: 'video',
  width: 1280,
};

const audioSource: VideoTimelineSource = {
  durationUs: secondsToMicroseconds(4),
  fileName: 'music.mp3',
  id: 'audio-1',
  src: '/music.mp3',
  type: 'audio',
};

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const readBlobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(blob);
  });

describe('VideoTimelineEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('always shows JSON export and only renders optional export and close actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onExport = vi.fn();
    const { rerender } = render(
      <VideoTimelineEditor sources={[videoSource]} title='剪辑项目' />,
    );

    expect(screen.getByRole('heading', { name: '剪辑项目' })).toBeVisible();
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '导出视频' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '关闭视频编辑器' }),
    ).not.toBeInTheDocument();

    rerender(
      <VideoTimelineEditor
        onClose={onClose}
        onExport={onExport}
        sources={[videoSource]}
      />,
    );

    expect(screen.getByRole('button', { name: '导出视频' })).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: '关闭视频编辑器' }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens the online import dialog only when onImportMedia is configured', async () => {
    const user = userEvent.setup();
    const onImportMedia = vi.fn<(request: VideoTimelineImportRequest) => void>();
    const { rerender } = render(<VideoTimelineEditor sources={[videoSource]} />);

    expect(
      screen.queryByRole('button', { name: '导入素材' }),
    ).not.toBeInTheDocument();

    rerender(
      <VideoTimelineEditor
        onImportMedia={onImportMedia}
        sources={[videoSource]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));

    expect(screen.getByRole('dialog', { name: '导入在线素材' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('素材 URL')).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: '导入在线素材' }),
    ).not.toBeInTheDocument();
  });

  it('detects the media type from the URL suffix and closes after import', async () => {
    const user = userEvent.setup();
    const onImportMedia = vi.fn<(request: VideoTimelineImportRequest) => void>();
    render(
      <VideoTimelineEditor
        onImportMedia={onImportMedia}
        sources={[videoSource]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));

    const urlInput = screen.getByLabelText('素材 URL');
    await user.click(urlInput);
    await user.paste('file:///private/video.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '请输入有效的 http 或 https 素材地址。',
    );
    expect(onImportMedia).not.toHaveBeenCalled();

    await user.clear(urlInput);
    await user.paste('https://cdn.example.com/music.mp3?signature=1');
    expect(screen.queryByText('素材类型')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(onImportMedia).toHaveBeenCalledWith({
      type: 'audio',
      url: 'https://cdn.example.com/music.mp3?signature=1',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '导入在线素材' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('rejects missing or unsupported URL file suffixes', async () => {
    const user = userEvent.setup();
    const onImportMedia = vi.fn<(request: VideoTimelineImportRequest) => void>();
    render(
      <VideoTimelineEditor
        onImportMedia={onImportMedia}
        sources={[videoSource]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));
    const urlInput = screen.getByLabelText('素材 URL');

    await user.click(urlInput);
    await user.paste('https://cdn.example.com/document.pdf');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '不支持的素材文件后缀：.pdf。',
    );

    await user.clear(urlInput);
    await user.paste('https://cdn.example.com/no-extension');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法从 URL 文件后缀识别素材类型。',
    );
    expect(onImportMedia).not.toHaveBeenCalled();
  });

  it('prevents duplicate import submissions and displays callback failures', async () => {
    const user = userEvent.setup();
    const pendingImport = createDeferred<void>();
    const onImportMedia = vi
      .fn<(request: VideoTimelineImportRequest) => Promise<void>>()
      .mockReturnValueOnce(pendingImport.promise)
      .mockRejectedValueOnce(new Error('素材服务暂不可用'));
    render(
      <VideoTimelineEditor
        onImportMedia={onImportMedia}
        sources={[videoSource]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));
    await user.click(screen.getByLabelText('素材 URL'));
    await user.paste('https://cdn.example.com/video.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(screen.getByRole('button', { name: '导入中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '导入中…' }));
    expect(onImportMedia).toHaveBeenCalledOnce();
    expect(onImportMedia).toHaveBeenCalledWith({
      type: 'video',
      url: 'https://cdn.example.com/video.mp4',
    });

    pendingImport.resolve();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '导入在线素材' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '导入素材' }));
    await user.click(screen.getByLabelText('素材 URL'));
    await user.paste('https://cdn.example.com/retry.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('该素材上传失败');
    expect(screen.getByRole('dialog', { name: '导入在线素材' })).toBeVisible();
  });

  it('passes the latest draft and derived payload to onExport', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: VideoTimelineExportRequest) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <VideoTimelineEditor onExport={onExport} sources={[audioSource]} />,
    );
    await flushEffects();

    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-first-track-volume',
      '0',
    );
    await user.click(screen.getByRole('button', { name: '导出视频' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    const request = onExport.mock.calls[0][0];
    expect(
      request.draft.tracks.find((track) => track.type === 'audio')?.volume,
    ).toBe(0);
    expect(request.payload.Track.flat()).toEqual([
      expect.objectContaining({
        Extra: expect.arrayContaining([{ Type: 'a_volume', Volume: 0 }]),
        Source: audioSource.src,
        Type: 'audio',
      }),
    ]);
  });

  it('downloads the current composition payload as JSON', async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | null = null;
    let downloadedFileName = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exportedBlob = blob as Blob;
      return 'blob:composition-json';
    });
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function captureDownload(this: HTMLAnchorElement) {
        downloadedFileName = this.download;
      },
    );
    render(
      <VideoTimelineEditor
        jsonFileName='my-cut.json'
        sources={[audioSource]}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );

    await user.click(screen.getByRole('button', { name: '导出 JSON' }));

    expect(downloadedFileName).toBe('my-cut.json');
    expect(exportedBlob).not.toBeNull();
    const payload = JSON.parse(
      await readBlobText(exportedBlob as unknown as Blob),
    );
    expect(payload.Track.flat()).toEqual([
      expect.objectContaining({
        Extra: expect.arrayContaining([{ Type: 'a_volume', Volume: 0 }]),
        Source: audioSource.src,
      }),
    ]);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:composition-json');
  });

  it('downloads a clip original blob with its clip name', async () => {
    const user = userEvent.setup();
    const sourceBlob = new Blob(['original-video'], { type: 'video/mp4' });
    const loadBlob = vi.fn().mockResolvedValue(sourceBlob);
    let downloadedFileName = '';
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:clip-original');
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function captureDownload(this: HTMLAnchorElement) {
        downloadedFileName = this.download;
      },
    );
    render(
      <VideoTimelineEditor
        mediaLoader={{ loadBlob }}
        sources={[videoSource]}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: '测试：下载首个片段原始素材',
      }),
    );

    await waitFor(() => expect(downloadedFileName).toBe(videoSource.fileName));
    expect(loadBlob).toHaveBeenCalledWith(videoSource.src, {
      signal: expect.any(AbortSignal),
      source: videoSource,
    });
    expect(createObjectUrl).toHaveBeenCalledWith(sourceBlob);
    await waitFor(() =>
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:clip-original'),
    );
  });

  it('shows a media toast when downloading a clip original fails', async () => {
    const user = userEvent.setup();
    const loadBlob = vi.fn().mockRejectedValue(new Error('无权访问素材'));
    render(
      <VideoTimelineEditor
        mediaLoader={{ loadBlob }}
        sources={[videoSource]}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: '测试：下载首个片段原始素材',
      }),
    );

    expect(await screen.findByText('素材下载失败：无权访问素材')).toBeVisible();
  });

  it('fills a missing audio duration through the injected metadata loader', async () => {
    const loadMetadata = vi.fn().mockResolvedValue({
      durationUs: secondsToMicroseconds(9),
    });
    const loadBlob = vi.fn();
    render(
      <VideoTimelineEditor
        mediaLoader={{ loadBlob, loadMetadata }}
        sources={[{ ...audioSource, durationUs: undefined }]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('timeline-state')).toHaveAttribute(
        'data-first-duration',
        String(secondsToMicroseconds(9)),
      ),
    );
    expect(loadMetadata).toHaveBeenCalledOnce();
    expect(loadBlob).not.toHaveBeenCalled();
  });

  it('contains a square video after metadata is resolved and exports that transform', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: VideoTimelineExportRequest) => Promise<void>>()
      .mockResolvedValue(undefined);
    const squareSource: VideoTimelineSource = {
      fileName: 'square.mp4',
      id: 'square-video',
      src: '/square.mp4',
      type: 'video',
    };
    const loadMetadata = vi.fn().mockResolvedValue({
      durationUs: secondsToMicroseconds(6),
      height: 1080,
      width: 1080,
    });
    render(
      <VideoTimelineEditor
        mediaLoader={{ loadBlob: vi.fn(), loadMetadata }}
        onExport={onExport}
        sources={[squareSource]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('timeline-state')).toHaveAttribute(
        'data-first-transform',
        JSON.stringify({ height: 720, width: 720, x: 280, y: 0 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: '导出视频' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    expect(onExport.mock.calls[0][0].payload.Track.flat()[0]?.Extra).toContainEqual(
      {
        Height: 720,
        PosX: 280,
        PosY: 0,
        Type: 'transform',
        Width: 720,
      },
    );
  });

  it('blocks repeated export while keeping exit actions available, then allows retry', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<void>();
    const onClose = vi.fn();
    const onExport = vi
      .fn<(request: VideoTimelineExportRequest) => void | Promise<void>>()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(undefined);
    render(
      <VideoTimelineEditor
        onClose={onClose}
        onExport={onExport}
        sources={[videoSource]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '导出视频' }));

    expect(screen.getByRole('button', { name: '导出中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '关闭视频编辑器' }),
    ).toBeEnabled();
    expect(onExport).toHaveBeenCalledOnce();

    await act(async () => {
      deferred.reject(new Error('导出服务暂不可用'));
      await deferred.promise.catch(() => undefined);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '导出服务暂不可用',
    );
    const retryButton = screen.getByRole('button', { name: '导出视频' });
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);

    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '导出视频' })).toBeEnabled();
  });

  it('allows an export error toast to be dismissed manually', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: VideoTimelineExportRequest) => Promise<void>>()
      .mockRejectedValue(new Error('导出服务暂不可用'));
    render(
      <VideoTimelineEditor onExport={onExport} sources={[videoSource]} />,
    );

    await user.click(screen.getByRole('button', { name: '导出视频' }));

    const errorToast = await screen.findByRole('alert');
    expect(errorToast).toHaveTextContent('导出服务暂不可用');
    fireEvent.click(
      within(errorToast).getByRole('button', { name: '关闭提示' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('shows one upload failure notification when metadata loading falls back to defaults', async () => {
    const loadMetadata = vi.fn().mockResolvedValue(null);
    render(
      <VideoTimelineEditor
        mediaLoader={{ loadBlob: vi.fn(), loadMetadata }}
        sources={[{ ...audioSource, durationUs: undefined }]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByText('该素材上传失败')).toBeVisible();
  });

  it('emits draft changes for persistent edits but not playback state', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: VideoTimelineDraft) => void>();
    render(
      <VideoTimelineEditor
        onDraftChange={onDraftChange}
        sources={[audioSource]}
      />,
    );
    await flushEffects();
    onDraftChange.mockClear();

    await user.click(screen.getByRole('button', { name: '测试：切换播放' }));
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-playing',
      'true',
    );
    expect(onDraftChange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledOnce());
    expect(
      onDraftChange.mock.calls[0][0].tracks.find(
        (track) => track.type === 'audio',
      )?.volume,
    ).toBe(0);
  });

  it('handles shortcuts only when they originate inside the focused editor', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <input aria-label='编辑器外输入框' />
        <VideoTimelineEditor sources={[videoSource]} />
      </>,
    );
    const editor = container.querySelector<HTMLElement>('.oc-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');

    await user.click(screen.getByRole('textbox', { name: '编辑器外输入框' }));
    await user.keyboard(' ');
    expect(state).toHaveAttribute('data-playing', 'false');

    editor.focus();
    await user.keyboard(' ');
    expect(state).toHaveAttribute('data-playing', 'true');

    await user.click(screen.getByRole('textbox', { name: '编辑器外输入框' }));
    await user.keyboard(' ');
    expect(state).toHaveAttribute('data-playing', 'true');

    editor.focus();
    await user.keyboard(' ');
    expect(state).toHaveAttribute('data-playing', 'false');
  });

  it('moves the playhead by 0.1 seconds with Ctrl+Arrow keys', () => {
    const { container } = render(<VideoTimelineEditor sources={[videoSource]} />);
    const editor = container.querySelector<HTMLElement>('.oc-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'ArrowRight' });
    expect(state).toHaveAttribute(
      'data-current-time',
      String(secondsToMicroseconds(0.1)),
    );

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'ArrowLeft' });
    expect(state).toHaveAttribute('data-current-time', '0');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'ArrowLeft' });
    expect(state).toHaveAttribute('data-current-time', '0');
  });

  it('ignores playback and delete shortcuts from an input inside the editor', async () => {
    const user = userEvent.setup();
    render(<VideoTimelineEditor sources={[videoSource]} />);
    const state = screen.getByTestId('timeline-state');
    await user.click(
      screen.getByRole('button', { name: '测试：选择首个片段' }),
    );
    await user.click(
      screen.getByRole('textbox', { name: '测试：编辑器内输入框' }),
    );

    await user.keyboard(' ');
    await user.keyboard('{Backspace}');
    fireEvent.keyDown(screen.getByRole('textbox', { name: '测试：编辑器内输入框' }), {
      ctrlKey: true,
      key: 'c',
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '测试：编辑器内输入框' }), {
      ctrlKey: true,
      key: 'v',
    });

    expect(state).toHaveAttribute('data-playing', 'false');
    expect(state).toHaveAttribute('data-clip-count', '1');
  });

  it('routes copy and paste shortcuts only to the focused editor instance', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <VideoTimelineEditor sources={[videoSource]} title='编辑器 A' />
        <VideoTimelineEditor sources={[videoSource]} title='编辑器 B' />
      </>,
    );
    const editors = Array.from(
      container.querySelectorAll<HTMLElement>('.oc-editor'),
    );
    const states = screen.getAllByTestId('timeline-state');

    await user.click(
      within(editors[0]).getByRole('button', { name: '测试：选择首个片段' }),
    );
    editors[0].focus();
    fireEvent.keyDown(editors[0], { ctrlKey: true, key: 'c' });
    fireEvent.keyDown(editors[0], { ctrlKey: true, key: 'v' });

    expect(states[0]).toHaveAttribute('data-clip-count', '2');
    expect(states[1]).toHaveAttribute('data-clip-count', '1');
    expect(states[0]).toHaveAttribute(
      'data-selected-clip-id',
      'clip-video-1-copy',
    );

    editors[1].focus();
    fireEvent.keyDown(editors[1], { metaKey: true, key: 'v' });
    expect(states[1]).toHaveAttribute('data-clip-count', '1');
  });

  it('routes Ctrl+Z and Ctrl+Y to the focused editor undo history', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <VideoTimelineEditor sources={[audioSource]} />,
    );
    const editor = container.querySelector<HTMLElement>('.oc-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');
    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );
    expect(state).toHaveAttribute('data-first-track-volume', '0');

    editor.focus();
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'z' });
    expect(state).toHaveAttribute('data-first-track-volume', '1');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'y' });
    expect(state).toHaveAttribute('data-first-track-volume', '0');
  });

  it('keeps playback state isolated between two editor instances', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <VideoTimelineEditor sources={[videoSource]} title='编辑器 A' />
        <VideoTimelineEditor sources={[videoSource]} title='编辑器 B' />
      </>,
    );
    const editors = Array.from(
      container.querySelectorAll<HTMLElement>('.oc-editor'),
    );
    const states = screen.getAllByTestId('timeline-state');

    editors[0].focus();
    await user.keyboard(' ');
    expect(states[0]).toHaveAttribute('data-playing', 'true');
    expect(states[1]).toHaveAttribute('data-playing', 'false');

    editors[1].focus();
    await user.keyboard(' ');
    expect(states[0]).toHaveAttribute('data-playing', 'true');
    expect(states[1]).toHaveAttribute('data-playing', 'true');

    await user.click(
      within(editors[0]).getByRole('button', { name: '测试：切换播放' }),
    );
    await user.click(
      within(editors[1]).getByRole('button', { name: '测试：切换播放' }),
    );
  });
});
