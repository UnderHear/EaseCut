import { describe, expect, it } from 'vitest';

import {
  formatHexRgbaColor,
  getRgbHexColor,
  replaceRgbHexColor,
} from './format-text-color';

describe('text color formatting', () => {
  it('adapts an RGBA hex color for a native color input', () => {
    expect(getRgbHexColor('#12345678')).toBe('#123456');
  });

  it('replaces RGB while preserving alpha', () => {
    expect(replaceRgbHexColor('#12345678', '#abcdef')).toBe('#ABCDEF78');
  });

  it('formats an RGBA hex color for canvas rendering', () => {
    expect(formatHexRgbaColor('#12345680')).toBe(
      `rgba(18, 52, 86, ${128 / 255})`,
    );
  });
});
