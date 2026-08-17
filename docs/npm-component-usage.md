# EaseCut React npm 组件使用说明

本文面向通过 npm 安装并嵌入 EaseCut React 的 React 应用开发者，描述当前包入口公开的组件、实例 API、Props、数据结构和浏览器要求。

> 当前仓库中的包名是 `easecut`，版本为 `0.1.0`，但 `package.json` 仍设置了 `private: true`。以下安装方式适用于正式发布之后；发布前可通过 workspace 或本地包路径使用相同 API。

## 1. 安装与导入

环境要求：

- React `>=19.0.0 <20.0.0`；
- React DOM `>=19.0.0 <20.0.0`；
- Node.js `^20.19.0` 或 `>=22.12.0`；
- 现代桌面浏览器和 ESM 构建环境。

```bash
npm install easecut react@^19 react-dom@^19
```

组件逻辑和样式分别从包根入口与样式子路径导入：

```tsx
import { EaseCut } from 'easecut';
import 'easecut/styles.css';
```

不要从 `easecut/dist/...` 或包内的 `editor/...` 路径深层导入。

## 2. 最小使用示例

`EaseCut` 不要求传入任何 Prop。下面就是完整的最小 TSX 示例：

```tsx
import { EaseCut } from 'easecut';
import 'easecut/styles.css';

export function EditorPage() {
  return (
    <div style={{ height: 720 }}>
      <EaseCut />
    </div>
  );
}
```

必须导入 `easecut/styles.css`。编辑器根节点使用 `width: 100%`、`height: 100%`，并具有 `520px` 的默认最小高度，因此宿主容器应提供明确高度。

编辑器会创建空工程。之后使用实例 API 添加素材和片段，不需要维护 React `sources` state。

## 3. 实例 API

使用 React `ref` 获取当前编辑器实例。每个编辑器实例都有独立的 source、clip、时间线和媒体缓存，不会读写全局状态。

```tsx
import { useRef } from 'react';
import {
  EaseCut,
  type EaseCutHandle,
} from 'easecut';
import 'easecut/styles.css';

export function EditorPage() {
  const editorRef = useRef<EaseCutHandle>(null);

  const editProject = async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const source = await editor.source.add(
      'https://cdn.example.com/opening.mp4',
    );
    const clip = await editor.clip.add({ sourceId: source.id });

    await editor.source.update(source.id, {
      src: 'https://cdn.example.com/opening-v2.mp4',
    });
    await editor.clip.update(clip.id, { volume: 0.8 });

    const currentSource = editor.source.get(source.id);
    const currentClip = editor.clip.get(clip.id);

    editor.clip.remove(clip.id);
    editor.source.remove(source.id);

    console.log(currentSource, currentClip);
  };

  return (
    <div style={{ height: 720 }}>
      <EaseCut ref={editorRef} />
    </div>
  );
}
```

`ref.current` 在组件挂载后可用，卸载后恢复为 `null`。实例方法返回的数据都是快照；直接修改返回对象不会改动编辑器状态。

### 3.1 Source CRUD

#### 新增

只提供 URL 时，组件会根据文件后缀推断媒体类型、文件名和 source ID，并在注册前读取缺失的元数据：

```ts
const source = await editor.source.add(
  'https://cdn.example.com/opening.mp4',
);
```

也可以显式提供字段。完整元数据存在时不需要再次探测：

```ts
const source = await editor.source.add({
  id: 'opening',
  type: 'video',
  fileName: 'opening.mp4',
  src: 'https://cdn.example.com/opening.mp4',
  durationUs: 8_500_000,
  width: 1920,
  height: 1080,
});
```

`source.add()` 只注册素材，不会自动创建时间线片段。同一个 source 可以创建多个 clip：

```ts
const firstClip = await editor.clip.add({ sourceId: source.id });
const secondClip = await editor.clip.add({
  sourceId: source.id,
  startUs: 10_000_000,
});
```

#### 查询

```ts
const source = editor.source.get('opening');
```

不存在时返回 `undefined`。

#### 更新

```ts
const source = await editor.source.update('opening', {
  fileName: 'opening-v2.mp4',
  src: 'https://cdn.example.com/opening-v2.mp4',
});
```

更新 source 会同步刷新所有引用它的 clip 的文件名、URL、波形 URL和可补充元数据。`id` 和 `type` 不可修改。

修改 `src` 时，旧 URL 的时长和尺寸不会被错误复用；如果没有同时提供新的完整元数据，组件会重新读取。

#### 删除

```ts
editor.source.remove('opening');
```

如果 source 仍被任何 clip 引用，会抛出 `SOURCE_IN_USE`。应先删除相关 clip，再删除 source，避免产生悬空引用。

删除成功后，撤销/重做历史和复制缓冲区中对该 source 的 clip 引用也会被丢弃，后续操作不会恢复悬空片段。

### 3.2 Clip CRUD

#### 新增媒体片段

```ts
const clip = await editor.clip.add({
  sourceId: 'opening',
});
```

可选字段：

```ts
const clip = await editor.clip.add({
  sourceId: 'opening',
  startUs: 3_000_000,
  trackId: 'video-main',
});
```

- `sourceId` 必须指向当前实例中已注册的 source；
- 省略 `startUs` 时使用当前播放头时间；
- 省略 `trackId` 时自动选择兼容轨道，必要时创建新轨道；
- 主视频轨会保持连续布局，因此实际起点可能受主轨排布规则调整；
- 图片省略 `durationUs` 时默认展示 5 秒。

#### 新增文字片段

```ts
const clip = await editor.clip.add({
  type: 'text',
  text: '宣传片标题',
});
```

组件会测量文字自然尺寸，在当前播放头创建默认 5 秒的文字片段，并自动选择文字轨。

#### 查询

```ts
const clip = editor.clip.get('clip-opening');
```

不存在时返回 `undefined`。

#### 更新

媒体片段示例：

```ts
await editor.clip.update('clip-opening', {
  hidden: false,
  speed: 1.25,
  volume: 0.8,
  trimStartUs: 500_000,
  trimEndUs: 7_500_000,
});
```

文字片段示例：

```ts
await editor.clip.update('text-clip-1', {
  text: '更新后的标题',
  fontColor: '#FFCC00FF',
  fontSize: 96,
  bold: true,
  endUs: 8_000_000,
});
```

支持的更新字段：

| 字段 | 适用片段 | 说明 |
| --- | --- | --- |
| `startUs`、`endUs`、`trackId`、`hidden` | 全部 | 时间、轨道和可见性 |
| `transform` | 视频、图片 | 画布位置与尺寸 |
| `speed`、`volume`、`trimStartUs`、`trimEndUs` | 视频、音频 | 倍速、音量与源区间 |
| `text`、`fontType`、`fontSize`、`fontColor` | 文字 | 内容与字体 |
| `bold`、`italic`、`underline`、`position` | 文字 | 字体样式与画布位置 |

更新文字内容、字体、字号、粗体或斜体时，组件会重新测量自然尺寸。不能通过 `clip.update()` 更换 `sourceId` 或 clip 类型；需要更换素材时应删除旧 clip 并创建新 clip。

#### 删除

```ts
editor.clip.remove('clip-opening');
```

删除 source 不会自动删除 clip，删除 clip 也不会自动删除 source。

### 3.3 错误处理

实例 API 的领域错误使用 `EaseCutApiError`：

```ts
import { EaseCutApiError } from 'easecut';

try {
  editor.source.remove('opening');
} catch (error) {
  if (error instanceof EaseCutApiError) {
    console.error(error.code, error.message);
  }
}
```

错误码：

```ts
type EaseCutApiErrorCode =
  | 'CLIP_INVALID'
  | 'CLIP_NOT_FOUND'
  | 'SOURCE_ALREADY_EXISTS'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_IN_USE'
  | 'SOURCE_INVALID'
  | 'SOURCE_NOT_FOUND';
```

`SOURCE_CONFLICT` 表示异步更新期间同一 source 已被更新、删除或用相同 ID 重新创建；重新读取最新 source 后再决定是否重试。

## 4. `EaseCut` Props

```ts
type EaseCutTheme = 'light' | 'dark';

type EaseCutProps = {
  initialDraft?: VideoTimelineDraft;
  title?: string;
  theme?: EaseCutTheme;
  className?: string;
  style?: React.CSSProperties;
  jsonFileName?: string;
  mediaLoader?: EaseCutMediaLoader;
  onSourcesChange?: (sources: VideoTimelineSource[]) => void;
  onDraftChange?: (draft: VideoTimelineDraft) => void;
  onExport?: (
    request: EaseCutExportRequest,
  ) => void | Promise<void>;
  onClose?: () => void;
};
```

| Prop | 默认值 | 作用 |
| --- | --- | --- |
| `initialDraft` | 新工程 | 仅在实例创建时读取的项目草稿 |
| `title` | `'EaseCut'` | 标题栏文字和根区域可访问名称 |
| `theme` | `'dark'` | 编辑器主题，可设为 `'light'` 或 `'dark'` |
| `className` | `''` | 追加到根节点 `ec-editor` 的类名 |
| `style` | 无 | 编辑器根节点内联样式 |
| `jsonFileName` | `'video-composition.json'` | “导出”菜单中“导出 JSON”的下载文件名 |
| `mediaLoader` | 默认浏览器加载 | 自定义 Blob 和元数据加载方式 |
| `onSourcesChange` | 无 | 实例 source 列表增删改后接收最新快照 |
| `onDraftChange` | 无 | 可持久化项目内容发生变化后接收最新草稿 |
| `onExport` | 无 | 提供后启用“导出”菜单中的“导出到本地”回调 |
| `onClose` | 无 | 提供后显示关闭按钮 |

`initialDraft` 是挂载时初始值，组件不会观察它的后续变化。切换项目草稿时应更换 React `key`：

```tsx
<EaseCut
  key={projectId}
  initialDraft={projectDraft}
/>
```

`theme` 是受控属性，更新它会立即切换根节点和浮层主题：

```tsx
<EaseCut theme='light' />
```

后续 source/clip 变更使用实例 API。项目所需的素材也通过 source API 注册，再通过 clip API 放入时间线。

`onSourcesChange` 初次挂载时不会调用；source 通过实例 API 增加、更新或删除后调用。

`onDraftChange` 初次挂载时不会调用，也不会因播放时间、缩放、滚动、选择或拖动预览等瞬态状态调用。

## 5. 媒体源

```ts
type VideoTimelineSource =
  | {
      id: string;
      type: 'video' | 'audio';
      fileName: string;
      src: string;
      durationUs?: number;
      waveformSrc?: string;
      width?: number;
      height?: number;
    }
  | {
      id: string;
      type: 'image';
      fileName: string;
      src: string;
      durationUs?: number;
      width?: number;
      height?: number;
    };
```

- 视频建议提供 `durationUs`、`width`、`height`；
- 音频建议提供 `durationUs`；
- 图片建议提供 `width`、`height`；
- 缺失字段由 `mediaLoader.loadMetadata` 或浏览器媒体能力补齐；
- 时间统一使用整数微秒；
- 图片只支持 PNG、JPEG 和 JPG，并会校验实际文件签名。

只提供字符串 URL 时支持以下后缀推断：

- 视频：`3g2`、`3gp`、`avi`、`m2ts`、`m4v`、`mkv`、`mov`、`mp4`、`mpeg`、`mpg`、`m3u8`、`ogv`、`ts`、`webm`；
- 音频：`aac`、`aif`、`aiff`、`flac`、`m4a`、`mp3`、`oga`、`ogg`、`opus`、`wav`、`weba`、`wma`；
- 图片：`jpeg`、`jpg`、`png`。

URL 没有可识别后缀时，使用对象形式显式提供 `type`。

## 6. 私有媒体加载

默认加载器执行不带 token、cookie 或自定义 header 的 `fetch`。私有媒体可以注入稳定的 `mediaLoader` 对象：

```tsx
const mediaLoader = useMemo<EaseCutMediaLoader>(
  () => ({
    async loadBlob(url, { signal }) {
      const response = await fetch(url, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('媒体加载失败');
      return response.blob();
    },
  }),
  [token],
);

<EaseCut mediaLoader={mediaLoader} />;
```

```ts
interface EaseCutMediaLoader {
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
  ): Promise<EaseCutMediaMetadata | null>;
}
```

同一编辑器实例会复用 Blob、Object URL、波形、帧预览和元数据缓存；卸载时会中止未完成请求并释放资源。不同实例不共享缓存。

## 7. 草稿与导出

`initialDraft` 和 `onDraftChange` 使用 `VideoTimelineDraft`。当前草稿只接受 `schemaVersion: 12`：

```ts
type VideoTimelineDraft = {
  schemaVersion: 12;
  canvasSize: { width: number; height: number };
  tracks: VideoTimelineTrack[];
  clips: VideoTimelineClip[];
};
```

组件自身不编码 MP4。传入 `onExport` 后，回调收到当前草稿和标准化导出数据：

```tsx
<EaseCut
  onExport={async ({ draft, payload }) => {
    await submitRenderTask({ draft, payload });
  }}
/>
```

也可以在组件外从草稿创建导出数据：

```ts
import { createCompositionExportPayload } from 'easecut';

const payload = createCompositionExportPayload(draft);
```

## 8. 时间工具

包根入口公开以下换算函数：

```ts
secondsToMicroseconds(seconds)
millisecondsToMicroseconds(milliseconds)
microsecondsToSeconds(timeUs)
microsecondsToMilliseconds(timeUs)
frameIndexToTimeUs(frameIndex, frameRate)
timeUsToFrameIndex(timeUs, frameRate)
```

帧率使用有理数：

```ts
type RationalFrameRate = {
  numerator: number;
  denominator: number;
};
```

## 9. 快捷键与实例隔离

快捷键只操作当前获得焦点的编辑器实例：

| 操作 | Windows/Linux | macOS |
| --- | --- | --- |
| 撤销 | `Ctrl + Z` | `Command + Z` |
| 重做 | `Ctrl + Y` | `Command + Shift + Z` |
| 复制/粘贴 | `Ctrl + C` / `Ctrl + V` | `Command + C` / `Command + V` |
| 分割 | `Ctrl + B` | `Command + B` |
| 删除 | `Backspace` | `Backspace` |
| 前后移动 0.1 秒 | `Ctrl + Left/Right` | `Command + Left/Right` |
| 播放/暂停 | `Space` | `Space` |

source API、clip API、草稿历史、播放状态和媒体缓存均为实例级状态。两个编辑器可以使用相同 source ID，不会互相覆盖。

## 10. 公共 API 清单

实例 API：

```ts
EaseCutHandle
EaseCutSourceApi
EaseCutSourceInput
EaseCutSourcePatch
EaseCutClipApi
EaseCutClipInput
EaseCutMediaClipInput
EaseCutTextClipInput
EaseCutClipPatch
EaseCutApiError
EaseCutApiErrorCode
```

组件、素材和回调：

```ts
EaseCut
EaseCutProps
EaseCutTheme
VideoTimelineSource
VideoTimelineMediaType
EaseCutMediaLoader
EaseCutMediaMetadata
EaseCutExportRequest
```

草稿、轨道、片段、导出 payload 和时间函数的公共类型继续从 `easecut` 包根入口导出。内部 store、Context、Hook 和 `src/editor/api/` 的内部处理函数不属于公共入口，不应深层导入。

## 11. 浏览器与部署注意事项

- 远程媒体必须允许宿主 Origin 读取；
- Canvas、缩略图、波形和导出前处理通常需要比 `<video>` 播放更严格的 CORS；
- 文件扩展名不能保证浏览器支持对应容器和编解码器；
- 私有媒体应通过 `mediaLoader` 获取 Blob；
- 组件依赖 DOM、Canvas、媒体元素和浏览器 Worker，不支持 SSR 直接渲染；Next.js 等环境应只在客户端加载；
- 当前面向桌面鼠标和键盘编辑，不保证移动端触控剪辑体验。
