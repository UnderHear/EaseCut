import * as Separator from '@radix-ui/react-separator';
import type { ReactNode } from 'react';

import { microsecondsToSeconds } from '../core/time';
import { useTimelineStore } from '../store/timeline-store-context';
import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import { InputNumber } from './ui/InputNumber';

type FloatingInspectorBasicPanelProps = {
  children?: ReactNode;
  clip: TimelineClip;
  timing: TimelineClipTimingPreview | TimelineClip;
};

export function FloatingInspectorBasicPanel({
  children,
  clip,
  timing,
}: FloatingInspectorBasicPanelProps) {
  const commitClipVolume = useTimelineStore(
    (state) => state.commitClipVolume,
  );

  return (
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
                title={clip.name}
              >
                {clip.name}
              </dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{clip.type === 'video' ? '视频' : '音频'}</dd>
            </div>
            <div>
              <dt>开始时间</dt>
              <dd>{microsecondsToSeconds(timing.startUs).toFixed(2)} 秒</dd>
            </div>
            <div>
              <dt>时长</dt>
              <dd>{microsecondsToSeconds(timing.durationUs).toFixed(2)} 秒</dd>
            </div>
          </dl>
        </section>

        <>
          <Separator.Root
            className='oc-floating-inspector__separator'
            decorative
            orientation='horizontal'
          />
          <section className='oc-floating-inspector__section'>
            <h3>音量</h3>
            <div className='oc-floating-inspector__number-field'>
              <span>片段音量</span>
              <InputNumber
                label='片段音量'
                max={100}
                min={0}
                onCommit={(value) =>
                  commitClipVolume(clip.id, clip.volume, value / 100)
                }
                suffix='%'
                value={Math.round(clip.volume * 100)}
              />
            </div>
          </section>
        </>

        {children}
      </div>
    </>
  );
}
