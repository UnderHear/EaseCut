import * as Separator from '@radix-ui/react-separator';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Type as TypeIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
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
  const [boldDraft, setBoldDraft] = useState(clip.bold);
  const [colorDraft, setColorDraft] = useState(clip.fontColor);
  const [fontTypeDraft, setFontTypeDraft] = useState(clip.fontType);
  const [fontSizeDraft, setFontSizeDraft] = useState(clip.fontSize);
  const [italicDraft, setItalicDraft] = useState(clip.italic);
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
      Pick<
        TimelineTextClip,
        'bold' | 'fontSize' | 'fontType' | 'italic' | 'text'
      >
    >,
  ) => {
    const bold = patch.bold ?? boldDraft;
    const text = (patch.text ?? textDraft).trim();
    const fontType = patch.fontType ?? fontTypeDraft;
    const fontSize = patch.fontSize ?? fontSizeDraft;
    const italic = patch.italic ?? italicDraft;
    if (text === '') {
      setTextDraft(clip.text);
      return;
    }
    if (
      bold === clip.bold &&
      text === clip.text &&
      fontType === clip.fontType &&
      fontSize === clip.fontSize &&
      italic === clip.italic
    ) {
      layoutRequestRef.current?.controller.abort();
      layoutRequestRef.current = null;
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
        { bold, fontSize, fontType, italic, text },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        layoutRequestRef.current?.id !== requestId
      ) {
        return;
      }
      commitTextClipProperties({
        bold,
        clipId: clip.id,
        fontSize,
        fontType,
        italic,
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
      setBoldDraft(clip.bold);
      setTextDraft(clip.text);
      setFontTypeDraft(clip.fontType);
      setFontSizeDraft(clip.fontSize);
      setItalicDraft(clip.italic);
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
          <div
            aria-label='文字样式'
            className='ec-floating-inspector__text-style'
            role='group'
          >
            <button
              aria-label='粗体'
              aria-pressed={boldDraft}
              onClick={() => {
                const bold = !boldDraft;
                setBoldDraft(bold);
                void commitMeasuredProperties({ bold });
              }}
              type='button'
            >
              <BoldIcon aria-hidden='true' size={16} />
              <span>粗体</span>
            </button>
            <button
              aria-label='斜体'
              aria-pressed={italicDraft}
              onClick={() => {
                const italic = !italicDraft;
                setItalicDraft(italic);
                void commitMeasuredProperties({ italic });
              }}
              type='button'
            >
              <ItalicIcon aria-hidden='true' size={16} />
              <span>斜体</span>
            </button>
            <button
              aria-label='下划线'
              aria-pressed={clip.underline}
              onClick={() =>
                commitTextClipProperties({
                  clipId: clip.id,
                  underline: !clip.underline,
                })
              }
              type='button'
            >
              <UnderlineIcon aria-hidden='true' size={16} />
              <span>下划线</span>
            </button>
          </div>
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
