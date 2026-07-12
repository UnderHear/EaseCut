import { useState } from 'react';

import {
  VideoTimelineEditor,
  type VideoTimelineImportRequest,
  type VideoTimelineSource,
} from '../index';

const createSourceId = (fileName: string) => {
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${fileName}-${suffix}`;
};

const getSourceFileName = (
  url: string,
  type: VideoTimelineImportRequest['type'],
) => {
  const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
  const lastPathSegment = pathSegments.at(-1);
  if (lastPathSegment) return decodeURIComponent(lastPathSegment);

  return type === 'audio' ? '在线音频' : '在线视频';
};

export function DemoApp() {
  const [sources, setSources] = useState<VideoTimelineSource[]>([]);
  const handleImportMedia = ({
    type,
    url,
  }: VideoTimelineImportRequest) => {
    const fileName = getSourceFileName(url, type);
    const source: VideoTimelineSource = {
      fileName,
      id: createSourceId(fileName),
      src: url,
      type,
    };

    setSources((current) => [...current, source]);
  };

  return (
    <main className='oc-demo'>
      <VideoTimelineEditor
        onImportMedia={handleImportMedia}
        sources={sources}
        title='OpenCut 视频时间线'
      />
    </main>
  );
}
