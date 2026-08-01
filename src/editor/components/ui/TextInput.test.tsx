import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TextInput, type TextInputType } from './TextInput';

describe('TextInput', () => {
  it.each(['small', 'medium', 'large'] as const)(
    'marks the %s size for its height style',
    (size) => {
      render(<TextInput aria-label={`${size} 输入框`} size={size} />);

      expect(screen.getByRole('textbox')).toHaveAttribute('data-size', size);
    },
  );

  it.each<TextInputType>([
    'text',
    'url',
    'email',
    'password',
    'search',
    'tel',
  ])('renders the supported %s input type', (type) => {
    render(<TextInput aria-label={`${type} 输入框`} size='medium' type={type} />);

    expect(screen.getByLabelText(`${type} 输入框`)).toHaveAttribute(
      'type',
      type,
    );
  });

  it('forwards native attributes and the input ref', () => {
    const ref = createRef<HTMLInputElement>();

    render(
      <TextInput
        aria-invalid='true'
        aria-label='素材 URL'
        defaultValue='https://example.com/video.mp4'
        disabled
        placeholder='请输入素材 URL'
        ref={ref}
        required
        size='large'
        type='url'
      />,
    );

    const input = screen.getByLabelText('素材 URL');
    expect(input).toBeDisabled();
    expect(input).toBeInvalid();
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('placeholder', '请输入素材 URL');
    expect(ref.current).toBe(input);
  });
});
