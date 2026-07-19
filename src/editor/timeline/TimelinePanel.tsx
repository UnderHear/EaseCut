import { TimelineToolbar } from '../components/TimelineToolbar';
import type { TimelineClipTimingPreview } from '../types';
import { TimelineViewport } from './TimelineViewport';

type TimelinePanelProps = {
  onClipTimingPreviewChange?: (
    preview: TimelineClipTimingPreview | null,
  ) => void;
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

export function TimelinePanel({
  onClipTimingPreviewChange,
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
      />
    </section>
  );
}
