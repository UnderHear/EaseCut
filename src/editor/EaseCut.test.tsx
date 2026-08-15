import { createRef } from 'react';
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
import {
  EaseCutApiError,
  type EaseCutHandle,
} from './api';
import type {
  TimelineClip,
  VideoTimelineDraft,
  EaseCutProps,
  EaseCutExportRequest,
  EaseCutMediaMetadata,
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
      onRequestAddTitle,
      onRequestImport,
    }: {
      onDownloadClip: (clip: TimelineClip) => void | Promise<void>;
      onRequestAddTitle: () => void;
      onRequestImport?: () => void;
    }) => {
      const clips = useTimelineStore((state) => state.clips);
      const canvasSize = useTimelineStore((state) => state.canvasSize);
      const beginTextStyleEdit = useTimelineStore(
        (state) => state.beginTextStyleEdit,
      );
      const commitTextStyleEdit = useTimelineStore(
        (state) => state.commitTextStyleEdit,
      );
      const continuousEdit = useTimelineStore(
        (state) => state.continuousEdit,
      );
      const currentTimeUs = useTimelineStore((state) => state.currentTimeUs);
      const isPlaying = useTimelineStore((state) => state.isPlaying);
      const selectedClipId = useTimelineStore((state) => state.selectedClipId);
      const tracks = useTimelineStore((state) => state.tracks);
      const selectClip = useTimelineStore((state) => state.selectClip);
      const setIsPlaying = useTimelineStore((state) => state.setIsPlaying);
      const previewTextStyleEdit = useTimelineStore(
        (state) => state.previewTextStyleEdit,
      );
      const toggleTrackMute = useTimelineStore(
        (state) => state.toggleTrackMute,
      );
      const firstClip = clips[0];
      const lastClip = clips.at(-1);
      const textClip = clips.find((clip) => clip.type === 'text');

      return (
        <>
          <TimelineToolbar
            onRequestAddTitle={onRequestAddTitle}
            onRequestImport={onRequestImport}
          />
          <div
            data-canvas-size={JSON.stringify(canvasSize)}
            data-clip-count={clips.length}
            data-current-time={currentTimeUs}
            data-first-duration={firstClip?.durationUs ?? ''}
            data-first-hidden={String(firstClip?.hidden ?? false)}
            data-first-transform={JSON.stringify(
              firstClip && firstClip.type !== 'text'
                ? firstClip.transform
                : null,
            )}
            data-first-clip-volume={
              firstClip &&
              (firstClip.type === 'video' || firstClip.type === 'audio')
                ? firstClip.volume
                : ''
            }
            data-last-duration={lastClip?.durationUs ?? ''}
            data-last-font-color={
              lastClip?.type === 'text' ? lastClip.fontColor : ''
            }
            data-last-layout={JSON.stringify(
              lastClip?.type === 'text' ? lastClip.layoutSize : null,
            )}
            data-last-position={JSON.stringify(
              lastClip?.type === 'text' ? lastClip.position : null,
            )}
            data-last-text={lastClip?.type === 'text' ? lastClip.text : ''}
            data-last-type={lastClip?.type ?? ''}
            data-playing={String(isPlaying)}
            data-selected-clip-id={selectedClipId ?? ''}
            data-source-ids={JSON.stringify(
              clips.flatMap((clip) =>
                clip.type === 'text' ? [] : [clip.sourceId],
              ),
            )}
            data-track-count={tracks.length}
            data-testid='timeline-state'
          >
            <button
              aria-label='测试：切换播放'
              onClick={() => setIsPlaying(!isPlaying)}
              type='button'
            />
            <button
              aria-label='测试：预览文字颜色'
              disabled={!textClip}
              onClick={() => {
                if (!textClip) return;
                const token = beginTextStyleEdit(textClip.id);
                if (token !== null) {
                  previewTextStyleEdit(textClip.id, token, '#123456FF');
                }
              }}
              type='button'
            />
            <button
              aria-label='测试：提交文字颜色'
              disabled={!textClip}
              onClick={() => {
                if (
                  textClip &&
                  continuousEdit?.kind === 'text-style' &&
                  continuousEdit.clipId === textClip.id
                ) {
                  commitTextStyleEdit(
                    textClip.id,
                    continuousEdit.token,
                    '#123456FF',
                  );
                }
              }}
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
            <button
              aria-label='测试：取消片段选择'
              onClick={() => selectClip(null)}
              type='button'
            />
            <input aria-label='测试：编辑器内输入框' />
          </div>
        </>
      );
    },
  };
});

import { EaseCut } from './EaseCut';

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

const imageSource: VideoTimelineSource = {
  fileName: 'still.png',
  height: 900,
  id: 'image-1',
  src: '/still.png',
  type: 'image',
  width: 600,
};

const textDraft: VideoTimelineDraft = {
  canvasSize: { height: 720, width: 1280 },
  clips: [
    {
      bold: false,
      durationUs: secondsToMicroseconds(5),
      fontColor: '#FFFFFFFF',
      fontSize: 120,
      fontType: 'SY_Black',
      hidden: false,
      id: 'text-clip-1',
      italic: false,
      layoutSize: { height: 120, width: 800 },
      position: { x: 240, y: 300 },
      startUs: 0,
      text: '颜色事务',
      trackId: 'text-track-1',
      type: 'text',
      underline: false,
      zIndex: 0,
    },
  ],
  schemaVersion: 12,
  tracks: [
    {
      id: 'video-track-1',
      muted: false,
      name: '视频轨',
      type: 'video',
      zIndex: 0,
    },
    {
      id: 'text-track-1',
      muted: false,
      name: '文字轨 1',
      type: 'text',
      zIndex: 1,
    },
  ],
};

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const addSourcesAndClips = async (
  editor: EaseCutHandle | null,
  sources: readonly VideoTimelineSource[],
) => {
  if (!editor) throw new Error('编辑器实例未就绪');
  for (const input of sources) {
    const source = await editor.source.add(input);
    await editor.clip.add({ sourceId: source.id });
  }
};

const renderEditor = async (
  props: EaseCutProps = {},
  sources: readonly VideoTimelineSource[] = [],
) => {
  const ref = createRef<EaseCutHandle>();
  const view = render(<EaseCut {...props} ref={ref} />);

  await act(async () => {
    await addSourcesAndClips(ref.current, sources);
  });

  return { ...view, ref };
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

describe('EaseCut', () => {
  const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(() => Promise.resolve([{}])) },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) =>
        ({
          actualBoundingBoxAscent: 100,
          actualBoundingBoxDescent: 20,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: text.length * 100,
          fontBoundingBoxAscent: 100,
          fontBoundingBoxDescent: 20,
          width: text.length * 100,
        }) as TextMetrics,
      textAlign: 'left',
      textBaseline: 'alphabetic',
    } as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (fontsDescriptor) {
      Object.defineProperty(document, 'fonts', fontsDescriptor);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('renders with an omitted source catalog', () => {
    render(<EaseCut />);

    expect(screen.getByRole('heading', { name: 'EaseCut' })).toBeVisible();
    expect(screen.getByRole('button', { name: '导出' })).toBeVisible();
  });

  it('always shows the export menu and only renders the optional close action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onExport = vi.fn();
    const { rerender } = render(
      <EaseCut title='剪辑项目' />,
    );

    expect(screen.getByRole('heading', { name: '剪辑项目' })).toBeVisible();
    const exportTrigger = screen.getByRole('button', { name: '导出' });
    expect(exportTrigger).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '导出视频' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '关闭 EaseCut' }),
    ).not.toBeInTheDocument();

    await user.click(exportTrigger);
    expect(screen.getByRole('menuitem', { name: '导出到本地' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: '导出 JSON' })).toBeEnabled();
    expect(screen.queryByText('导出位置')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    rerender(
      <EaseCut
        onClose={onClose}
        onExport={onExport}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '导出视频' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导出' }));
    expect(screen.getByRole('menuitem', { name: '导出到本地' })).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: '关闭 EaseCut' }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('always exposes the instance-backed online import dialog', async () => {
    const user = userEvent.setup();
    render(<EaseCut />);
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

  it('adds a five-second text title from the always-available title dialog', async () => {
    const user = userEvent.setup();
    await renderEditor({}, [videoSource]);

    const addTitleButton = screen.getByRole('button', { name: '添加标题' });
    expect(addTitleButton).toBeVisible();
    expect(screen.getByRole('button', { name: '导入素材' })).toBeVisible();

    await user.click(addTitleButton);
    expect(
      screen.getByRole('dialog', { name: '添加文字标题' }),
    ).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('标题内容')).toHaveFocus());

    await user.paste('未提交标题');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(addTitleButton).toHaveFocus());

    await user.click(addTitleButton);
    expect(screen.getByLabelText('标题内容')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '确认添加' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入标题内容');

    await user.click(screen.getByLabelText('标题内容'));
    await user.paste('我们的精彩旅程');
    await user.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '添加文字标题' }),
      ).not.toBeInTheDocument();
    });
    const timelineState = screen.getByTestId('timeline-state');
    expect(timelineState).toHaveAttribute('data-clip-count', '2');
    expect(timelineState).toHaveAttribute('data-last-type', 'text');
    expect(timelineState).toHaveAttribute(
      'data-last-text',
      '我们的精彩旅程',
    );
    expect(timelineState).toHaveAttribute(
      'data-last-duration',
      String(secondsToMicroseconds(5)),
    );
    expect(timelineState).toHaveAttribute(
      'data-last-layout',
      JSON.stringify({ height: 120, width: 700 }),
    );
    expect(timelineState).toHaveAttribute(
      'data-last-position',
      JSON.stringify({ x: 290, y: 300 }),
    );
  });

  it('keeps the title dialog open when natural-size measurement fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: vi.fn(() => Promise.reject(new Error('font unavailable'))),
      },
    });
    await renderEditor({}, [videoSource]);

    await user.click(screen.getByRole('button', { name: '添加标题' }));
    await user.click(screen.getByLabelText('标题内容'));
    await user.paste('无法测量的标题');
    await user.click(screen.getByRole('button', { name: '确认添加' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '字体资源加载失败，无法计算文字尺寸',
    );
    expect(
      screen.getByRole('dialog', { name: '添加文字标题' }),
    ).toBeVisible();
    expect(screen.getByLabelText('标题内容')).toHaveValue('无法测量的标题');
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '1',
    );
  });

  it('detects the media type, registers the source, and adds its clip', async () => {
    const user = userEvent.setup();
    const loadMetadata = vi.fn().mockResolvedValue({
      durationUs: secondsToMicroseconds(8),
    });
    await renderEditor(
      { mediaLoader: { loadBlob: vi.fn(), loadMetadata } },
      [videoSource],
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));

    const urlInput = screen.getByLabelText('素材 URL');
    await user.click(urlInput);
    await user.paste('file:///private/video.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '请输入有效的 http 或 https 素材地址。',
    );
    expect(loadMetadata).not.toHaveBeenCalled();

    await user.clear(urlInput);
    await user.paste('https://cdn.example.com/music.mp3?signature=1');
    expect(screen.queryByText('素材类型')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '导入在线素材' }),
      ).not.toBeInTheDocument(),
    );
    expect(loadMetadata).toHaveBeenCalledOnce();
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '2',
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-last-type',
      'audio',
    );
  });

  it.each(['png', 'jpg', 'jpeg'])(
    'detects .%s image URLs with uppercase suffixes and query parameters',
    async (extension) => {
      const user = userEvent.setup();
      await renderEditor(
        {
          mediaLoader: {
            loadBlob: vi.fn(),
            loadMetadata: vi.fn().mockResolvedValue({
              height: 900,
              width: 600,
            }),
          },
        },
        [videoSource],
      );
      await user.click(screen.getByRole('button', { name: '导入素材' }));
      const url = `https://cdn.example.com/still.${extension.toUpperCase()}?signature=1`;
      await user.click(screen.getByLabelText('素材 URL'));
      await user.paste(url);
      await user.click(screen.getByRole('button', { name: '确认导入' }));

      await waitFor(() =>
        expect(screen.getByTestId('timeline-state')).toHaveAttribute(
          'data-last-type',
          'image',
        ),
      );
    },
  );

  it('rejects missing or unsupported URL file suffixes', async () => {
    const user = userEvent.setup();
    render(<EaseCut />);
    await user.click(screen.getByRole('button', { name: '导入素材' }));
    const urlInput = screen.getByLabelText('素材 URL');

    await user.click(urlInput);
    await user.paste('https://cdn.example.com/document.pdf');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '不支持的素材文件后缀：.pdf。',
    );

    for (const extension of ['webp', 'gif', 'svg']) {
      await user.clear(urlInput);
      await user.click(urlInput);
      await user.paste(`https://cdn.example.com/still.${extension}`);
      await user.click(screen.getByRole('button', { name: '确认导入' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        `不支持的素材文件后缀：.${extension}。`,
      );
    }

    await user.clear(urlInput);
    await user.paste('https://cdn.example.com/no-extension');
    await user.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法从素材地址识别媒体类型，请显式提供 type。',
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '0',
    );
  });

  it('prevents duplicate import submissions and displays metadata failures', async () => {
    const user = userEvent.setup();
    const pendingMetadata = createDeferred<{
      durationUs: number;
      height: number;
      width: number;
    }>();
    const loadMetadata = vi
      .fn()
      .mockReturnValueOnce(pendingMetadata.promise)
      .mockRejectedValueOnce(new Error('素材服务暂不可用'));
    await renderEditor(
      { mediaLoader: { loadBlob: vi.fn(), loadMetadata } },
      [videoSource],
    );
    await user.click(screen.getByRole('button', { name: '导入素材' }));
    await user.click(screen.getByLabelText('素材 URL'));
    await user.paste('https://cdn.example.com/video.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(screen.getByRole('button', { name: '导入中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '导入中…' }));
    expect(loadMetadata).toHaveBeenCalledOnce();

    pendingMetadata.resolve({
      durationUs: secondsToMicroseconds(8),
      height: 720,
      width: 1280,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '导入在线素材' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '导入素材' }));
    await user.click(screen.getByLabelText('素材 URL'));
    await user.paste('https://cdn.example.com/retry.mp4');
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '素材服务暂不可用',
    );
    expect(screen.getByRole('dialog', { name: '导入在线素材' })).toBeVisible();
  });

  it('passes the latest draft and derived payload to onExport', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: EaseCutExportRequest) => Promise<void>>()
      .mockResolvedValue(undefined);
    await renderEditor({ onExport }, [audioSource]);
    await flushEffects();

    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-first-clip-volume',
      '1',
    );
    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('menuitem', { name: '导出到本地' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    const request = onExport.mock.calls[0][0];
    expect(
      request.draft.tracks.find((track) => track.type === 'audio')?.muted,
    ).toBe(true);
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
    await renderEditor({ jsonFileName: 'my-cut.json' }, [audioSource]);
    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );

    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('menuitem', { name: '导出 JSON' }));

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
    await renderEditor({ mediaLoader: { loadBlob } }, [videoSource]);

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

  it('downloads an image original without adding audio properties', async () => {
    const user = userEvent.setup();
    const sourceBlob = new Blob([
      new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]),
    ], { type: 'image/png' });
    const loadBlob = vi.fn().mockResolvedValue(sourceBlob);
    let downloadedFileName = '';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image-original');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function captureDownload(this: HTMLAnchorElement) {
        downloadedFileName = this.download;
      },
    );
    await renderEditor({ mediaLoader: { loadBlob } }, [imageSource]);

    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-first-clip-volume',
      '',
    );
    await user.click(
      screen.getByRole('button', {
        name: '测试：下载首个片段原始素材',
      }),
    );

    await waitFor(() => expect(downloadedFileName).toBe('still.png'));
    expect(loadBlob).toHaveBeenCalledWith(imageSource.src, {
      signal: expect.any(AbortSignal),
      source: imageSource,
    });
  });

  it('shows a media toast when downloading a clip original fails', async () => {
    const user = userEvent.setup();
    const loadBlob = vi.fn().mockRejectedValue(new Error('无权访问素材'));
    await renderEditor({ mediaLoader: { loadBlob } }, [videoSource]);

    await user.click(
      screen.getByRole('button', {
        name: '测试：下载首个片段原始素材',
      }),
    );

    expect(await screen.findByText('素材下载失败：无权访问素材')).toBeVisible();
  });

  it('uses a square video as the original canvas after metadata is resolved', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: EaseCutExportRequest) => Promise<void>>()
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
    await renderEditor(
      {
        mediaLoader: { loadBlob: vi.fn(), loadMetadata },
        onExport,
      },
      [squareSource],
    );

    await waitFor(() =>
      expect(screen.getByTestId('timeline-state')).toHaveAttribute(
        'data-first-transform',
        JSON.stringify({ height: 1080, width: 1080, x: 0, y: 0 }),
      ),
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-canvas-size',
      JSON.stringify({ height: 1080, width: 1080 }),
    );
    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('menuitem', { name: '导出到本地' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    expect(onExport.mock.calls[0][0].payload.Canvas).toEqual({
      Height: 1080,
      Width: 1080,
    });
    expect(onExport.mock.calls[0][0].payload.Track.flat()[0]?.Extra).toContainEqual(
      {
        Height: 1080,
        PosX: 0,
        PosY: 0,
        Type: 'transform',
        Width: 1080,
      },
    );
  });

  it('blocks repeated export while keeping exit actions available, then allows retry', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<void>();
    const onClose = vi.fn();
    const onExport = vi
      .fn<(request: EaseCutExportRequest) => void | Promise<void>>()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(undefined);
    await renderEditor({ onClose, onExport }, [videoSource]);

    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('menuitem', { name: '导出到本地' }));

    await user.click(screen.getByRole('button', { name: '导出' }));
    expect(screen.getByRole('menuitem', { name: '导出中…' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: '导出 JSON' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '关闭 EaseCut' }),
    ).toBeEnabled();
    expect(onExport).toHaveBeenCalledOnce();

    await act(async () => {
      deferred.reject(new Error('导出服务暂不可用'));
      await deferred.promise.catch(() => undefined);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '导出服务暂不可用',
    );
    const retryButton = screen.getByRole('menuitem', { name: '导出到本地' });
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);

    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: '导出' }));
    expect(
      screen.getByRole('menuitem', { name: '导出到本地' }),
    ).toBeEnabled();
  });

  it('allows an export error toast to be dismissed manually', async () => {
    const user = userEvent.setup();
    const onExport = vi
      .fn<(request: EaseCutExportRequest) => Promise<void>>()
      .mockRejectedValue(new Error('导出服务暂不可用'));
    await renderEditor({ onExport }, [videoSource]);

    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('menuitem', { name: '导出到本地' }));

    const errorToast = await screen.findByRole('alert');
    expect(errorToast).toHaveTextContent('导出服务暂不可用');
    fireEvent.click(
      within(errorToast).getByRole('button', { name: '关闭提示' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('keeps existing clips when an instance source add fails', async () => {
    const ref = createRef<EaseCutHandle>();
    const loadMetadata = vi
      .fn()
      .mockRejectedValue(new Error('无法读取媒体元数据'));
    const mediaLoader = { loadBlob: vi.fn(), loadMetadata };
    const failedAudioSource: VideoTimelineSource = {
      ...audioSource,
      durationUs: undefined,
      id: 'failed-audio',
      src: '/failed-audio.mp3',
    };
    render(<EaseCut mediaLoader={mediaLoader} ref={ref} />);

    await act(async () => {
      const source = await ref.current?.source.add(videoSource);
      await ref.current?.clip.add({ sourceId: source?.id ?? '' });
    });

    await expect(
      ref.current?.source.add(failedAudioSource),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
    expect(ref.current?.source.get(failedAudioSource.id)).toBeUndefined();
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '1',
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-track-count',
      '1',
    );

    let addedSourceId = '';
    await act(async () => {
      const addedSource = await ref.current?.source.add({
        ...failedAudioSource,
        durationUs: secondsToMicroseconds(4),
      });
      addedSourceId = addedSource?.id ?? '';
      await ref.current?.clip.add({ sourceId: addedSourceId });
    });
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '2',
    );
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-track-count',
      '2',
    );
  });

  it('supports source and media clip CRUD through the instance API', async () => {
    const ref = createRef<EaseCutHandle>();
    const onSourcesChange = vi.fn();
    render(
      <EaseCut onSourcesChange={onSourcesChange} ref={ref} />,
    );

    let sourceId = '';
    let clipId = '';
    await act(async () => {
      const source = await ref.current?.source.add({
        ...videoSource,
        id: 'api-video',
      });
      sourceId = source?.id ?? '';
    });
    expect(ref.current?.source.get(sourceId)).toMatchObject({
      fileName: 'video.mp4',
      id: 'api-video',
    });
    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-clip-count',
      '0',
    );

    await act(async () => {
      const clip = await ref.current?.clip.add({
        sourceId,
        trackId: 'video-main',
      });
      clipId = clip?.id ?? '';
    });
    expect(ref.current?.clip.get(clipId)).toMatchObject({
      sourceId,
      type: 'video',
    });

    await act(async () => {
      await ref.current?.source.update(sourceId, {
        durationUs: secondsToMicroseconds(9),
        fileName: 'updated.mp4',
        height: 1080,
        src: 'https://cdn.example.com/updated.mp4',
        width: 1920,
      });
      await ref.current?.clip.update(clipId, {
        hidden: true,
        volume: 0.5,
      });
    });
    expect(ref.current?.source.get(sourceId)).toMatchObject({
      fileName: 'updated.mp4',
      src: 'https://cdn.example.com/updated.mp4',
    });
    expect(ref.current?.clip.get(clipId)).toMatchObject({
      hidden: true,
      src: 'https://cdn.example.com/updated.mp4',
      volume: 0.5,
    });
    expect(() => ref.current?.source.remove(sourceId)).toThrow(
      expect.objectContaining({ code: 'SOURCE_IN_USE' }),
    );

    act(() => {
      ref.current?.clip.remove(clipId);
      ref.current?.source.remove(sourceId);
    });
    expect(ref.current?.clip.get(clipId)).toBeUndefined();
    expect(ref.current?.source.get(sourceId)).toBeUndefined();
    expect(onSourcesChange).toHaveBeenCalledTimes(3);
  });

  it('keeps refreshed source identity when timeline history is restored', async () => {
    const ref = createRef<EaseCutHandle>();
    render(<EaseCut ref={ref} />);
    let sourceId = '';
    let clipId = '';

    await act(async () => {
      const source = await ref.current?.source.add({
        ...videoSource,
        id: 'history-video',
      });
      sourceId = source?.id ?? '';
      const clip = await ref.current?.clip.add({ sourceId });
      clipId = clip?.id ?? '';
      await ref.current?.clip.update(clipId, { volume: 0.4 });
      await ref.current?.source.update(sourceId, {
        durationUs: videoSource.durationUs,
        fileName: 'history-video-v2.mp4',
        height: videoSource.height,
        src: '/history-video-v2.mp4',
        width: videoSource.width,
      });
    });

    fireEvent.keyDown(screen.getByRole('region', { name: 'EaseCut' }), {
      ctrlKey: true,
      key: 'z',
    });
    expect(ref.current?.clip.get(clipId)).toEqual(
      expect.objectContaining({
        src: '/history-video-v2.mp4',
        volume: 1,
      }),
    );
  });

  it('does not restore a dangling clip after its source is removed', async () => {
    const ref = createRef<EaseCutHandle>();
    render(<EaseCut ref={ref} />);
    let sourceId = '';
    let clipId = '';

    await act(async () => {
      const source = await ref.current?.source.add({
        ...videoSource,
        id: 'removed-video',
      });
      sourceId = source?.id ?? '';
      const clip = await ref.current?.clip.add({ sourceId });
      clipId = clip?.id ?? '';
      ref.current?.clip.remove(clipId);
      ref.current?.source.remove(sourceId);
    });

    fireEvent.keyDown(screen.getByRole('region', { name: 'EaseCut' }), {
      ctrlKey: true,
      key: 'z',
    });
    expect(ref.current?.source.get(sourceId)).toBeUndefined();
    expect(ref.current?.clip.get(clipId)).toBeUndefined();
  });

  it('rejects a stale source update after the source ID is reused', async () => {
    const ref = createRef<EaseCutHandle>();
    const metadata = createDeferred<EaseCutMediaMetadata | null>();
    const mediaLoader = {
      loadBlob: vi.fn().mockResolvedValue(new Blob()),
      loadMetadata: vi.fn(() => metadata.promise),
    };
    render(<EaseCut mediaLoader={mediaLoader} ref={ref} />);

    await act(async () => {
      await ref.current?.source.add({
        ...videoSource,
        id: 'reused-video',
      });
    });
    const staleUpdate = ref.current?.source.update('reused-video', {
      src: '/slow-video.mp4',
    });
    const staleUpdateResult = expect(staleUpdate).rejects.toMatchObject({
      code: 'SOURCE_CONFLICT',
    });
    await act(async () => {
      ref.current?.source.remove('reused-video');
      await ref.current?.source.add({
        ...videoSource,
        fileName: 'replacement.mp4',
        id: 'reused-video',
        src: '/replacement.mp4',
      });
    });
    metadata.resolve({
      durationUs: videoSource.durationUs,
      height: videoSource.height,
      width: videoSource.width,
    });

    await staleUpdateResult;
    expect(ref.current?.source.get('reused-video')).toEqual(
      expect.objectContaining({
        fileName: 'replacement.mp4',
        src: '/replacement.mp4',
      }),
    );
  });

  it('rejects source durations that are not positive safe integers', async () => {
    const ref = createRef<EaseCutHandle>();
    render(<EaseCut ref={ref} />);

    await expect(
      ref.current?.source.add({
        ...imageSource,
        durationUs: 1.5,
        id: 'invalid-duration-image',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
    expect(
      ref.current?.source.get('invalid-duration-image'),
    ).toBeUndefined();
  });

  it('rejects non-finite clip transform dimensions', async () => {
    const ref = createRef<EaseCutHandle>();
    render(<EaseCut ref={ref} />);
    await act(async () => {
      const source = await ref.current?.source.add(videoSource);
      await ref.current?.clip.add({ sourceId: source?.id ?? '' });
    });
    const clipId = `clip-${videoSource.id}`;
    const originalClip = ref.current?.clip.get(clipId);
    const originalTransform =
      originalClip && originalClip.type !== 'text'
        ? originalClip.transform
        : undefined;

    await expect(
      ref.current?.clip.update(clipId, {
        transform: {
          height: videoSource.height ?? 720,
          width: Number.POSITIVE_INFINITY,
          x: 0,
          y: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'CLIP_INVALID' });
    const currentClip = ref.current?.clip.get(clipId);
    expect(
      currentClip && currentClip.type !== 'text'
        ? currentClip.transform
        : undefined,
    ).toEqual(originalTransform);
  });

  it('supports text clip CRUD and rejects incompatible updates', async () => {
    const ref = createRef<EaseCutHandle>();
    render(<EaseCut ref={ref} />);

    let clipId = '';
    await act(async () => {
      const clip = await ref.current?.clip.add({
        text: '原始标题',
        type: 'text',
      });
      clipId = clip?.id ?? '';
      await ref.current?.clip.update(clipId, {
        endUs: secondsToMicroseconds(6),
        fontColor: '#123456FF',
        text: '更新标题',
      });
    });
    expect(ref.current?.clip.get(clipId)).toMatchObject({
      durationUs: secondsToMicroseconds(6),
      fontColor: '#123456FF',
      text: '更新标题',
      type: 'text',
    });
    await expect(
      ref.current?.clip.update(clipId, { volume: 0.5 }),
    ).rejects.toBeInstanceOf(EaseCutApiError);

    act(() => ref.current?.clip.remove(clipId));
    expect(ref.current?.clip.get(clipId)).toBeUndefined();
  });

  it('emits draft changes for persistent edits but not playback state', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: VideoTimelineDraft) => void>();
    await renderEditor({ onDraftChange }, [audioSource]);
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
      )?.muted,
    ).toBe(true);
  });

  it('does not emit draft changes until a text color transaction commits', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: VideoTimelineDraft) => void>();
    render(
      <EaseCut
        initialDraft={textDraft}
        onDraftChange={onDraftChange}
      />,
    );
    await flushEffects();
    onDraftChange.mockClear();

    await user.click(
      screen.getByRole('button', { name: '测试：预览文字颜色' }),
    );

    expect(screen.getByTestId('timeline-state')).toHaveAttribute(
      'data-last-font-color',
      '#FFFFFFFF',
    );
    expect(onDraftChange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: '测试：提交文字颜色' }),
    );

    await waitFor(() => expect(onDraftChange).toHaveBeenCalledOnce());
    expect(onDraftChange.mock.calls[0][0].clips[0]).toMatchObject({
      fontColor: '#123456FF',
    });
  });

  it('handles shortcuts only when they originate inside the focused editor', async () => {
    const user = userEvent.setup();
    const ref = createRef<EaseCutHandle>();
    const { container } = render(
      <>
        <input aria-label='编辑器外输入框' />
        <EaseCut ref={ref} />
      </>,
    );
    await act(async () => {
      await addSourcesAndClips(ref.current, [videoSource]);
    });
    const editor = container.querySelector<HTMLElement>('.ec-editor');
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

  it('moves the playhead by 0.1 seconds with Ctrl+Arrow keys', async () => {
    const { container } = await renderEditor({}, [videoSource]);
    const editor = container.querySelector<HTMLElement>('.ec-editor');
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

  it('toggles the selected clip visibility with H and records undo history', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor({}, [videoSource]);
    const editor = container.querySelector<HTMLElement>('.ec-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');

    await user.click(
      screen.getByRole('button', { name: '测试：取消片段选择' }),
    );
    editor.focus();
    fireEvent.keyDown(editor, { key: 'h' });
    expect(state).toHaveAttribute('data-first-hidden', 'false');

    await user.click(
      screen.getByRole('button', { name: '测试：选择首个片段' }),
    );
    editor.focus();

    fireEvent.keyDown(editor, { key: 'h' });
    expect(state).toHaveAttribute('data-first-hidden', 'true');

    fireEvent.keyDown(editor, { key: 'H' });
    expect(state).toHaveAttribute('data-first-hidden', 'false');

    fireEvent.keyDown(editor, { key: 'h' });
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'z' });
    expect(state).toHaveAttribute('data-first-hidden', 'false');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'y' });
    expect(state).toHaveAttribute('data-first-hidden', 'true');
  });

  it('ignores repeated or modified H shortcuts and editable targets', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor({}, [videoSource]);
    const editor = container.querySelector<HTMLElement>('.ec-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');
    await user.click(
      screen.getByRole('button', { name: '测试：选择首个片段' }),
    );
    editor.focus();

    fireEvent.keyDown(editor, { key: 'h', repeat: true });
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'h' });
    fireEvent.keyDown(editor, { metaKey: true, key: 'h' });
    fireEvent.keyDown(editor, { altKey: true, key: 'h' });
    fireEvent.keyDown(editor, { shiftKey: true, key: 'H' });
    expect(state).toHaveAttribute('data-first-hidden', 'false');

    const input = screen.getByRole('textbox', {
      name: '测试：编辑器内输入框',
    });
    await user.click(input);
    fireEvent.keyDown(input, { key: 'h' });
    expect(state).toHaveAttribute('data-first-hidden', 'false');
  });

  it('routes H only to the focused editor instance', async () => {
    const user = userEvent.setup();
    const firstRef = createRef<EaseCutHandle>();
    const secondRef = createRef<EaseCutHandle>();
    const { container } = render(
      <>
        <input aria-label='编辑器外输入框' />
        <EaseCut ref={firstRef} title='编辑器 A' />
        <EaseCut ref={secondRef} title='编辑器 B' />
      </>,
    );
    await act(async () => {
      await addSourcesAndClips(firstRef.current, [videoSource]);
      await addSourcesAndClips(secondRef.current, [videoSource]);
    });
    const editors = Array.from(
      container.querySelectorAll<HTMLElement>('.ec-editor'),
    );
    const states = screen.getAllByTestId('timeline-state');
    const firstEditor = editors[0];
    if (!firstEditor) throw new Error('第一个编辑器根节点未渲染');

    firstEditor.focus();
    fireEvent.keyDown(firstEditor, { key: 'h' });
    expect(states[0]).toHaveAttribute('data-first-hidden', 'true');
    expect(states[1]).toHaveAttribute('data-first-hidden', 'false');

    const outsideInput = screen.getByRole('textbox', {
      name: '编辑器外输入框',
    });
    await user.click(outsideInput);
    fireEvent.keyDown(outsideInput, { key: 'h' });
    expect(states[0]).toHaveAttribute('data-first-hidden', 'true');
    expect(states[1]).toHaveAttribute('data-first-hidden', 'false');
  });

  it('ignores playback and delete shortcuts from an input inside the editor', async () => {
    const user = userEvent.setup();
    await renderEditor({}, [videoSource]);
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
    const firstRef = createRef<EaseCutHandle>();
    const secondRef = createRef<EaseCutHandle>();
    const { container } = render(
      <>
        <EaseCut ref={firstRef} title='编辑器 A' />
        <EaseCut ref={secondRef} title='编辑器 B' />
      </>,
    );
    await act(async () => {
      await addSourcesAndClips(firstRef.current, [videoSource]);
      await addSourcesAndClips(secondRef.current, [videoSource]);
    });
    const editors = Array.from(
      container.querySelectorAll<HTMLElement>('.ec-editor'),
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
    const { container } = await renderEditor({}, [audioSource]);
    const editor = container.querySelector<HTMLElement>('.ec-editor');
    const state = screen.getByTestId('timeline-state');
    if (!editor) throw new Error('编辑器根节点未渲染');
    await user.click(
      screen.getByRole('button', { name: '测试：切换首个片段静音' }),
    );
    expect(state).toHaveAttribute('data-first-clip-volume', '1');

    editor.focus();
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'z' });
    expect(state).toHaveAttribute('data-first-clip-volume', '1');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'y' });
    expect(state).toHaveAttribute('data-first-clip-volume', '1');
  });

  it('isolates source and clip APIs between editor instances', async () => {
    const firstRef = createRef<EaseCutHandle>();
    const secondRef = createRef<EaseCutHandle>();
    render(
      <>
        <EaseCut ref={firstRef} title='编辑器 A' />
        <EaseCut ref={secondRef} title='编辑器 B' />
      </>,
    );
    const states = screen.getAllByTestId('timeline-state');

    await act(async () => {
      const source = await firstRef.current?.source.add({
        ...videoSource,
        id: 'shared-id',
      });
      await firstRef.current?.clip.add({ sourceId: source?.id ?? '' });
      await secondRef.current?.source.add({
        ...audioSource,
        id: 'shared-id',
      });
    });

    expect(firstRef.current?.source.get('shared-id')?.type).toBe('video');
    expect(secondRef.current?.source.get('shared-id')?.type).toBe('audio');
    expect(states[0]).toHaveAttribute('data-clip-count', '1');
    expect(states[1]).toHaveAttribute('data-clip-count', '0');
  });

  it('keeps playback state isolated between two editor instances', async () => {
    const user = userEvent.setup();
    const firstRef = createRef<EaseCutHandle>();
    const secondRef = createRef<EaseCutHandle>();
    const { container } = render(
      <>
        <EaseCut ref={firstRef} title='编辑器 A' />
        <EaseCut ref={secondRef} title='编辑器 B' />
      </>,
    );
    await act(async () => {
      await addSourcesAndClips(firstRef.current, [videoSource]);
      await addSourcesAndClips(secondRef.current, [videoSource]);
    });
    const editors = Array.from(
      container.querySelectorAll<HTMLElement>('.ec-editor'),
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
