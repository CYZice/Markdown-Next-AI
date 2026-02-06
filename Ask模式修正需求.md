# Ask 模式修正需求文档

## 1. 背景
需修正 Markdown-Next-AI 的 Ask 模式，使其对标 `obsidian-yolo` 插件的 `quickAskController.ts` 实现。主要目标是统一触发机制、上下文获取逻辑以及 UI 的挂载与生命周期管理。

## 2. 核心变更点

### 2.1 触发机制 (Trigger Mechanism)
*   **现状**：目前在 `main.ts` 中通过全局 `keydown` 事件监听 `@` 或 `/` 键，并通过 `showAtTriggerModal` 手动计算位置触发。
*   **目标 (对标 Yolo)**：
    *   使用 CodeMirror 的 `EditorView.domEventHandlers` 监听 `beforeinput` 事件。
    *   **触发条件**：
        *   用户输入 `@` (或配置的触发符)。
        *   当前选区为空 (`selection.empty`)。
        *   光标位于空行或行首 (检查 `lineTextBeforeCursor`)。
    *   **行为**：
        *   阻止默认输入 (`preventDefault`, `stopPropagation`)。
        *   若已有部分触发符输入（如多字符触发符），需删除已输入的文本。
        *   调用 `Controller.show()` 方法唤起 UI。

### 2.2 上下文获取 (Context Construction)
*   **现状**：`main.ts` 中 `handleContinueWriting` 可能使用选中文本或全文。
*   **目标 (对标 Yolo)**：
    *   在 `Controller.show()` 中构建上下文。
    *   **范围**：光标前 5000 字符 (`DEFAULT_QUICK_ASK_CONTEXT_BEFORE_CHARS`) + 光标后 2000 字符 (`DEFAULT_QUICK_ASK_CONTEXT_AFTER_CHARS`)。
    *   **标记**：在光标位置插入 `<<CURSOR>>` 标记。
    *   **数据结构**：构建包含 `contextText` 和 `fileTitle` 的对象传递给 UI。

### 2.3 UI 挂载与生命周期 (UI Mounting & Lifecycle)
*   **现状**：`AtTriggerPopup` 直接追加到 `document.body`，位置由绝对坐标控制。
*   **目标 (对标 Yolo)**：
    *   引入 `QuickAskController` 类管理状态。
    *   使用 CodeMirror 的 `StateEffect` (`quickAskWidgetEffect`) 和 `ViewPlugin` (`quickAskOverlayPlugin`) 管理 UI 实例。
    *   **挂载方式**：通过 `ViewPlugin` 监听 `StateEffect`，在编辑器视图更新时挂载或销毁 `QuickAskOverlay`（或适配现有的 `AtTriggerPopup`）。
    *   **位置更新**：利用 `ViewPlugin` 的 `update` 方法，在文档变更时自动更新 UI 位置 (`updatePosition`)。
    *   **关闭逻辑**：提供 `close(restoreFocus)` 方法，支持关闭动画和焦点还原。

### 2.4 模块化架构
*   新建 `src/features/quick-ask/` 目录。
*   创建 `QuickAskController.ts`：负责触发监听、上下文构建、状态管理。
*   **[新增] UI 迁移**：
    *   将 `obsidian-yolo` 的 `QuickAskPanel.tsx` (React 组件) 移植到 Markdown-Next-AI。
    *   废弃原有的 `AtTriggerPopup` (Vanilla JS)，改用 React 组件渲染完整的对话界面。
    *   实现流式对话状态管理 (`useChatHistory`, `useApp` 等 Context 的适配)。

## 3. 详细需求规范

### 3.1 QuickAskController 类
*   **依赖**：`plugin`, `getSettings`, `getActiveMarkdownView` 等。
*   **方法**：
    *   `createTriggerExtension()`: 返回 CodeMirror 扩展（包含 ViewPlugin 和事件处理器）。
    *   `show(editor, view)`: 计算上下文，分发 `quickAskWidgetEffect` 打开 UI。
    *   `close(restoreFocus)`: 分发关闭 Effect，处理焦点恢复。

### 3.2 ViewPlugin (Overlay Plugin)
*   监听 `quickAskWidgetEffect`。
*   当 payload 存在时，实例化 UI 组件并调用 `mount(pos)`。
*   当 payload 为 null 时，调用 UI 组件的 `destroy()`。
*   监听 `docChanged`，更新 UI 位置。

### 3.3 UI 组件 (QuickAskPanel)
*   **核心功能**：
    *   **多轮对话**：在弹层内维护聊天记录 (`chatMessages`)，支持流式输出。
    *   **模式切换**：集成现有的 `ModeSelect` 组件。
    *   **操作集成**：
        *   Ask 模式：纯对话。
        *   Edit 模式：生成 Diff 并提供 Apply/Reject 按钮 (或跳转 Apply View)。
        *   Direct 模式：直接应用修改。
*   **适配工作**：
    *   替换 Yolo 特有的 Context/Hooks (如 `useRAG`, `useMcp`) 为 Markdown-Next-AI 的服务调用。
    *   确保样式 (`QuickAskPanel.css`) 与当前插件主题变量 (`mn-*`) 兼容。

### 3.4 上下文数据
*   传递给 UI 的 `options` 需包含：
    *   `contextText`: `before + "<<CURSOR>>" + after`
    *   `fileTitle`: 当前文件名
    *   `editor`: Obsidian Editor 实例
    *   `view`: CodeMirror EditorView 实例
    *   `onClose`: 关闭回调

## 4. 执行计划
1.  创建 `src/features/quick-ask/quickAskController.ts`。
2.  实现 `StateEffect` 和 `ViewPlugin` 逻辑。
3.  迁移 `AtTriggerPopup` (或新建适配器) 以支持作为 Overlay 挂载。
4.  在 `main.ts` 中注册 `QuickAskController` 的扩展，替代旧的 `keydown` 监听。
