<p align="center">
  <img src="https://i.postimg.cc/Zq8fXr1D/Logo.png" width="160">
</p>

<h1 align="center">EaseCut</h1>

<p align="center">
  <a href="https://underhear.github.io/EaseCut/"><img src="https://img.shields.io/badge/演示地址-https://underhear.github.io/EaseCut/-01ab85" alt="在线演示"></a>
</p>
<p align="center">
  <a href="https://github.com/UnderHear/EaseCut"><img src="https://img.shields.io/badge/Github-https://github.com/UnderHear/EaseCut-6543ae" alt="项目地址"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/easecut-react"><img src="https://img.shields.io/npm/v/easecut-react?label=npm" alt="npm 版本"></a>
  <img src="https://img.shields.io/badge/license-MIT-22c55e" alt="MIT License">
</p>

<p align="center">
一个 React 视频编辑器，能够快速接入到任何项目中，支持npm导入。
</p>
<p align="center">
具备进行快速视频编辑的完备功能。
</p>

## 效果图 

[underhear.github.io/EaseCut/](underhear.github.io/EaseCut/)

<table>
  <tr>
    <td><img src="https://i.postimg.cc/PxR8yqt2/image.png" alt="效果图 1"></td>
    <td><img src="https://i.postimg.cc/gJC3d0fb/image.png" alt="效果图 2"></td>
  </tr>
  <tr>
    <td><img src="https://i.postimg.cc/Y0BLZsWB/image.png" alt="效果图 3"></td>
    <td><img src="https://i.postimg.cc/RhYyvwvN/image.png" alt="效果图 4"></td>
  </tr>
</table>

## 快速开始

随着AI生成视频的需求越来越大，视频编辑器的重要性日益体现，适合中小型开发团队或个人开发者的...

废话到此为止！让我们快速开始！

```bash
npm i easecut-react
```

`home.tsx`

```tsx
import { EaseCut } from "easecut-react";
import "easecut-react/styles.css";

export function App() {
  return <EaseCut />;
}
```

好了。

## 导入素材 & 导出视频 & 关闭编辑器

### 导入素材

```tsx
import { useRef } from "react";
import { EaseCut, type EaseCutHandle } from "easecut-react";
import "easecut-react/styles.css";

export function App() {
  const editorRef = useRef<EaseCutHandle>(null);

  return (
    <>
      <button 
        onClick={() => 
          void editorRef.current?.source.add("/video.mp4")
        }>
        导入素材
      </button>
      <EaseCut ref={editorRef} />
    </>
  );
}
```

### 导出视频

```tsx
import { EaseCut } from "easecut-react";
import "easecut-react/styles.css";

export function App() {
  return (
    <EaseCut
      onExport={async ({ payload }) => {
        await fetch("/api/export", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }}
    />
  );
}
```

`EaseCut` 不直接编码视频，`onExport` 用于将导出数据交给后端渲染。

### 关闭编辑器

```tsx
import { useState } from "react";
import { EaseCut } from "easecut-react";
import "easecut-react/styles.css";

export function App() {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return <EaseCut onClose={() => setOpen(false)} />;
}
```

## 重要

实在懒得写README了，还有好多操作API没列出来，功能还是比较全面的，很多东西都考虑到了，如果有疑惑的话请通过以下方式解决：
- 问你的AI，它知道怎么做
- EaseCut\docs\npm-component-usage.md 有较为详细的使用说明
- 如果确实是EaseCut没做好，请提交Issues
- 发送邮件至2533643340@qq.com

**官方文档在制作路上...**

**也欢迎任何人进行贡献**

## 许可证

基于 MIT 许可证发布。
