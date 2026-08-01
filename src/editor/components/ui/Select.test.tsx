import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

const options = [
  { label: '默认', value: 'default' },
  { label: '启现代体', value: 'modern' },
  { label: '新青年体', value: 'youth' },
] as const;

describe('Select', () => {
  it('shows the selected label and opens an accessible listbox', async () => {
    const user = userEvent.setup();
    render(
      <Select
        label='字体'
        onValueChange={vi.fn()}
        options={options}
        value='modern'
      />,
    );

    const trigger = screen.getByRole('button', { name: '字体' });
    expect(trigger).toHaveTextContent('启现代体');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: '字体' });
    expect(listbox).toBeVisible();
    expect(listbox.parentElement).toHaveClass('ec-select');
    expect(trigger.style.getPropertyValue('anchor-name')).not.toBe('');
    expect(listbox.style.getPropertyValue('position-anchor')).toBe(
      trigger.style.getPropertyValue('anchor-name'),
    );
    expect(screen.getByRole('option', { name: '启现代体' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('selects an option and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label='字体'
        onValueChange={onValueChange}
        options={options}
        value='default'
      />,
    );

    const trigger = screen.getByRole('button', { name: '字体' });
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: '新青年体' }));

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith('youth');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports arrow selection and Escape from the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label='字体'
        onValueChange={onValueChange}
        options={options}
        value='default'
      />,
    );

    const trigger = screen.getByRole('button', { name: '字体' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('modern');
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not scroll the listbox when pointer hover changes the active option', async () => {
    const user = userEvent.setup();
    render(
      <Select
        label='字体'
        onValueChange={vi.fn()}
        options={options}
        value='default'
      />,
    );

    await user.click(screen.getByRole('button', { name: '字体' }));
    const option = screen.getByRole('option', { name: '新青年体' });
    const scrollIntoView = vi.fn();
    option.scrollIntoView = scrollIntoView;

    fireEvent.pointerMove(option);

    expect(option).toHaveAttribute('data-active', 'true');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
