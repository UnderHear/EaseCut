import { TimelineToolbar } from '../components/TimelineToolbar';
import type { TimelineClip, TimelineClipTimingPreview } from '../types';
import { TimelineViewport } from './TimelineViewport';

type TimelinePanelProps = {
  onClipTimingPreviewChange?: (
    preview: TimelineClipTimingPreview | null,
  ) => void;
  onDownloadClip: (clip: TimelineClip) => void | Promise<void>;
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

export function TimelinePanel({
  onClipTimingPreviewChange,
  onDownloadClip,
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelinePanelProps) {
  return (
    <section className='oc-timeline-panel' aria-label='时间线编辑区域'>
      <TimelineToolbar
        onRequestImport={onRequestImport}
        onRequestPreviewFullscreen={onRequestPreviewFullscreen}
      />
      <TimelineViewport
        onClipTimingPreviewChange={onClipTimingPreviewChange}
        onDownloadClip={onDownloadClip}
      />
    </section>
  );
}
