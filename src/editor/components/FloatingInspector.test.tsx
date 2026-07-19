import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithEditorProviders } from './test-helpers';
import { FloatingInspector } from './FloatingInspector';

describe('FloatingInspector', () => {
  it('renders the static basic property controls', () => {
    const { container } = renderWithEditorProviders(<FloatingInspector />);

    expect(
      screen.getByRole('complementary', { name: '基础属性面板' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '基本' })).toBeVisible();
    const rail = screen.getByRole('navigation', { name: '属性分类' });
    expect(rail).toBeVisible();
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['基本', '背景', '变速']);
    expect(screen.getByText('蒙版')).toBeVisible();
    expect(screen.getByText('颜色调整')).toBeVisible();
    expect(screen.getByText('混合')).toBeVisible();
    expect(screen.getByText('转换')).toBeVisible();
    expect(screen.getByLabelText('不透明度')).toBeDisabled();
    expect(screen.getByLabelText('缩放')).toBeDisabled();
    const main = container.querySelector('.oc-floating-inspector__main');
    expect(main?.children).toHaveLength(2);
    expect(main?.firstElementChild).toHaveClass(
      'oc-floating-inspector__separator--header',
    );
    expect(main?.lastElementChild).toHaveClass(
      'oc-floating-inspector__body',
    );
    expect(
      container.querySelectorAll(
        '.oc-floating-inspector__separator[data-orientation="horizontal"]',
      ),
    ).toHaveLength(4);
  });

  it('switches sections and leaves non-basic content empty', async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditorProviders(<FloatingInspector />);
    const main = container.querySelector('.oc-floating-inspector__main');

    for (const sectionName of ['背景', '变速']) {
      const sectionButton = screen.getByRole('button', {
        name: sectionName,
      });

      await user.click(sectionButton);

      expect(sectionButton).toHaveAttribute('aria-current', 'page');
      expect(sectionButton).toHaveClass('oc-is-active');
      expect(screen.getByRole('heading', { name: sectionName })).toBeVisible();
      expect(main).toBeEmptyDOMElement();
    }

    await user.click(screen.getByRole('button', { name: '基本' }));

    expect(screen.getByRole('button', { name: '基本' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(main?.children).toHaveLength(2);
    expect(screen.getByText('蒙版')).toBeVisible();
  });
});
