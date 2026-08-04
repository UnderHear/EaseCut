# EaseCut React npm 组件使用说明

本文面向通过 npm 安装并嵌入 EaseCut React 的应用开发者，描述当前包入口实际公开的组件、Props、回调、函数、类型、数据结构和浏览器要求。

> 当前仓库中的包名是 `easecut-react`，版本为 `0.1.0`，但 `package.json` 仍设置了 `private: true`。以下安装方式适用于包名确认并正式发布到 npm 之后；发布前可通过 workspace 或本地包路径以相同 API 集成。

## 1. 组件定位与能力边界

EaseCut React 提供一个完整的 React 视频时间线编辑器组件 `VideoTimelineEditor`。它是 React 组件，不是原生 Web Component，也不提供 Vue、React Native 或框架无关的自定义元素版本。

组件内置以下编辑能力：

- 视频、音频、图片和单行文字多轨时间线；
- 片段选择、拖动、裁剪、双击还原裁剪、分割、复制、粘贴、删除和隐藏；
- 撤销、重做、时间轴缩放、时间轴吸附、画布辅助线和播放头跟随；
- 视频位置与尺寸调整；
- 音视频片段音量和 `0.1` 至 `4` 倍速调整；
- 轨道静音；
- 文字内容、字体、字号、颜色、粗体、斜体、下划线、时间和位置调整；
- Canvas 画面预览、播放/暂停和全屏预览；
- 当前组合数据的 JSON 下载；
- 将最新草稿及标准化导出数据交给宿主应用处理；
- 通过宿主回调导入 HTTP/HTTPS 在线素材；
- 通过 `sources` 接收宿主提供的远程 URL、Blob URL 或其他浏览器可访问的媒体地址；
- 为鉴权媒体注入自定义 Blob 和元数据加载器。

组件的边界如下：

- 不包含 MP4 编码器，也不会自行生成最终视频文件；
- 不上传或持久化素材，在线导入、文件上传、草稿保存和最终渲染均由宿主决定；
- 没有命令式 `ref` API，不能从外部直接调用“分割”“撤销”“播放”等内部命令；
- `initialDraft` 是非受控初始值，不是持续同步的 `draft` 受控属性；
- 不支持 SSR、React Native 或移动端触控剪辑；
- Canvas 预览用于编辑体验，不等同于最终离线渲染结果。

## 2. 环境要求与安装

包当前声明的环境要求：

- React：`>=19.0.0 <20.0.0`；
- React DOM：`>=19.0.0 <20.0.0`；
- Node.js：`^20.19.0` 或 `>=22.12.0`，推荐 Node.js 22；
- 模块格式：ESM；
- 浏览器：现代桌面浏览器。

正式发布后安装：

```bash
npm install easecut-react react@^19 react-dom@^19
```

组件逻辑和样式分别从下面两个公共子路径导入：

```tsx
import { VideoTimelineEditor } from 'easecut-react';
import 'easecut-react/styles.css';
```

不要从 `easecut-react/dist/...` 或包内的 `editor/...` 路径深层导入。当前受支持的运行时入口只有：

```text
easecut-react
easecut-react/styles.css
```

## 3. 最小使用示例

```tsx
import {
  VideoTimelineEditor,
  type VideoTimelineSource,
} from 'easecut-react';
import 'easecut-react/styles.css';

const sources: VideoTimelineSource[] = [
  {
    id: 'video-1',
    type: 'video',
    fileName: 'opening.mp4',
    src: 'https://cdn.example.com/opening.mp4',
    durationUs: 8_500_000,
    width: 1920,
    height: 1080,
  },
];

export function EditorPage() {
  return (
    <div style={{ height: 720 }}>
      <VideoTimelineEditor
        sources={sources}
        title='宣传片工程'
      />
    </div>
  );
}
```

必须导入 `easecut-react/styles.css`。编辑器根节点使用 `width: 100%`、`height: 100%`，并具有 `520px` 的默认最小高度，因此宿主容器应提供明确高度：

```css
.editor-host {
  width: 100%;
  height: min(800px, 100vh);
  min-height: 520px;
}
```

## 4. 宿主与组件的数据流

`VideoTimelineEditor` 采用“宿主提供素材和初始草稿，组件管理编辑会话，组件通过回调输出结果”的模式：

```text
宿主 sources ────────────────┐
宿主 initialDraft ──────────┼─> VideoTimelineEditor
宿主 mediaLoader ───────────┘            │
                                         ├─> onDraftChange(draft)
                                         ├─> onExport({ draft, payload })
                                         ├─> onImportMedia({ type, url })
                                         └─> onClose()
```

常见操作与调用方式：

| 宿主目标 | 调用方式 |
| --- | --- |
| 初始化素材 | 传入 `sources` |
| 后续添加素材 | 向 `sources` 添加一个具有新 `id` 的元素并重新渲染 |
| 刷新素材 URL 或元数据 | 用相同 `id` 更新对应 source |
| 打开已有工程 | 传入 `initialDraft` |
| 切换工程 | 更换组件的 React `key`，同时传入新 `initialDraft` |
| 保存编辑结果 | 监听 `onDraftChange` |
| 自定义视频导出 | 实现 `onExport` |
| 接入在线素材导入 | 实现 `onImportMedia`，完成后更新 `sources` |
| 接入鉴权媒体 | 传入稳定的 `mediaLoader` 对象 |
| 关闭编辑器 | 实现 `onClose` 并由宿主卸载或隐藏组件 |
| 在组件外生成导出 JSON | 调用 `createCompositionExportPayload(draft)` |
| 时间单位或帧序号换算 | 调用公开的时间工具函数 |

## 5. `VideoTimelineEditor` Props

完整签名：

```ts
type VideoTimelineEditorProps = {
  sources: VideoTimelineSource[];
  initialDraft?: VideoTimelineDraft;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  jsonFileName?: string;
  mediaLoader?: VideoTimelineMediaLoader;
  onDraftChange?: (draft: VideoTimelineDraft) => void;
  onExport?: (
    request: VideoTimelineExportRequest,
  ) => void | Promise<void>;
  onImportMedia?: (
    request: VideoTimelineImportRequest,
  ) => void | Promise<void>;
  onClose?: () => void;
};
```

### 5.1 Props 总表

| Prop | 类型 | 必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `sources` | `VideoTimelineSource[]` | 是 | 无 | 宿主提供的媒体源列表；支持初始化和增量更新 |
| `initialDraft` | `VideoTimelineDraft` | 否 | 根据 `sources` 创建新工程 | 仅在组件实例创建时读取的初始项目草稿 |
| `title` | `string` | 否 | `'视频合成'` | 编辑器标题，也是根区域的可访问名称 |
| `className` | `string` | 否 | `''` | 追加到根节点 `ec-editor` 后的类名 |
| `style` | `React.CSSProperties` | 否 | 无 | 传给编辑器根节点的内联样式 |
| `jsonFileName` | `string` | 否 | `'video-composition.json'` | “导出 JSON”按钮下载文件的名称 |
| `mediaLoader` | `VideoTimelineMediaLoader` | 否 | 无鉴权的浏览器 `fetch` | 自定义媒体 Blob 和元数据加载方式 |
| `onDraftChange` | `(draft) => void` | 否 | 无 | 可持久化项目内容发生变化后触发 |
| `onExport` | `({ draft, payload }) => void \| Promise<void>` | 否 | 无 | 提供后显示“导出视频”按钮，点击后交由宿主导出 |
| `onImportMedia` | `({ type, url }) => void \| Promise<void>` | 否 | 无 | 提供后显示“导入素材”按钮，提交在线 URL 时调用 |
| `onClose` | `() => void` | 否 | 无 | 提供后显示关闭按钮，点击时调用 |

### 5.2 `sources`

`sources` 是宿主维护的素材列表，不是当前时间线片段列表。同一个 source 可以通过复制、分割等编辑动作形成多个 clip。

组件会观察 `sources` 的后续变化：

- 新增一个从未出现过的 `id`：创建对应 clip 并加入时间线；
- 使用相同 `id` 更新 source：刷新已有 clip 的名称、URL、波形 URL 和可补充的元数据；
- 已有 `id` 的 `type` 不应改变；类型与现有 clip 不一致的更新不会覆盖该 clip；
- 从 `sources` 删除元素：不会自动删除已经编辑的 clip；
- source 元数据缺失：先异步探测，验证成功后才加入时间线；
- 元数据探测失败：显示错误提示，不把失败 source 写入草稿；
- 初始视频按 `sources` 顺序排列在主视频轨道上，音频从时间 `0` 开始并各自创建音频轨道；
- 如果挂载时存在具有完整尺寸的 16:9 视频，默认画布采用其中分辨率最大的一个；否则新工程使用 `1280 × 720`。

source 的 `id` 必须稳定且唯一。不要在每次 React 渲染时重新生成已有素材的 ID。

### 5.3 `initialDraft`

`initialDraft` 只在组件实例首次创建时读取。组件挂载后仅修改该 Prop 不会重置正在编辑的工程。

切换工程时应同时更换 React `key`：

```tsx
<VideoTimelineEditor
  key={projectId}
  initialDraft={projectDraft}
  sources={projectSources}
/>
```

如果同时传入 `initialDraft` 和 `sources`：

- source `id` 与草稿中的 `sourceId` 相同时，组件会用 source 刷新素材名称、URL 和可用元数据；
- `sources` 中出现草稿没有的新 `id` 时，新素材会追加到已打开的工程；
- 不在 `sources` 中的旧 clip 不会被自动删除。

组件会校验初始草稿。旧 schema 会抛出“不支持的草稿版本”错误，其他无效结构会被拒绝，不会静默迁移或猜测修复。

### 5.4 `onDraftChange`

`onDraftChange` 在可持久化状态变化后接收最新 `VideoTimelineDraft`。它不会因为下列瞬态状态变化而触发：

- 当前播放时间；
- 播放或暂停状态；
- 时间轴缩放和滚动；
- 当前选中的 clip；
- hover、拖动中的临时预览；
- 尚未提交的连续输入手势。

组件初次挂载时不会主动调用 `onDraftChange`。宿主应自行保留传入的 `initialDraft`；第一次实际编辑提交后才会收到新草稿。

保存示例：

```tsx
import { useCallback } from 'react';
import type { VideoTimelineDraft } from 'easecut-react';

const saveDraft = async (draft: VideoTimelineDraft) => {
  const response = await fetch('/api/projects/project-1/draft', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    throw new Error('草稿保存失败');
  }
};

export function ProjectEditor() {
  const handleDraftChange = useCallback((draft: VideoTimelineDraft) => {
    void saveDraft(draft);
  }, []);

  return (
    <VideoTimelineEditor
      onDraftChange={handleDraftChange}
      sources={[]}
    />
  );
}
```

如果保存请求较昂贵，宿主可以自行防抖、排队或做版本控制；组件不会等待 `onDraftChange`，该回调也不是 `Promise` 接口。

### 5.5 `onExport`

配置 `onExport` 后，标题栏显示“导出视频”按钮。点击时回调收到点击瞬间的最新草稿和从该草稿派生的导出 payload：

```ts
type VideoTimelineExportRequest = {
  draft: VideoTimelineDraft;
  payload: CompositionExportPayload;
};
```

回调可以同步执行，也可以返回 `Promise`。Promise 未结束期间按钮会进入“导出中…”状态并阻止重复提交。回调抛出的 `Error` 会以错误提示展示给用户。

```tsx
import type { VideoTimelineExportRequest } from 'easecut-react';

async function submitExport({
  draft,
  payload,
}: VideoTimelineExportRequest) {
  const response = await fetch('/api/render-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, composition: payload }),
  });

  if (!response.ok) {
    throw new Error('创建渲染任务失败');
  }
}

<VideoTimelineEditor
  onExport={submitExport}
  sources={sources}
/>
```

组件自身不编码 MP4。`onExport` 的常见实现包括：

- 把 `payload` 交给宿主已有的渲染服务；
- 启动宿主实现的浏览器端导出管线；
- 创建异步任务并跳转到任务进度页面；
- 将 `draft` 和 `payload` 保存为工程快照。

### 5.6 `onImportMedia`

配置 `onImportMedia` 后，时间线工具栏显示“导入素材”按钮。组件弹窗负责校验 URL 和识别媒体类型，然后将请求交给宿主：

```ts
type VideoTimelineImportRequest = {
  type: 'video' | 'audio' | 'image';
  url: string;
};
```

当前只接受 `http:` 和 `https:` URL，并根据 URL pathname 的文件后缀识别类型。查询参数和签名不参与识别。

识别的视频后缀：

```text
3g2, 3gp, avi, m2ts, m4v, mkv, mov, mp4, mpeg, mpg,
m3u8, ogv, ts, webm
```

识别的音频后缀：

```text
aac, aif, aiff, flac, m4a, mp3, oga, ogg, opus, wav, weba, wma
```

识别的图片后缀：

```text
jpeg, jpg, png
```

图片加载时还会校验实际文件签名，只接受 PNG、JPEG 和 JPG。

`onImportMedia` 只通知宿主，不会自行把 URL 加入时间线。宿主必须在回调成功前后把新 source 写入 `sources`：

```tsx
import { useState } from 'react';
import {
  VideoTimelineEditor,
  type VideoTimelineImportRequest,
  type VideoTimelineSource,
} from 'easecut-react';

const getFileName = (url: string) => {
  const name = new URL(url).pathname.split('/').filter(Boolean).at(-1);
  return name ? decodeURIComponent(name) : '在线素材';
};

export function OnlineMediaEditor() {
  const [sources, setSources] = useState<VideoTimelineSource[]>([]);

  const handleImportMedia = ({
    type,
    url,
  }: VideoTimelineImportRequest) => {
    setSources((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        fileName: getFileName(url),
        src: url,
      },
    ]);
  };

  return (
    <VideoTimelineEditor
      onImportMedia={handleImportMedia}
      sources={sources}
    />
  );
}
```

如果回调返回 rejected Promise 或抛出异常，弹窗保持打开并显示失败提示。

### 5.7 `onClose`

配置 `onClose` 后标题栏显示关闭按钮。组件只调用回调，不会自动保存、确认未保存改动或卸载自己：

```tsx
<VideoTimelineEditor
  onClose={() => navigate('/projects')}
  sources={sources}
/>
```

是否确认、保存或丢弃改动应由宿主在 `onClose` 中决定。

### 5.8 `title`、`className`、`style` 和 `jsonFileName`

```tsx
<VideoTimelineEditor
  className='marketing-editor'
  jsonFileName='marketing-composition.json'
  sources={sources}
  style={{ minHeight: 640 }}
  title='营销视频工程'
/>
```

- `title` 会显示在编辑器标题栏，并用于根 `region` 的可访问名称；
- `className` 会得到 `ec-editor marketing-editor`；
- `style` 直接作用于根节点，可用于设置最小高度、边框或宿主布局；
- “导出 JSON”按钮始终存在，下载内容是 `CompositionExportPayload`，而不是原始 `VideoTimelineDraft`；
- `jsonFileName` 只修改该下载文件名；当前没有用于拦截该按钮的回调，需要自定义流程时请使用 `createCompositionExportPayload` 或 `onExport`。

## 6. 媒体源 `VideoTimelineSource`

```ts
type VideoTimelineMediaType = 'video' | 'audio' | 'image';

type VideoTimelineSourceBase = {
  id: string;
  fileName: string;
  src: string;
};

type VideoTimelineSource =
  | (VideoTimelineSourceBase & {
      type: 'video' | 'audio';
      durationUs?: number;
      waveformSrc?: string;
      width?: number;
      height?: number;
    })
  | (VideoTimelineSourceBase & {
      type: 'image';
      durationUs?: number;
      width?: number;
      height?: number;
    });
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 宿主定义的稳定唯一素材 ID，也是 source 更新与草稿重连的依据 |
| `type` | 是 | `'video'`、`'audio'` 或 `'image'` |
| `fileName` | 是 | UI 显示名称，也是“下载原始素材”默认文件名 |
| `src` | 是 | 浏览器可加载的媒体 URL；可为远程 URL、Blob URL 等 |
| `waveformSrc` | 否 | 仅音视频 Source 可用；用于音频波形解码的替代 URL，未提供时使用 `src` |
| `durationUs` | 否 | 音视频素材总时长；图片中表示初始展示时长，省略时默认 5 秒；单位均为整数微秒 |
| `width` | 否 | 视频或图片原始宽度；音频无需提供 |
| `height` | 否 | 视频或图片原始高度；音频无需提供 |

推荐直接提供完整元数据：

```ts
const source: VideoTimelineSource = {
  id: 'asset-42',
  type: 'video',
  fileName: 'product-demo.mp4',
  src: 'https://cdn.example.com/product-demo.mp4',
  durationUs: 65_250_000,
  width: 3840,
  height: 2160,
};
```

完整元数据可以避免组件为了创建 clip 而额外探测媒体。缺失时：

- 视频需要解析出 `durationUs`、`width` 和 `height`；
- 音频需要解析出 `durationUs`；
- 图片需要解析出 `width` 和 `height`，不要求媒体时长；
- 组件先调用可选的 `mediaLoader.loadMetadata`，信息仍不完整时再使用浏览器媒体元素读取。

所有 `*Us` 字段都使用整数微秒：

```ts
1 秒 = 1_000_000 微秒
1 毫秒 = 1_000 微秒
```

### 6.1 宿主接入本地文件

组件没有内置本地文件选择器。宿主可以在组件外选择文件并创建 Blob URL，然后将 source 加入 `sources`：

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  VideoTimelineEditor,
  type VideoTimelineSource,
} from 'easecut-react';

export function LocalFileEditor() {
  const [sources, setSources] = useState<VideoTimelineSource[]>([]);
  const ownedUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of ownedUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const addLocalFile = (file: File) => {
    const type = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : null;

    if (!type) throw new Error('请选择视频或音频文件');

    const src = URL.createObjectURL(file);
    ownedUrls.current.push(src);
    setSources((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        fileName: file.name,
        src,
      },
    ]);
  };

  return (
    <>
      <input
        accept='video/*,audio/*'
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) addLocalFile(file);
          event.currentTarget.value = '';
        }}
        type='file'
      />
      <div style={{ height: 720 }}>
        <VideoTimelineEditor sources={sources} />
      </div>
    </>
  );
}
```

宿主创建的 Blob URL 仍由宿主负责释放。组件只负责释放其媒体运行时内部创建的 Object URL。

## 7. 私有媒体加载器 `VideoTimelineMediaLoader`

默认加载器只调用 `fetch(url, { signal })`，不额外设置 Authorization、`credentials` 或自定义 header；实际凭据行为仍遵循浏览器的 `fetch` 默认规则。需要鉴权、签名刷新或自定义缓存时可注入：

```ts
interface VideoTimelineMediaLoader {
  loadBlob(
    url: string,
    options: {
      signal: AbortSignal;
      source?: VideoTimelineSource;
    },
  ): Promise<Blob>;

  loadMetadata?(
    source: VideoTimelineSource,
    options: { signal: AbortSignal },
  ): Promise<VideoTimelineMediaMetadata | null>;
}

type VideoTimelineMediaMetadata = {
  durationUs?: number;
  height?: number;
  width?: number;
};
```

鉴权示例：

```tsx
import { useMemo } from 'react';
import {
  VideoTimelineEditor,
  type VideoTimelineMediaLoader,
} from 'easecut-react';

function AuthorizedEditor({ token }: { token: string }) {
  const mediaLoader = useMemo<VideoTimelineMediaLoader>(
    () => ({
      async loadBlob(url, { signal }) {
        const response = await fetch(url, {
          signal,
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error(`媒体加载失败 (${response.status})`);
        }

        return response.blob();
      },

      async loadMetadata(source, { signal }) {
        const response = await fetch(
          `/api/media/${encodeURIComponent(source.id)}/metadata`,
          {
            signal,
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (response.status === 404) return null;
        if (!response.ok) throw new Error('媒体元数据加载失败');
        return response.json();
      },
    }),
    [token],
  );

  return (
    <VideoTimelineEditor
      mediaLoader={mediaLoader}
      sources={sources}
    />
  );
}
```

实现要求：

- 必须响应 `AbortSignal`，不要在取消后继续占用网络或解码资源；
- `loadBlob` 的 `source` 是可选值，加载器不能假设它永远存在；
- `loadMetadata` 可以返回部分元数据或 `null`，组件会继续用浏览器媒体元素补齐；
- `durationUs` 必须为正整数微秒，宽高必须为正数；
- 应保持 `mediaLoader` 对象引用稳定。引用变化会销毁旧媒体运行时并创建新缓存；
- 同一编辑器实例复用 Blob、Object URL、波形、帧预览和元数据缓存；
- 不同编辑器实例不共享缓存；组件卸载时会取消任务并释放内部资源。

## 8. 项目草稿 `VideoTimelineDraft`

`VideoTimelineDraft` 是可序列化的权威项目文档：

```ts
type VideoTimelineDraft = {
  schemaVersion: 12;
  canvasSize: VideoTimelineCanvasSize;
  tracks: VideoTimelineTrack[];
  clips: VideoTimelineClip[];
};

type VideoTimelineCanvasSize = {
  width: number;
  height: number;
};
```

不要在草稿中保存 `File`、`Blob`、媒体元素、AudioNode、Worker、Object URL 句柄或其他运行时对象。虽然 `src` 字段本身是字符串，但如果它是临时 Blob URL，重新打开页面后通常需要宿主用相同 `sourceId` 提供新的可用 source。

### 8.1 轨道

```ts
type VideoTimelineTrack = {
  id: string;
  muted: boolean;
  name: string;
  type: 'video' | 'audio' | 'text';
  zIndex: number;
};
```

轨道规则：

- 工程必须至少包含一条轨道，画布宽高必须为正有限数字；
- 轨道 `id` 在工程内唯一；
- `tracks` 按合成层从下到上存储；
- `tracks[0]` 是最低层，最后一个元素是最高层；
- `zIndex` 等于轨道在规范化数组中的下标；
- 轨道按 `[音频…, 主视频, 叠加视频…, 文字…]` 分组；
- 时间线 UI 反向展示，因此视觉上最高层位于最上方；
- 主视频轨道 ID 为 `video-main`；
- 手写音频轨道草稿时，当前校验要求名称为 `音频轨道`；
- `muted` 只影响轨道输出，不会改写 clip 自身保存的 `volume`。

### 8.2 Clip 公共字段

所有 clip 都有以下基础字段：

```ts
type ClipBase = {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  trackId: string;
  startUs: number;
  durationUs: number;
  hidden: boolean;
  zIndex: number;
};
```

- `id` 在工程内唯一；
- `trackId` 必须引用兼容轨道；图片 Clip 使用视频轨道；
- `startUs` 是非负安全整数微秒；
- `durationUs` 是正安全整数微秒；
- `hidden` 的 clip 仍参与工程总时长、布局、碰撞和吸附，但不参与预览、播放和导出 Track；
- `zIndex` 是同轨 clip 的确定性顺序字段。

### 8.3 音视频 Clip

```ts
type TimelineTimedMediaClip = ClipBase & {
  type: 'video' | 'audio';
  name: string;
  sourceId: string;
  src: string;
  waveformSrc?: string;
  sourceDurationUs: number;
  trimStartUs: number;
  trimEndUs: number;
  speed: number;
  volume: number;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

约束：

- `sourceId` 和 `src` 不能为空；
- `0 <= trimStartUs <= trimEndUs <= sourceDurationUs`；
- `speed` 范围是 `0.1` 至 `4`；
- `volume` 范围是 `0` 至 `1`；
- `transform.width` 和 `transform.height` 必须为正有限数字；
- 当前草稿模型要求音频 clip 同样保存合法的 `transform`，但音频导出元素不会输出 transform 过滤器；
- `durationUs` 是裁剪区间应用倍速后的时间线时长，不是原始素材时长；
- 倍速时长使用绝对端点分别换算后相减，因此手写草稿时必须与组件的整数微秒取整结果一致。

### 8.4 图片 Clip

```ts
type TimelineImageClip = ClipBase & {
  type: 'image';
  name: string;
  sourceId: string;
  src: string;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type TimelineMediaClip = TimelineTimedMediaClip | TimelineImageClip;
```

图片 Clip 与视频 Clip 使用同一类视频轨道，支持移动、裁剪、分割、复制、隐藏和画布变换。图片的 `durationUs` 是权威展示时长；图片不保存 `sourceDurationUs`、`trimStartUs`、`trimEndUs`、`speed`、`volume` 或 `waveformSrc`。

### 8.5 文字 Clip

```ts
type TimelineTextClip = ClipBase & {
  type: 'text';
  text: string;
  fontType: TimelineTextFontType;
  fontSize: number;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  position: {
    x: number;
    y: number;
  };
  layoutSize: {
    width: number;
    height: number;
  };
};
```

约束：

- `text` 去除首尾空白后不能为空，且不能包含换行；
- `fontSize` 为正整数；
- `fontColor` 使用 `#RRGGBBAA` 格式，例如不透明白色为 `#FFFFFFFF`；
- `layoutSize.width` 和 `layoutSize.height` 为正整数；
- 文字 clip 不包含媒体专属的 `sourceId`、`src`、`trimStartUs`、`trimEndUs`、`speed` 或 `volume`。

当前 `TimelineTextFontType` 可用值：

| `fontType` | 字体 |
| --- | --- |
| `'1187223'` | 站酷仓耳渔阳体 |
| `'1187221'` | 站酷高端黑 |
| `'1187219'` | 站酷酷黑体 |
| `'1187217'` | 站酷快乐体 |
| `'1187213'` | 站酷文艺体 |
| `'1187211'` | 站酷小薇体 |
| `'SY_Black'` | 思源黑体 |
| `'ALi_PuHui'` | 阿里巴巴普惠体 |

字体预设类型的公开结构为：

```ts
type TimelineTextFontPreset = Readonly<{
  family: string;
  fontType: TimelineTextFontType;
  label: string;
}>;
```

八款字体资源随组件库构建产物提供并按需加载。当前包只公开字体相关类型，没有公开字体预设常量或查询函数。

### 8.6 完整草稿示例

```ts
import type { VideoTimelineDraft } from 'easecut-react';

const draft: VideoTimelineDraft = {
  schemaVersion: 12,
  canvasSize: {
    width: 1920,
    height: 1080,
  },
  tracks: [
    {
      id: 'video-main',
      muted: false,
      name: '视频轨',
      type: 'video',
      zIndex: 0,
    },
  ],
  clips: [
    {
      id: 'clip-video-1',
      type: 'video',
      trackId: 'video-main',
      startUs: 0,
      durationUs: 8_500_000,
      hidden: false,
      zIndex: 0,
      name: 'opening.mp4',
      sourceId: 'video-1',
      src: 'https://cdn.example.com/opening.mp4',
      sourceDurationUs: 8_500_000,
      trimStartUs: 0,
      trimEndUs: 8_500_000,
      speed: 1,
      volume: 1,
      transform: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
    },
  ],
};
```

推荐持久化 `onDraftChange` 返回的草稿，而不是自行拼装复杂工程。这样可以保证倍速时长、轨道顺序、文字自然尺寸和其他不变量与组件一致。

## 9. 导出 API

### 9.1 `createCompositionExportPayload`

组件外可以从草稿生成与“导出 JSON”及 `onExport` 相同的数据：

```ts
function createCompositionExportPayload(
  draft: VideoTimelineDraft,
): CompositionExportPayload;
```

```ts
import {
  createCompositionExportPayload,
  type VideoTimelineDraft,
} from 'easecut-react';

const payload = createCompositionExportPayload(draft);
const json = JSON.stringify(payload, null, 2);
```

函数会验证草稿结构。无效 schema、引用、时间、轨道、布局、字体、倍速或音量会同步抛出 `TypeError` 或 `RangeError`。

### 9.2 `CompositionExportPayload`

```ts
type CompositionExportPayload = {
  Canvas: {
    Width: number;
    Height: number;
  };
  Duration: number;
  Track: CompositionExportClip[][];
};
```

规则：

- `Canvas` 尺寸会取整；
- `Duration` 单位为整数毫秒，包含隐藏的尾段；
- `Track` 与草稿轨道一一对应，按合成层从下到上排列；
- `Track[0]` 是最低层，最后一个 Track 是最高层；
- 空轨道会对应空数组；
- 隐藏 clip 不会出现在任何 Track 中；
- `TargetTime` 是 `[时间线开始毫秒, 时间线结束毫秒]`；
- trim 时间是素材源区间的整数毫秒。

媒体导出元素：

```ts
type CompositionExportTimedMediaClip = {
  Type: 'video' | 'audio';
  Source: string;
  TargetTime: [number, number];
  Extra: Array<
    | CompositionExportTrim
    | CompositionExportSpeed
    | CompositionExportTransform
    | CompositionExportVolume
  >;
};

type CompositionExportImageClip = {
  Type: 'image';
  Source: string;
  TargetTime: [number, number];
  Extra: [CompositionExportTransform];
};

type CompositionExportMediaClip =
  | CompositionExportTimedMediaClip
  | CompositionExportImageClip;

type CompositionExportTrim = {
  Type: 'trim';
  StartTime: number;
  EndTime: number;
};

type CompositionExportSpeed = {
  Type: 'speed';
  Speed: number;
};

type CompositionExportTransform = {
  Type: 'transform';
  PosX: number;
  PosY: number;
  Width: number;
  Height: number;
};

type CompositionExportVolume = {
  Type: 'a_volume';
  Volume: number;
};
```

过滤器顺序具有语义：

- 视频：`trim -> speed -> transform -> a_volume`；
- 音频：`a_volume -> trim -> speed`；
- 图片：唯一的 `transform`，不包含 trim、speed 或音量过滤器；
- 轨道静音时生成的 `a_volume.Volume` 为 `0`，但草稿内 clip 的 `volume` 不变。

文字导出元素：

```ts
type CompositionExportTextClip = {
  Type: 'text';
  TargetTime: [number, number];
  Text: string;
  FontType: TimelineTextFontType;
  FontSize: number;
  FontColor: string;
  Bold?: boolean;
  Italic?: boolean;
  Underline?: boolean;
  Extra: [CompositionExportTransform];
};
```

公开类型把三个样式布尔字段声明为可选，但当前生成函数始终显式输出 `Bold`、`Italic` 和 `Underline`。文字不包含 `Source`、trim、speed 或音量过滤器。
`FontColor` 会被规范化为大写的 `#RRGGBBAA` 字符串。

前述 8.6 节草稿会生成：

```json
{
  "Canvas": {
    "Height": 1080,
    "Width": 1920
  },
  "Duration": 8500,
  "Track": [
    [
      {
        "Extra": [
          {
            "EndTime": 8500,
            "StartTime": 0,
            "Type": "trim"
          },
          {
            "Speed": 1,
            "Type": "speed"
          },
          {
            "Height": 1080,
            "PosX": 0,
            "PosY": 0,
            "Type": "transform",
            "Width": 1920
          },
          {
            "Type": "a_volume",
            "Volume": 1
          }
        ],
        "Source": "https://cdn.example.com/opening.mp4",
        "TargetTime": [0, 8500],
        "Type": "video"
      }
    ]
  ]
}
```

## 10. 时间与帧率工具函数

包公开六个换算函数和 `RationalFrameRate` 类型。

```ts
type RationalFrameRate = Readonly<{
  numerator: number;
  denominator: number;
}>;
```

| 函数 | 输入 | 返回 | 取整行为 |
| --- | --- | --- | --- |
| `secondsToMicroseconds(seconds)` | 非负有限秒数 | 整数微秒 | 四舍五入到最近微秒 |
| `millisecondsToMicroseconds(milliseconds)` | 非负有限毫秒 | 整数微秒 | 四舍五入到最近微秒 |
| `microsecondsToSeconds(timeUs)` | 非负安全整数微秒 | 浮点秒数 | 不取整 |
| `microsecondsToMilliseconds(timeUs)` | 非负安全整数微秒 | 整数毫秒 | 四舍五入到最近毫秒 |
| `frameIndexToTimeUs(frameIndex, frameRate)` | 非负安全整数帧序号、有理帧率 | 该帧起点的整数微秒 | 整数除法向下取整 |
| `timeUsToFrameIndex(timeUs, frameRate)` | 非负安全整数微秒、有理帧率 | 所在帧的整数序号 | 整数除法向下取整 |

示例：

```ts
import {
  frameIndexToTimeUs,
  microsecondsToMilliseconds,
  microsecondsToSeconds,
  millisecondsToMicroseconds,
  secondsToMicroseconds,
  timeUsToFrameIndex,
  type RationalFrameRate,
} from 'easecut-react';

secondsToMicroseconds(1.5); // 1_500_000
millisecondsToMicroseconds(250); // 250_000
microsecondsToSeconds(1_500_000); // 1.5
microsecondsToMilliseconds(1_500_000); // 1500

const ntsc30: RationalFrameRate = {
  numerator: 30_000,
  denominator: 1_001,
};

frameIndexToTimeUs(30, ntsc30); // 1_001_000
timeUsToFrameIndex(1_001_000, ntsc30); // 30
```

错误规则：

- 负数、`NaN` 和无穷值会抛错；
- 微秒时间和帧序号必须是安全整数；
- 帧率的分子、分母必须是正安全整数；
- 超出 JavaScript 安全整数范围会抛出 `RangeError`。

不要使用 `29.97` 代替精确的 `30000/1001` 帧率。

## 11. 全部公共导出清单

### 11.1 运行时值

当前包根入口公开以下运行时值，除此之外的内部组件、store、hook 和常量不属于 npm 公共 API：

```ts
VideoTimelineEditor
createCompositionExportPayload
frameIndexToTimeUs
microsecondsToMilliseconds
microsecondsToSeconds
millisecondsToMicroseconds
secondsToMicroseconds
timeUsToFrameIndex
```

### 11.2 公共类型

组件与回调：

```ts
VideoTimelineEditorProps
VideoTimelineSource
VideoTimelineMediaType
VideoTimelineMediaLoader
VideoTimelineMediaMetadata
VideoTimelineImportRequest
VideoTimelineExportRequest
```

草稿、轨道和片段：

```ts
VideoTimelineDraft
VideoTimelineCanvasSize
VideoTimelineTrack
VideoTimelineTrackDraft
VideoTimelineClip
VideoTimelineClipDraft
VideoTimelineClipTransform
VideoTimelineClipSpeed
VideoTimelineClipVolume
TimelineClipType
TimelineClipPosition
TimelineClipSpeed
TimelineImageClip
TimelineMediaClip
TimelineMediaType
TimelineTimedMediaClip
TimelineTimedMediaType
TimelineTextClip
TimelineTextLayoutSize
TimelineTextFontType
TimelineTextFontPreset
TimelineTrackType
TimelineVisualMediaClip
```

导出数据：

```ts
CompositionExportPayload
CompositionExportCanvas
CompositionExportClip
CompositionExportImageClip
CompositionExportMediaClip
CompositionExportTextClip
CompositionExportTimedMediaClip
CompositionExportTrim
CompositionExportSpeed
CompositionExportTransform
CompositionExportVolume
```

时间：

```ts
RationalFrameRate
```

别名关系：

| 公共类型 | 当前含义 |
| --- | --- |
| `VideoTimelineTrackDraft` | `VideoTimelineTrack` 的别名 |
| `VideoTimelineClipDraft` | `VideoTimelineClip` 的别名 |
| `VideoTimelineClipSpeed` | `number`，有效范围 `0.1..4` |
| `TimelineClipSpeed` | 与 `VideoTimelineClipSpeed` 相同 |
| `VideoTimelineClipVolume` | `number`，有效范围 `0..1` |
| `VideoTimelineMediaType` | `'video' \| 'audio' \| 'image'` |
| `TimelineMediaType` | 与 `VideoTimelineMediaType` 相同 |
| `TimelineTimedMediaType` | `'video' \| 'audio'` |
| `TimelineTrackType` | `'video' \| 'audio' \| 'text'`；图片使用视频轨道 |
| `TimelineClipType` | `'video' \| 'audio' \| 'image' \| 'text'` |
| `TimelineTimedMediaClip` | 视频或音频 clip 的联合类型 |
| `TimelineVisualMediaClip` | 视频或图片 clip 的联合类型 |
| `TimelineMediaClip` | 视频、音频或图片 clip 的联合类型 |
| `VideoTimelineClip` | 媒体或文字 clip 的联合类型 |

## 12. 快捷键与焦点

快捷键只在当前获得焦点的编辑器实例内生效。输入框、文本框、选择器、按钮、链接和可编辑元素不会触发全局编辑快捷键。

| 操作 | Windows/Linux | macOS |
| --- | --- | --- |
| 撤销 | `Ctrl + Z` | `Command + Z` |
| 重做 | `Ctrl + Y` | `Command + Shift + Z` |
| 复制选中片段 | `Ctrl + C` | `Command + C` |
| 粘贴到选中片段右侧 | `Ctrl + V` | `Command + V` |
| 分割选中片段 | `Ctrl + B` | `Command + B` |
| 删除选中片段 | `Backspace` | `Backspace` |
| 后退 0.1 秒 | `Ctrl + Left` | `Command + Left` |
| 前进 0.1 秒 | `Ctrl + Right` | `Command + Right` |
| 播放/暂停 | `Space` | `Space` |
| 缩放时间线 | `Ctrl + Wheel` | `Command + Wheel` |
| 横向移动轨道 | `Shift + Wheel` | `Shift + Wheel` |
| 还原裁剪 | 双击片段 | 双击片段 |
| 等比例缩放视频 | `Shift + 左键拖拽` | `Shift + 左键拖拽` |

多个编辑器实例的 store、播放状态和媒体缓存彼此隔离。用户先点击某个实例，再使用快捷键即可只操作该实例。

## 13. 完整集成示例

下面示例组合了素材增量导入、草稿保存、服务端导出、鉴权媒体和工程切换：

```tsx
import { useCallback, useMemo, useState } from 'react';
import {
  VideoTimelineEditor,
  type VideoTimelineDraft,
  type VideoTimelineExportRequest,
  type VideoTimelineImportRequest,
  type VideoTimelineMediaLoader,
  type VideoTimelineSource,
} from 'easecut-react';
import 'easecut-react/styles.css';

type ProjectEditorProps = {
  projectId: string;
  initialDraft?: VideoTimelineDraft;
  initialSources: VideoTimelineSource[];
  token: string;
  onExit: () => void;
};

const fileNameFromUrl = (url: string) => {
  const segment = new URL(url).pathname.split('/').filter(Boolean).at(-1);
  return segment ? decodeURIComponent(segment) : '在线素材';
};

export function ProjectEditor(props: ProjectEditorProps) {
  return <ProjectEditorInstance key={props.projectId} {...props} />;
}

function ProjectEditorInstance({
  projectId,
  initialDraft,
  initialSources,
  token,
  onExit,
}: ProjectEditorProps) {
  const [sources, setSources] =
    useState<VideoTimelineSource[]>(initialSources);

  const mediaLoader = useMemo<VideoTimelineMediaLoader>(
    () => ({
      async loadBlob(url, { signal }) {
        const response = await fetch(url, {
          signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`媒体加载失败 (${response.status})`);
        }
        return response.blob();
      },
    }),
    [token],
  );

  const handleDraftChange = useCallback(
    (draft: VideoTimelineDraft) => {
      localStorage.setItem(
        `easecut:draft:${projectId}`,
        JSON.stringify(draft),
      );
    },
    [projectId],
  );

  const handleImportMedia = useCallback(
    ({ type, url }: VideoTimelineImportRequest) => {
      setSources((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type,
          fileName: fileNameFromUrl(url),
          src: url,
        },
      ]);
    },
    [],
  );

  const handleExport = useCallback(
    async ({ draft, payload }: VideoTimelineExportRequest) => {
      const response = await fetch(`/api/projects/${projectId}/exports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draft, composition: payload }),
      });
      if (!response.ok) throw new Error('创建导出任务失败');
    },
    [projectId, token],
  );

  return (
    <div className='project-editor-host'>
      <VideoTimelineEditor
        initialDraft={initialDraft}
        jsonFileName={`${projectId}-composition.json`}
        mediaLoader={mediaLoader}
        onClose={onExit}
        onDraftChange={handleDraftChange}
        onExport={handleExport}
        onImportMedia={handleImportMedia}
        sources={sources}
        title='EaseCut 视频工程'
      />
    </div>
  );
}
```

```css
.project-editor-host {
  width: 100%;
  height: 720px;
  min-height: 520px;
}
```

生产项目通常还应在宿主层补充草稿保存失败提示、远程保存请求合并、页面离开确认、导出任务进度和 Blob URL 清理。示例通过外层 `key` 同时重建素材 state 和编辑器实例，确保切换 `projectId` 时不会沿用上一个工程的非受控状态。

## 14. 浏览器、媒体与部署注意事项

### 14.1 CORS 与媒体格式

- 远程媒体必须允许宿主 Origin 读取；
- Canvas 预览、缩略图、波形和导出前处理比单纯 `<video>` 播放需要更严格的 CORS；
- 文件扩展名不能保证浏览器支持容器和编解码器；
- 私有媒体应通过 `mediaLoader` 获取 Blob，不要把短期 token 硬编码到草稿；
- 签名 URL 过期后，可用相同 source `id` 和新的 `src` 重新打开工程。

### 14.2 浏览器能力

- 视频帧预览优先使用 Worker、OffscreenCanvas 和 WebCodecs；
- 音频波形优先在 Worker 中使用 Mediabunny，必要时回退到 `AudioContext.decodeAudioData()`；
- 倍速音调补偿优先使用 AudioWorklet 和 SoundTouch，不支持时回退到媒体元素 `preservesPitch`；
- 视频播放优先使用 `requestVideoFrameCallback`；
- 慢放会延长现有帧，不做光流插帧；
- 字体自然尺寸依赖浏览器 Font Loading 和 Canvas 文字测量能力；
- 全屏预览依赖 `Element.requestFullscreen()`。

### 14.3 资源生命周期

每个编辑器实例拥有自己的媒体运行时：

- 缓存 Blob、元数据、内部 Object URL、波形和帧预览；
- source 更新不会无条件清空整个缓存；
- `mediaLoader` 引用变化会重建运行时；
- 卸载时取消任务、终止 Worker 并释放内部 Object URL；
- 宿主自己创建的 URL、上传任务和持久化资源仍由宿主管理。

### 14.4 SSR

当前组件面向浏览器，不支持 SSR。使用 Next.js 等框架时，应把包含 `VideoTimelineEditor` 的模块作为客户端组件并关闭该组件的服务端渲染；具体方式取决于宿主框架版本。

## 15. 当前未公开的能力

以下实现存在于组件内部，但没有从 npm 根入口公开，不应通过深层路径调用：

- Zustand store 和内部 actions；
- 时间线控制器、Pointer 手势和布局函数；
- 媒体 runtime、缓存 hook 和 Worker 协议；
- Inspector 子组件和通用 UI 子组件；
- 字体预设常量；
- 轨道/片段编辑命令；
- 播放头、选中状态、缩放比例等内部状态；
- MP4/WebM 编码或最终渲染函数。

如果宿主需要命令式控制、受控草稿、播放状态订阅、自定义工具栏或内部编辑命令，应先将其设计为明确、稳定的公共 API，再从 `easecut-react` 根入口显式导出；不要依赖包内文件路径。

## 16. 升级检查清单

升级 `easecut-react` 前建议确认：

1. React peer dependency 是否仍与宿主一致；
2. `VideoTimelineDraft.schemaVersion` 是否变化；
3. 草稿、clip 和 export payload 字段是否变化；
4. 字体 `fontType` 是否变化；
5. `onExport` 的后端渲染语义是否仍匹配过滤器顺序；
6. 构建工具是否能处理 ESM、Worker 和随包字体/AudioWorklet 资源；
7. 目标浏览器是否支持项目需要的预览与音频能力；
8. 是否仍只从包根入口和 `styles.css` 导入。
