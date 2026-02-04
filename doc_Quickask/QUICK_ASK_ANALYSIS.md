# Quick Ask 实现分析（Obsidian YOLO 1.4.13）

## 1. 概览
Quick Ask 是一个在编辑器内联触发的轻量级 AI 对话面板。它不依赖侧边栏，而是直接悬浮在编辑器光标附近，提供极速的问答与编辑体验。
核心特点：
- **内联触发**：通过行首 `@` 触发。
- **Overlay 架构**：独立 React Root 挂载到编辑器 DOM，跟随滚动。
- **极简 UI**：无边框输入行 + 流式对话区 + 底部工具栏。
- **键盘优先**：全键盘操作支持（导航、选择、关闭）。

## 2. 关键文件
| 文件 | 路径 | 作用 |
| :--- | :--- | :--- |
| **QuickAskPanel.tsx** | `src/components/panels/quick-ask/QuickAskPanel.tsx` | 主 UI 组件，包含输入、聊天流、工具栏逻辑。 |
| **QuickAskWidget.tsx** | `src/components/panels/quick-ask/QuickAskWidget.tsx` | Overlay 管理器，负责挂载、定位、拖拽/缩放、全局事件。 |
| **quickAskController.ts** | `src/features/editor/quick-ask/quickAskController.ts` | 触发控制器（CodeMirror Plugin），拦截输入并激活 Overlay。 |
| **AssistantSelectMenu.tsx** | `src/components/panels/quick-ask/AssistantSelectMenu.tsx` | 助手选择菜单（自定义列表实现）。 |
| **ModeSelect.tsx** | `src/components/panels/quick-ask/ModeSelect.tsx` | 模式选择菜单（基于 Radix UI）。 |

## 3. Overlay 架构
### 挂载与生命周期
- **挂载点**：优先挂载到 `view.dom`（编辑器容器），兜底 `document.body`。
- **容器结构**：
  ```html
  <div class="smtcmp-quick-ask-overlay-root"> <!-- 宿主容器，单例 -->
    <div class="smtcmp-quick-ask-overlay"> <!-- 实例容器，含样式 -->
      <ReactRoot /> <!-- React 应用根节点 -->
    </div>
  </div>
  ```
- **生命周期**：由 `quickAskController` 通过 CodeMirror `StateEffect` 控制。`ViewPlugin` 监听 Effect 变化来创建/销毁 `QuickAskOverlay` 实例。

### 定位策略
- **初始定位**：使用 `view.coordsAtPos(pos)` 获取光标坐标作为锚点。
- **边界限制**：
  - 宽度限制：`Math.min(editorContentWidth, viewportWidth - margin * 2)`。
  - 左侧定位：Clamp 在编辑器内容区（`cm-sizer`）与视口 Margin 之间。
  - 顶部定位：光标底部 + 偏移量。
- **动态更新**：
  - 监听 `scroll` (Window + Editor) 和 `resize` 事件。
  - 使用 `requestAnimationFrame` 批量更新 DOM 样式（`updateDynamicStyleClass`），避免布局抖动。
- **拖拽与缩放**：
  - 拖拽后切换为“固定位置模式”，不再跟随光标重算，而是基于拖拽后的绝对坐标。
  - 支持右、下、右下角缩放，并记忆尺寸。

## 4. 交互逻辑
### 触发机制
- **监听事件**：CodeMirror `beforeinput` 事件。
- **触发条件**：
  1. 用户输入字符导致当前行文本（光标前）+ 输入字符 === 触发符（默认 `@`）。
  2. 这意味着通常是在**空行**输入 `@`，或行首输入 `@`。
- **行为**：
  - `preventDefault()` 阻止 `@` 输入。
  - 清除行内已有的部分触发符（如果有）。
  - 调用 `show()` 挂载 Overlay。
  - 自动抓取上下文：光标前 5000 字符，后 2000 字符，插入 `<<CURSOR>>` 标记。

### 键盘导航与焦点管理
- **Esc 优先级**：
  1. 子菜单（助手/模型/模式）打开时：Esc 仅关闭子菜单，焦点回退到输入框。
  2. 无子菜单时：Esc 关闭整个 Quick Ask 面板。
- **方向键**：
  - 输入框内上下键：如果不在菜单内，焦点可跳转到触发按钮（如助手选择器）。
  - 菜单内：标准列表导航（上下移动选中，Enter 确认）。
- **Tab/Shift+Tab**：在输入框与工具栏按钮间循环。

### 流式对话
- **流式引擎**：使用 `ResponseGenerator` 处理 LLM 流。
- **自动滚动**：
  - 默认：新消息到达时自动滚动到底部。
  - 用户干预：如果用户向上滚动（远离底部），暂停自动滚动。
  - 恢复：用户手动滚回底部附近（<100px）时，恢复自动滚动。

## 5. UI 规范
- **样式风格**：
  - **Ghost (幽灵态)**：按钮平时无背景/边框，Hover 时显示轻微背景。
  - **纯图标**：工具栏按钮多为 24x24 纯图标，无文字标签（除当前选中的助手/模型名）。
  - **卡片化**：白底，细边框，柔和阴影 (`box-shadow`)。
- **尺寸**：
  - 默认最大宽度跟随编辑器内容宽度 (`--file-line-width` 或 720px)。
  - 最小宽度 120px。
- **动画**：
  - 面板出入场有淡入淡出 + 轻微缩放动画。
  - 关闭时有延时（200ms）等待动画播放完毕。

## 6. 复现计划（Markdown-Next-AI）
我们将基于现有 `AtTriggerPopup` 进行改造，使其完全对齐 Quick Ask。

### 第一阶段：架构对齐
- [ ] **Overlay 重构**：将 `AtTriggerPopup` 改为挂载到 `view.dom` 的独立 Root，而非 `body` 直接定位。
- [ ] **定位逻辑优化**：引入 `updateDynamicStyleClass`，实现基于 `requestAnimationFrame` 的高性能跟随定位。
- [ ] **触发器改造**：保留现有的 `@` 触发逻辑，但确保通过 CodeMirror 插件拦截而非仅监听 `keypress`。

### 第二阶段：UI 翻新
- [ ] **React 组件化**：确保弹窗内容完全由 React 渲染（目前已有基础，需完善）。
- [ ] **样式对齐**：
  - 去除内联样式，全面使用 CSS 类。
  - 实现 Ghost 按钮风格。
  - 引入 24x24 纯图标系统。
- [ ] **拖拽/缩放完善**：对齐 Quick Ask 的拖拽后“固定位置”逻辑与缩放手柄样式。

### 第三阶段：交互精修
- [ ] **Esc 优先级治理**：建立统一的 `OverlayCloseManager`，确保子菜单 -> 主面板的关闭顺序。
- [ ] **菜单统一**：将所有下拉菜单（模型、助手、模式）统一为 `SuggestionList` 或 Radix UI 风格，支持一致的键盘导航。
- [ ] **流式滚动优化**：实现“用户上滑暂停滚动”的智能策略。

### 第四阶段：功能补全
- [ ] **上下文增强**：自动抓取光标前后文并插入 `<<CURSOR>>`。
- [ ] **提及系统**：虽然目前使用 `contentEditable`，需确保 `@` 提及文件体验流畅（未来考虑迁移 Lexical）。

此文档作为后续开发的参考基准。
