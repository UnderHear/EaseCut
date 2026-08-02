import type { ComponentPropsWithRef } from 'react';

import './ColorInput.css';

type NativeColorInputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'aria-label' | 'children' | 'className' | 'defaultValue' | 'size' | 'style' | 'type' | 'value'
>;

export type ColorInputProps = NativeColorInputProps & {
  'aria-label': string;
  size: number;
  value: string;
};

export function ColorInput({ size, value, ...props }: ColorInputProps) {
  return (
    <input
      {...props}
      className='ec-color-input'
      style={{
        backgroundColor: value,
        height: size,
        width: size,
      }}
      type='color'
      value={value}
    />
  );
}
