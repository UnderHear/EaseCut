# 核心架构

编辑器以项目草稿为唯一权威文档。持久化时间全部使用整数微秒，
帧率使用 `{ numerator, denominator }` 有理数；浏览器媒体 API 的浮点秒
只在 `core/time.ts` 定义的边界进行换算。

依赖方向固定为：

```text
components / timeline / media
              ↓
            store
              ↓
             core
```

`core/model.ts` 定义可序列化领域模型；`core/clip-speed.ts` 集中处理
`0.1` 至 `4` 的固定倍速、源时间与时间线时间换算以及整数微秒取整；
`core/composition.ts` 校验项目不变量，
并提供预览、时间线和导出共享的片段激活与排序语义；
`core/timeline-commands.ts` 实现移动、裁剪、分割、复制等确定性编辑命令。
这些模块不依赖 React、Zustand、DOM 或浏览器全局对象。

store 只保存权威项目状态、编辑会话状态和撤销历史。一次命令要么返回完整
新状态并形成一个历史项，要么保持原状态不变。素材刷新不再重写所有撤销和
重做快照；旧 schema、迁移适配器和双套字段均不保留。

轨道数组是唯一的层级顺序，按合成层从下到上保存，`zIndex` 始终等于数组下标。
类型分组固定为 `[音频…, 视频…, 文字…]`，主视频位于视频组底部；时间线布局
反向遍历轨道数组，使最高层显示在顶部。预览合成和导出均按原数组顺序消费，
因此高索引视觉轨道最后绘制并覆盖低索引轨道。

预览不是架构中心。预览与导出都消费 `composition` 的同一份时间、轨道顺序、
裁剪、倍速和变换语义；媒体元素、对象 URL、解码缓存及播放生命周期仍属于
`media/` 和 UI 运行时。

播放中的媒体元素保持稳定，只在进入 clip、暂停定位或显式跳转时同步源时间，
不跟随时间线的每次动画帧更新反复调用 `play()` 或 seek。视频 Canvas 优先响应
`requestVideoFrameCallback`，并为每条轨道有界预热五秒内的下一个 clip。
音视频原声通过 `media/preview-audio-engine.ts` 进入同一个 AudioContext；
非原速播放由 SoundTouch AudioWorklet 补偿音调，原速走不经 time-stretch 的直通
节点。AudioWorklet 不可用时明确降级到媒体元素 `preservesPitch`。该预览管线
不进行视频光流插帧。

倍速在裁剪后执行。片段时长通过分别缩放裁剪起止端点后相减得到，使同倍速
片段在任意源时间分割后仍保持整数微秒时长严格可加；预览 seek、时间线缩略图、
音频波形和导出 `SpeedFilter` 使用同一映射。
