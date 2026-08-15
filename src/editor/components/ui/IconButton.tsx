import {
  forwardRef,
  type ComponentPropsWithoutRef,
} from 'react';

import './IconButton.css';

type NativeButtonProps = ComponentPropsWithoutRef<'button'>;

export type IconButtonProps = Pick<
  NativeButtonProps,
  | 'aria-controls'
  | 'aria-expanded'
  | 'aria-haspopup'
  | 'aria-pressed'
  | 'children'
  | 'disabled'
  | 'onClick'
  | 'title'
> & {
  'aria-label': string;
  /** Layout hooks only; visual styling belongs to `.ec-icon-button`. */
  className?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, ...buttonProps }, ref) {
    const resolvedClassName = className
      ? `ec-icon-button ${className}`
      : 'ec-icon-button';

    return (
      <button
        {...buttonProps}
        className={resolvedClassName}
        ref={ref}
        type='button'
      />
    );
  },
);
