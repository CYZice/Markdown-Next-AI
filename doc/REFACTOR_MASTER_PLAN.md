# 代码重构总体方案 (Master Refactor Plan)

**日期**: 2026-02-07
**目标对象**: `settings.ts`, `at-trigger-popup.ts`, `main.ts`
**核心目标**: 解耦上帝类、消除手动 DOM 操作、提升可维护性。

---

## 现状评估

| 模块 | 当前规模 | 主要问题 | 风险等级 |
| :--- | :--- | :--- | :--- |
| **Settings** (`settings.ts`) | ~1790 行 | 典型的 God Class。所有的配置界面逻辑（模型、编辑器、对话、补全）和数据持久化逻辑混杂。 | **高** (修改易出错) |
| **Popup** (`at-trigger-popup.ts`) | ~1521 行 | 手动 DOM 操作噩梦。在一个类中混杂了 UI 构建、React 组件挂载、业务逻辑、流式响应处理。 | **极高** (难以扩展) |
| **Main** (`main.ts`) | ~892 行 | 获取了过多非核心职责。包含了设置迁移、UI 初始化注入、事件监听管理等琐碎逻辑。 | **中** (显得臃肿) |

---

## 1. 模块重构方案：设置页面 (`settings.ts`)

### 目标架构
将单一文件拆分为 **Manager + Tabs** 结构。

```text
src/settings/
├── index.ts                # 导出入口
├── SettingsManager.ts      # 负责数据的 save, load, migrate, keychain 逻辑
├── MarkdownNextAISettingTab.ts # 主入口文件 (Obsidian PluginSettingTab)
└── tabs/                   # 各个子页面的渲染逻辑
    ├── AbstractModelTab.ts     # 基类
    ├── ModelsTab.ts        # 模型与供应商设置
    ├── EditorTab.ts        # 编辑器与右键菜单设置
    ├── CompletionTab.ts    # 自动补全设置
    └── ChatTab.ts          # 对话与 Prompt 设置
```

### 重构步骤
1.  **提取数据层**: 创建 `SettingsManager`，将 `migrateKeysToKeychain` 等逻辑移入。
2.  **创建基类**: 定义 `ISettingsTab` 接口，规范 `display()` 和 `save()` 行为。
3.  **拆分 UI**: 将原 `renderModelsTab`, `renderEditorTab` 等函数代码分别移动到 `tabs/` 下的独立类中。
4.  **组装**: 主 `MarkdownNextAISettingTab` 只负责初始化这些 Tab 类，并处理 Tab 切换的导航栏逻辑。

---

## 2. 模块重构方案：对话弹窗 (`at-trigger-popup.ts`)

### 目标架构
**React 全面接管 UI**。将手动 DOM 操作转换为声明式组件。

```text
src/ui/chat-window/
├── ChatWindowController.ts # 原 AtTriggerPopup，仅保留 Obsidian 桥接逻辑 (open/close)
├── components/             # React 组件
│   ├── ChatWindow.tsx      # 根组件
│   ├── MessageList.tsx     # 消息列表容器
│   ├── MessageItem.tsx     # 单条消息 (负责 Markdown 渲染, Copy 按钮)
│   ├── InputBox.tsx        # 输入框、上下文选择器
│   └── ModelSelector.tsx   # 模型下拉框
└── hooks/
    ├── useChatStream.ts    # 核心逻辑：封装流式对话状态 (thinking, streaming)
    └── useHotkeys.ts       # 快捷键处理
```

### 关键改动
1.  **状态管理**: 使用 React `useState` / `useReducer` 管理 `messages`, `isGenerating`, `input` 等状态，替代 `this.messages`, `this.currentStreamingMessageEl`。
2.  **流式逻辑分离**: 将 `aiService` 的调用逻辑封装在 Hook 中，视图层只负责展示 data。
3.  **移除 DOM 操作**: 不需要再写 `createEl('div')` 或 `innerHTML`，全部改用 JSX。

---

## 3. 模块重构方案：插件主入口 (`main.ts`)

### 目标架构
**Main 仅仅是协调者 (Coordinator)**。

```text
src/
├── main.ts
├── managers/
│   ├── LifecycleManager.ts # (可选)
│   └── UIManager.ts        # 负责 Ribbon, HeaderButton, StatusBar 的挂载
└── services/
    └── KeychainService.ts  # 专门负责密钥迁移和存储 (从 Main 中剥离)
```

### 重构步骤
1.  **剥离 UI 初始化**: `setupHeaderButton`, `addRibbonIcon` 等逻辑移至 `UIManager`。
2.  **剥离业务逻辑**: `migrateKeysToKeychain` 移至 `KeychainService`，并在 `loadSettings` 后调用。
3.  **清理事件监听**: 统一使用 `this.registerEvent` 或专门的 `EventManager` 管理零散的全局事件。

---

## 执行计划与优先级

1.  **Phase 1: Settings 重构** (预计耗时: 低)
    *   原因: 逻辑相对独立，风险小，能显著减少代码行数，从 1800 行减负至 <200 行的主文件。
    *   *Action*: 立即执行。

2.  **Phase 2: Main 瘦身** (预计耗时: 低)
    *   原因: 清理入口，让代码结构更清晰。
    *   *Action*: 在 Phase 1 完成后执行。

3.  **Phase 3: Popup React 化** (预计耗时: 高)
    *   原因: 涉及 UI 重写和状态逻辑迁移，工作量大且容易影响核心体验。
    *   *Action*: 需要单独的分支进行，分步替换（例如先替换内部的消息列表，再替换外壳）。

## 下一步行动建议
请确认是否开始 **Phase 1: Settings 重构**？我们将优先拆分 `settings.ts` 文件。
