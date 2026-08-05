import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type FloatingInspectorShellProps = {
  ariaLabel?: string;
  children: ReactNode;
  closeLabel?: string;
  isPanelOpen: boolean;
  navigationLabel?: string;
  onClose: () => void;
  railItems: ReactNode;
  sectionTitle: string;
  side?: 'left' | 'right';
};

export function FloatingInspectorShell({
  ariaLabel = '基础属性面板',
  children,
  closeLabel = '关闭属性面板',
  isPanelOpen,
  navigationLabel = '属性分类',
  onClose,
  railItems,
  sectionTitle,
  side = 'right',
}: FloatingInspectorShellProps) {
  return (
    <aside
      aria-label={ariaLabel}
      className='ec-floating-inspector'
      data-panel-open={isPanelOpen}
      data-side={side}
    >
      <div className='ec-floating-inspector__panel' hidden={!isPanelOpen}>
        <header className='ec-floating-inspector__header'>
          <h2>{sectionTitle}</h2>
          <button
            aria-label={closeLabel}
            className='ec-floating-inspector__close'
            onClick={onClose}
            type='button'
          >
            <X aria-hidden='true' size={19} />
          </button>
        </header>
        <div className='ec-floating-inspector__main'>{children}</div>
      </div>

      <nav
        aria-label={navigationLabel}
        className='ec-floating-inspector__rail'
      >
        {railItems}
      </nav>
    </aside>
  );
}
