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
**原生 TypeScript 模块化拆分** (不引入 React)。
将上帝类拆分为“视图管理”与“业务逻辑”分离的协作类，保持原生 DOM 操作的高性能与轻量级。

```text
src/ui/popup/
├── components/
│   ├── WindowManager.ts        # 负责窗口生命周期：创建、定位(Positioning)、拖拽(Drag)、关闭守卫
│   ├── ChatRenderer.ts         # 负责消息流渲染：DOM生成、Markdown渲染、正在思考(Thinking)动效
│   └── InputManager.ts         # 负责输入交互：高度自适应、@/# 触发器、ContextSelector管理
├── AtTriggerPopup.ts           # 主控制器 (Coordinator)，协调上述组件与 AI Service
└── types.ts                    # 弹窗专用类型定义
```

### 关键改动
1.  **提取窗口逻辑**: 将 `positionPopup`, `enableDragging`, `closeGuards` 等约 200 行代码移入 `WindowManager`。
2.  **封装流式渲染**: 将 `createStreamingAssistantMessage`, `updateStreamingThinking` 等流式 DOM 操作移入 `ChatRenderer`。
3.  **输入逻辑解耦**: 将 `InputContextSelector` 和 `PromptSelector` 的初始化与事件绑定移入 `InputManager`。

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

3.  **Phase 3: Popup 模块化重构** (预计耗时: 中)
    *   原因: 虽然不涉及 React 重写，但逻辑拆分仍需细致处理状态同步。
    *   *Action*: 分步提取。先提取最独立的 `PopupWindowManager` (定位与拖拽)，再提取 `ChatStreamRenderer` (渲染)。

## 下一步行动建议
请确认是否开始 **Phase 1: Settings 重构**？我们将优先拆分 `settings.ts` 文件。
