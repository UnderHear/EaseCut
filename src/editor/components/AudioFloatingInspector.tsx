import { Film } from 'lucide-react';
import { useState } from 'react';

import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import { FloatingInspectorBasicPanel } from './FloatingInspectorBasicPanel';
import { FloatingInspectorShell } from './FloatingInspectorShell';

type AudioFloatingInspectorProps = {
  clip: TimelineClip;
  previewTiming: TimelineClipTimingPreview | null;
};

export function AudioFloatingInspector({
  clip,
  previewTiming,
}: AudioFloatingInspectorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const displayedTiming =
    previewTiming?.clipId === clip.id ? previewTiming : clip;

  return (
    <FloatingInspectorShell
      isPanelOpen={isPanelOpen}
      onClose={() => setIsPanelOpen(false)}
      railItems={
        <button
          aria-current={isPanelOpen ? 'page' : undefined}
          className={`oc-floating-inspector__rail-item${isPanelOpen ? ' oc-is-active' : ''}`}
          onClick={() => setIsPanelOpen(true)}
          type='button'
        >
          <Film aria-hidden='true' size={20} />
          <span>基本</span>
        </button>
      }
      sectionTitle='基本'
    >
      <FloatingInspectorBasicPanel clip={clip} timing={displayedTiming} />
    </FloatingInspectorShell>
  );
}
