import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { addDecimalStep, clampNumber } from '../../util/number';

import './InputNumber.css';

export type InputNumberProps = {
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  step?: number;
  suffix?: ReactNode;
  value: number;
};

export function InputNumber({
  label,
  max,
  min,
  onCommit,
  step = 1,
  suffix,
  value,
}: InputNumberProps) {
  const [draftValue, setDraftValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);
  const displayedValue = isEditing ? draftValue : String(value);

  const commit = (nextDraftValue = draftValue) => {
    const parsedValue = Number(nextDraftValue);
    if (nextDraftValue.trim() === '' || !Number.isFinite(parsedValue)) {
      setIsEditing(false);
      return;
    }

    const nextValue = clampNumber(parsedValue, min, max);
    setDraftValue(String(nextValue));
    setIsEditing(false);
    onCommit(nextValue);
  };

  const stepBy = (direction: 1 | -1) => {
    const parsedDraftValue = Number(displayedValue);
    const baseValue = Number.isFinite(parsedDraftValue) ? parsedDraftValue : value;
    const nextValue = clampNumber(
      addDecimalStep(baseValue, step, direction),
      min,
      max,
    );

    setDraftValue(String(nextValue));
    setIsEditing(true);
    onCommit(nextValue);
  };

  return (
    <span className='ec-input-number'>
      <input
        aria-label={label}
        max={max}
        min={min}
        onBlur={() => commit()}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setIsEditing(true);
        }}
        onFocus={() => {
          setDraftValue(String(value));
          setIsEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        step={step}
        type='number'
        value={displayedValue}
      />
      <span className='ec-input-number__suffix-group'>
        <span aria-hidden='true' className='ec-input-number__suffix'>
          {suffix}
        </span>
        <span className='ec-input-number__step-layer'>
          <button
            aria-label={`${label}增加`}
            className='ec-input-number__step-button'
            onClick={() => stepBy(1)}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            type='button'
          >
            <ChevronUp aria-hidden='true' size={11} strokeWidth={2} />
          </button>
          <button
            aria-label={`${label}减少`}
            className='ec-input-number__step-button'
            onClick={() => stepBy(-1)}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            type='button'
          >
            <ChevronDown aria-hidden='true' size={11} strokeWidth={2} />
          </button>
        </span>
      </span>
    </span>
  );
}
