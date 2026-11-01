import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { TimelineClip } from '../types';
import { MAIN_VIDEO_TRACK_ID } from '../store/timeline-store';
import { useTimelineStore } from '../store/timeline-store-context';
import { PreviewInspectors } from './PreviewInspectors';
import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';

const videoClip: TimelineClip = {
  durationUs: 5_000_000,
  hidden: false,
  id: 'video',
  name: 'video.mp4',
  sourceDurationUs: 5_000_000,
  sourceId: 'source-video',
  speed: 1,
  src: '/video.mp4',
  startUs: 0,
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  trimEndUs: 5_000_000,
  trimStartUs: 0,
  type: 'video',
  volume: 1,
  zIndex: 0,
};

const audioClip: TimelineClip = {
  ...videoClip,
  id: 'audio',
  name: 'audio.mp3',
  sourceId: 'source-audio',
  src: '/audio.mp3',
  trackId: 'audio-track',
  transform: { height: 0, width: 0, x: 0, y: 0 },
  type: 'audio',
};

const textClip: TimelineClip = {
  bold: false,
  durationUs: 5_000_000,
  fontColor: '#FFFFFFFF',
  fontSize: 120,
  fontType: 'SY_Black',
  hidden: false,
  id: 'text',
  italic: false,
  layoutSize: { height: 120, width: 800 },
  position: { x: 0, y: 0 },
  startUs: 0,
  text: 'Title',
  trackId: 'text-track',
  type: 'text',
  underline: false,
  zIndex: 0,
};

const imageClip: TimelineClip = {
  durationUs: 5_000_000,
  hidden: false,
  id: 'image',
  name: 'image.png',
  sourceId: 'source-image',
  src: '/image.png',
  startUs: 0,
  trackId: MAIN_VIDEO_TRACK_ID,
  transform: { height: 720, width: 1280, x: 0, y: 0 },
  type: 'image',
  zIndex: 0,
};

const mediaRuntimeMock = vi.hoisted(() => ({
  measureTextLayout: vi.fn(() => Promise.resolve({ height: 120, width: 800 })),
}));
vi.mock('../media', async (importOriginal) => ({
  ...await importOriginal<typeof import('../media')>(),
  useMediaRuntime: () => mediaRuntimeMock,
}));

function InspectorsFixture() {
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  return <PreviewInspectors selectedClipId={selectedClipId} />;
}

describe('PreviewInspectors', () => {
  let width: number;
  let notifyResize: () => void;
  let disconnect: Mock<() => void>;

  beforeEach(() => {
    width = 400;
    disconnect = vi.fn<() => void>();
    notifyResize = () => { throw new Error('ResizeObserver was not created'); };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, 0, width, 600);
    });
    vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this);
      }
      disconnect = disconnect;
      observe = vi.fn();
      unobserve = vi.fn();
    });
    resetTestTimelineStore();
    testTimelineStore.setState({
      clips: [videoClip],
      selectedClipId: videoClip.id,
      tracks: [
        ...testTimelineStore.getState().tracks,
        { id: 'audio-track', muted: false, name: 'Audio', type: 'audio', zIndex: 1 },
        { id: 'text-track', muted: false, name: 'Text', type: 'text', zIndex: 2 },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the ratio close button accessible by hiding the opposite rail in a narrow container', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '关闭属性面板' }));
    const opener = screen.getByRole('button', { name: '纵横比' });
    await user.click(screen.getByRole('button', { name: '纵横比' }));

    expect(screen.getByRole('button', { name: '关闭画布比例面板' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '属性分类' })).toBeNull();
    expect(screen.getByRole('button', { name: '关闭画布比例面板' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '关闭画布比例面板' }));
    expect(opener).toHaveFocus();
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '基本' })).toBeNull();
  });

  it('hides the left rail when a right panel opens and restores the chosen trigger on Escape', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    expect(screen.queryByRole('navigation', { name: '画布设置' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '关闭属性面板' }));
    const speedTrigger = screen.getByRole('button', { name: '变速' });
    await user.click(speedTrigger);
    expect(screen.getByRole('heading', { name: '变速' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '画布设置' })).toBeNull();

    await user.keyboard('{Escape}');
    expect(speedTrigger).toHaveFocus();
    expect(screen.getByRole('navigation', { name: '画布设置' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '变速' })).toBeNull();
  });

  it('keeps both panels available in a wide container and closes only the focused panel', async () => {
    width = 900;
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: '纵横比' })).toBeNull();
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
  });

  it('keeps the last opened panel when crossing the container breakpoint', async () => {
    width = 702;
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();

    width = 701;
    act(notifyResize);
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '属性分类' })).toBeNull();

    width = 702;
    act(notifyResize);
    const rail = screen.getByRole('navigation', { name: '属性分类' });
    expect(rail).toBeVisible();
    expect(screen.queryByRole('heading', { name: '基本' })).toBeNull();
    await user.click(within(rail).getByRole('button', { name: '基本' }));
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
  });

  it('does not hide the ratio rail after the selected clip disappears', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    act(() => testTimelineStore.setState({ selectedClipId: null }));
    expect(screen.getByRole('navigation', { name: '画布设置' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
    act(() => testTimelineStore.setState({ selectedClipId: videoClip.id }));
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '画布设置' })).toBeNull();
  });

  it.each([videoClip, audioClip, textClip, imageClip])('coordinates ratio and $type panels without changing the project', async (clip) => {
    testTimelineStore.setState({ clips: [clip], selectedClipId: clip.id });
    const snapshot = testTimelineStore.getState();
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '关闭属性面板' }));
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    expect(screen.queryByRole('navigation', { name: '属性分类' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(testTimelineStore.getState().clips).toBe(snapshot.clips);
    expect(testTimelineStore.getState().past).toBe(snapshot.past);
  });

  it('does not steal keyboard focus when selection automatically opens clip properties', () => {
    testTimelineStore.setState({ selectedClipId: null });
    renderWithEditorProviders(
      <>
        <button type='button'>Timeline</button>
        <InspectorsFixture />
      </>,
    );
    const timeline = screen.getByRole('button', { name: 'Timeline' });
    timeline.focus();
    act(() => testTimelineStore.setState({ selectedClipId: videoClip.id }));
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    expect(timeline).toHaveFocus();
  });

  it('uses the current container width when closing before a resize notification', async () => {
    width = 900;
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    width = 400;
    await user.click(screen.getByRole('button', { name: '关闭画布比例面板' }));
    expect(screen.getByRole('navigation', { name: '画布设置' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: '属性分类' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '基本' })).toBeNull();
  });

  it('leaves Escape to a child control that already handled the event', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '关闭属性面板' }));
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(screen.getByRole('button', { name: '关闭画布比例面板' }), event);
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
  });

  it('updates the mode on window resize without ResizeObserver and cleans up the listener', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    width = 900;
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const user = userEvent.setup();
    const { unmount } = renderWithEditorProviders(<InspectorsFixture />);
    await user.click(screen.getByRole('button', { name: '纵横比' }));
    width = 400;
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('navigation', { name: '属性分类' })).toBeNull();
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('disconnects its observer on unmount', () => {
    const { unmount } = renderWithEditorProviders(<InspectorsFixture />);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
