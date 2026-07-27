import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';
import { TimelineToolbar } from './TimelineToolbar';

describe('TimelineToolbar', () => {
  beforeEach(() => {
    resetTestTimelineStore();
    testTimelineStore.getState().resetTimeline({
      sources: [
        {
          durationUs: secondsToMicroseconds(4),
          fileName: 'clip.mp4',
          id: 'video-source-1',
          src: 'http://localhost/clip.mp4',
          type: 'video',
        },
      ],
    });
  });

  it('disables the split button when splitting would create a clip shorter than 0.6s', () => {
    testTimelineStore
      .getState()
      .setCurrentTimeUs(secondsToMicroseconds(0.5));
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '分割片段' })).toBeDisabled();
  });

  it('enables the split button when both split clips are at least 0.6s', () => {
    testTimelineStore
      .getState()
      .setCurrentTimeUs(secondsToMicroseconds(0.6));
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '分割片段' })).toBeEnabled();
  });

  it('displays the current time and total duration as MM:SS:CC', () => {
    testTimelineStore
      .getState()
      .setCurrentTimeUs(secondsToMicroseconds(3.999));
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByText('00:03:99')).toHaveAttribute(
      'dateTime',
      'PT3.999S',
    );
    expect(screen.getByText('00:04:00')).toHaveAttribute('dateTime', 'PT4S');
  });

  it('exposes native titles for enabled and disabled toolbar actions', () => {
    testTimelineStore
      .getState()
      .setCurrentTimeUs(secondsToMicroseconds(0.5));
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '分割片段' })).toHaveAttribute(
      'title',
      '分割片段 Ctrl+B',
    );
    expect(screen.getByRole('button', { name: '撤销' })).toHaveAttribute(
      'title',
      '撤销 Ctrl+Z',
    );
  });

  it('only shows the import action when the editor provides an import handler', async () => {
    const user = userEvent.setup();
    const onRequestImport = vi.fn();
    const { rerender } = renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(
      screen.queryByRole('button', { name: '导入素材' }),
    ).not.toBeInTheDocument();

    rerender(
      <TimelineToolbar
        onRequestImport={onRequestImport}
        onRequestPreviewFullscreen={vi.fn()}
      />,
    );

    const importButton = screen.getByRole('button', { name: '导入素材' });
    expect(importButton).toHaveAttribute('title', '导入素材');
    await user.click(importButton);
    expect(onRequestImport).toHaveBeenCalledOnce();
  });

  it('controls timeline and canvas snapping independently', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    const timelineSnappingButton = screen.getByRole('button', {
      name: '时间轴吸附',
    });
    const canvasSnappingButton = screen.getByRole('button', {
      name: '画布辅助线',
    });
    expect(timelineSnappingButton).toHaveAttribute('aria-pressed', 'true');
    expect(canvasSnappingButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(canvasSnappingButton);
    expect(testTimelineStore.getState().canvasSnappingEnabled).toBe(false);
    expect(testTimelineStore.getState().snappingEnabled).toBe(true);
    expect(canvasSnappingButton).toHaveAttribute('aria-pressed', 'false');
    expect(timelineSnappingButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(timelineSnappingButton);
    expect(testTimelineStore.getState().canvasSnappingEnabled).toBe(false);
    expect(testTimelineStore.getState().snappingEnabled).toBe(false);
    expect(timelineSnappingButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows timeline keyboard shortcuts in a dismissible dialog', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.queryByText('快捷键')).not.toBeInTheDocument();

    const shortcutsTrigger = screen.getByRole('button', { name: '查看快捷键' });
    await user.click(shortcutsTrigger);

    expect(shortcutsTrigger).toHaveAttribute('data-state', 'open');

    expect(screen.getByRole('dialog', { name: '快捷键' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Globe' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Canva' })).toBeInTheDocument();
    expect(screen.getByText('快捷键')).toBeInTheDocument();
    expect(screen.getByText('撤销')).toBeInTheDocument();
    expect(screen.getByText('重做')).toBeInTheDocument();
    expect(screen.getByText('复制选中片段')).toBeInTheDocument();
    expect(screen.getByText('粘贴到选中片段右侧')).toBeInTheDocument();
    expect(screen.getByText('分割选中片段')).toBeInTheDocument();
    expect(screen.getByText('删除选中片段')).toBeInTheDocument();
    expect(screen.getByText('后退 0.1 秒')).toBeInTheDocument();
    expect(screen.getByText('前进 0.1 秒')).toBeInTheDocument();
    expect(screen.getByText('缩放时间线')).toBeInTheDocument();
    expect(screen.getByText('双击片段还原裁剪')).toBeInTheDocument();
    expect(screen.getByText('播放 / 暂停')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Z / ⌘ + Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Y / ⌘ + ⇧ + Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + C / ⌘ + C')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + V / ⌘ + V')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + B / ⌘ + B')).toBeInTheDocument();
    expect(screen.getByText('Backspace')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + ← / ⌘ + ←')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + → / ⌘ + →')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + 滚轮 / ⌘ + 滚轮')).toBeInTheDocument();
    expect(screen.getByText('双击片段')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('快捷键')).not.toBeInTheDocument();
    expect(shortcutsTrigger).toHaveAttribute('data-state', 'closed');
  });
});
