import type { ComponentPropsWithRef } from 'react';

import './TextInput.css';

export type TextInputSize = 'small' | 'medium' | 'large';

export type TextInputType =
  | 'text'
  | 'url'
  | 'email'
  | 'password'
  | 'search'
  | 'tel';

export type TextInputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'size' | 'type'
> & {
  size: TextInputSize;
  type?: TextInputType;
};

export function TextInput({ size, type = 'text', ...props }: TextInputProps) {
  return (
    <input
      {...props}
      className='ec-text-input'
      data-size={size}
      type={type}
    />
  );
}
