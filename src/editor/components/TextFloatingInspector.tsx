import * as Separator from '@radix-ui/react-separator';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Type as TypeIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
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
import { ColorInput } from './ui/ColorInput';
import { IconButton } from './ui/IconButton';
import { InputNumber } from './ui/InputNumber';
import { Select } from './ui/Select';
import { TitleContentTextarea } from './TitleContentTextarea';

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
const withFontColorAlpha = (rgbColor: string, fontColor: string) =>
  `${rgbColor}${fontColor.slice(7)}`.toUpperCase();
const textFontOptions = TIMELINE_TEXT_FONT_PRESETS.map((preset) => ({
  label: preset.label,
  value: preset.fontType,
}));

export function TextFloatingInspector({
  clip,
  previewTiming,
  previewTransform,
}: TextFloatingInspectorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [textDraft, setTextDraft] = useState(clip.text);
  const [boldDraft, setBoldDraft] = useState(clip.bold);
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
  const colorPreviewFrameRef = useRef<number | null>(null);
  const colorEditTokenRef = useRef<number | null>(null);
  const pendingColorPreviewRef = useRef<{
    fontColor: string;
    token: number;
  } | null>(null);
  const mediaRuntime = useMediaRuntime();
  const beginTextStyleEdit = useTimelineStore(
    (state) => state.beginTextStyleEdit,
  );
  const cancelTextStyleEdit = useTimelineStore(
    (state) => state.cancelTextStyleEdit,
  );
  const commitClipPosition = useTimelineStore(
    (state) => state.commitClipPosition,
  );
  const commitTextClipProperties = useTimelineStore(
    (state) => state.commitTextClipProperties,
  );
  const commitTextClipTiming = useTimelineStore(
    (state) => state.commitTextClipTiming,
  );
  const commitTextStyleEdit = useTimelineStore(
    (state) => state.commitTextStyleEdit,
  );
  const previewFontColor = useTimelineStore((state) =>
    state.continuousEdit?.kind === 'text-style' &&
    state.continuousEdit.clipId === clip.id &&
    state.continuousEdit.phase === 'active'
      ? state.continuousEdit.preview.fontColor
      : null,
  );
  const previewTextStyleEdit = useTimelineStore(
    (state) => state.previewTextStyleEdit,
  );
  const suspendTextStyleEdit = useTimelineStore(
    (state) => state.suspendTextStyleEdit,
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
  const displayedRgbColor = toRgbColor(previewFontColor ?? clip.fontColor);
  const endUs = displayedTiming.startUs + displayedTiming.durationUs;

  useEffect(
    () => () => {
      layoutRequestRef.current?.controller.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (colorPreviewFrameRef.current !== null) {
        cancelAnimationFrame(colorPreviewFrameRef.current);
      }
      pendingColorPreviewRef.current = null;
      const token = colorEditTokenRef.current;
      colorEditTokenRef.current = null;
      if (token !== null) cancelTextStyleEdit(clip.id, token);
    },
    [cancelTextStyleEdit, clip.id],
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
  const beginColorEdit = useCallback(() => {
    const token = beginTextStyleEdit(clip.id);
    if (token !== null) colorEditTokenRef.current = token;
    return token;
  }, [beginTextStyleEdit, clip.id]);
  const suspendColorPreview = useCallback(() => {
    if (colorPreviewFrameRef.current !== null) {
      cancelAnimationFrame(colorPreviewFrameRef.current);
      colorPreviewFrameRef.current = null;
    }
    pendingColorPreviewRef.current = null;
    const token = colorEditTokenRef.current;
    if (token !== null) suspendTextStyleEdit(clip.id, token);
  }, [clip.id, suspendTextStyleEdit]);
  const previewColor = useCallback(
    (rgbColor: string) => {
      const token = beginColorEdit();
      if (token === null) return;
      pendingColorPreviewRef.current = {
        fontColor: withFontColorAlpha(rgbColor, clip.fontColor),
        token,
      };
      if (colorPreviewFrameRef.current !== null) return;
      colorPreviewFrameRef.current = requestAnimationFrame(() => {
        colorPreviewFrameRef.current = null;
        const preview = pendingColorPreviewRef.current;
        pendingColorPreviewRef.current = null;
        if (preview) {
          previewTextStyleEdit(clip.id, preview.token, preview.fontColor);
        }
      });
    },
    [
      beginColorEdit,
      clip.fontColor,
      clip.id,
      previewTextStyleEdit,
    ],
  );
  const commitColor = useCallback(
    (rgbColor: string) => {
      if (colorPreviewFrameRef.current !== null) {
        cancelAnimationFrame(colorPreviewFrameRef.current);
        colorPreviewFrameRef.current = null;
      }
      pendingColorPreviewRef.current = null;
      const token = colorEditTokenRef.current ?? beginColorEdit();
      if (token === null) return;
      commitTextStyleEdit(
        clip.id,
        token,
        withFontColorAlpha(rgbColor, clip.fontColor),
      );
      colorEditTokenRef.current = null;
    },
    [beginColorEdit, clip.fontColor, clip.id, commitTextStyleEdit],
  );
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
      <div className='ec-floating-inspector__body ec-scrollbar'>
        <section
          aria-label='文字属性'
          className='ec-floating-inspector__section'
          style={{ paddingTop: 0 }}
        >
          <TitleContentTextarea
            onChange={setTextDraft}
            onCommit={commitText}
            value={textDraft}
          />

          <div className='ec-text-inspector__typography-row'>
            <Select
              label='字体'
              onValueChange={(fontType) => {
                setFontTypeDraft(fontType);
                void commitMeasuredProperties({ fontType });
              }}
              options={textFontOptions}
              value={fontTypeDraft}
            />
            <InputNumber
              label='字号'
              min={1}
              onCommit={(fontSize) => {
                setFontSizeDraft(fontSize);
                void commitMeasuredProperties({ fontSize });
              }}
              suffix='px'
              value={fontSizeDraft}
            />
          </div>

          <div
            aria-label='文字样式'
            className='ec-text-inspector__toolbar'
            role='group'
          >
            <IconButton
              aria-label='粗体'
              aria-pressed={boldDraft}
              onClick={() => {
                const bold = !boldDraft;
                setBoldDraft(bold);
                void commitMeasuredProperties({ bold });
              }}
              title='粗体'
            >
              <BoldIcon aria-hidden='true' size={16} />
            </IconButton>
            <IconButton
              aria-label='斜体'
              aria-pressed={italicDraft}
              onClick={() => {
                const italic = !italicDraft;
                setItalicDraft(italic);
                void commitMeasuredProperties({ italic });
              }}
              title='斜体'
            >
              <ItalicIcon aria-hidden='true' size={16} />
            </IconButton>
            <IconButton
              aria-label='下划线'
              aria-pressed={clip.underline}
              onClick={() =>
                commitTextClipProperties({
                  clipId: clip.id,
                  underline: !clip.underline,
                })
              }
              title='下划线'
            >
              <UnderlineIcon aria-hidden='true' size={16} />
            </IconButton>

            <span
              aria-hidden='true'
              className='ec-text-inspector__toolbar-separator'
            />

            <ColorInput
              aria-label='字体颜色'
              isPreviewing={previewFontColor !== null}
              onBlur={suspendColorPreview}
              onCommit={commitColor}
              onFocus={beginColorEdit}
              onPreview={previewColor}
              size={20}
              title='字体颜色'
              value={displayedRgbColor}
            />
          </div>

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
          <h3>时间与位置</h3>
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
