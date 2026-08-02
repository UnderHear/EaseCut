import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { FormEvent, ReactNode, RefObject } from 'react';

import { IconButton } from './ui/IconButton';

type FormDialogProps = {
  actions: ReactNode;
  children: ReactNode;
  closeLabel: string;
  describedBy?: string;
  disabled?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  title: string;
};

export function FormDialog({
  actions,
  children,
  closeLabel,
  describedBy,
  disabled = false,
  onClose,
  onSubmit,
  open,
  returnFocusRef,
  title,
}: FormDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !disabled) onClose();
      }}
      open={open}
    >
      <Dialog.Overlay className='ec-import-dialog__backdrop' />
      <Dialog.Content
        aria-describedby={describedBy}
        className='ec-import-dialog'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          if (disabled) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <form noValidate onSubmit={onSubmit}>
          <div className='ec-import-dialog__header'>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild disabled={disabled}>
              <IconButton
                aria-label={closeLabel}
                disabled={disabled}
                title='关闭'
              >
                <X aria-hidden='true' size={17} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
          <div className='ec-import-dialog__actions'>{actions}</div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
