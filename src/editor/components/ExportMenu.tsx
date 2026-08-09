import { ChevronDown, Download, FileJson } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import './ExportMenu.css';

export type ExportMenuProps = {
  isExporting: boolean;
  onExportJson: () => void;
  onExportLocal?: () => void;
};

const LOCAL_ITEM_INDEX = 0;
const JSON_ITEM_INDEX = 1;

export function ExportMenu({
  isExporting,
  onExportJson,
  onExportLocal,
}: ExportMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndexRef = useRef(LOCAL_ITEM_INDEX);
  const [isOpen, setIsOpen] = useState(false);
  const isLocalExportDisabled = Boolean(onExportLocal) && isExporting;

  const getEnabledItemIndexes = () =>
    [LOCAL_ITEM_INDEX, JSON_ITEM_INDEX].filter(
      (index) => index !== LOCAL_ITEM_INDEX || !isLocalExportDisabled,
    );

  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  const openMenu = (preferredIndex: number) => {
    const enabledIndexes = getEnabledItemIndexes();
    pendingFocusIndexRef.current = enabledIndexes.includes(preferredIndex)
      ? preferredIndex
      : (enabledIndexes[0] ?? JSON_ITEM_INDEX);
    setIsOpen(true);
  };

  const closeMenu = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledIndexes = getEnabledItemIndexes();
    const currentIndex = itemRefs.current.findIndex(
      (item) => item === document.activeElement,
    );
    const enabledPosition = enabledIndexes.indexOf(currentIndex);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nextPosition =
          enabledPosition < 0
            ? 0
            : (enabledPosition + 1) % enabledIndexes.length;
        focusItem(enabledIndexes[nextPosition] ?? JSON_ITEM_INDEX);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previousPosition =
          enabledPosition < 0
            ? enabledIndexes.length - 1
            : (enabledPosition - 1 + enabledIndexes.length) %
              enabledIndexes.length;
        focusItem(enabledIndexes[previousPosition] ?? JSON_ITEM_INDEX);
        break;
      }
      case 'Home':
        event.preventDefault();
        focusItem(enabledIndexes[0] ?? JSON_ITEM_INDEX);
        break;
      case 'End':
        event.preventDefault();
        focusItem(enabledIndexes.at(-1) ?? JSON_ITEM_INDEX);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    focusItem(pendingFocusIndexRef.current);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isOpen]);

  return (
    <div
      className='ec-export-menu'
      data-state={isOpen ? 'open' : 'closed'}
      ref={rootRef}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup='menu'
        className='ec-button ec-button--secondary ec-export-menu__trigger'
        onClick={() => {
          if (isOpen) closeMenu(false);
          else openMenu(LOCAL_ITEM_INDEX);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openMenu(LOCAL_ITEM_INDEX);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(JSON_ITEM_INDEX);
          } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            closeMenu(false);
          }
        }}
        ref={triggerRef}
        type='button'
      >
        <span>导出</span>
        <ChevronDown aria-hidden='true' className='ec-export-menu__chevron' />
      </button>

      {isOpen ? (
        <div
          aria-label='导出选项'
          className='ec-export-menu__content'
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          role='menu'
        >
          <button
            className='ec-export-menu__item'
            disabled={isLocalExportDisabled}
            onClick={
              onExportLocal
                ? () => {
                    closeMenu(true);
                    onExportLocal();
                  }
                : undefined
            }
            ref={(node) => {
              itemRefs.current[LOCAL_ITEM_INDEX] = node;
            }}
            role='menuitem'
            type='button'
          >
            <Download aria-hidden='true' />
            <span>{isLocalExportDisabled ? '导出中…' : '导出到本地'}</span>
          </button>
          <button
            className='ec-export-menu__item'
            onClick={() => {
              closeMenu(true);
              onExportJson();
            }}
            ref={(node) => {
              itemRefs.current[JSON_ITEM_INDEX] = node;
            }}
            role='menuitem'
            type='button'
          >
            <FileJson aria-hidden='true' />
            <span>导出 JSON</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
