# OpenCut React

OpenCut React 是一个独立、可嵌入的 React 视频时间线编辑器。它提供多视频/音频轨、拖拽编排、裁剪、分割、吸附、撤销重做、音量调节、画面变换、预览以及可扩展导出接口。

项目不依赖 React Flow、Tailwind、shadcn 或 Base UI。界面由语义 HTML、普通 CSS、原生 Canvas 和 lucide-react 构成。

> 当前包名为 `opencut-react`，并设置了 `private: true`。这是为了先稳定公开 API；正式发布到 npm 前需要确认包名和版权主体。

## 本地开发

要求 Node.js `^20.19.0` 或 `>=22.12.0`，推荐 Node.js 22。

```bash
npm install
npm run dev
```

打开 Vite 输出的地址，通过顶部的“添加本地素材”选择浏览器支持的本地视频或音频文件即可体验。

常用命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
```

`npm run build` 会同时生成：

- `dist/`：ESM 组件库、TypeScript 声明和 `styles.css`。
- `demo-dist/`：可部署的示例应用。

## 组件用法

```tsx
import {
  VideoTimelineEditor,
  type VideoTimelineDraft,
  type VideoTimelineSource,
} from 'opencut-react';
import 'opencut-react/styles.css';

const sources: VideoTimelineSource[] = [
  {
    id: 'video-1',
    type: 'video',
    fileName: 'example.mp4',
    src: 'https://example.com/example.mp4',
    durationSeconds: 8.5,
    width: 1920,
    height: 1080,
  },
];

export function Editor() {
  const saveDraft = (draft: VideoTimelineDraft) => {
    localStorage.setItem('timeline-draft', JSON.stringify(draft));
  };

  return (
    <div style={{ height: 720 }}>
      <VideoTimelineEditor
        onDraftChange={saveDraft}
        onExport={async ({ draft, payload }) => {
          // 将 payload 交给自己的服务端视频渲染服务。
          await submitRenderTask({ draft, payload });
        }}
        sources={sources}
        title='我的视频工程'
      />
    </div>
  );
}
```

`initialDraft` 只在组件实例创建时读取。切换工程时请为组件设置新的 React `key`。`onDraftChange` 只响应可持久化的轨道、片段和画布变化，不会因播放时间、缩放或选中状态触发。

## 媒体源

视频源建议提供时长、宽度和高度；音频源建议提供时长。如果缺失，编辑器会通过浏览器媒体元素异步读取。

```ts
type VideoTimelineSource = {
  id: string;
  type: 'video' | 'audio';
  fileName: string;
  src: string;
  waveformSrc?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
};
```

后续向 `sources` 加入新 ID 会将素材追加到当前时间线。移除 source 不会自动删除已编辑片段，避免宿主数据刷新导致工程内容丢失。

## 私有媒体加载

默认加载器执行不带 token、cookie 或自定义 header 的 `fetch`。私有媒体可以注入加载器：

```tsx
<VideoTimelineEditor
  mediaLoader={{
    async loadBlob(url, { signal }) {
      const response = await fetch(url, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('媒体加载失败');
      return response.blob();
    },
  }}
  sources={sources}
/>
```

同一编辑器实例会复用 Blob、Object URL、波形、帧预览和元数据缓存；卸载时会中止未完成请求并释放 Object URL。不同编辑器实例之间不会共享这些资源。

## 导出

- “导出 JSON”下载当前 `CompositionExportPayload`。
- 传入 `onExport` 后显示“导出视频”，回调会收到最新 `draft` 和 `payload`。
- OpenCut React 不包含 MP4 编码器或渲染后端。
- 可使用 `createCompositionExportPayload(draft)` 在组件外创建同样的导出数据。

草稿当前写入 schema v4，并兼容读取 v1–v4。

## 快捷键

快捷键仅作用于当前获得焦点的编辑器实例：

| 操作 | 快捷键 |
| --- | --- |
| 撤销 | `Ctrl/Cmd + Z` |
| 重做 | `Ctrl + Y` 或 `Cmd + Shift + Z` |
| 分割片段 | `Ctrl/Cmd + B` |
| 删除片段 | `Backspace` |
| 播放/暂停 | `Space` |
| 缩放时间线 | `Ctrl + 滚轮` |

## 浏览器限制

- 面向现代桌面浏览器，不支持 SSR、React Native 或移动端触控剪辑。
- 远程媒体必须允许 CORS，并使用浏览器支持的封装和编解码格式。
- Canvas 预览是编辑体验，不等同于最终离线渲染结果。

## License

[MIT](./LICENSE)
