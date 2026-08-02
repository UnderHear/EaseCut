import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { secondsToMicroseconds } from '../core/time';
import { TextLayoutError } from '../media/text-layout-runtime';
import type { TimelineClip, TimelineTrack } from '../types';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';
import { FloatingInspector } from './FloatingInspector';

const measureTextLayoutMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ height: 88, width: 420 })),
);
vi.mock('../media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../media')>();
  return {
    ...actual,
    useMediaRuntime: () => ({ measureTextLayout: measureTextLayoutMock }),
  };
});

const videoTrack: TimelineTrack = {
  id: 'video-track',
  name: '视频轨 1',
  type: 'video',
  muted: false,
  zIndex: 0,
};

const videoClip: TimelineClip = {
  durationUs: secondsToMicroseconds(4.5),
  id: 'video-clip',
  name: 'sample.mp4',
  sourceDurationUs: secondsToMicroseconds(8),
  sourceId: 'video-source',
  speed: 1,
  src: '/sample.mp4',
  startUs: secondsToMicroseconds(1.25),
  trackId: videoTrack.id,
  transform: { height: 360, width: 640, x: 35, y: 20 },
  trimEndUs: secondsToMicroseconds(5),
  trimStartUs: secondsToMicroseconds(0.5),
  type: 'video',
  volume: 0.8,
  zIndex: 0,
};

const audioTrack: TimelineTrack = {
  id: 'audio-track',
  name: '音频轨道',
  type: 'audio',
  muted: false,
  zIndex: 1,
};

const audioClip: TimelineClip = {
  durationUs: secondsToMicroseconds(6),
  id: 'audio-clip',
  name: 'sample.mp3',
  sourceDurationUs: secondsToMicroseconds(10),
  sourceId: 'audio-source',
  speed: 1,
  src: '/sample.mp3',
  startUs: secondsToMicroseconds(2),
  trackId: audioTrack.id,
  transform: { height: 0, width: 0, x: 0, y: 0 },
  trimEndUs: secondsToMicroseconds(8),
  trimStartUs: secondsToMicroseconds(2),
  type: 'audio',
  volume: 1,
  zIndex: 0,
};

const textTrack: TimelineTrack = {
  id: 'text-track-1',
  muted: false,
  name: '文字轨 1',
  type: 'text',
  zIndex: 2,
};

const textClip: TimelineClip = {
  bold: false,
  durationUs: secondsToMicroseconds(5),
  fontColor: '#FFFFFFFF',
  fontSize: 120,
  fontType: 'SY_Black',
  id: 'text-clip-1',
  italic: false,
  layoutSize: { height: 120, width: 800 },
  position: { x: 560, y: 480 },
  startUs: secondsToMicroseconds(1),
  text: '我们的精彩旅程',
  trackId: textTrack.id,
  type: 'text',
  underline: false,
  zIndex: 0,
};

const getFirstMediaClip = () => {
  const clip = testTimelineStore.getState().clips[0];
  if (!clip || clip.type === 'text') {
    throw new Error('Expected the first clip to be media');
  }
  return clip;
};

describe('FloatingInspector', () => {
  beforeEach(() => {
    resetTestTimelineStore();
    measureTextLayoutMock.mockReset();
    measureTextLayoutMock.mockResolvedValue({ height: 88, width: 420 });
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
      'ec-floating-inspector__detail-value--wrap',
    );
    expect(screen.getByText('视频')).toBeVisible();
    expect(screen.queryByText('视频轨 1')).not.toBeInTheDocument();
    expect(screen.getByText('1.25 秒')).toBeVisible();
    expect(screen.getByText('4.50 秒')).toBeVisible();
    expect(screen.getByLabelText('片段音量')).toHaveValue(80);
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
        '.ec-floating-inspector__separator[data-orientation="horizontal"]',
      ),
    ).toHaveLength(3);
  });

  it('renders matching live clip timing without committing it to the store', () => {
    renderWithEditorProviders(
      <FloatingInspector
        previewTiming={{
          clipId: videoClip.id,
          durationUs: secondsToMicroseconds(3.25),
          startUs: secondsToMicroseconds(2.75),
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
    ).toEqual(['基本', '变速']);
    expect(rail.querySelector('.lucide-music-2')).toBeInTheDocument();
    expect(rail.querySelector('.lucide-film')).not.toBeInTheDocument();
    expect(screen.getByText('sample.mp3')).toBeVisible();
    expect(screen.getByText('音频')).toBeVisible();
    expect(screen.getByLabelText('片段音量')).toHaveValue(100);
    expect(screen.queryByRole('button', { name: '背景' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '变速' })).toBeVisible();
    expect(screen.queryByText('转换')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('X 位置')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '.ec-floating-inspector__separator[data-orientation="horizontal"]',
      ),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '变速' }));
    expect(screen.getByLabelText('播放速度滑块')).toHaveValue('1');
    expect(screen.getByLabelText('播放速度')).toHaveValue(1);
  });

  it('commits transform and clip volume edits through the timeline store', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<FloatingInspector />);

    const xInput = screen.getByLabelText('X 位置');
    await user.clear(xInput);
    await user.type(xInput, '160');
    await user.tab();

    expect(getFirstMediaClip().transform.x).toBe(160);
    expect(testTimelineStore.getState().past).toHaveLength(1);

    const volumeInput = screen.getByLabelText('片段音量');
    await user.clear(volumeInput);
    await user.type(volumeInput, '45');
    await user.tab();

    expect(getFirstMediaClip().volume).toBe(0.45);
    expect(testTimelineStore.getState().past).toHaveLength(2);
  });

  it('commits a typed fixed speed and updates the timeline duration once', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<FloatingInspector />);
    await user.click(screen.getByRole('button', { name: '变速' }));

    const speedInput = screen.getByLabelText('播放速度');
    await user.clear(speedInput);
    await user.type(speedInput, '2');
    await user.tab();

    expect(testTimelineStore.getState().clips[0]).toEqual(
      expect.objectContaining({
        durationUs: secondsToMicroseconds(2.25),
        speed: 2,
      }),
    );
    expect(testTimelineStore.getState().past).toHaveLength(1);
    expect(screen.getByLabelText('播放速度滑块')).toHaveValue('2');
  });

  it('keeps range input changes local until one pointer gesture commits', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<FloatingInspector />);
    await user.click(screen.getByRole('button', { name: '变速' }));
    const slider = screen.getByLabelText('播放速度滑块');

    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: '2' } });

    expect(screen.getByLabelText('播放速度')).toHaveValue(2);
    expect(getFirstMediaClip().speed).toBe(1);
    expect(testTimelineStore.getState().past).toEqual([]);

    fireEvent.pointerUp(slider, { pointerId: 1 });

    expect(getFirstMediaClip().speed).toBe(2);
    expect(testTimelineStore.getState().past).toHaveLength(1);
  });

  it('restores the original slider value when its pointer gesture is cancelled', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<FloatingInspector />);
    await user.click(screen.getByRole('button', { name: '变速' }));
    const slider = screen.getByLabelText('播放速度滑块');

    fireEvent.pointerDown(slider, { pointerId: 2 });
    fireEvent.change(slider, { target: { value: '0.5' } });
    fireEvent.pointerCancel(slider, { pointerId: 2 });

    expect(slider).toHaveValue('1');
    expect(screen.getByLabelText('播放速度')).toHaveValue(1);
    expect(getFirstMediaClip().speed).toBe(1);
    expect(testTimelineStore.getState().past).toEqual([]);
  });

  it('switches sections and restores the selected clip properties', async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditorProviders(<FloatingInspector />);
    const main = container.querySelector('.ec-floating-inspector__main');

    const backgroundButton = screen.getByRole('button', {
      name: '背景',
    });
    await user.click(backgroundButton);
    expect(backgroundButton).toHaveAttribute('aria-current', 'page');
    expect(main).toBeEmptyDOMElement();

    {
      const sectionName = '变速';
      const sectionButton = screen.getByRole('button', {
        name: sectionName,
      });

      await user.click(sectionButton);

      expect(sectionButton).toHaveAttribute('aria-current', 'page');
      expect(sectionButton).toHaveClass('ec-is-active');
      expect(screen.getByRole('heading', { name: sectionName })).toBeVisible();
      expect(screen.getByLabelText('播放速度滑块')).toHaveValue('1');
      expect(screen.getByLabelText('播放速度')).toHaveValue(1);
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
      container.querySelector('.ec-floating-inspector__panel'),
    ).not.toBeVisible();
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(screen.getByRole('button', { name: '基本' })).not.toHaveClass(
      'ec-is-active',
    );
    expect(screen.getByRole('button', { name: '基本' })).not.toHaveAttribute(
      'aria-current',
    );

    await user.click(screen.getByRole('button', { name: '背景' }));

    expect(
      screen.getByRole('complementary', { name: '基础属性面板' }),
    ).toHaveAttribute('data-panel-open', 'true');
    expect(
      container.querySelector('.ec-floating-inspector__panel'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '背景' })).toHaveClass(
      'ec-is-active',
    );
  });

  it('shows only basic text properties and commits one history entry per field', async () => {
    const user = userEvent.setup();
    testTimelineStore.setState({
      clips: [textClip],
      future: [],
      past: [],
      selectedClipId: textClip.id,
      tracks: [textTrack],
    });
    renderWithEditorProviders(<FloatingInspector />);

    const rail = screen.getByRole('navigation', { name: '属性分类' });
    expect(within(rail).getAllByRole('button')).toHaveLength(1);
    expect(within(rail).getByRole('button', { name: '基本' })).toBeVisible();
    expect(screen.queryByText('音量')).not.toBeInTheDocument();
    expect(screen.queryByText('变速')).not.toBeInTheDocument();
    expect(screen.getByLabelText('标题内容')).toHaveValue('我们的精彩旅程');
    expect(screen.getByLabelText('标题内容')).toHaveClass(
      'ec-title-content-textarea',
    );
    expect(
      screen.getByRole('group', { name: '文字样式' }),
    ).toHaveClass('ec-text-inspector__toolbar');
    expect(
      screen.getByRole('heading', { name: '时间与位置' }),
    ).toBeVisible();
    expect(screen.getByLabelText('开始时间')).toBeVisible();
    expect(screen.getByLabelText('开始时间')).toHaveValue(1);
    expect(screen.getByLabelText('结束时间')).toBeVisible();
    expect(screen.getByLabelText('结束时间')).toHaveValue(6);
    expect(screen.getByRole('button', { name: '字体' })).toHaveTextContent(
      '思源黑体',
    );
    expect(screen.getByLabelText('字号')).toHaveValue(120);
    expect(screen.getByText('px')).toBeVisible();
    const textStyle = screen.getByRole('group', { name: '文字样式' });
    const boldButton = within(textStyle).getByRole('button', { name: '粗体' });
    const italicButton = within(textStyle).getByRole('button', { name: '斜体' });
    const underlineButton = within(textStyle).getByRole('button', {
      name: '下划线',
    });
    expect(boldButton).toHaveClass('ec-icon-button');
    expect(boldButton).toHaveAttribute('aria-pressed', 'false');
    expect(italicButton).toHaveClass('ec-icon-button');
    expect(italicButton).toHaveAttribute('aria-pressed', 'false');
    expect(underlineButton).toHaveClass('ec-icon-button');
    expect(underlineButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('宽度')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('高度')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '文字对齐' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('字体颜色')).toHaveValue('#ffffff');

    const textInput = screen.getByLabelText('标题内容');
    await user.clear(textInput);
    await user.type(textInput, '新的标题');
    await user.tab();

    await waitFor(() => {
      expect(testTimelineStore.getState().clips[0]).toMatchObject({
        layoutSize: { height: 88, width: 420 },
        position: { x: 560, y: 480 },
        text: '新的标题',
        type: 'text',
      });
    });
    expect(testTimelineStore.getState().past).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '字体' }));
    await user.click(screen.getByRole('option', { name: '阿里巴巴普惠体' }));
    await waitFor(() => {
      expect(testTimelineStore.getState().clips[0]).toMatchObject({
        fontType: 'ALi_PuHui',
        layoutSize: { height: 88, width: 420 },
        position: { x: 560, y: 480 },
      });
    });
    expect(testTimelineStore.getState().past).toHaveLength(2);

    measureTextLayoutMock.mockResolvedValueOnce({
      height: 160,
      width: 600,
    });
    const fontSizeInput = screen.getByLabelText('字号');
    await user.clear(fontSizeInput);
    await user.type(fontSizeInput, '160');
    await user.tab();
    await waitFor(() => {
      expect(testTimelineStore.getState().clips[0]).toMatchObject({
        fontSize: 160,
        layoutSize: { height: 160, width: 600 },
        position: { x: 560, y: 480 },
      });
    });
    expect(testTimelineStore.getState().past).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('字体颜色'), {
      target: { value: '#123456' },
    });
    expect(testTimelineStore.getState().clips[0]).toMatchObject({
      fontColor: '#123456FF',
    });
    expect(testTimelineStore.getState().past).toHaveLength(4);
  });

  it('toggles text styles with one history item per successful action', async () => {
    const user = userEvent.setup();
    testTimelineStore.setState({
      clips: [textClip],
      future: [],
      past: [],
      selectedClipId: textClip.id,
      tracks: [textTrack],
    });
    renderWithEditorProviders(<FloatingInspector />);

    await user.click(screen.getByRole('button', { name: '下划线' }));
    expect(testTimelineStore.getState().clips[0]).toMatchObject({
      layoutSize: textClip.layoutSize,
      position: textClip.position,
      underline: true,
    });
    expect(testTimelineStore.getState().past).toHaveLength(1);

    measureTextLayoutMock.mockResolvedValueOnce({
      height: 130,
      width: 900,
    });
    await user.click(screen.getByRole('button', { name: '粗体' }));
    await waitFor(() => {
      expect(testTimelineStore.getState().clips[0]).toMatchObject({
        bold: true,
        layoutSize: { height: 130, width: 900 },
        underline: true,
      });
    });
    expect(measureTextLayoutMock).toHaveBeenLastCalledWith(
      {
        bold: true,
        fontSize: 120,
        fontType: 'SY_Black',
        italic: false,
        text: '我们的精彩旅程',
      },
      expect.any(AbortSignal),
    );
    expect(testTimelineStore.getState().past).toHaveLength(2);

    measureTextLayoutMock.mockResolvedValueOnce({
      height: 140,
      width: 960,
    });
    await user.click(screen.getByRole('button', { name: '斜体' }));
    await waitFor(() => {
      expect(testTimelineStore.getState().clips[0]).toMatchObject({
        bold: true,
        italic: true,
        layoutSize: { height: 140, width: 960 },
        underline: true,
      });
    });
    expect(testTimelineStore.getState().past).toHaveLength(3);
  });

  it('keeps the original text layout and exposes a measurement failure', async () => {
    const user = userEvent.setup();
    testTimelineStore.setState({
      clips: [textClip],
      future: [],
      past: [],
      selectedClipId: textClip.id,
      tracks: [textTrack],
    });
    measureTextLayoutMock.mockRejectedValueOnce(
      new TextLayoutError(
        'font-load-failed',
        '字体加载失败，请重新选择字体。',
      ),
    );
    renderWithEditorProviders(<FloatingInspector />);

    await user.click(screen.getByRole('button', { name: '粗体' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '字体加载失败，请重新选择字体。',
    );
    expect(screen.getByRole('button', { name: '粗体' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(testTimelineStore.getState().clips[0]).toEqual(textClip);
    expect(testTimelineStore.getState().past).toEqual([]);
  });
});
