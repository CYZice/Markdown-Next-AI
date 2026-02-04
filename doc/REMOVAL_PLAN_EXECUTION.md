# AtTriggerPopup 清理与 QuickAskOverlay 替换报告

## 1. 变更概述
本报告记录了将 Markdown-Next-AI 插件中的历史遗留组件 `AtTriggerPopup` 完全替换为新版 React 组件 `QuickAskOverlay` 的过程。本次变更旨在解决功能重叠问题，统一 UI 技术栈，并提升代码的可维护性。

## 2. 变更详情

### 2.1 删除的模块
以下文件已被物理删除：
- `src/ui/at-trigger-popup.ts`: 原生 DOM 实现的旧版对话弹窗。
- `src/ui/context-selector.ts`: 旧版上下文选择器。
- `src/ui/overlay/`: 旧版弹窗的辅助模块目录，包含：
  - `close-manager.ts`
  - `positioning.ts`
  - `suggestion-list.ts`

### 2.2 修改的模块
- `src/main.ts`:
  - 移除了 `AtTriggerPopup` 的导入和类属性 `lastAtTriggerPopup`。
  - 修改 `showAtTriggerModal` 方法，改为实例化 `QuickAskOverlay`。
  - 修改 `showAtTriggerModalGlobal` 方法，改为实例化 `QuickAskOverlay`。
  - 更新流式响应回调，移除对 `lastAtTriggerPopup` 的调用。
- `src/ui/index.ts`:
  - 移除了 `AtTriggerPopup` 和 `InputContextSelector` 的导出。

### 2.3 功能迁移对照

| 功能 | 原 AtTriggerPopup | 新 QuickAskOverlay | 状态 |
| :--- | :--- | :--- | :--- |
| **基础对话** | 支持 | 支持 | ✅ 迁移完成 |
| **@ 引用文件** | 支持 (自定义实现) | 支持 (React 组件 + 模糊搜索) | ✅ 迁移完成 (体验升级) |
| **图片上传** | 支持 | 支持 (React 组件) | ✅ 迁移完成 |
| **模型切换** | 支持 | 支持 (Obsidian Menu 集成) | ✅ 迁移完成 |
| **流式响应** | 支持 | 支持 | ✅ 迁移完成 |
| **全局模式** | 支持 | 支持 | ✅ 迁移完成 |
| **上下文解析** | 支持 | 支持 (逻辑重构) | ✅ 迁移完成 |

## 3. 风险评估

### 3.1 潜在风险
- **样式兼容性**: 新版 `QuickAskOverlay` 使用了完全不同的 DOM 结构 (React Root)，可能会受到不同主题 CSS 的影响。
  - *缓解措施*: `QuickAskPanel` 采用了 Scoped CSS 类名，并尽量复用 Obsidian 标准变量。
- **上下文解析逻辑差异**: 新版解析逻辑在 `QuickAskOverlay.tsx` 中重写，虽然逻辑相似，但在边缘情况（如复杂路径引用）下可能表现不同。
  - *缓解措施*: 已在 `QuickAskOverlay` 中实现了与原版一致的文件读取逻辑。
- **Prompt Selector 集成**: 目前 `#` 触发提示词模板的功能尚未在新版面板中完全验证/实现。
  - *注意*: 本次迁移主要关注 `@` 触发和基础对话，`#` 触发功能如果依赖外部组件 `PromptSelectorPopup`，可能需要后续跟进验证。

### 3.2 回归测试计划

为确保功能完整性，建议执行以下回归测试用例：

#### 用例 1: 基础文本对话
1. 在编辑器中输入 `@`。
2. 确认 `QuickAskOverlay` 弹出。
3. 输入 "Hello World" 并回车。
4. 验证 AI 浮窗是否出现并开始流式输出。

#### 用例 2: 上下文引用
1. 在编辑器中输入 `@`。
2. 在弹出的列表中选择一个 Markdown 文件。
3. 输入 "总结这个文件" 并回车。
4. 验证 AI 是否能读取该文件内容并生成摘要。

#### 用例 3: 图片上传
1. 打开对话弹窗。
2. 点击回形针图标或粘贴图片。
3. 验证图片预览是否显示。
4. 发送消息，验证 AI 是否接收到图片数据。

#### 用例 4: 模型切换
1. 打开对话弹窗。
2. 点击右下角的模型名称。
3. 在下拉菜单中选择另一个模型。
4. 验证按钮显示的名称是否更新。
5. 发送消息，验证是否使用了新选择的模型。

#### 用例 5: 全局模式
1. 关闭所有编辑器页面（或点击侧边栏空白处）。
2. 使用快捷键触发全局对话（如 `Ctrl+P` 运行命令）。
3. 验证弹窗是否出现在屏幕中央。
4. 进行对话，验证功能是否正常。

## 4. 后续建议
- 监控 `#` 触发器的行为，如果新版面板不支持，需要参考 `PromptSelectorPopup` 实现逻辑。
- 收集用户关于新版 UI 的反馈，优化交互细节（如动画、快捷键响应）。
