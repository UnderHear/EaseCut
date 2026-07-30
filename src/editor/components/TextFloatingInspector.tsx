import * as Separator from '@radix-ui/react-separator';
import { Type as TypeIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  isTimelineTextFontType,
  TIMELINE_TEXT_FONT_PRESETS,
} from '../core/text-fonts';
import {
  microsecondsToSeconds,
  secondsToMicroseconds,
} from '../core/time';
import { TextLayoutError, useMediaRuntime } from '../media';
import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClipPosition,
  TimelineClipTimingPreview,
  TimelineClipTransform,
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

type PositionField = keyof TimelineClipPosition;

const toRgbColor = (fontColor: string) => fontColor.slice(0, 7);

export function TextFloatingInspector({
  clip,
  previewTiming,
  previewTransform,
}: TextFloatingInspectorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [textDraft, setTextDraft] = useState(clip.text);
  const [colorDraft, setColorDraft] = useState(clip.fontColor);
  const [fontTypeDraft, setFontTypeDraft] = useState(clip.fontType);
  const [fontSizeDraft, setFontSizeDraft] = useState(clip.fontSize);
  const [layoutStatus, setLayoutStatus] = useState<
    | { message: string; state: 'error' }
    | { message: string; state: 'loading' }
    | null
  >(null);
  const layoutRequestRef = useRef<{
    controller: AbortController;
    id: number;
  } | null>(null);
  const mediaRuntime = useMediaRuntime();
  const commitClipPosition = useTimelineStore(
    (state) => state.commitClipPosition,
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
      : {
          height: clip.layoutSize.height,
          width: clip.layoutSize.width,
          x: clip.position.x,
          y: clip.position.y,
        };
  const endUs = displayedTiming.startUs + displayedTiming.durationUs;

  useEffect(
    () => () => {
      layoutRequestRef.current?.controller.abort();
    },
    [],
  );

  const commitMeasuredProperties = async (
    patch: Partial<
      Pick<TimelineTextClip, 'fontSize' | 'fontType' | 'text'>
    >,
  ) => {
    const text = (patch.text ?? textDraft).trim();
    const fontType = patch.fontType ?? fontTypeDraft;
    const fontSize = patch.fontSize ?? fontSizeDraft;
    if (text === '') {
      setTextDraft(clip.text);
      return;
    }
    if (
      text === clip.text &&
      fontType === clip.fontType &&
      fontSize === clip.fontSize
    ) {
      setLayoutStatus(null);
      return;
    }

    layoutRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = (layoutRequestRef.current?.id ?? 0) + 1;
    layoutRequestRef.current = { controller, id: requestId };
    setLayoutStatus({ message: '正在计算文字尺寸…', state: 'loading' });

    try {
      const layoutSize = await mediaRuntime.measureTextLayout(
        { fontSize, fontType, text },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        layoutRequestRef.current?.id !== requestId
      ) {
        return;
      }
      commitTextClipProperties({
        clipId: clip.id,
        fontSize,
        fontType,
        layoutSize,
        text,
      });
      setLayoutStatus(null);
    } catch (error: unknown) {
      if (
        controller.signal.aborted ||
        layoutRequestRef.current?.id !== requestId
      ) {
        return;
      }
      setTextDraft(clip.text);
      setFontTypeDraft(clip.fontType);
      setFontSizeDraft(clip.fontSize);
      setLayoutStatus({
        message:
          error instanceof TextLayoutError
            ? error.message
            : '文字尺寸计算失败，请重试。',
        state: 'error',
      });
    }
  };

  const commitText = () => {
    if (textDraft.trim() === '') {
      setTextDraft(clip.text);
      return;
    }
    if (textDraft === clip.text) return;
    void commitMeasuredProperties({ text: textDraft });
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
  const commitPositionField = (field: PositionField, value: number) => {
    commitClipPosition({
      clipId: clip.id,
      position: { ...clip.position, [field]: value },
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
              onChange={(event) => {
                const fontType = event.target.value;
                if (!isTimelineTextFontType(fontType)) return;
                setFontTypeDraft(fontType);
                void commitMeasuredProperties({ fontType });
              }}
              value={fontTypeDraft}
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
              onCommit={(fontSize) => {
                setFontSizeDraft(fontSize);
                void commitMeasuredProperties({ fontSize });
              }}
              value={fontSizeDraft}
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
          {layoutStatus && (
            <p
              aria-live={layoutStatus.state === 'loading' ? 'polite' : undefined}
              className={`ec-floating-inspector__layout-status ec-floating-inspector__layout-status--${layoutStatus.state}`}
              role={layoutStatus.state === 'error' ? 'alert' : 'status'}
            >
              {layoutStatus.message}
            </p>
          )}
        </section>

        <Separator.Root
          className='ec-floating-inspector__separator'
          decorative
          orientation='horizontal'
        />
        <section className='ec-floating-inspector__section'>
          <h3>位置</h3>
          <div className='ec-floating-inspector__number-grid'>
            {(
              [
                ['x', 'X 位置', 'X'],
                ['y', 'Y 位置', 'Y'],
              ] as const
            ).map(([field, label, suffix]) => (
              <div
                className='ec-floating-inspector__number-field'
                key={field}
              >
                <span>{label}</span>
                <InputNumber
                  label={label}
                  onCommit={(value) => commitPositionField(field, value)}
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
