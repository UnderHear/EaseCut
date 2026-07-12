import { TimelineToolbar } from '../components/TimelineToolbar';
import { TimelineViewport } from './TimelineViewport';

type TimelinePanelProps = {
  onRequestImport?: () => void;
  onRequestPreviewFullscreen: () => void;
};

export function TimelinePanel({
  onRequestImport,
  onRequestPreviewFullscreen,
}: TimelinePanelProps) {
  return (
    <section className='oc-timeline-panel' aria-label='时间线编辑区域'>
      <TimelineToolbar
        onRequestImport={onRequestImport}
        onRequestPreviewFullscreen={onRequestPreviewFullscreen}
      />
      <TimelineViewport />
    </section>
  );
}
