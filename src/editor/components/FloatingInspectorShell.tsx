import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type FloatingInspectorShellProps = {
  children: ReactNode;
  isPanelOpen: boolean;
  onClose: () => void;
  railItems: ReactNode;
  sectionTitle: string;
};

export function FloatingInspectorShell({
  children,
  isPanelOpen,
  onClose,
  railItems,
  sectionTitle,
}: FloatingInspectorShellProps) {
  return (
    <aside
      aria-label='基础属性面板'
      className='ec-floating-inspector'
      data-panel-open={isPanelOpen}
    >
      <div className='ec-floating-inspector__panel' hidden={!isPanelOpen}>
        <header className='ec-floating-inspector__header'>
          <h2>{sectionTitle}</h2>
          <button
            aria-label='关闭属性面板'
            className='ec-floating-inspector__close'
            onClick={onClose}
            type='button'
          >
            <X aria-hidden='true' size={19} />
          </button>
        </header>
        <div className='ec-floating-inspector__main'>{children}</div>
      </div>

      <nav aria-label='属性分类' className='ec-floating-inspector__rail'>
        {railItems}
      </nav>
    </aside>
  );
}
