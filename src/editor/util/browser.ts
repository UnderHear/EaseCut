export const isJsdomEnvironment = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('jsdom');

export const supportsPopover = () =>
  typeof HTMLElement !== 'undefined' &&
  typeof HTMLElement.prototype.showPopover === 'function';

export const supportsAnchorPositioning = () =>
  typeof CSS !== 'undefined' &&
  CSS.supports('position-anchor', '--ec-select-anchor') &&
  CSS.supports('top', 'anchor(bottom)') &&
  CSS.supports('width', 'anchor-size(width)');

export const shouldIgnoreShortcutTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    Boolean(
      target.closest(
        'input, textarea, select, button, a[href], summary, [role="button"], [contenteditable="true"]',
      ),
    ));
