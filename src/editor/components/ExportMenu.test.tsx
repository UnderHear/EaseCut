import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExportMenu } from './ExportMenu';

describe('ExportMenu', () => {
  it('shows the two requested actions without an export-location heading', async () => {
    const user = userEvent.setup();
    const onExportJson = vi.fn();
    render(
      <ExportMenu isExporting={false} onExportJson={onExportJson} />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: '导出选项' })).toBeVisible();
    const localItem = screen.getByRole('menuitem', { name: '导出到本地' });
    expect(localItem).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: '导出 JSON' })).toBeEnabled();
    expect(screen.queryByText('导出位置')).not.toBeInTheDocument();

    await user.click(localItem);

    expect(screen.getByRole('menu', { name: '导出选项' })).toBeVisible();
    expect(onExportJson).not.toHaveBeenCalled();
  });

  it('runs JSON export and restores focus after selecting it', async () => {
    const user = userEvent.setup();
    const onExportJson = vi.fn();
    render(
      <ExportMenu isExporting={false} onExportJson={onExportJson} />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: '导出 JSON' }));

    expect(onExportJson).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports keyboard navigation, escape, and outside dismissal', async () => {
    const user = userEvent.setup();
    render(<ExportMenu isExporting={false} onExportJson={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: '导出' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    const localItem = screen.getByRole('menuitem', { name: '导出到本地' });
    const jsonItem = screen.getByRole('menuitem', { name: '导出 JSON' });
    expect(localItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(jsonItem).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(localItem).toHaveFocus();
    await user.keyboard('{End}');
    expect(jsonItem).toHaveFocus();
    await user.keyboard('{Home}');
    expect(localItem).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables only local export while a configured export is pending', async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        isExporting
        onExportJson={vi.fn()}
        onExportLocal={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(
      screen.getByRole('menuitem', { name: '导出中…' }),
    ).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: '导出 JSON' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: '导出 JSON' })).toBeEnabled();
  });
});
