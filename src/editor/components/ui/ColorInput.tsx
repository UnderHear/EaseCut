import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type Ref,
} from 'react';

import './ColorInput.css';

type NativeColorInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  | 'aria-label'
  | 'children'
  | 'className'
  | 'defaultValue'
  | 'onChange'
  | 'onInput'
  | 'size'
  | 'style'
  | 'type'
  | 'value'
>;

export type ColorInputProps = NativeColorInputProps & {
  'aria-label': string;
  isPreviewing: boolean;
  onCommit?: (value: string) => void;
  onPreview?: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
  size: number;
  value: string;
};

export function ColorInput({
  isPreviewing,
  onBlur,
  onCommit,
  onFocus,
  onKeyDown,
  onPointerDown,
  onPreview,
  ref,
  size,
  value,
  ...props
}: ColorInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestInputValueRef = useRef<string | null>(null);
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const displayedValue = isPreviewing ? (previewValue ?? value) : value;
  const setInputRef = useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input;
      if (typeof ref === 'function') {
        ref(input);
      } else if (ref) {
        ref.current = input;
      }
    },
    [ref],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !onCommit) return undefined;
    const commitValue = () => {
      onCommit(latestInputValueRef.current ?? input.value);
      latestInputValueRef.current = null;
      setPreviewValue(null);
    };
    input.addEventListener('change', commitValue);
    return () => input.removeEventListener('change', commitValue);
  }, [onCommit]);

  return (
    <input
      {...props}
      className='ec-color-input'
      onBlur={(event) => {
        setPreviewValue(null);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setPreviewValue(null);
        onFocus?.(event);
      }}
      onInput={(event) => {
        latestInputValueRef.current = event.currentTarget.value;
        setPreviewValue(event.currentTarget.value);
        onPreview?.(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        latestInputValueRef.current = null;
        onKeyDown?.(event);
      }}
      onPointerDown={(event) => {
        latestInputValueRef.current = null;
        onPointerDown?.(event);
      }}
      ref={setInputRef}
      style={{
        backgroundColor: displayedValue,
        height: size,
        width: size,
      }}
      type='color'
      value={displayedValue}
    />
  );
}
