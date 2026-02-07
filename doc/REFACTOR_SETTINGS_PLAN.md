# Settings 重构方案 (Phase 1)

**目标**: 将 `settings.ts` 从 God Class 拆解为模块化的设置管理系统。
**目录**: `src/settings/`
**原则**:
1.  **UI 渲染与数据逻辑分离**。
2.  **单一职责**：每个 Tab 对应一个 View 类，数据管理对应 Manager 类。
3.  **安全性分离**：API Key 与 Keychain 管理剥离。

---

## 1. 目录结构设计

```text
src/settings/
├── index.ts                     // 导出入口，供 main.ts 使用
├── settings-manager.ts          // [Logic] 数据持久化、Keychain 迁移、默认值合并
├── settings-tab.ts              // [View] 主入口，继承 PluginSettingTab，负责 Tab 切换
├── settings-types.ts            // (可选) 如果 types.ts 太大，可在此定义局部接口
└── views/                       // [View] 各个 Tab 的渲染逻辑
    ├── abstract-tab-view.ts     // 基类：定义 render(container) 接口
    ├── models-tab-view.ts       // 模型 TAB：API Key、Provider、Model 增删改查
    ├── editor-tab-view.ts       // 编辑器 TAB：右键菜单、快捷键
    ├── completion-tab-view.ts   // 补全 TAB：Ghost text, debounce
    ├── chat-tab-view.ts         // 对话 TAB：Prompt 管理
    └── others-tab-view.ts       // 其他 TAB：Global Rules (规则管理)
```

---

## 2. 职能与函数映射

### 2.1 SettingsManager (`settings-manager.ts`)
负责所有与 `this.plugin.settings` 直接交互的逻辑。

| 原函数/逻辑 | 新位置 | 说明 |
| :--- | :--- | :--- |
| `loadSettings` (main.ts) | `SettingsManager.loadSettings` | 移入 |
| `saveSettings` (interface) | `SettingsManager.saveSettings` | 移入 |
| `migrateKeysToKeychain` | `SettingsManager.migrateKeysToKeychain` | 移入 |
| `this.plugin.settings.*` | `SettingsManager.getSettings()` | 提供访问器 |

### 2.2 ModelsTabView (`views/models-tab-view.ts`)
负责“模型”页面的渲染和交互弹窗。

| 原函数/逻辑 | 说明 |
| :--- | :--- |
| `renderModelsTab` | 核心渲染方法 |
| `showApiKeyModal` | 弹窗逻辑应提取为独立 Modal 或保留在 View 类的方法中 |
| `showAddProviderModal` | 同上 |
| `showEditProviderModal` | 同上 |
| `showAddModelModal` | 同上 |
| `showEditModelModal` | 同上 |
| Keychain 配置 UI | 开关逻辑 |

### 2.3 EditorTabView (`views/editor-tab-view.ts`)
负责编辑器行为。

| 原函数/逻辑 | 说明 |
| :--- | :--- |
| `renderEditorTab` | 编辑器、Trigger 配置 |
| Trigger 列表管理 | 对话触发词的增删 UI |

### 2.4 CompletionTabView (`views/completion-tab-view.ts`)

| 原函数/逻辑 | 说明 |
| :--- | :--- |
| `renderCompletionTab` | 补全开关、延迟等 |
| `showAddTriggerModal` | 补全触发器 Modal |
| `showEditTriggerModal` | 补全触发器 Modal |

### 2.5 ChatTabView (`views/chat-tab-view.ts`)

| 原函数/逻辑 | 说明 |
| :--- | :--- |
| `renderChatTab` | 渲染 |
| `showPromptModal` | Prompt 增删改查 |
| `deletePrompt` | 辅助函数 |

### 2.6 OthersTabView (`views/others-tab-view.ts`)

| 原函数/逻辑 | 说明 |
| :--- | :--- |
| `renderOthersTab` | 规则管理入口 |
| `renderRuleList`, `showRuleManager` | 复杂的规则管理 UI |
| `showRuleEditor`, `showTemplateSelector` | 规则编辑弹窗 |
| `deleteRule`, `exportRules`, `importRules` | 规则导入导出逻辑 |

---

## 3. 实施步骤

1.  **创建基础结构**:
    *   建立文件夹。
    *   新建 `settings-manager.ts`，从 `main.ts` 和 `settings.ts` 中提取 `PluginSettings` 相关操作。
    *   新建 `abstract-tab-view.ts` 定义接口 `render(container: HTMLElement): void`。

2.  **拆分 View**:
    *   **Step 2.1**: 处理 `OthersTabView` (规则管理部分逻辑最封闭，容易独立)。
    *   **Step 2.2**: 处理 `ChatTabView` (Prompt 管理)。
    *   **Step 2.3**: 处理 `EditorTabView`。
    *   **Step 2.4**: 处理 `CompletionTabView`。
    *   **Step 2.5**: 处理 `ModelsTabView` (最复杂，涉及 Keychain 和大量 Modals)。

3.  **整合主入口**:
    *   新建 `settings-tab.ts`，重写 `display()` 方法，根据 `activeTab` 实例化并调用对应的 Sub-View。

4.  **替换引用**:
    *   修改 `main.ts` 使用新的 `MarkdownNextAISettingTab` 和 `SettingsManager`。

---

## 4. 关键代码示例

**AbstractTabView**
```typescript
import { App } from "obsidian";
import { SettingsManager } from "../settings-manager";

export abstract class AbstractTabView {
    constructor(protected app: App, protected settingsManager: SettingsManager) {}
    abstract render(container: HTMLElement): void;
}
```

**SettingsManager**
```typescript
import MarkdownNextAIPlugin from "../main";

export class SettingsManager {
    constructor(private plugin: MarkdownNextAIPlugin) {}

    get settings() { return this.plugin.settings; }

    async saveSettings() { await this.plugin.saveSettings(); }
    
    // ... migrateKeysToKeychain 等逻辑
}
```

---

该方案已就绪。我将按此执行拆分。
