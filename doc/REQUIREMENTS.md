# Markdown-Next-AI 需求与重构文档

本文档详细描述了 Markdown-Next-AI 项目的重构需求，旨在简化交互逻辑，去除冗余的自动路由功能，并引入类似 obsidian-yolo 的选中交互体验。

## 1. 核心目标
1.  **简化模式**: 移除 LLM 自动路由，废弃“续写模式”，统一为“Chat 模式”。
2.  **优化交互**:
    *   `@` 触发的弹窗统一为 Chat 交互。
    *   引入文本选中后的 Indicator 菜单（仿 obsidian-yolo）。
3.  **保持兼容**: 确保现有的全局规则（Global Rules）和上下文嵌入（Context Embedding）功能在新的交互逻辑中继续生效。

## 2. 详细需求

### 2.1 移除 LLM 自动路由 (Remove LLM Auto-routing)
*   **现状**: 目前系统在提交请求前会调用 `decideModeByLLM` 或 `routeByLLM` 来决定是使用 "continue", "chat" 还是其他模式。
*   **需求**:
    *   彻底移除 `decideModeByLLM` 及相关路由逻辑。
    *   所有请求默认走统一的 **Chat 模式** 管道。
    *   清理 `src/services` 中与路由相关的代码。

### 2.2 统一 Chat 模式 (@ 触发)
*   **交互变更**:
    *   用户在编辑器输入 `@` 唤出的弹窗（`AtTriggerPopup`），不再区分“续写”或“对话”，统一视为 **Chat 模式**。
    *   用户输入的 Prompt 直接作为对话内容发送。
    *   **上下文处理**: 必须完整保留现有的文件引用（`@File`）、文件夹引用（`@Folder`）及光标位置上下文逻辑。
*   **废弃续写模式**:
    *   将原有的“续写”逻辑并入 Chat 模式。如果用户意图是续写，他们应通过 Prompt 表达（例如“继续写...”），或者我们可以在 UI 上提供快捷指令，但底层不再做区分。

### 2.3 文本选中交互 (Selection Logic)
*   **参考**: 逻辑与 UI 完全模仿 `obsidian-yolo` 插件。
*   **触发条件**: 当用户在编辑器中选中文本时。
*   **UI 表现**:
    *   在选区附近显示一个 **Indicator** (图标)。
    *   鼠标悬停或点击 Indicator，展开 **Menu** (菜单)。
*   **菜单选项**:
    1.  **AI 改写 (AI Rewrite)**:
        *   **行为**: 调出 Markdown-Next-AI 的主对话框（`AtTriggerPopup` 或类似样式的变体）。
        *   **状态**: 选中的文本不直接进入 Prompt，而是作为“待修改目标”。
        *   **操作**: 用户输入修改指令（如“翻译成英文”、“润色”），AI 对选中文本进行处理。
        *   **实现参考**: 模仿 `obsidian-yolo` 的 Smart Space 逻辑。
    2.  **添加至对话 (Add to Chat)**:
        *   **行为**: 调出 Markdown-Next-AI 的主对话框。
        *   **状态**: 选中的文本被自动格式化为引用块（Quote），添加到输入框的上下文区域或 Prompt 前缀中。
        *   **操作**: 用户继续输入 Prompt，AI 结合该引用内容进行回复。
        *   **结果插入**: 生成的结果默认插入到光标处（保持 Markdown-Next-AI 现有的插入逻辑）。

### 2.4 兼容性要求 (Compatibility)
*   **全局规则 (Global Rules)**:
    *   在构建最终发给 LLM 的 Prompt 时，必须包含 `GlobalRuleManager` 中定义的规则（如“始终使用中文”、“数学公式格式”等）。
    *   确保新的 Chat 模式管道正确读取并拼接这些 System Prompts。
*   **上下文嵌入 (Context Embedding)**:
    *   如果项目已有 RAG (检索增强生成) 或向量搜索功能，需确保在新的 Chat 模式下依然生效。
    *   当用户在对话框中手动引用文件时，应优先使用显式上下文；当涉及模糊查询时，利用 Embedding 检索相关内容。

## 3. 技术实现路径 (Implementation Plan)

### Phase 1: 清理与重构
1.  修改 `src/main.ts`，移除 `decideModeByLLM` 调用。
2.  修改 `src/ai/service.ts` (或相关 Service)，简化 `sendRequest` 接口，默认指定 type 为 `chat`。
3.  验证 `@` 触发流程，确保其直接调用 AI Service 的 Chat 接口。

### Phase 2: 实现选中交互 (Selection Features)
1.  **引入组件**:
    *   移植/实现 `SelectionChatController` (控制器)。
    *   移植/实现 `SelectionWidget` / `SelectionActionsMenu` (React 组件或原生 DOM)。
2.  **对接现有 UI**:
    *   实现 **Rewrite Action**: 调用 `showAtTriggerModal`，并传入参数标识“改写模式”（可能需要修改 `AtTriggerPopup` 以支持“改写”状态的 UI 区分）。
    *   实现 **Add to Chat Action**: 调用 `showAtTriggerModal`，并将选中文本作为 `initialContext` 或预填充到输入框。

### Phase 3: 验证与优化
1.  测试全局规则是否生效。
2.  测试选中文本后的两种操作路径是否符合预期。
3.  确保 UI 风格与 Markdown-Next-AI 保持一致。

## 4. 文件结构与模块规划 (File Structure & Modules)

### 4.1 新增模块 (New Modules)

我们将在 `src/features/` 目录下创建一个新的 `selection` 模块，用于集中管理文本选中交互功能。

```
src/
└── features/
    └── selection/
        ├── index.ts               # 导出模块接口
        ├── selection-controller.ts # 核心控制器：监听选区变化，管理 Widget 生命周期
        ├── selection-view.ts       # 视图层：负责渲染 Indicator 和 Menu (DOM 操作)
        └── selection-actions.ts    # 动作定义：Rewrite 和 Add to Chat 的具体逻辑
```

*   **`selection-controller.ts`**:
    *   职责：监听编辑器事件（selection change, scroll, resize），计算 Indicator 位置，决定何时显示/隐藏。
    *   依赖：`App`, `Plugin`, `Editor` (Obsidian API)。
*   **`selection-view.ts`**:
    *   职责：创建和更新 DOM 元素。
    *   包含：Indicator 图标渲染，Menu 菜单渲染。
*   **`selection-actions.ts`**:
    *   职责：定义菜单点击后的回调函数。
    *   关键逻辑：调用 `main.ts` 或 `AtTriggerPopup` 的接口打开对话框。

### 4.2 修改现有模块 (Modified Modules)

| 模块路径 | 修改内容 | 原因 |
| :--- | :--- | :--- |
| **`src/main.ts`** | 1. 移除 `routeByLLM` 调用。<br>2. 在 `onload` 中初始化 `SelectionController`。<br>3. 废弃 `decideModeByLLM` 方法。 | 去除自动路由，集成新功能入口。 |
| **`src/services/routing-service.ts`** | **[删除/废弃]** | 自动路由功能移除。 |
| **`src/services/ai-service.ts`** | 修改 `sendRequest` 方法，简化 `mode` 参数处理，默认为 `chat`。 | 统一请求管道。 |
| **`src/ui/at-trigger-popup.ts`** | 1. 构造函数增加参数，用于区分 `Rewrite` 模式和普通 Chat 模式。<br>2. 如果是 Rewrite 模式，UI 显示“修改选中文本”标题，并将选中文本作为 Target。<br>3. 如果是 Add to Chat 模式，自动填充选中文本到 Context 区域。 | 适配从选中菜单发起的不同请求类型。 |
| **`src/types/index.ts`** (如有) | 更新相关类型定义，移除 RouteMode 枚举中废弃的项。 | 类型同步。 |

### 4.3 目录结构预览 (Preview)

```text
src/
├── features/               <-- [NEW] 功能模块目录
│   └── selection/          <-- [NEW] 选中交互模块
│       ├── index.ts
│       ├── selection-controller.ts
│       ├── selection-view.ts
│       └── selection-actions.ts
├── services/
│   ├── ai-service.ts       <-- [MOD] 简化请求接口
│   ├── routing-service.ts  <-- [DEL] 删除
│   └── ...
├── ui/
│   ├── at-trigger-popup.ts <-- [MOD] 适配 Rewrite/Add Context
│   └── ...
├── main.ts                 <-- [MOD] 入口调整
└── ...
```

## 5. 参考实现与代码映射 (Reference & Code Mapping)

为了加速开发，我们可以直接参考 `FlowText` 和 `obsidian-yolo` 的现有实现。以下是详细的映射表。

### 5.1 文本选中交互模块 (Selection Feature)
**目标模块**: `src/features/selection/`

| 功能组件 | 对应参考文件 (绝对路径) | 参考内容说明 |
| :--- | :--- | :--- |
| **Selection Controller**<br>(核心控制逻辑) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\features\editor\selection-chat\selectionChatController.ts` | 抄录 `SelectionChatController` 类。<br>重点参考 `initializeSelectionChat`, `handleSelectionChange`, `updateWidgetPosition` 等方法。<br>逻辑：如何监听编辑器选区变化，如何防抖，如何计算 Widget 的坐标。 |
| **Selection Manager**<br>(选区信息管理) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\components\selection\SelectionManager.ts` | 抄录 `SelectionManager` 类。<br>逻辑：获取当前选中的文本、范围、光标位置的辅助函数。 |
| **Selection Widget (UI)**<br>(悬浮图标与容器) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\components\selection\SelectionChatWidget.tsx` | 参考 React 组件结构，移植为原生 DOM 操作（如果 Markdown-Next-AI 不使用 React）。<br>UI：包含 Indicator (图标) 和 Menu (菜单) 的容器结构。 |
| **Selection Menu (UI)**<br>(操作菜单) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\components\selection\SelectionActionsMenu.tsx` | 参考菜单项的定义和渲染。<br>UI：按钮列表，每个按钮包含 Icon 和 Label。<br>动作绑定：参考 `actions` 数组的定义。 |
| **Rewrite Action**<br>(AI 改写动作) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\features\editor\selection-chat\selectionChatController.ts` (method: `rewriteSelection`) | 参考 `rewriteSelection` 方法。<br>逻辑：如何获取选中文本，如何触发“智能编辑框” (这里我们要触发 `AtTriggerPopup`)。 |
| **Add to Chat Action**<br>(添加至对话动作) | `d:\Microsoft VS Code\PYTHON\FlowText\obsidian-yolo-1.4.13\obsidian-yolo-1.4.13\src\features\editor\selection-chat\selectionChatController.ts` (method: `explainSelection`) | 参考 `explainSelection` 方法。<br>逻辑：如何将选中文本格式化为引用，并发送到 Chat View (这里我们要发送到 `AtTriggerPopup`)。 |

### 5.2 聊天弹窗与 UI (Popup & UI)
**目标模块**: `src/ui/at-trigger-popup.ts`

| 功能组件 | 对应参考文件 (绝对路径) | 参考内容说明 |
| :--- | :--- | :--- |
| **Popup UI Structure**<br>(弹窗基础结构) | `d:\Microsoft VS Code\PYTHON\FlowText\FlowText\src\ui\at_trigger_popup.ts` | 参考 FlowText 的 `AtTriggerPopup` 实现。<br>UI：输入框、模型选择下拉框（注意之前的修复）、上下文展示区域。 |
| **Model Dropdown**<br>(模型选择下拉框) | `d:\Microsoft VS Code\PYTHON\FlowText\FlowText\src\ui\at_trigger_popup.ts` | 重点参考 `renderModelSelect` 和 `onModelChange` 事件处理。<br>UI：使用标准 HTML `<select>` 标签，而非自定义复杂的 DIV 模拟。 |

### 5.3 全局规则与提示词 (Rules & Prompts)
**目标模块**: `src/ai/service.ts` & `src/services/rule-manager.ts`

| 功能组件 | 对应参考文件 (绝对路径) | 参考内容说明 |
| :--- | :--- | :--- |
| **System Prompts**<br>(系统提示词) | `d:\Microsoft VS Code\PYTHON\FlowText\FlowText\src\constants.ts` | 参考 `SYSTEM_PROMPTS` 对象。<br>提示词：虽然我们要移除 `continue` 模式，但可以参考 `commonPrompts` 中的通用提示词设计。 |
| **Global Rules**<br>(全局规则管理) | `d:\Microsoft VS Code\PYTHON\FlowText\FlowText\src\managers\rule_manager.ts` | 参考 `RuleManager` 类。<br>逻辑：如何加载、保存和应用用户定义的全局规则（如“始终用中文回答”）。 |
