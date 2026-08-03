import { useState } from 'react';

import {
  VideoTimelineEditor,
  type VideoTimelineImportRequest,
  type VideoTimelineSource,
} from '../index';

const BUILT_IN_SOURCES: VideoTimelineSource[] = [
  {
    fileName: 'demo-video.mp4',
    id: 'built-in-demo-video',
    src: 'https://libtv-res.liblib.art/upload-images/4d3376b999c849d285db25671acea9fa/eaedab8923a8e9da4f69df2effbdcb779a10c086.mp4',
    type: 'video',
  },
  {
    fileName: 'demo-audio.mp3',
    id: 'built-in-demo-audio',
    src: 'https://libtv-res.liblib.art/upload-images/4d3376b999c849d285db25671acea9fa/c87fd89e424e6ca517c3213268373033e1523fdc.mp3',
    type: 'audio',
  },
];

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
  const [sources, setSources] =
    useState<VideoTimelineSource[]>(BUILT_IN_SOURCES);
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
    <main className='ec-demo'>
      <VideoTimelineEditor
        onImportMedia={handleImportMedia}
        sources={sources}
        title='EaseCut 视频编辑器'
      />
    </main>
  );
}
