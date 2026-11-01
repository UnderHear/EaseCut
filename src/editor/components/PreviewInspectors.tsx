import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';

import { CanvasRatioPanel } from './CanvasRatioPanel';
import { FloatingInspector } from './FloatingInspector';

// Two 340px inspectors, 8px outer margins, and a 6px gap.
const MIN_DUAL_INSPECTOR_WIDTH_PX = 702;

type InspectorSide = 'left' | 'right';
type InspectorLayout = {
  activeSide: InspectorSide;
  compact: boolean;
  left: boolean;
  right: boolean;
};
type PreviewInspectorsProps = Pick<
  ComponentProps<typeof FloatingInspector>,
  'previewTiming' | 'previewTransform'
> & {
  selectedClipId: string | null;
};

const getActiveSide = (layout: InspectorLayout): InspectorSide | null => {
  if (layout[layout.activeSide]) return layout.activeSide;
  if (layout.left) return 'left';
  return layout.right ? 'right' : null;
};

export function PreviewInspectors({
  previewTiming,
  previewTransform,
  selectedClipId,
}: PreviewInspectorsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<InspectorLayout>({
    activeSide: 'right',
    compact: false,
    left: false,
    right: selectedClipId !== null,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const updateMode = () => {
      const width = container.getBoundingClientRect().width;
      if (width <= 0) return;
      const compact = width < MIN_DUAL_INSPECTOR_WIDTH_PX;
      setLayout((current) => {
        if (current.compact === compact) return current;
        const activeSide = getActiveSide(current);
        return {
          ...current,
          compact,
          left: current.left && (!compact || activeSide === 'left'),
          right: current.right && (!compact || activeSide === 'right'),
        };
      });
    };
    updateMode();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMode);
      return () => window.removeEventListener('resize', updateMode);
    }
    const observer = new ResizeObserver(updateMode);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const width = containerRef.current?.getBoundingClientRect().width ?? 0;
    setLayout((current) => {
      const compact = width > 0
        ? width < MIN_DUAL_INSPECTOR_WIDTH_PX
        : current.compact;
      const right = selectedClipId !== null;
      const left = current.left && !(compact && right);
      const activeSide = right ? 'right' : current.activeSide;
      if (
        current.compact === compact && current.right === right &&
        current.left === left && current.activeSide === activeSide
      ) return current;
      return { ...current, activeSide, compact, left, right };
    });
  }, [selectedClipId]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const hiddenInspector = container?.querySelector(
      '.ec-floating-inspector[hidden]',
    );
    if (!hiddenInspector?.contains(document.activeElement)) return;
    container?.querySelector<HTMLButtonElement>(
      '.ec-floating-inspector:not([hidden]) .ec-floating-inspector__close',
    )?.focus();
  }, [layout]);

  const setPanelOpen = (side: InspectorSide, open: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const compact = container.getBoundingClientRect().width < MIN_DUAL_INSPECTOR_WIDTH_PX;
    setLayout((current) => ({
      ...current,
      activeSide: open ? side : current.activeSide,
      compact,
      left: side === 'left' ? open : !compact && current.left,
      right: side === 'right' ? open : !compact && current.right,
    }));
  };

  return (
    <div
      className='ec-preview-inspectors'
      data-active-side={getActiveSide(layout) ?? 'none'}
      ref={containerRef}
    >
      <CanvasRatioPanel
        hidden={layout.compact && layout.right}
        isPanelOpen={layout.left}
        onClose={() => setPanelOpen('left', false)}
        onOpen={() => setPanelOpen('left', true)}
      />
      {selectedClipId !== null && (
        <FloatingInspector
          key={selectedClipId}
          hidden={layout.compact && layout.left}
          isPanelOpen={layout.right}
          onClose={() => setPanelOpen('right', false)}
          onOpen={() => setPanelOpen('right', true)}
          previewTiming={previewTiming}
          previewTransform={previewTransform}
        />
      )}
    </div>
  );
}
