import { useEffect, useRef, useState } from 'react';

import {
  VideoTimelineEditor,
  type CompositionExportPayload,
  type VideoTimelineEditorHandle,
} from '../index';

async function submitVideoEditTask({
  payload,
}: {
  payload: CompositionExportPayload;
}): Promise<void> {
  let response = await fetch(
    'http://localhost:10081/api/v1/video-edit-tasks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  let result = await response.json();
  if (!response.ok) throw new Error(result.message);

  const taskId = result.data.taskId;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    response = await fetch(
      `http://localhost:10081/api/v1/video-edit-tasks/${taskId}`,
    );
    result = await response.json();

    if (!response.ok) throw new Error(result.message);
    if (result.data.status === 'SUCCESS') return;
    if (
      result.data.status !== 'PENDING' &&
      result.data.status !== 'PROCESSING'
    ) {
      throw new Error(result.data.taskMessage || result.message);
    }
  }
}

export function DemoApp() {
  const editorRef = useRef<VideoTimelineEditorHandle>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const initClip = async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const source1 = await editor.source.add(
      'https://libtv-res.liblib.art/upload-images/4d3376b999c849d285db25671acea9fa/eaedab8923a8e9da4f69df2effbdcb779a10c086.mp4',
    );

    await editor.clip.add({ sourceId: source1.id });

    const source2 = await editor.source.add(
      'https://libtv-res.liblib.art/upload-images/4d3376b999c849d285db25671acea9fa/c87fd89e424e6ca517c3213268373033e1523fdc.mp3',
    );

    await editor.clip.add({ sourceId: source2.id });
  };

  useEffect(() => {
    if (isEditorOpen) {
      initClip();
    }
  }, [isEditorOpen]);

  return (
    <main className='ec-demo'>
      <button className='ec-demo__open-editor-btn'
        onClick={() => setIsEditorOpen(true)}>点我打开编辑器！
      </button>
      {isEditorOpen && (
        <div className='ec-demo__editor'>
          <VideoTimelineEditor title='EaseCut 视频编辑器' 
            ref={editorRef} 
            onClose={() => setIsEditorOpen(false)}
            onExport={submitVideoEditTask}
          />
        </div>
      )}
    </main>
  );
}
