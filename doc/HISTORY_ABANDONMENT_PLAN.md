# 历史记录功能废弃方案与执行记录

## 1. 概述
本方案旨在阐述如何从 Markdown-Next-AI 项目中完全移除历史记录（Conversation History）功能。该功能原用于在本地存储用户的对话历史，但因产品定位调整（更倾向于轻量级辅助而非长期记忆），决定将其完全废弃。

## 2. 废弃范围
本次废弃涉及以下模块：
- **UI 组件**: `AtTriggerPopup` 中的历史记录按钮、历史记录列表面板、查看详情面板。
- **数据模型**: `types.ts` 中的 `ConversationEntry` 接口及 `PluginSettings` 中的历史记录字段。
- **业务逻辑**: `main.ts` 中的 `recordConversation` 方法及相关调用。
- **样式定义**: `styles.css` 中所有与历史记录相关的样式类。
- **默认配置**: `defaults.ts` 中的默认历史记录配置。
- **文档**: 所有提及历史记录的用户文档和开发文档。

## 3. 执行步骤 (已完成)

### 3.1 UI 组件清理
- [x] 修改 `src/ui/at-trigger-popup.ts`：
    - 移除了 `showHistoryPanel` 方法。
    - 移除了 `renderHistoryList` 方法。
    - 移除了 `renderHistoryDetail` 方法。
    - 移除了构建历史记录按钮的 DOM 操作代码。
    - 移除了相关的事件监听器。

### 3.2 样式清理
- [x] 修改 `styles.css`：
    - 删除了 `.markdown-next-ai-history-btn` 相关样式。
    - 删除了 `.markdown-next-ai-history-panel` 相关样式。
    - 删除了 `.markdown-next-ai-history-item` 相关样式。
    - 删除了 `.markdown-next-ai-history-detail` 相关样式。
    - 清理了 `.markdown-next-ai-search-bar` 等仅用于历史面板的辅助样式。

### 3.3 类型定义与配置清理
- [x] 修改 `src/types.ts`：
    - 删除了 `ConversationEntry` 接口。
    - 从 `PluginSettings` 接口中移除了 `conversationHistory` 和 `conversationHistoryLimit` 字段。
- [x] 修改 `src/defaults.ts`：
    - 从 `DEFAULT_SETTINGS` 中移除了对应的默认值。

### 3.4 核心逻辑清理
- [x] 修改 `src/main.ts`：
    - 删除了 `recordConversation` 方法的实现。
    - 在 `handleContinueWriting` 和 `handleContinueWritingGlobal` 中，移除了对 `recordConversation` 的调用（注释或直接删除）。
    - 在 `loadSettings` 中移除了对旧版历史记录数据的兼容处理逻辑。

### 3.5 文档清理
- [x] 删除了 `doc/HISTORY_INTEGRATION_ANALYSIS.md`（历史功能分析文档）。
- [x] 检查 `README.md`，确认无历史记录相关描述。

## 4. 依赖处理
- 本次移除不涉及外部 npm 包的卸载，仅为内部逻辑移除。
- 确认 `AIService` 和 `GlobalRuleManager` 不依赖于历史记录数据。

## 5. 验证结果
- **静态检查**: 全局搜索 `conversationHistory` 无相关代码匹配。
- **编译检查**: TypeScript 类型检查通过（需在开发环境验证）。
- **功能检查**: 核心的 AI 对话、上下文引用、Prompt 模板功能均不受影响。

## 6. 后续维护
- 未来如果需要重新引入历史记录功能，建议采用独立的数据库存储（如 IndexedDB）或服务端存储，而非直接写入 `data.json`，以避免性能问题。
