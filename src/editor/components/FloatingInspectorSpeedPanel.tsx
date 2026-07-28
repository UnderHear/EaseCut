import * as Separator from '@radix-ui/react-separator';
import { useEffect, useRef, useState } from 'react';

import {
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
} from '../core/clip-speed';
import { useTimelineStore } from '../store/timeline-store-context';
import type { TimelineClip } from '../types';
import { InputNumber } from './ui/InputNumber';

type FloatingInspectorSpeedPanelProps = {
  clip: TimelineClip;
};

export function FloatingInspectorSpeedPanel({
  clip,
}: FloatingInspectorSpeedPanelProps) {
  const commitClipSpeed = useTimelineStore(
    (state) => state.commitClipSpeed,
  );
  const [draftSpeed, setDraftSpeed] = useState(clip.speed);
  const draftSpeedRef = useRef(clip.speed);
  const gestureStartSpeedRef = useRef<number | null>(null);

  useEffect(() => {
    if (gestureStartSpeedRef.current !== null) return;
    draftSpeedRef.current = clip.speed;
    setDraftSpeed(clip.speed);
  }, [clip.speed]);

  const updateDraftSpeed = (speed: number) => {
    draftSpeedRef.current = speed;
    setDraftSpeed(speed);
  };

  const commitDraftSpeed = () => {
    gestureStartSpeedRef.current = null;
    const speed = draftSpeedRef.current;
    if (speed !== clip.speed) {
      commitClipSpeed({ clipId: clip.id, speed });
    }
  };

  const cancelDraftSpeed = () => {
    const speed = gestureStartSpeedRef.current ?? clip.speed;
    gestureStartSpeedRef.current = null;
    updateDraftSpeed(speed);
  };

  return (
    <>
      <Separator.Root
        className='oc-floating-inspector__separator oc-floating-inspector__separator--header'
        decorative
        orientation='horizontal'
      />

      <div className='oc-floating-inspector__body oc-scrollbar'>
        <section className='oc-floating-inspector__section'>
          <h3>播放速度</h3>
          <div className='oc-floating-inspector__speed-control'>
            <input
              aria-label='播放速度滑块'
              aria-valuetext={`${draftSpeed} 倍`}
              max={MAX_CLIP_SPEED}
              min={MIN_CLIP_SPEED}
              onBlur={commitDraftSpeed}
              onChange={(event) =>
                updateDraftSpeed(Number(event.currentTarget.value))
              }
              onKeyDown={() => {
                gestureStartSpeedRef.current ??= clip.speed;
              }}
              onKeyUp={commitDraftSpeed}
              onPointerCancel={cancelDraftSpeed}
              onPointerDown={() => {
                gestureStartSpeedRef.current = clip.speed;
              }}
              onPointerUp={commitDraftSpeed}
              step={0.1}
              type='range'
              value={draftSpeed}
            />
            <div className='oc-floating-inspector__speed-range'>
              <span>{MIN_CLIP_SPEED}x</span>
              <span>{MAX_CLIP_SPEED}x</span>
            </div>
          </div>
          <div className='oc-floating-inspector__number-field'>
            <span>固定倍速</span>
            <InputNumber
              label='播放速度'
              max={MAX_CLIP_SPEED}
              min={MIN_CLIP_SPEED}
              onCommit={(speed) => {
                updateDraftSpeed(speed);
                commitClipSpeed({ clipId: clip.id, speed });
              }}
              step={0.1}
              suffix='x'
              value={draftSpeed}
            />
          </div>
        </section>
      </div>
    </>
  );
}
