import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FilePlus2, RotateCcw } from 'lucide-react';

import {
  VideoTimelineEditor,
  type VideoTimelineDraft,
  type VideoTimelineExportRequest,
  type VideoTimelineSource,
} from '../index';

const createSourceId = (file: File) => {
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${file.name}-${file.lastModified}-${suffix}`;
};

export function DemoApp() {
  const [sources, setSources] = useState<VideoTimelineSource[]>([]);
  const [notice, setNotice] = useState(
    '请选择本地 MP4、WebM、MP3、WAV 等浏览器可播放的媒体文件。',
  );
  const draftRef = useRef<VideoTimelineDraft | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current.clear();
    },
    [],
  );

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) =>
        file.type.startsWith('video/') || file.type.startsWith('audio/'),
    );
    event.target.value = '';
    if (files.length === 0) return;

    const nextSources = files.map((file): VideoTimelineSource => {
      const src = URL.createObjectURL(file);
      objectUrlsRef.current.add(src);

      return {
        fileName: file.name,
        id: createSourceId(file),
        src,
        type: file.type.startsWith('audio/') ? 'audio' : 'video',
      };
    });

    setSources((current) => [...current, ...nextSources]);
    setNotice(`已添加 ${nextSources.length} 个本地素材。`);
  };

  const clearSources = () => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
    draftRef.current = null;
    setSources([]);
    setNotice('素材已清空，请重新选择本地媒体文件。');
  };

  const handleExport = async ({
    draft,
    payload,
  }: VideoTimelineExportRequest) => {
    draftRef.current = draft;
    setNotice(
      `示例导出适配器已收到 ${payload.Track.length} 条轨道；OpenCut 不内置 MP4 渲染后端。`,
    );
  };

  return (
    <main className='oc-demo'>
      <section className='oc-demo__controls' aria-label='示例素材控制'>
        <div>
          <strong>OpenCut React</strong>
          <span aria-live='polite' role='status'>
            {notice}
          </span>
        </div>
        <div className='oc-demo__actions'>
          <label className='oc-demo__file-button'>
            <FilePlus2 aria-hidden='true' size={16} />
            添加本地素材
            <input
              accept='video/*,audio/*'
              multiple
              onChange={addFiles}
              type='file'
            />
          </label>
          <button disabled={sources.length === 0} onClick={clearSources} type='button'>
            <RotateCcw aria-hidden='true' size={16} />
            清空
          </button>
        </div>
      </section>

      <div className='oc-demo__editor'>
        <VideoTimelineEditor
          key={sources.length === 0 ? 'empty' : 'project'}
          onDraftChange={(draft) => {
            draftRef.current = draft;
          }}
          onExport={handleExport}
          sources={sources}
          title='OpenCut 视频时间线'
        />
      </div>
    </main>
  );
}
