import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

const clampValue = (value: number, min?: number, max?: number) =>
  Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  );

const getDecimalPrecision = (value: number) => {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  const fractionalDigits = coefficient?.split('.')[1]?.length ?? 0;
  const exponent = Number(exponentText ?? 0);
  return Math.max(0, fractionalDigits - exponent);
};

const addDecimalStep = (
  value: number,
  step: number,
  direction: 1 | -1,
) => {
  const precision = Math.max(
    getDecimalPrecision(value),
    getDecimalPrecision(step),
  );
  const scale = 10 ** precision;
  const scaledValue = Math.round(value * scale);
  const scaledStep = Math.round(step * scale);
  if (
    !Number.isSafeInteger(scaledValue) ||
    !Number.isSafeInteger(scaledStep)
  ) {
    return value + step * direction;
  }
  return (scaledValue + scaledStep * direction) / scale;
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

    const nextValue = clampValue(parsedValue, min, max);
    setDraftValue(String(nextValue));
    setIsEditing(false);
    onCommit(nextValue);
  };

  const stepBy = (direction: 1 | -1) => {
    const parsedDraftValue = Number(displayedValue);
    const baseValue = Number.isFinite(parsedDraftValue) ? parsedDraftValue : value;
    const nextValue = clampValue(
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
