import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ColorInput } from './ColorInput';

describe('ColorInput', () => {
  it('renders the selected color as a square with the requested size', () => {
    render(
      <ColorInput
        aria-label='字体颜色'
        isPreviewing={false}
        size={24}
        value='#123456'
      />,
    );

    expect(screen.getByLabelText('字体颜色')).toHaveAttribute('type', 'color');
    expect(screen.getByLabelText('字体颜色')).toHaveClass('ec-color-input');
    expect(screen.getByLabelText('字体颜色')).toHaveStyle({
      backgroundColor: '#123456',
      height: '24px',
      width: '24px',
    });
  });

  it('separates color previews from the committed native change', () => {
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const ref = createRef<HTMLInputElement>();

    render(
      <ColorInput
        aria-label='背景颜色'
        disabled
        isPreviewing
        onCommit={onCommit}
        onPreview={onPreview}
        ref={ref}
        size={16}
        title='背景颜色'
        value='#ffffff'
      />,
    );

    const input = screen.getByLabelText('背景颜色');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('title', '背景颜色');
    expect(ref.current).toBe(input);

    fireEvent.input(input, { target: { value: '#abcdef' } });

    expect(onPreview).toHaveBeenCalledOnce();
    expect(onPreview).toHaveBeenLastCalledWith('#abcdef');
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.input(input, { target: { value: '#fedcba' } });
    fireEvent.change(input);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenLastCalledWith('#fedcba');
  });

  it('does not reuse a cancelled preview in a later picker activation', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <ColorInput
        aria-label='字体颜色'
        isPreviewing
        onCommit={onCommit}
        size={20}
        value='#ffffff'
      />,
    );
    const input = screen.getByLabelText('字体颜色');

    fireEvent.input(input, { target: { value: '#abcdef' } });
    rerender(
      <ColorInput
        aria-label='字体颜色'
        isPreviewing={false}
        onCommit={onCommit}
        size={20}
        value='#ffffff'
      />,
    );
    fireEvent.pointerDown(input);
    fireEvent.change(input);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('#ffffff');
  });
});
