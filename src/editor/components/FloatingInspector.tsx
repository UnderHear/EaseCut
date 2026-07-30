import { useTimelineStore } from '../store/timeline-store-context';
import type {
  TimelineClipTimingPreview,
  TimelineClipTransform,
} from '../types';
import { AudioFloatingInspector } from './AudioFloatingInspector';
import { TextFloatingInspector } from './TextFloatingInspector';
import { VideoFloatingInspector } from './VideoFloatingInspector';

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
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedClip = useTimelineStore(
    (state) =>
      state.clips.find((clip) => clip.id === selectedClipId) ?? null,
  );

  if (!selectedClip) return null;

  if (selectedClip.type === 'text') {
    return (
      <TextFloatingInspector
        key={`${selectedClip.id}:${selectedClip.text}:${selectedClip.fontType}:${selectedClip.fontSize}:${selectedClip.fontColor}:${selectedClip.bold}:${selectedClip.italic}`}
        clip={selectedClip}
        previewTiming={previewTiming}
        previewTransform={previewTransform}
      />
    );
  }

  if (selectedClip.type === 'audio') {
    return (
      <AudioFloatingInspector
        clip={selectedClip}
        previewTiming={previewTiming}
      />
    );
  }

  return (
    <VideoFloatingInspector
      clip={selectedClip}
      previewTiming={previewTiming}
      previewTransform={previewTransform}
    />
  );
}
