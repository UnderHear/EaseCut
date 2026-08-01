import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import './Select.css';

const supportsPopover = () =>
  typeof HTMLElement !== 'undefined' &&
  typeof HTMLElement.prototype.showPopover === 'function';

const supportsAnchorPositioning = () =>
  typeof CSS !== 'undefined' &&
  CSS.supports('position-anchor', '--ec-select-anchor') &&
  CSS.supports('top', 'anchor(bottom)') &&
  CSS.supports('width', 'anchor-size(width)');

export type SelectOption<Value extends string> = Readonly<{
  label: string;
  value: Value;
}>;

export type SelectProps<Value extends string> = {
  disabled?: boolean;
  label: string;
  onValueChange: (value: Value) => void;
  options: readonly SelectOption<Value>[];
  value: Value;
};

export function Select<Value extends string>({
  disabled = false,
  label,
  onValueChange,
  options,
  value,
}: SelectProps<Value>) {
  const listboxId = useId();
  const anchorName = `--ec-select-${listboxId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const pendingOpenIndexRef = useRef<number | null>(null);
  const shouldScrollActiveOptionRef = useRef(false);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const usesTopLayer = supportsPopover();
  const isDisabled = disabled || options.length === 0;

  const prepareOpen = (fallbackIndex: number) => {
    if (isDisabled) return;
    shouldScrollActiveOptionRef.current = true;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallbackIndex);
  };

  const updateFallbackPosition = useCallback(() => {
    if (!usesTopLayer || supportsAnchorPositioning()) return;
    const trigger = triggerRef.current;
    const listbox = listboxRef.current;
    if (!trigger || !listbox) return;
    const rect = trigger.getBoundingClientRect();
    listbox.style.setProperty('--ec-select-left', `${rect.left}px`);
    listbox.style.setProperty('--ec-select-top', `${rect.bottom + 4}px`);
    listbox.style.setProperty('--ec-select-width', `${rect.width}px`);
  }, [usesTopLayer]);

  const open = (fallbackIndex: number) => {
    if (isDisabled) return;
    if (usesTopLayer) {
      pendingOpenIndexRef.current = fallbackIndex;
      triggerRef.current?.click();
      return;
    }
    prepareOpen(fallbackIndex);
    setIsOpen(true);
  };

  const close = (restoreFocus: boolean) => {
    const listbox = listboxRef.current;
    if (usesTopLayer && listbox?.matches(':popover-open')) {
      listbox.hidePopover();
    } else {
      setIsOpen(false);
    }
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onValueChange(option.value);
    close(true);
  };

  const moveActiveOption = (direction: -1 | 1) => {
    shouldScrollActiveOptionRef.current = true;
    setActiveIndex((currentIndex) =>
      Math.min(
        options.length - 1,
        Math.max(0, currentIndex + direction),
      ),
    );
  };

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveOption(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveOption(-1);
        break;
      case 'End':
        event.preventDefault();
        shouldScrollActiveOptionRef.current = true;
        setActiveIndex(options.length - 1);
        break;
      case 'Home':
        event.preventDefault();
        shouldScrollActiveOptionRef.current = true;
        setActiveIndex(0);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectOption(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    listboxRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => updateFallbackPosition();
    if (usesTopLayer && !supportsAnchorPositioning()) {
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (rootRef.current?.contains(target) || listboxRef.current?.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isOpen, updateFallbackPosition, usesTopLayer]);

  useEffect(() => {
    if (!isOpen || !shouldScrollActiveOptionRef.current) return;
    shouldScrollActiveOptionRef.current = false;
    const activeOption = optionRefs.current.get(activeIndex);
    if (typeof activeOption?.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen]);

  return (
    <div
      className='ec-select'
      data-state={isOpen ? 'open' : 'closed'}
      ref={rootRef}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof Node) ||
          (!event.currentTarget.contains(nextTarget) &&
            !listboxRef.current?.contains(nextTarget))
        ) {
          setIsOpen(false);
        }
      }}
    >
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup='listbox'
        aria-label={label}
        className='ec-select__trigger'
        disabled={isDisabled}
        onClick={() => {
          if (!isOpen) {
            prepareOpen(pendingOpenIndexRef.current ?? 0);
            updateFallbackPosition();
          }
          pendingOpenIndexRef.current = null;
          if (!usesTopLayer) setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            open(0);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            open(options.length - 1);
          }
        }}
        popoverTarget={usesTopLayer ? listboxId : undefined}
        ref={triggerRef}
        style={{ anchorName }}
        type='button'
      >
        <span className='ec-select__value'>
          {selectedOption?.label ?? value}
        </span>
        <ChevronDown aria-hidden='true' className='ec-select__chevron' />
      </button>

      {usesTopLayer || isOpen ? (
        <div
          aria-activedescendant={
            activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-label={label}
          className='ec-select__listbox'
          data-top-layer={usesTopLayer ? 'true' : undefined}
          id={listboxId}
          onKeyDown={handleListboxKeyDown}
          onToggle={(event) => {
            setIsOpen(event.newState === 'open');
          }}
          popover={usesTopLayer ? 'auto' : undefined}
          ref={listboxRef}
          role='listbox'
          style={{ positionAnchor: anchorName }}
          tabIndex={-1}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                aria-selected={isSelected}
                className='ec-select__option'
                data-active={index === activeIndex ? 'true' : undefined}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => selectOption(index)}
                onPointerMove={() => {
                  shouldScrollActiveOptionRef.current = false;
                  setActiveIndex(index);
                }}
                ref={(node) => {
                  if (node) optionRefs.current.set(index, node);
                  else optionRefs.current.delete(index);
                }}
                role='option'
                tabIndex={-1}
                type='button'
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <Check aria-hidden='true' className='ec-select__check' />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
