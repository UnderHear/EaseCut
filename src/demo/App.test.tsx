import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../index', () => ({
  EaseCut: () => <output>编辑器已挂载</output>,
}));

import { DemoApp } from './App';

describe('DemoApp', () => {
  it('opens the editor after clicking the button', async () => {
    const user = userEvent.setup();

    render(<DemoApp />);

    expect(screen.queryByText('编辑器已挂载')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '点我打开编辑器！' }));

    expect(screen.getByText('编辑器已挂载')).toBeVisible();
    expect(screen.queryByText('添加本地素材')).not.toBeInTheDocument();
  });
});
