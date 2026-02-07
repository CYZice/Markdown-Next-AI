# Ask 模式修正需求文档 (Refined)

## 1. 背景
需修正 Markdown-Next-AI 的 Ask 模式，将其打造为**纯对话模式 (Pure Conversation Mode)**。
在此模式下，用户可以与 AI 进行连续对话，而不是一次性的问答。用户应能方便地复制 AI 的回复或将其插入到文档中。
**技术约束**：必须基于当前的 `AtTriggerPopup` (Vanilla JS) 实现，**严禁引入 React 或其他重型框架**来构建聊天界面。

## 2. 核心目标
1.  **纯对话体验**：Ask 模式下，UI 展示对话历史，支持多轮交互。
2.  **流式响应**：AI 回复实时流式渲染。
3.  **操作便捷**：AI 回复气泡需提供“复制”和“插入”按钮。
4.  **架构对齐**：底层触发与挂载逻辑对齐 `obsidian-yolo` (使用 CodeMirror ViewPlugin)，但 UI 实现保持原生 DOM 操作。

## 3. 详细需求

### 3.1 触发机制 (Trigger Mechanism)
*   保持原计划，使用 CodeMirror 的 `EditorView.domEventHandlers` 监听 `beforeinput` 事件。
*   **触发条件**：
    *   用户输入 `@` (或配置符)。
    *   选区为空且光标位于行首或空行。
*   **行为**：阻止默认输入，调用 `QuickAskController.show('ask')`。

### 3.2 QuickAskController & ViewPlugin
*   **职责**：负责 UI 的挂载、销毁和位置更新。
*   **挂载**：通过 `StateEffect` 驱动 `ViewPlugin`，将 `AtTriggerPopup` 挂载为 Overlay。
*   **位置**：随文档内容变更自动更新位置 (Overlay Positioning)。

### 3.3 UI 改造 (AtTriggerPopup.ts)
基于现有的 `AtTriggerPopup` 类进行扩展，**完全使用 Vanilla JS**。

#### A. DOM 结构变更
*   在 `ask` 模式下，在输入框上方动态插入一个 `.markdown-next-ai-chat-history` 容器。
*   该容器默认隐藏，仅在 `ask` 模式或产生对话后显示。
*   容器内部包含消息列表，支持滚动。

#### B. 交互逻辑 (Ask Mode)
1.  **提交 (Submit)**：
    *   用户按 Enter 提交。
    *   **不关闭弹窗**。
    *   清空输入框。
    *   在历史区域追加用户消息气泡。
    *   立即在历史区域追加一个“正在思考/生成”的 AI 消息气泡。
    *   调用 `AIService.streamCompletion`。
2.  **流式更新**：
    *   接收到 chunk 时，实时更新最后一条 AI 消息气泡的内容。
    *   自动滚动到底部。
3.  **消息操作**：
    *   每个 AI 消息气泡右下角或悬浮显示操作栏：
        *   **复制 (Copy)**: 复制内容到剪贴板。
        *   **插入 (Insert)**: 将该条回复内容插入到编辑器光标位置 (并在插入后可选择是否关闭弹窗，默认保持或根据用户习惯)。

#### C. 样式 (CSS)
*   复用 `mn-*` 变量。
*   **用户消息**：右侧对齐，深色/高亮背景。
*   **AI 消息**：左侧对齐，浅色/默认背景，Markdown 渲染 (需支持基础 Markdown 渲染，如代码块、加粗等，可复用 Obsidian 的 `MarkdownRenderer` 或简单的 HTML 转换)。
*   **操作按钮**：纯图标风格 (24x24)，Hover 显示。

### 3.4 上下文与状态
*   `QuickAskController` 需维护当前的 `context` (光标位置、选中文件名等)。
*   **插入逻辑**：点击“插入”时，需获取当前最新的 EditorView 实例，在原始触发位置或当前光标位置插入文本。

## 4. 执行计划
1.  **控制器层**：创建 `src/features/quick-ask/quickAskController.ts`，实现 `createTriggerExtension` 和 `ViewPlugin` 挂载逻辑。
2.  **UI 层改造**：
    *   修改 `AtTriggerPopup.ts`，增加 `renderChatMessage`、`updateStreamingMessage` 等方法。
    *   实现 Ask 模式下的“不关闭 + 流式更新”逻辑。
    *   实现消息气泡的 DOM 构建与事件绑定 (Copy/Insert)。
3.  **整合**：在 `main.ts` 中替换旧的 `keydown` 监听，注册新的编辑器扩展。

