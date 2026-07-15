import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../index', () => ({
  VideoTimelineEditor: ({
    onImportMedia,
    sources,
  }: {
    onImportMedia: (request: { type: 'video' | 'audio'; url: string }) => void;
    sources: Array<{ fileName: string; src: string; type: string }>;
  }) => (
    <>
      <button
        onClick={() =>
          onImportMedia({
            type: 'audio',
            url: 'https://cdn.example.com/music.mp3?signature=1',
          })
        }
        type='button'
      >
        测试导入在线素材
      </button>
      <output data-testid='sources'>{JSON.stringify(sources)}</output>
    </>
  ),
}));

import { DemoApp } from './App';

describe('DemoApp', () => {
  it('starts with built-in media and adds online sources through the editor callback', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: '测试导入在线素材' }));

    const sources = JSON.parse(screen.getByTestId('sources').textContent ?? '[]');
    expect(sources).toEqual([
      ...initialSources,
      expect.objectContaining({
        fileName: 'music.mp3',
        src: 'https://cdn.example.com/music.mp3?signature=1',
        type: 'audio',
      }),
    ]);
    expect(sources.at(-1).id).toEqual(expect.any(String));
  });
});
