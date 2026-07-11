import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
          durationSeconds: 4,
          fileName: 'clip.mp4',
          id: 'video-source-1',
          src: 'http://localhost/clip.mp4',
          type: 'video',
        },
      ],
    });
  });

  it('disables the split button when splitting would create a clip shorter than 0.6s', () => {
    testTimelineStore.getState().setCurrentTime(0.5);
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '分割片段' })).toBeDisabled();
  });

  it('enables the split button when both split clips are at least 0.6s', () => {
    testTimelineStore.getState().setCurrentTime(0.6);
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '分割片段' })).toBeEnabled();
  });

  it('exposes native titles for enabled and disabled toolbar actions', () => {
    testTimelineStore.getState().setCurrentTime(0.5);
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

  it('shows timeline keyboard shortcuts from native details', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(
      <TimelineToolbar onRequestPreviewFullscreen={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: '查看快捷键' }));

    expect(screen.getByText('快捷键')).toBeInTheDocument();
    expect(screen.getByText('回退')).toBeInTheDocument();
    expect(screen.getByText('前进')).toBeInTheDocument();
    expect(screen.getByText('分割选中片段')).toBeInTheDocument();
    expect(screen.getByText('删除选中片段')).toBeInTheDocument();
    expect(screen.getByText('缩放时间线')).toBeInTheDocument();
    expect(screen.getByText('播放 / 暂停')).toBeInTheDocument();
    expect(screen.getAllByText('Ctrl')).toHaveLength(4);
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('Y')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Backspace')).toBeInTheDocument();
    expect(screen.getByText('滚轮')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
