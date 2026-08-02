import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('applies the shared class and forwards supported button properties', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();

    render(
      <IconButton
        ref={ref}
        aria-label='切换吸附'
        aria-pressed={true}
        className='ec-toolbar__layout-slot'
        onClick={onClick}
        title='切换吸附'
      >
        <svg aria-hidden='true' />
      </IconButton>,
    );

    const button = screen.getByRole('button', { name: '切换吸附' });
    expect(button).toHaveClass('ec-icon-button', 'ec-toolbar__layout-slot');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('title', '切换吸附');
    expect(button).toHaveAttribute('type', 'button');
    expect(ref.current).toBe(button);

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('preserves native disabled behavior', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <IconButton aria-label='不可用操作' disabled onClick={onClick}>
        <svg aria-hidden='true' />
      </IconButton>,
    );

    const button = screen.getByRole('button', { name: '不可用操作' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
