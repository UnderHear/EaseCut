import * as Separator from '@radix-ui/react-separator';
import { Film, Gauge, Image } from 'lucide-react';
import { useState } from 'react';

import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClip,
  TimelineClipTimingPreview,
  TimelineClipTransform,
} from '../types';
import { FloatingInspectorBasicPanel } from './FloatingInspectorBasicPanel';
import { FloatingInspectorShell } from './FloatingInspectorShell';
import { InputNumber } from './ui/InputNumber';

type VideoInspectorSection = 'basic' | 'background' | 'speed';
type TransformField = keyof TimelineClipTransform;

type VideoFloatingInspectorProps = {
  clip: TimelineClip;
  previewTiming: TimelineClipTimingPreview | null;
  previewTransform: {
    clipId: string;
    transform: TimelineClipTransform;
  } | null;
};

export function VideoFloatingInspector({
  clip,
  previewTiming,
  previewTransform,
}: VideoFloatingInspectorProps) {
  const [activeSection, setActiveSection] =
    useState<VideoInspectorSection>('basic');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const commitClipTransform = useTimelineStore(
    (state) => state.commitClipTransform,
  );

  const displayedTransform =
    previewTransform?.clipId === clip.id
      ? previewTransform.transform
      : clip.transform;
  const displayedTiming =
    previewTiming?.clipId === clip.id ? previewTiming : clip;
  const sectionTitle = {
    basic: '基本',
    background: '背景',
    speed: '变速',
  }[activeSection];
  const activeRailSection = isPanelOpen ? activeSection : null;

  const selectSection = (section: VideoInspectorSection) => {
    setActiveSection(section);
    setIsPanelOpen(true);
  };

  const commitTransformField = (field: TransformField, value: number) => {
    commitClipTransform({
      clipId: clip.id,
      transform: { ...clip.transform, [field]: value },
    });
  };

  return (
    <FloatingInspectorShell
      isPanelOpen={isPanelOpen}
      onClose={() => setIsPanelOpen(false)}
      railItems={
        <>
          <button
            aria-current={activeRailSection === 'basic' ? 'page' : undefined}
            className={`oc-floating-inspector__rail-item${activeRailSection === 'basic' ? ' oc-is-active' : ''}`}
            onClick={() => selectSection('basic')}
            type='button'
          >
            <Film aria-hidden='true' size={20} />
            <span>基本</span>
          </button>
          <button
            aria-current={
              activeRailSection === 'background' ? 'page' : undefined
            }
            className={`oc-floating-inspector__rail-item${activeRailSection === 'background' ? ' oc-is-active' : ''}`}
            onClick={() => selectSection('background')}
            type='button'
          >
            <Image aria-hidden='true' size={20} />
            <span>背景</span>
          </button>
          <button
            aria-current={activeRailSection === 'speed' ? 'page' : undefined}
            className={`oc-floating-inspector__rail-item${activeRailSection === 'speed' ? ' oc-is-active' : ''}`}
            onClick={() => selectSection('speed')}
            type='button'
          >
            <Gauge aria-hidden='true' size={20} />
            <span>变速</span>
          </button>
        </>
      }
      sectionTitle={sectionTitle}
    >
      {activeSection === 'basic' && (
        <FloatingInspectorBasicPanel clip={clip} timing={displayedTiming}>
          <Separator.Root
            className='oc-floating-inspector__separator'
            decorative
            orientation='horizontal'
          />
          <section className='oc-floating-inspector__section'>
            <h3>转换</h3>
            <div className='oc-floating-inspector__number-grid'>
              <div className='oc-floating-inspector__number-field'>
                <span>X 位置</span>
                <InputNumber
                  label='X 位置'
                  onCommit={(value) => commitTransformField('x', value)}
                  suffix='X'
                  value={displayedTransform.x}
                />
              </div>
              <div className='oc-floating-inspector__number-field'>
                <span>Y 位置</span>
                <InputNumber
                  label='Y 位置'
                  onCommit={(value) => commitTransformField('y', value)}
                  suffix='Y'
                  value={displayedTransform.y}
                />
              </div>
              <div className='oc-floating-inspector__number-field'>
                <span>宽度</span>
                <InputNumber
                  label='宽度'
                  min={1}
                  onCommit={(value) => commitTransformField('width', value)}
                  suffix='W'
                  value={displayedTransform.width}
                />
              </div>
              <div className='oc-floating-inspector__number-field'>
                <span>高度</span>
                <InputNumber
                  label='高度'
                  min={1}
                  onCommit={(value) => commitTransformField('height', value)}
                  suffix='H'
                  value={displayedTransform.height}
                />
              </div>
            </div>
          </section>
        </FloatingInspectorBasicPanel>
      )}
    </FloatingInspectorShell>
  );
}
