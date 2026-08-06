import { describe, expect, it } from 'vitest';

import { createTextCanvasFont } from './format-canvas-font';
import { formatTimelineMediaType } from './format-media-label';

describe('media display formatting', () => {
  it('formats canvas fonts in CSS syntax', () => {
    expect(
      createTextCanvasFont(
        { bold: true, fontSize: 32, italic: true },
        'Noto Sans SC',
      ),
    ).toBe('italic 700 32px "Noto Sans SC", sans-serif');
  });

  it('formats media type labels', () => {
    expect(formatTimelineMediaType('video')).toBe('视频');
    expect(formatTimelineMediaType('audio')).toBe('音频');
    expect(formatTimelineMediaType('image')).toBe('图片');
  });
});
