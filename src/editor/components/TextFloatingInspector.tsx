import * as Separator from '@radix-ui/react-separator';
import { AlignCenter, AlignLeft, AlignRight, Type as TypeIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { TIMELINE_TEXT_FONT_PRESETS } from '../core/text-fonts';
import {
  microsecondsToSeconds,
  secondsToMicroseconds,
} from '../core/time';
import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClipTimingPreview,
  TimelineClipTransform,
  TimelineTextAlign,
  TimelineTextClip,
} from '../types';
import { FloatingInspectorShell } from './FloatingInspectorShell';
import { InputNumber } from './ui/InputNumber';

type TextFloatingInspectorProps = {
  clip: TimelineTextClip;
  previewTiming: TimelineClipTimingPreview | null;
  previewTransform: {
    clipId: string;
    transform: TimelineClipTransform;
  } | null;
};

type TransformField = keyof TimelineClipTransform;

const alignments: Array<{
  alignType: TimelineTextAlign;
  icon: typeof AlignLeft;
  label: string;
}> = [
  { alignType: 0, icon: AlignLeft, label: '左对齐' },
  { alignType: 1, icon: AlignCenter, label: '居中对齐' },
  { alignType: 2, icon: AlignRight, label: '右对齐' },
];

const toRgbColor = (fontColor: string) => fontColor.slice(0, 7);

export function TextFloatingInspector({
  clip,
  previewTiming,
  previewTransform,
}: TextFloatingInspectorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [textDraft, setTextDraft] = useState(clip.text);
  const [colorDraft, setColorDraft] = useState(clip.fontColor);
  const commitClipTransform = useTimelineStore(
    (state) => state.commitClipTransform,
  );
  const commitTextClipProperties = useTimelineStore(
    (state) => state.commitTextClipProperties,
  );
  const commitTextClipTiming = useTimelineStore(
    (state) => state.commitTextClipTiming,
  );

  const displayedTiming =
    previewTiming?.clipId === clip.id ? previewTiming : clip;
  const displayedTransform =
    previewTransform?.clipId === clip.id
      ? previewTransform.transform
      : clip.transform;
  const endUs = displayedTiming.startUs + displayedTiming.durationUs;

  const commitText = () => {
    if (textDraft.trim() === '') {
      setTextDraft(clip.text);
      return;
    }
    if (textDraft === clip.text) return;
    commitTextClipProperties({ clipId: clip.id, text: textDraft });
  };
  const commitColor = () => {
    if (!/^#[\dA-Fa-f]{8}$/.test(colorDraft)) {
      setColorDraft(clip.fontColor);
      return;
    }
    if (colorDraft === clip.fontColor) return;
    commitTextClipProperties({
      clipId: clip.id,
      fontColor: colorDraft.toUpperCase(),
    });
  };
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
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
        <button
          aria-current={isPanelOpen ? 'page' : undefined}
          className={`ec-floating-inspector__rail-item${isPanelOpen ? ' ec-is-active' : ''}`}
          onClick={() => setIsPanelOpen(true)}
          type='button'
        >
          <TypeIcon aria-hidden='true' size={20} />
          <span>基本</span>
        </button>
      }
      sectionTitle='基本'
    >
      <Separator.Root
        className='ec-floating-inspector__separator ec-floating-inspector__separator--header'
        decorative
        orientation='horizontal'
      />
      <div className='ec-floating-inspector__body ec-scrollbar'>
        <section className='ec-floating-inspector__section'>
          <h3>标题</h3>
          <label className='ec-floating-inspector__field'>
            <span>标题内容</span>
            <input
              aria-label='标题内容'
              onBlur={commitText}
              onChange={(event) => setTextDraft(event.target.value)}
              onKeyDown={blurOnEnter}
              value={textDraft}
            />
          </label>
        </section>

        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <section className='ec-floating-inspector__section'>
          <h3>时间</h3>
          <div className='ec-floating-inspector__number-grid'>
            <div className='ec-floating-inspector__number-field'>
              <span>开始时间</span>
              <InputNumber
                label='开始时间'
                min={0}
                onCommit={(value) =>
                  commitTextClipTiming({
                    clipId: clip.id,
                    endUs,
                    startUs: secondsToMicroseconds(value),
                  })
                }
                step={0.1}
                suffix='秒'
                value={microsecondsToSeconds(displayedTiming.startUs)}
              />
            </div>
            <div className='ec-floating-inspector__number-field'>
              <span>结束时间</span>
              <InputNumber
                label='结束时间'
                min={0.6}
                onCommit={(value) =>
                  commitTextClipTiming({
                    clipId: clip.id,
                    endUs: secondsToMicroseconds(value),
                    startUs: displayedTiming.startUs,
                  })
                }
                step={0.1}
                suffix='秒'
                value={microsecondsToSeconds(endUs)}
              />
            </div>
          </div>
        </section>

        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <section className='ec-floating-inspector__section'>
          <h3>字体</h3>
          <label className='ec-floating-inspector__field'>
            <span>字体</span>
            <select
              aria-label='字体'
              onChange={(event) =>
                commitTextClipProperties({
                  clipId: clip.id,
                  fontType: event.target.value,
                })
              }
              value={clip.fontType}
            >
              {TIMELINE_TEXT_FONT_PRESETS.map((preset) => (
                <option key={preset.fontType} value={preset.fontType}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className='ec-floating-inspector__number-field'>
            <span>字号</span>
            <InputNumber
              label='字号'
              min={1}
              onCommit={(fontSize) =>
                commitTextClipProperties({ clipId: clip.id, fontSize })
              }
              value={clip.fontSize}
            />
          </div>
          <label className='ec-floating-inspector__field'>
            <span>字体颜色</span>
            <span className='ec-floating-inspector__color-field'>
              <input
                aria-label='字体颜色选择器'
                onChange={(event) => {
                  const nextColor = `${event.target.value}${clip.fontColor.slice(7)}`.toUpperCase();
                  setColorDraft(nextColor);
                  commitTextClipProperties({
                    clipId: clip.id,
                    fontColor: nextColor,
                  });
                }}
                type='color'
                value={toRgbColor(clip.fontColor)}
              />
              <input
                aria-label='字体颜色'
                onBlur={commitColor}
                onChange={(event) => setColorDraft(event.target.value)}
                onKeyDown={blurOnEnter}
                value={colorDraft}
              />
            </span>
          </label>
          <div
            aria-label='文字对齐'
            className='ec-floating-inspector__alignment'
            role='group'
          >
            {alignments.map(({ alignType, icon: Icon, label }) => (
              <button
                aria-pressed={clip.alignType === alignType}
                key={alignType}
                onClick={() =>
                  commitTextClipProperties({ clipId: clip.id, alignType })
                }
                type='button'
              >
                <Icon aria-hidden='true' size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <section className='ec-floating-inspector__section'>
          <h3>转换</h3>
          <div className='ec-floating-inspector__number-grid'>
            {(
              [
                ['x', 'X 位置', 'X'],
                ['y', 'Y 位置', 'Y'],
                ['width', '宽度', 'W'],
                ['height', '高度', 'H'],
              ] as const
            ).map(([field, label, suffix]) => (
              <div
                className='ec-floating-inspector__number-field'
                key={field}
              >
                <span>{label}</span>
                <InputNumber
                  label={label}
                  min={field === 'width' || field === 'height' ? 1 : undefined}
                  onCommit={(value) => commitTransformField(field, value)}
                  suffix={suffix}
                  value={displayedTransform[field]}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </FloatingInspectorShell>
  );
}
