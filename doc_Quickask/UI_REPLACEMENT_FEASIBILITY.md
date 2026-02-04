# UI 替换可行性评估文档

## 1. 结论摘要
**总体结论**: **可行，但有重大工作量**。
将原有的 `AtTriggerPopup` 替换为 Quick Ask 风格的 React 组件在技术上是完全可行的，并且长远来看有利于代码维护和 UI 统一。
然而，目前 Quick Ask 组件 (`QuickAskPanel`) 缺乏现有弹窗的核心高级功能（`@` 文件引用、`/` 命令提示、图片上传管理），直接替换会导致功能缺失。

**是否存在阻塞性不兼容**: **否**。没有技术上的死胡同，所有功能都可以在 React 中重新实现。

## 2. 兼容性结论

### 2.1 可直接复用的模块
- **拖拽/定位逻辑**: `QuickAskOverlay` 中的定位算法可以直接使用。
- **流式消息处理**: `QuickAskPanel` 中的 `updateAssistantMessage` 逻辑清晰，可直接用于展示。
- **AI 服务集成**: `AIService` 保持不变，Overlay 层的 `onSubmit` 接口适配层已存在。

### 2.2 需要重写的模块 (高优先级)
1.  **输入框组件 (InputContextSelector)**:
    - 原实现: 绑定在 `contentEditable` div 上的原生 JS 类。
    - 需重写: 需要将其转换为 React 组件（或封装的 `div`），支持 `@` 触发下拉菜单、插入高亮标签。**这是工作量最大的部分**。建议参考 `AtTriggerPopup` 的逻辑，用 React 状态管理建议列表的渲染。
2.  **命令提示器 (PromptSelectorPopup)**:
    - 原实现: 原生 DOM 弹窗。
    - 需重写: React 组件，监听 `/` 输入。
3.  **图片上传/预览区**:
    - 原实现: `ImageHandler` + DOM 操作。
    - 需重写: React 组件，展示图片缩略图，提供删除按钮。
4.  **模型选择器**:
    - 需重写: 将 Quick Ask 底部仅显示的文本改为可交互的下拉菜单或 Popover。

### 2.3 需要新增适配的 AI 服务调用点
- 保持后端 `AIService.sendRequest` 接口不变。
- 在 `QuickAskOverlay` 的 `onSubmit` 中，需要收集以下数据并传递：
    - `prompt`: 纯文本内容。
    - `images`: 图片数据数组。
    - `contextContent`: 从 React 状态中管理的已引用文件内容。
    - `modelId`: 当前选择的模型 ID。

## 3. 最小可行替换方案 (MVP)

为了降低风险，建议分阶段实施。MVP 阶段的目标是**功能对齐**，而非完美 UI。

### 3.1 文件级变更清单
1.  **修改** `src/ui/quick-ask/QuickAskPanel.tsx`:
    - 将 `textarea` 替换为 `div contentEditable` 或增强版 `textarea` (若仅支持纯文本引用)。
    - 增加 `SuggestionList` 组件 (用于渲染 @ 列表)。
    - 增加 `AttachmentArea` 组件 (用于图片预览)。
    - 增加 `ModelSelector` 组件。
2.  **修改** `src/ui/quick-ask/QuickAskOverlay.tsx`:
    - 增加上下文管理逻辑 (`SelectedContext` state)。
    - 适配 `InputContextSelector` 的逻辑到 React。
3.  **新增** `src/ui/quick-ask/hooks/`:
    - `useInputContext.ts`: 处理 `@` 触发逻辑。
    - `useImageUpload.ts`: 处理粘贴/拖拽上传。
4.  **替换入口**:
    - 修改 `main.ts`，将 `openAtTriggerPopup` 的实现切换为实例化 `QuickAskOverlay`。

### 3.2 依赖版本约束
- `react`: >= 18.0.0 (已满足)
- `react-dom`: >= 18.0.0 (已满足)
- 无需新增 npm 依赖。

## 4. 下一步实施计划

### 阶段一：基础组件补全 (预计 2-3 天)
1.  **移植 SuggestionList**: 创建 React 版的建议列表组件，支持键盘导航。
2.  **实现 ContextInput**: 创建支持 `@` 触发的输入框组件，能正确解析和渲染引用标签。
3.  **实现 ImageUploader**: 简单的图片上传和预览组件。

### 阶段二：集成与验证 (预计 1-2 天)
1.  在 `QuickAskPanel` 中组装上述组件。
2.  在 `QuickAskOverlay` 中连接 `AIService`。
3.  编写测试用例：
    - 输入 `@` 是否弹出列表？
    - 选择文件后是否正确加入 Context？
    - 发送请求是否携带了 Context 和图片？

### 阶段三：切换与回滚准备 (预计 0.5 天)
1.  在 `main.ts` 中添加特性开关 (Feature Flag) `useNewUI`。
2.  默认开启新 UI，保留旧代码 1-2 个版本以防万一。
3.  发布灰度版本测试。

## 5. 风险评估
- **输入体验差异**: 从原生 DOM 迁移到 React，`contentEditable` 的光标管理是常见痛点，需特别注意输入中文时的光标跳动问题。
- **样式冲突**: 需确保 Quick Ask 的样式权重足够高，不被主题样式覆盖。
