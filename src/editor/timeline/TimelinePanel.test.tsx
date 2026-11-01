import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { TimelinePanel } from './TimelinePanel';

vi.mock('../components/TimelineToolbar', () => ({
  TimelineToolbar: () => <div data-testid='timeline-toolbar' />,
}));

vi.mock('./TimelineViewport', () => ({
  TimelineViewport: () => <div data-testid='timeline-viewport' />,
}));

const DEFAULT_LAYOUT_HEIGHT_PX = 800;

describe('TimelinePanel', () => {
  const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight',
  );
  const hasPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
    HTMLButtonElement.prototype,
    'hasPointerCapture',
  );
  const releasePointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
    HTMLButtonElement.prototype,
    'releasePointerCapture',
  );
  const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
    HTMLButtonElement.prototype,
    'setPointerCapture',
  );

  let animationFrames: Map<number, FrameRequestCallback>;
  let cancelAnimationFrameMock: Mock<(frameId: number) => void>;
  let nextAnimationFrameId: number;
  let releasePointerCaptureMock: Mock<(pointerId: number) => void>;
  let resizeObserverCallback: (() => void) | null;
  let resizeObserverDisconnectMock: Mock<() => void>;
  let setPointerCaptureMock: Mock<(pointerId: number) => void>;

  const flushAnimationFrames = () => {
    const callbacks = [...animationFrames.values()];
    animationFrames.clear();
    callbacks.forEach((callback) => callback(0));
  };

  const notifyContainerResize = () => {
    const callback = resizeObserverCallback;
    if (!callback) throw new Error('ResizeObserver 尚未创建。');
    act(() => callback());
  };

  const renderPanel = (
    layoutHeight = DEFAULT_LAYOUT_HEIGHT_PX,
    onRender: ProfilerOnRenderCallback = () => undefined,
  ) => {
    const result = render(
      <Profiler id='timeline-panel' onRender={onRender}>
        <div
          data-client-height={layoutHeight}
          data-testid='editor-main'
          style={{ paddingBottom: 8 }}
        >
          <div data-testid='preview-panel' style={{ minHeight: 300 }} />
          <TimelinePanel
            onDownloadClip={() => undefined}
            onRequestAddTitle={() => undefined}
          />
        </div>
      </Profiler>,
    );

    const layout = screen.getByTestId('editor-main');
    return {
      ...result,
      layout,
      setLayoutHeight: (height: number) => {
        layout.dataset.clientHeight = String(height);
        notifyContainerResize();
      },
    };
  };

  beforeEach(() => {
    animationFrames = new Map();
    nextAnimationFrameId = 0;
    resizeObserverCallback = null;
    resizeObserverDisconnectMock = vi.fn();
    setPointerCaptureMock = vi.fn();
    releasePointerCaptureMock = vi.fn();
    cancelAnimationFrameMock = vi.fn((frameId: number) => {
      animationFrames.delete(frameId);
    });

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        const height = this.dataset.clientHeight;
        return height ? Number(height) : 0;
      },
    });
    // jsdom has no layout engine; expose the geometry supplied by flex layout.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const containerHeight = Number(this.parentElement?.dataset.clientHeight ?? 0);
      const requestedHeight = Number.parseFloat(this.style.height);
      const height = this.classList.contains('ec-timeline-panel')
        ? Math.max(210, Math.min(requestedHeight, containerHeight - 316))
        : Number(this.dataset.clientHeight ?? 0);
      return new DOMRect(0, 0, 1200, height);
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(
      HTMLButtonElement.prototype,
      'releasePointerCapture',
      {
        configurable: true,
        value: releasePointerCaptureMock,
      },
    );
    Object.defineProperty(HTMLButtonElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: setPointerCaptureMock,
    });

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextAnimationFrameId += 1;
        animationFrames.set(nextAnimationFrameId, callback);
        return nextAnimationFrameId;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = () => callback([], this);
        }

        disconnect() {
          resizeObserverDisconnectMock();
        }

        observe() {
          return undefined;
        }

        unobserve() {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    if (clientHeightDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'clientHeight',
        clientHeightDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    }
    if (hasPointerCaptureDescriptor) {
      Object.defineProperty(
        HTMLButtonElement.prototype,
        'hasPointerCapture',
        hasPointerCaptureDescriptor,
      );
    } else {
      Reflect.deleteProperty(
        HTMLButtonElement.prototype,
        'hasPointerCapture',
      );
    }
    if (releasePointerCaptureDescriptor) {
      Object.defineProperty(
        HTMLButtonElement.prototype,
        'releasePointerCapture',
        releasePointerCaptureDescriptor,
      );
    } else {
      Reflect.deleteProperty(
        HTMLButtonElement.prototype,
        'releasePointerCapture',
      );
    }
    if (setPointerCaptureDescriptor) {
      Object.defineProperty(
        HTMLButtonElement.prototype,
        'setPointerCapture',
        setPointerCaptureDescriptor,
      );
    } else {
      Reflect.deleteProperty(
        HTMLButtonElement.prototype,
        'setPointerCapture',
      );
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes the default and bounded height through an accessible separator', () => {
    const { layout } = renderPanel();

    const preview = screen.getByTestId('preview-panel');
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });
    separator.focus();

    expect(layout.children).toHaveLength(3);
    expect(preview.nextElementSibling).toBe(separator);
    expect(separator.nextElementSibling).toBe(panel);
    expect(panel).toHaveStyle({ height: '360px' });
    expect(separator).toHaveFocus();
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).toHaveAttribute('aria-valuemin', '210');
    expect(separator).toHaveAttribute('aria-valuemax', '484');
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(separator).toHaveAttribute('aria-valuetext', '360 像素');
  });

  it('resizes with the primary pointer and clamps both boundaries', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 300,
      isPrimary: true,
      pointerId: 7,
    });
    fireEvent.pointerMove(separator, {
      clientY: 200,
      isPrimary: true,
      pointerId: 7,
    });
    act(flushAnimationFrames);

    expect(setPointerCaptureMock).toHaveBeenCalledWith(7);
    expect(panel).toHaveStyle({ height: '460px' });

    fireEvent.pointerMove(separator, {
      clientY: -500,
      isPrimary: true,
      pointerId: 7,
    });
    act(flushAnimationFrames);
    expect(panel).toHaveStyle({ height: '484px' });

    fireEvent.pointerUp(separator, { pointerId: 7 });
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(7);

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
    });
    fireEvent.pointerMove(separator, {
      clientY: 1_000,
      isPrimary: true,
      pointerId: 8,
    });
    act(flushAnimationFrames);
    expect(panel).toHaveStyle({ height: '210px' });
  });

  it('ignores non-primary and secondary pointer input', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 300,
      isPrimary: false,
      pointerId: 2,
    });
    fireEvent.pointerDown(separator, {
      button: 2,
      clientY: 300,
      isPrimary: true,
      pointerId: 3,
    });
    fireEvent.pointerMove(separator, { clientY: 100, pointerId: 3 });
    act(flushAnimationFrames);

    expect(setPointerCaptureMock).not.toHaveBeenCalled();
    expect(panel).toHaveStyle({ height: '360px' });
  });

  it('restores the pre-gesture preference when pointer input is cancelled', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 300,
      isPrimary: true,
      pointerId: 4,
    });
    fireEvent.pointerMove(separator, { clientY: 240, pointerId: 4 });
    act(flushAnimationFrames);
    expect(panel).toHaveStyle({ height: '420px' });

    fireEvent.pointerMove(separator, { clientY: 220, pointerId: 4 });
    fireEvent.pointerCancel(separator, { pointerId: 4 });

    expect(cancelAnimationFrameMock).toHaveBeenCalled();
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(4);
    expect(panel).toHaveStyle({ height: '360px' });
  });

  it('supports keyboard resizing and boundary shortcuts', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(panel).toHaveStyle({ height: '370px' });

    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(panel).toHaveStyle({ height: '360px' });

    fireEvent.keyDown(separator, { key: 'Home' });
    expect(panel).toHaveStyle({ height: '210px' });

    fireEvent.keyDown(separator, { key: 'End' });
    expect(panel).toHaveStyle({ height: '484px' });
    expect(separator).toHaveAttribute('aria-valuenow', '484');
  });

  it('clamps to resized containers and restores the preferred height later', () => {
    const { setLayoutHeight } = renderPanel(552);
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    expect(panel).toHaveStyle({ height: '360px' });
    expect(panel.getBoundingClientRect().height).toBe(236);
    expect(separator).toHaveAttribute('aria-valuemax', '236');

    setLayoutHeight(800);
    expect(panel).toHaveStyle({ height: '360px' });

    fireEvent.keyDown(separator, { key: 'End' });
    expect(panel).toHaveStyle({ height: '484px' });

    setLayoutHeight(676);
    expect(panel).toHaveStyle({ height: '484px' });
    expect(panel.getBoundingClientRect().height).toBe(360);

    setLayoutHeight(800);
    expect(panel).toHaveStyle({ height: '484px' });
  });

  it('keeps the preferred height unchanged without a React commit when the container resizes', () => {
    const onRender = vi.fn();
    const { setLayoutHeight } = renderPanel(552, onRender);
    const panel = screen.getByTestId('timeline-toolbar').parentElement;
    onRender.mockClear();

    setLayoutHeight(800);
    setLayoutHeight(552);

    expect(onRender).not.toHaveBeenCalled();
    expect(panel).toHaveStyle({ height: '360px' });
  });

  it('resizes by keyboard from the actual CSS-constrained height', () => {
    renderPanel(552);
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', { name: '调整时间线面板高度' });

    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(panel).toHaveStyle({ height: '226px' });
    expect(separator).toHaveAttribute('aria-valuenow', '226');
  });

  it('reads current geometry when a drag starts before the resize observer runs', () => {
    const { layout } = renderPanel(552);
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', { name: '调整时间线面板高度' });
    layout.dataset.clientHeight = '800';

    fireEvent.pointerDown(separator, {
      button: 0, clientY: 300, isPrimary: true, pointerId: 1,
    });
    fireEvent.pointerMove(separator, { clientY: 270, pointerId: 1 });
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(panel).toHaveStyle({ height: '390px' });
    expect(animationFrames.size).toBe(0);
  });

  it('clamps pending pointer input to the container at the time it is applied', () => {
    const { layout, setLayoutHeight } = renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', { name: '调整时间线面板高度' });
    fireEvent.pointerDown(separator, {
      button: 0, clientY: 300, isPrimary: true, pointerId: 1,
    });
    fireEvent.pointerMove(separator, { clientY: 200, pointerId: 1 });
    layout.dataset.clientHeight = '552';
    act(flushAnimationFrames);

    expect(panel).toHaveStyle({ height: '236px' });
    fireEvent.pointerUp(separator, { pointerId: 1 });
    setLayoutHeight(800);
    expect(panel).toHaveStyle({ height: '236px' });
  });

  it('cancels a drag on window blur and restores the original preference', () => {
    const { setLayoutHeight } = renderPanel();
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', { name: '调整时间线面板高度' });
    fireEvent.pointerDown(separator, {
      button: 0, clientY: 300, isPrimary: true, pointerId: 2,
    });
    fireEvent.pointerMove(separator, { clientY: 200, pointerId: 2 });
    act(flushAnimationFrames);
    expect(panel).toHaveStyle({ height: '460px' });
    fireEvent.pointerMove(separator, { clientY: 100, pointerId: 2 });
    setLayoutHeight(552);

    fireEvent(window, new Event('blur'));
    act(flushAnimationFrames);

    expect(panel).toHaveStyle({ height: '360px' });
    expect(panel).not.toHaveAttribute('data-resizing');
    expect(separator).toHaveAttribute('aria-valuenow', '236');
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(2);
    expect(animationFrames.size).toBe(0);
    setLayoutHeight(800);
    expect(separator).toHaveAttribute('aria-valuenow', '360');
  });

  it('keeps CSS sizing and accessibility updates without ResizeObserver and cleans up listeners', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const onRender = vi.fn();
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { layout, unmount } = renderPanel(552, onRender);
    const panel = screen.getByRole('region', { name: '时间线编辑区域' });
    const separator = screen.getByRole('separator', { name: '调整时间线面板高度' });
    onRender.mockClear();
    layout.dataset.clientHeight = '800';

    fireEvent(window, new Event('resize'));

    expect(panel).toHaveStyle({ height: '360px' });
    expect(separator).toHaveAttribute('aria-valuenow', '360');
    expect(separator).toHaveAttribute('aria-valuemax', '484');
    expect(onRender).not.toHaveBeenCalled();
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
  });

  it('cleans up pending animation work and the resize observer on unmount', () => {
    const { unmount } = renderPanel();
    const separator = screen.getByRole('separator', {
      name: '调整时间线面板高度',
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 300,
      isPrimary: true,
      pointerId: 9,
    });
    fireEvent.pointerMove(separator, { clientY: 250, pointerId: 9 });
    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalled();
    expect(resizeObserverDisconnectMock).toHaveBeenCalledOnce();
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(9);
  });
});
