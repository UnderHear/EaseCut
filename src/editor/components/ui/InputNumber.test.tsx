import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InputNumber } from './InputNumber';

describe('InputNumber', () => {
  it('renders a suffix and commits a typed value on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InputNumber
        label='Y 位置'
        onCommit={onCommit}
        suffix='Y'
        value={28}
      />,
    );

    const input = screen.getByRole('spinbutton', { name: 'Y 位置' });
    expect(input).toHaveValue(28);
    expect(screen.getByText('Y')).toBeVisible();

    await user.clear(input);
    await user.type(input, '42');
    await user.tab();

    expect(onCommit).toHaveBeenLastCalledWith(42);
  });

  it('increments, decrements and clamps values with step buttons', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InputNumber
        label='轨道音量'
        max={100}
        min={0}
        onCommit={onCommit}
        suffix='%'
        value={100}
      />,
    );

    await user.click(screen.getByRole('button', { name: '轨道音量增加' }));
    expect(onCommit).toHaveBeenLastCalledWith(100);

    await user.click(screen.getByRole('button', { name: '轨道音量减少' }));
    expect(onCommit).toHaveBeenLastCalledWith(99);
  });

  it('keeps decimal step values free of floating-point artifacts', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InputNumber
        label='播放速度'
        max={4}
        min={0.1}
        onCommit={onCommit}
        step={0.1}
        suffix='x'
        value={1}
      />,
    );

    const increase = screen.getByRole('button', {
      name: '播放速度增加',
    });
    await user.click(increase);
    await user.click(increase);

    expect(screen.getByRole('spinbutton', { name: '播放速度' })).toHaveValue(
      1.2,
    );
    expect(onCommit).toHaveBeenLastCalledWith(1.2);
  });
});
