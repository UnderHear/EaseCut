import { describe, expect, it } from 'vitest';

import { getNextNumberedId } from './id';
import {
  addDecimalStep,
  clampNumber,
  isNonNegativeFiniteNumber,
  isPositiveFiniteNumber,
  normalizeNonNegativeFiniteNumber,
} from './number';
import { replaceLineBreaksWithSpaces } from './text';

describe('number, text, and ID helpers', () => {
  it('clamps numbers and increments decimals without floating-point noise', () => {
    expect(clampNumber(3, 0, 2)).toBe(2);
    expect(addDecimalStep(0.2, 0.1, 1)).toBe(0.3);
    expect(addDecimalStep(0.2, 0.1, -1)).toBe(0.1);
  });

  it('classifies and normalizes finite numbers', () => {
    expect(isPositiveFiniteNumber(1)).toBe(true);
    expect(isPositiveFiniteNumber(0)).toBe(false);
    expect(isNonNegativeFiniteNumber(0)).toBe(true);
    expect(isNonNegativeFiniteNumber(-1)).toBe(false);
    expect(normalizeNonNegativeFiniteNumber(Number.NaN)).toBe(0);
    expect(normalizeNonNegativeFiniteNumber(2.5)).toBe(2.5);
  });

  it('normalizes line breaks and generates the first available numbered ID', () => {
    expect(replaceLineBreaksWithSpaces('第一行\r\n第二行\n第三行')).toBe(
      '第一行 第二行 第三行',
    );
    expect(getNextNumberedId(['source-1', 'source-3'], 'source')).toBe(
      'source-2',
    );
  });
});
