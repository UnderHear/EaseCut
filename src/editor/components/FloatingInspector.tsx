import * as Separator from '@radix-ui/react-separator';
import { useState } from 'react';
import { Film, Gauge, Image, X } from 'lucide-react';

import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClipTimingPreview,
  TimelineClipTransform,
} from '../types';
import { InputNumber } from './ui/InputNumber';

type InspectorSection = 'basic' | 'background' | 'speed';
type TransformField = keyof TimelineClipTransform;

type FloatingInspectorProps = {
  previewTiming?: TimelineClipTimingPreview | null;
  previewTransform?: {
    clipId: string;
    transform: TimelineClipTransform;
  } | null;
};

export function FloatingInspector({
  previewTiming = null,
  previewTransform = null,
}: FloatingInspectorProps) {
  const [activeSection, setActiveSection] =
    useState<InspectorSection>('basic');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedClip = useTimelineStore(
    (state) =>
      state.clips.find((clip) => clip.id === selectedClipId) ?? null,
  );
  const selectedTrack = useTimelineStore(
    (state) =>
      state.tracks.find((track) => track.id === selectedClip?.trackId) ?? null,
  );
  const commitClipTransform = useTimelineStore(
    (state) => state.commitClipTransform,
  );
  const commitTrackVolume = useTimelineStore(
    (state) => state.commitTrackVolume,
  );

  if (!selectedClip) return null;

  const displayedTransform =
    previewTransform?.clipId === selectedClip.id
      ? previewTransform.transform
      : selectedClip.transform;
  const displayedTiming =
    previewTiming?.clipId === selectedClip.id ? previewTiming : selectedClip;

  const sectionTitle = {
    basic: '基本',
    background: '背景',
    speed: '变速',
  }[activeSection];
  const activeRailSection = isPanelOpen ? activeSection : null;

  const selectSection = (section: InspectorSection) => {
    setActiveSection(section);
    setIsPanelOpen(true);
  };

  const commitTransformField = (field: TransformField, value: number) => {
    commitClipTransform({
      clipId: selectedClip.id,
      transform: { ...selectedClip.transform, [field]: value },
    });
  };

  return (
    <aside
      aria-label='基础属性面板'
      className='oc-floating-inspector'
      data-panel-open={isPanelOpen}
    >
      <div className='oc-floating-inspector__panel' hidden={!isPanelOpen}>
        <header className='oc-floating-inspector__header'>
          <h2>{sectionTitle}</h2>
          <button
            aria-label='关闭属性面板'
            className='oc-floating-inspector__close'
            onClick={() => setIsPanelOpen(false)}
            type='button'
          >
            <X aria-hidden='true' size={19} />
          </button>
        </header>
        <div className='oc-floating-inspector__main'>
          {activeSection === 'basic' && (
            <>
              <Separator.Root
                className='oc-floating-inspector__separator oc-floating-inspector__separator--header'
                decorative
                orientation='horizontal'
              />

              <div className='oc-floating-inspector__body oc-scrollbar'>
                <section className='oc-floating-inspector__section'>
                  <h3>片段信息</h3>
                  <dl className='oc-floating-inspector__details'>
                    <div>
                      <dt>素材</dt>
                      <dd
                        className='oc-floating-inspector__detail-value--wrap'
                        title={selectedClip.name}
                      >
                        {selectedClip.name}
                      </dd>
                    </div>
                    <div>
                      <dt>类型</dt>
                      <dd>{selectedClip.type === 'video' ? '视频' : '音频'}</dd>
                    </div>
                    <div>
                      <dt>开始时间</dt>
                      <dd>{displayedTiming.start.toFixed(2)} 秒</dd>
                    </div>
                    <div>
                      <dt>时长</dt>
                      <dd>{displayedTiming.duration.toFixed(2)} 秒</dd>
                    </div>
                  </dl>
                </section>

                {selectedTrack && (
                  <>
                    <Separator.Root
                      className='oc-floating-inspector__separator'
                      decorative
                      orientation='horizontal'
                    />
                    <section className='oc-floating-inspector__section'>
                      <h3>音量</h3>
                      <div className='oc-floating-inspector__number-field'>
                        <span>轨道音量</span>
                        <InputNumber
                          label='轨道音量'
                          max={100}
                          min={0}
                          onCommit={(value) =>
                            commitTrackVolume(
                              selectedTrack.id,
                              selectedTrack.volume,
                              value / 100,
                            )
                          }
                          suffix='%'
                          value={Math.round(selectedTrack.volume * 100)}
                        />
                      </div>
                    </section>
                  </>
                )}

                {selectedClip.type === 'video' && (
                  <>
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
                            onCommit={(value) =>
                              commitTransformField('x', value)
                            }
                            suffix='X'
                            value={displayedTransform.x}
                          />
                        </div>
                        <div className='oc-floating-inspector__number-field'>
                          <span>Y 位置</span>
                          <InputNumber
                            label='Y 位置'
                            onCommit={(value) =>
                              commitTransformField('y', value)
                            }
                            suffix='Y'
                            value={displayedTransform.y}
                          />
                        </div>
                        <div className='oc-floating-inspector__number-field'>
                          <span>宽度</span>
                          <InputNumber
                            label='宽度'
                            min={1}
                            onCommit={(value) =>
                              commitTransformField('width', value)
                            }
                            suffix='W'
                            value={displayedTransform.width}
                          />
                        </div>
                        <div className='oc-floating-inspector__number-field'>
                          <span>高度</span>
                          <InputNumber
                            label='高度'
                            min={1}
                            onCommit={(value) =>
                              commitTransformField('height', value)
                            }
                            suffix='H'
                            value={displayedTransform.height}
                          />
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <nav aria-label='属性分类' className='oc-floating-inspector__rail'>
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
          aria-current={activeRailSection === 'background' ? 'page' : undefined}
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
      </nav>
    </aside>
  );
}
