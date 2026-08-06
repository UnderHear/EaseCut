import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../index', () => ({
  VideoTimelineEditor: () => <output>编辑器已挂载</output>,
}));

import { DemoApp } from './App';

describe('DemoApp', () => {
  it('renders an empty editor entry point', () => {
    render(<DemoApp />);

    expect(screen.getByText('编辑器已挂载')).toBeVisible();
    expect(screen.queryByText('添加本地素材')).not.toBeInTheDocument();
  });
});
