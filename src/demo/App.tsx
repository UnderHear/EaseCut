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
    src: 'https://yiqun-bucket.oss-cn-beijing.aliyuncs.com/uploads%2F019f0399-f9bc-791e-9d76-4ff8fd6bcb81%2Fa1059ee2-3b63-4ccf-a3d7-db08e637516d_123_123.mp4?OSSAccessKeyId=LTAI5t7XnCpjNo3F4SACrkRh&Expires=2099193645&Signature=TR59dfLHMxuJAtgB%2FDwwHLfzX1I%3D',
    type: 'video',
  },
  {
    fileName: 'demo-audio.mp3',
    id: 'built-in-demo-audio',
    src: 'https://yiqun-bucket.oss-cn-beijing.aliyuncs.com/uploads%2F019f0399-f9bc-791e-9d76-4ff8fd6bcb81%2Ff473f7c8-0a48-4446-8b08-80352a5b91ca_audio.mp3?OSSAccessKeyId=LTAI5t7XnCpjNo3F4SACrkRh&Expires=2099500568&Signature=6pCNrhMTaQ6veY3ww%2Fbs8IssCa4%3D',
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
    <main className='oc-demo'>
      <VideoTimelineEditor
        onImportMedia={handleImportMedia}
        sources={sources}
        title='OpenCut 视频编辑器'
      />
    </main>
  );
}
