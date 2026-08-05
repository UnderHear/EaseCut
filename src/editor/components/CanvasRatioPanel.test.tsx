import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  renderWithEditorProviders,
  resetTestTimelineStore,
  testTimelineStore,
} from './test-helpers';
import { CanvasRatioPanel } from './CanvasRatioPanel';

describe('CanvasRatioPanel', () => {
  beforeEach(() => {
    resetTestTimelineStore();
    testTimelineStore.setState({
      originalCanvasSize: { height: 1920, width: 1080 },
    });
  });

  it('mirrors the property inspector on the left with all ratio choices', () => {
    renderWithEditorProviders(<CanvasRatioPanel />);

    const panel = screen.getByRole('complementary', {
      name: '画布比例面板',
    });
    expect(panel).toHaveAttribute('data-side', 'left');
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: '画布设置' }))
        .getByRole('button', { name: '纵横比' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
    ).toEqual([
      '关闭画布比例面板',
      '原纵横比',
      '16:9',
      '4:3',
      '2:1',
      '9:16',
      '1:1',
      '3:4',
      '纵横比',
    ]);
  });

  it('commits preset and original canvas sizes and supports undo and redo', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<CanvasRatioPanel />);

    await user.click(screen.getByRole('button', { name: '9:16' }));
    expect(testTimelineStore.getState().canvasSize).toEqual({
      height: 1280,
      width: 720,
    });
    expect(testTimelineStore.getState().canvasSelection).toBe('9:16');
    expect(testTimelineStore.getState().past).toHaveLength(1);
    expect(screen.getByRole('button', { name: '9:16' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    testTimelineStore.getState().undo();
    expect(testTimelineStore.getState().canvasSize).toEqual({
      height: 720,
      width: 1280,
    });
    expect(testTimelineStore.getState().canvasSelection).toBe('original');

    testTimelineStore.getState().redo();
    expect(testTimelineStore.getState().canvasSize).toEqual({
      height: 1280,
      width: 720,
    });
    expect(testTimelineStore.getState().canvasSelection).toBe('9:16');

    await user.click(screen.getByRole('button', { name: '原纵横比' }));
    expect(testTimelineStore.getState().canvasSize).toEqual({
      height: 1920,
      width: 1080,
    });
    expect(testTimelineStore.getState().canvasSelection).toBe('original');
  });

  it('keeps original and preset selections distinct at the same size', async () => {
    const user = userEvent.setup();
    testTimelineStore.setState({
      canvasSelection: 'original',
      originalCanvasSize: { height: 720, width: 1280 },
    });
    renderWithEditorProviders(<CanvasRatioPanel />);

    await user.click(screen.getByRole('button', { name: '16:9' }));

    expect(testTimelineStore.getState().canvasSize).toEqual({
      height: 720,
      width: 1280,
    });
    expect(testTimelineStore.getState().canvasSelection).toBe('16:9');
    expect(screen.getByRole('button', { name: '16:9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: '原纵横比' }),
    ).toHaveAttribute('aria-pressed', 'false');

    testTimelineStore.getState().undo();
    expect(testTimelineStore.getState().canvasSelection).toBe('original');
  });

  it('closes the panel and reopens it from the ratio rail item', async () => {
    const user = userEvent.setup();
    renderWithEditorProviders(<CanvasRatioPanel />);

    await user.click(
      screen.getByRole('button', { name: '关闭画布比例面板' }),
    );
    expect(screen.queryByRole('heading', { name: '纵横比' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '纵横比' }));
    expect(screen.getByRole('heading', { name: '纵横比' })).toBeVisible();
  });
});
