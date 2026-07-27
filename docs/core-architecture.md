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

`core/model.ts` 定义可序列化领域模型；`core/composition.ts` 校验项目不变量，
并提供预览、时间线和导出共享的片段激活与排序语义；
`core/timeline-commands.ts` 实现移动、裁剪、分割、复制等确定性编辑命令。
这些模块不依赖 React、Zustand、DOM 或浏览器全局对象。

store 只保存权威项目状态、编辑会话状态和撤销历史。一次命令要么返回完整
新状态并形成一个历史项，要么保持原状态不变。素材刷新不再重写所有撤销和
重做快照；旧 schema、迁移适配器和双套字段均不保留。

预览不是架构中心。预览与导出都消费 `composition` 的同一份时间、轨道顺序、
裁剪和变换语义；媒体元素、对象 URL、解码缓存及播放生命周期仍属于
`media/` 和 UI 运行时。
