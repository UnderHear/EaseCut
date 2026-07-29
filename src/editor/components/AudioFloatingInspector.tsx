import { Gauge, Music2 } from 'lucide-react';
import { useState } from 'react';

import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import { FloatingInspectorBasicPanel } from './FloatingInspectorBasicPanel';
import { FloatingInspectorShell } from './FloatingInspectorShell';
import { FloatingInspectorSpeedPanel } from './FloatingInspectorSpeedPanel';

type AudioInspectorSection = 'basic' | 'speed';

type AudioFloatingInspectorProps = {
  clip: TimelineClip;
  previewTiming: TimelineClipTimingPreview | null;
};

export function AudioFloatingInspector({
  clip,
  previewTiming,
}: AudioFloatingInspectorProps) {
  const [activeSection, setActiveSection] =
    useState<AudioInspectorSection>('basic');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const displayedTiming =
    previewTiming?.clipId === clip.id ? previewTiming : clip;
  const activeRailSection = isPanelOpen ? activeSection : null;
  const selectSection = (section: AudioInspectorSection) => {
    setActiveSection(section);
    setIsPanelOpen(true);
  };

  return (
    <FloatingInspectorShell
      isPanelOpen={isPanelOpen}
      onClose={() => setIsPanelOpen(false)}
      railItems={
        <>
          <button
            aria-current={activeRailSection === 'basic' ? 'page' : undefined}
            className={`ec-floating-inspector__rail-item${activeRailSection === 'basic' ? ' ec-is-active' : ''}`}
            onClick={() => selectSection('basic')}
            type='button'
          >
            <Music2 aria-hidden='true' size={20} />
            <span>基本</span>
          </button>
          <button
            aria-current={activeRailSection === 'speed' ? 'page' : undefined}
            className={`ec-floating-inspector__rail-item${activeRailSection === 'speed' ? ' ec-is-active' : ''}`}
            onClick={() => selectSection('speed')}
            type='button'
          >
            <Gauge aria-hidden='true' size={20} />
            <span>变速</span>
          </button>
        </>
      }
      sectionTitle={activeSection === 'basic' ? '基本' : '变速'}
    >
      {activeSection === 'basic' && (
        <FloatingInspectorBasicPanel clip={clip} timing={displayedTiming} />
      )}
      {activeSection === 'speed' && (
        <FloatingInspectorSpeedPanel clip={clip} />
      )}
    </FloatingInspectorShell>
  );
}
