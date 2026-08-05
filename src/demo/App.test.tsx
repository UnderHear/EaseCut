import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../index', () => ({
  VideoTimelineEditor: ({
    initialSources,
  }: {
    initialSources: Array<{ fileName: string; src: string; type: string }>;
  }) => (
    <output data-testid='sources'>{JSON.stringify(initialSources)}</output>
  ),
}));

import { DemoApp } from './App';

describe('DemoApp', () => {
  it('starts the editor with built-in media', () => {
    const { container } = render(<DemoApp />);

    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(screen.queryByText('添加本地素材')).not.toBeInTheDocument();

    const initialSources = JSON.parse(
      screen.getByTestId('sources').textContent ?? '[]',
    );
    expect(initialSources).toEqual([
      expect.objectContaining({
        fileName: 'demo-video.mp4',
        id: 'built-in-demo-video',
        type: 'video',
      }),
      expect.objectContaining({
        fileName: 'demo-audio.mp3',
        id: 'built-in-demo-audio',
        type: 'audio',
      }),
    ]);

  });
});
