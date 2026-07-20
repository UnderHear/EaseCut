import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TimelineClip, TimelineTrack } from '../types';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';
import { FloatingInspector } from './FloatingInspector';

const videoTrack: TimelineTrack = {
  id: 'video-track',
  name: '视频轨 1',
  type: 'video',
  volume: 0.8,
  zIndex: 0,
};

const videoClip: TimelineClip = {
  duration: 4.5,
  id: 'video-clip',
  name: 'sample.mp4',
  sourceDuration: 8,
  sourceId: 'video-source',
  src: '/sample.mp4',
  start: 1.25,
  trackId: videoTrack.id,
  transform: { height: 360, width: 640, x: 35, y: 20 },
  trimEnd: 5,
  trimStart: 0.5,
  type: 'video',
  zIndex: 0,
};

const audioTrack: TimelineTrack = {
  id: 'audio-track',
  name: '音频轨 1',
  type: 'audio',
  volume: 0.65,
  zIndex: 1,
};

const audioClip: TimelineClip = {
  duration: 6,
  id: 'audio-clip',
  name: 'sample.mp3',
  sourceDuration: 10,
  sourceId: 'audio-source',
  src: '/sample.mp3',
  start: 2,
  trackId: audioTrack.id,
  transform: { height: 0, width: 0, x: 0, y: 0 },
  trimEnd: 8,
  trimStart: 2,
  type: 'audio',
  zIndex: 0,
};

describe('FloatingInspector', () => {
  beforeEach(() => {
    resetTestTimelineStore();
    testTimelineStore.setState({
      clips: [videoClip],
      future: [],
      past: [],
      selectedClipId: videoClip.id,
      tracks: [videoTrack],
    });
  });

  it('renders selected clip properties instead of static placeholder controls', () => {
    const { container } = renderWithEditorProviders(<FloatingInspector />);

    expect(
      screen.getByRole('complementary', { name: '基础属性面板' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    const rail = screen.getByRole('navigation', { name: '属性分类' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['基本', '背景', '变速']);

    expect(screen.getByRole('heading', { name: '片段信息' })).toBeVisible();
    expect(screen.getByText('sample.mp4')).toHaveClass(
      'oc-floating-inspector__detail-value--wrap',
    );
    expect(screen.getByText('视频')).toBeVisible();
    expect(screen.queryByText('视频轨 1')).not.toBeInTheDocument();
    expect(screen.getByText('1.25 秒')).toBeVisible();
    expect(screen.getByText('4.50 秒')).toBeVisible();
    expect(screen.getByLabelText('轨道音量')).toHaveValue(80);
    expect(screen.getByLabelText('X 位置')).toHaveValue(35);
    expect(screen.getByLabelText('Y 位置')).toHaveValue(20);
    expect(screen.getByLabelText('宽度')).toHaveValue(640);
    expect(screen.getByLabelText('高度')).toHaveValue(360);

    expect(screen.queryByText('蒙版')).not.toBeInTheDocument();
    expect(screen.queryByText('颜色调整')).not.toBeInTheDocument();
    expect(screen.queryByText('混合')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('不透明度')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('缩放')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '.oc-floating-inspector__separator[data-orientation="horizontal"]',
      ),
    ).toHaveLength(3);
  });

  it('renders matching live clip timing without committing it to the store', () => {
    renderWithEditorProviders(
      <FloatingInspector
        previewTiming={{
          clipId: videoClip.id,
          duration: 3.25,
          start: 2.75,
        }}
      />,
    );

    expect(screen.getByText('2.75 秒')).toBeVisible();
    expect(screen.getByText('3.25 秒')).toBeVisible();
    expect(testTimelineStore.getState().clips[0]).toEqual(videoClip);
  });

  it('renders the audio-specific rail and panel', () => {
    testTimelineStore.setState({
      clips: [audioClip],
      selectedClipId: audioClip.id,
      tracks: [audioTrack],
    });

    const { container } = renderWithEditorProviders(<FloatingInspector />);
    const rail = screen.getByRole('navigation', { name: '属性分类' });

    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['基本']);
    expect(rail.querySelector('.lucide-music-2')).toBeInTheDocument();
    expect(rail.querySelector('.lucide-film')).not.toBeInTheDocument();
    expect(screen.getByText('sample.mp3')).toBeVisible();
    expect(screen.getByText('音频')).toBeVisible();
    expect(screen.getByLabelText('轨道音量')).toHaveValue(65);
    expect(screen.queryByRole('button', { name: '背景' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '变速' })).not.toBeInTheDocument();
    expect(screen.queryByText('转换')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('X 位置')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '.oc-floating-inspector__separator[data-orientation="horizontal"]',
      ),
    ).toHaveLength(2);
  });

  it('commits transform and track volume edits through the timeline store', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<FloatingInspector />);

    const xInput = screen.getByLabelText('X 位置');
    await user.clear(xInput);
    await user.type(xInput, '160');
    await user.tab();

    expect(testTimelineStore.getState().clips[0]?.transform.x).toBe(160);
    expect(testTimelineStore.getState().past).toHaveLength(1);

    const volumeInput = screen.getByLabelText('轨道音量');
    await user.clear(volumeInput);
    await user.type(volumeInput, '45');
    await user.tab();

    expect(testTimelineStore.getState().tracks[0]?.volume).toBe(0.45);
    expect(testTimelineStore.getState().past).toHaveLength(2);
  });

  it('switches sections and restores the selected clip properties', async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditorProviders(<FloatingInspector />);
    const main = container.querySelector('.oc-floating-inspector__main');

    for (const sectionName of ['背景', '变速']) {
      const sectionButton = screen.getByRole('button', {
        name: sectionName,
      });

      await user.click(sectionButton);

      expect(sectionButton).toHaveAttribute('aria-current', 'page');
      expect(sectionButton).toHaveClass('oc-is-active');
      expect(screen.getByRole('heading', { name: sectionName })).toBeVisible();
      expect(main).toBeEmptyDOMElement();
    }

    await user.click(screen.getByRole('button', { name: '基本' }));

    expect(screen.getByRole('button', { name: '基本' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('sample.mp4')).toBeVisible();
  });

  it('closes only the panel and reopens it from the rail', async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditorProviders(<FloatingInspector />);

    await user.click(screen.getByRole('button', { name: '关闭属性面板' }));

    expect(
      screen.getByRole('complementary', { name: '基础属性面板' }),
    ).toHaveAttribute('data-panel-open', 'false');
    expect(
      container.querySelector('.oc-floating-inspector__panel'),
    ).not.toBeVisible();
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(screen.getByRole('button', { name: '基本' })).not.toHaveClass(
      'oc-is-active',
    );
    expect(screen.getByRole('button', { name: '基本' })).not.toHaveAttribute(
      'aria-current',
    );

    await user.click(screen.getByRole('button', { name: '背景' }));

    expect(
      screen.getByRole('complementary', { name: '基础属性面板' }),
    ).toHaveAttribute('data-panel-open', 'true');
    expect(
      container.querySelector('.oc-floating-inspector__panel'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '背景' })).toHaveClass(
      'oc-is-active',
    );
  });
});
