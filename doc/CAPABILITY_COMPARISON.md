# Markdown-Next-AI 现有能力对照表

## 1. 概述
本表格对比了 Markdown-Next-AI 中现有的 AI 弹窗实现 (`AtTriggerPopup`) 与目标 Quick Ask 风格实现 (`QuickAskOverlay` / `QuickAskPanel`) 的功能差异。

## 2. 组件/服务对照

| 功能模块 | 现有实现 (`AtTriggerPopup.ts`) | 目标实现 (`QuickAskOverlay.tsx` / `Panel.tsx`) | 兼容性/差异评估 |
| :--- | :--- | :--- | :--- |
| **技术栈** | 原生 DOM 操作 (Vanilla JS) | React 函数组件 + Hooks | **完全不同**，需重构 |
| **挂载方式** | `document.createElement` + 拼接 | `ReactDOM.createRoot` | React 方式更易管理状态 |
| **拖拽移动** | 内部实现 `mousedown` 监听 | `QuickAskOverlay` 内部实现 | 逻辑类似，可复用算法 |
| **大小缩放** | 内部实现 Resize 手柄监听 | React 结构中包含手柄 div，逻辑待完善 | UI 已就绪，逻辑需确认 |
| **流式消息** | 手动追加 `innerHTML` | `useState` 更新消息数组 | React 方式渲染性能更好 |
| **自动滚动** | 手动计算 `scrollTop` | `getAutoScrollHandlers` Hook | Quick Ask 逻辑更健壮 |

## 3. 详细功能差异表

| 功能点 | AtTriggerPopup (现有) | Quick Ask (目标) | 缺口 / 兼容性风险 |
| :--- | :--- | :--- | :--- |
| **@ 文件引用** | ✅ 支持 (InputContextSelector) | ❌ **不支持** | **高风险**：需将 ContextSelector 移植为 React 组件 |
| **# 标题引用** | ✅ 支持 | ❌ **不支持** | **高风险**：同上 |
| **+ 文本引用** | ✅ 支持 | ❌ **不支持** | **高风险**：同上 |
| **/ 命令提示** | ✅ 支持 (PromptSelectorPopup) | ❌ **不支持** | **中风险**：需移植为 React 组件 |
| **图片上传** | ✅ 支持 (拖拽/粘贴/按钮) | ❌ **仅预留参数** | 需在 Panel 中实现上传 UI 和逻辑 |
| **模型切换** | ✅ 下拉框选择 | ⚠️ 仅显示名称 | 需将纯文本显示改为下拉菜单或点击切换 |
| **选中文本预览**| ✅ 有独立区域显示 | ❌ 未见显式 UI | 需在 Panel 中添加选中文本预览区域 |
| **Markdown渲染**| ⚠️ 基础文本显示 | ⚠️ 基础文本显示 | 两者目前都可能缺乏完整的 Markdown 渲染 (如代码高亮) |
| **上下文管理** | ✅ 维护 `SelectedContext` 对象 | ❌ 依赖外部传入 | 需在 React 状态中管理选中的上下文文件 |

## 4. 接口与数据流对照

### 4.1 输入数据
- **AtTriggerPopup**: 直接读取 `contentEditable` div 的内容，解析 HTML 标签（用于 @ 引用）。
- **QuickAskPanel**: 使用 `textarea` 和 `value` 状态。
- **冲突**: `textarea` 无法直接渲染高亮的 @ 标签。
- **解决方案**: Quick Ask 需要改用 `contentEditable` div 或者基于 `prosemirror`/`codemirror` 的输入框，才能完美复刻 @ 引用的体验。如果降级为纯文本 `textarea`，则只能使用纯文本的 `[[link]]` 语法，体验会下降。

### 4.2 输出调用
- **AtTriggerPopup**: `this.onSubmit(prompt, images, modelId, context, ...)`
- **QuickAskOverlay**: `this.onSubmit(prompt, images, modelId, ...)`
- **兼容性**: 接口签名基本一致，`QuickAskOverlay` 的构造函数已经适配了 `onSubmit` 回调，这部分集成难度较低。

## 5. 结论
现有 `AtTriggerPopup` 功能完备但实现陈旧（原生 DOM）；Quick Ask UI 现代但功能缺失严重（缺乏上下文选择、命令提示、富文本输入）。直接替换会导致严重的**功能倒退**，必须先补充缺失的功能模块。
