import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TitleContentTextarea } from './TitleContentTextarea';

describe('TitleContentTextarea', () => {
  it('uses the scrollbar-free textarea style and reports edited text', () => {
    const onChange = vi.fn();

    render(
      <TitleContentTextarea
        onChange={onChange}
        onCommit={() => undefined}
        value='标题'
      />,
    );

    const textarea = screen.getByRole('textbox', { name: '标题内容' });
    expect(textarea).toHaveClass('ec-title-content-textarea');

    fireEvent.change(textarea, { target: { value: '第一行\n第二行' } });
    expect(onChange).toHaveBeenCalledWith('第一行 第二行');
  });

  it('commits and leaves the field when Enter is pressed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(
      <TitleContentTextarea
        onChange={() => undefined}
        onCommit={onCommit}
        value='标题'
      />,
    );

    const textarea = screen.getByRole('textbox', { name: '标题内容' });
    textarea.focus();
    await user.keyboard('{Enter}');

    expect(onCommit).toHaveBeenCalledOnce();
    expect(textarea).not.toHaveFocus();
  });
});
