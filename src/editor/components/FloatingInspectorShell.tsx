import { X } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { IconButton } from './ui/IconButton';

export type FloatingInspectorControls = {
  hidden: boolean;
  isPanelOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
};

type FloatingInspectorShellProps = Omit<FloatingInspectorControls, 'onOpen'> & {
  ariaLabel?: string;
  children: ReactNode;
  closeLabel?: string;
  navigationLabel?: string;
  railItems: ReactNode;
  sectionTitle: string;
  side?: 'left' | 'right';
};

export function FloatingInspectorShell({
  ariaLabel = '基础属性面板',
  children,
  closeLabel = '关闭属性面板',
  hidden,
  isPanelOpen,
  navigationLabel = '属性分类',
  onClose,
  railItems,
  sectionTitle,
  side = 'right',
}: FloatingInspectorShellProps) {
  const railRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const wasPanelOpenRef = useRef(isPanelOpen);

  useLayoutEffect(() => {
    if (isPanelOpen && !wasPanelOpenRef.current && !hidden && openerRef.current) {
      closeRef.current?.focus();
    }
    wasPanelOpenRef.current = isPanelOpen;
  }, [hidden, isPanelOpen]);

  const closePanel = () => {
    onClose();
    const opener = openerRef.current ??
      railRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]') ??
      railRef.current?.querySelector<HTMLButtonElement>('button');
    opener?.focus();
  };

  return (
    <aside
      aria-label={ariaLabel}
      className='ec-floating-inspector'
      data-panel-open={isPanelOpen}
      data-side={side}
      hidden={hidden}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !isPanelOpen) return;
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }}
    >
      <div className='ec-floating-inspector__panel' hidden={!isPanelOpen}>
        <header className='ec-floating-inspector__header'>
          <h2>{sectionTitle}</h2>
          <IconButton
            aria-label={closeLabel}
            className='ec-floating-inspector__close'
            onClick={closePanel}
            ref={closeRef}
          >
            <X aria-hidden='true' size={19} />
          </IconButton>
        </header>
        <div className='ec-floating-inspector__main'>{children}</div>
      </div>

      <nav
        aria-label={navigationLabel}
        className='ec-floating-inspector__rail'
        onClickCapture={(event) => {
          if (!(event.target instanceof Element)) return;
          openerRef.current = event.target.closest<HTMLButtonElement>('button');
        }}
        ref={railRef}
      >
        {railItems}
      </nav>
    </aside>
  );
}
