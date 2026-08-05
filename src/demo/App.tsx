import {
  VideoTimelineEditor,
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

export function DemoApp() {
  return (
    <main className='ec-demo'>
      <VideoTimelineEditor
        initialSources={BUILT_IN_SOURCES}
        title='EaseCut 视频编辑器'
      />
    </main>
  );
}
