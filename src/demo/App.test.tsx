import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../index', () => ({
  EaseCut: ({
    onExport,
  }: {
    onExport?: (request: { payload: unknown }) => void | Promise<void>;
  }) => (
    <>
      <output>编辑器已挂载</output>
      <button
        onClick={() => void onExport?.({ payload: {} })}
        type='button'
      >
        模拟导出
      </button>
    </>
  ),
}));

import { DemoApp } from './App';

describe('DemoApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the editor after clicking the button', async () => {
    const user = userEvent.setup();

    render(<DemoApp />);

    expect(screen.queryByText('编辑器已挂载')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '点我打开编辑器！' }));

    expect(screen.getByText('编辑器已挂载')).toBeVisible();
    expect(screen.queryByText('添加本地素材')).not.toBeInTheDocument();
  });

  it('keeps an export dialog open while polling, then downloads the completed video', async () => {
    vi.useFakeTimers();
    const playUrl = 'https://example.com/completed.mp4';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ data: { taskId: 'task-1' } }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ data: { status: 'PROCESSING' } }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: { playUrl, status: 'SUCCESS' },
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        blob: async () => new Blob(['video'], { type: 'video/mp4' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);
    const objectUrl = 'blob:completed-video';
    const createObjectURL = vi.fn(() => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<DemoApp />);
    fireEvent.click(screen.getByRole('button', { name: '点我打开编辑器！' }));
    fireEvent.click(screen.getByRole('button', { name: '模拟导出' }));

    const exportDialog = screen.getByRole('dialog', {
      name: '正在导出视频…',
    });
    expect(exportDialog).toHaveTextContent('视频正在导出，请稍候。');
    expect(
      screen.queryByRole('button', { name: '关闭导出弹窗' }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(exportDialog, { key: 'Escape' });
    expect(exportDialog).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByRole('dialog', { name: '正在导出视频…' })).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(
      screen.queryByRole('dialog', { name: '正在导出视频…' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(4, playUrl);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(anchorClick.mock.instances[0]).toMatchObject({
      download: 'easecut-export.mp4',
      href: objectUrl,
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });
});
