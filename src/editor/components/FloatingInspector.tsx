import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClipTimingPreview,
  TimelineClipTransform,
} from '../types';
import type { FloatingInspectorControls } from './FloatingInspectorShell';
import { AudioFloatingInspector } from './AudioFloatingInspector';
import { TextFloatingInspector } from './TextFloatingInspector';
import { VideoFloatingInspector } from './VideoFloatingInspector';

type FloatingInspectorProps = FloatingInspectorControls & {
  previewTiming?: TimelineClipTimingPreview | null;
  previewTransform?: {
    clipId: string;
    transform: TimelineClipTransform;
  } | null;
};

export function FloatingInspector({
  previewTiming = null,
  previewTransform = null,
  ...panelControls
}: FloatingInspectorProps) {
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedClip = useTimelineStore(
    (state) =>
      state.clips.find((clip) => clip.id === selectedClipId) ?? null,
  );

  if (!selectedClip) return null;

  if (selectedClip.type === 'text') {
    return (
      <TextFloatingInspector
        {...panelControls}
        key={`${selectedClip.id}:${selectedClip.text}:${selectedClip.fontType}:${selectedClip.fontSize}:${selectedClip.bold}:${selectedClip.italic}`}
        clip={selectedClip}
        previewTiming={previewTiming}
        previewTransform={previewTransform}
      />
    );
  }

  if (selectedClip.type === 'audio') {
    return (
      <AudioFloatingInspector
        {...panelControls}
        clip={selectedClip}
        previewTiming={previewTiming}
      />
    );
  }

  return (
    <VideoFloatingInspector
      {...panelControls}
      clip={selectedClip}
      previewTiming={previewTiming}
      previewTransform={previewTransform}
    />
  );
}
