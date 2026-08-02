import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ColorInput } from './ColorInput';

describe('ColorInput', () => {
  it('renders the selected color as a square with the requested size', () => {
    render(
      <ColorInput aria-label='字体颜色' size={24} value='#123456' />,
    );

    expect(screen.getByLabelText('字体颜色')).toHaveAttribute('type', 'color');
    expect(screen.getByLabelText('字体颜色')).toHaveClass('ec-color-input');
    expect(screen.getByLabelText('字体颜色')).toHaveStyle({
      backgroundColor: '#123456',
      height: '24px',
      width: '24px',
    });
  });

  it('forwards color changes and native input attributes', () => {
    const onChange = vi.fn();
    const ref = createRef<HTMLInputElement>();

    render(
      <ColorInput
        aria-label='背景颜色'
        disabled
        onChange={onChange}
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

    fireEvent.change(input, { target: { value: '#abcdef' } });

    expect(onChange).toHaveBeenCalledOnce();
  });
});
