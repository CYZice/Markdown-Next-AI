# Obsidian-YOLO Selection Toolbar 实现分析

本文档分析了 `obsidian-yolo` 插件中 Selection Toolbar（选中工具栏）的实现方案，旨在指导将其复刻到 `Markdown-Next-AI` 项目中。

## 1. 核心交互模式 (Interaction Pattern)

YOLO 采用了 **"两阶段交互"** 模式，避免了传统 Selection Toolbar 直接弹出菜单遮挡视线的问题：

1.  **阶段一 (Indicator)**: 用户选中文本后，首先在选区附近显示一个小型的 "Indicator"（图标，如 Sparkles）。
    *   这是一个非侵入式的浮动按钮。
    *   如果用户不操作，它会静静地待在那里。
2.  **阶段二 (Menu)**: 当用户鼠标悬停 (Hover) 在 Indicator 上时，展开完整的 "Actions Menu"（操作菜单）。
    *   菜单包含具体的功能按钮（如 AI 改写、深入解释等）。
    *   鼠标移开后，菜单会自动延迟隐藏。

## 2. 核心组件架构

实现主要由以下几个组件构成：

### 2.1 SelectionManager (业务逻辑核心)
*   **文件**: `src/components/selection/SelectionManager.ts`
*   **职责**:
    *   监听全局 `selectionchange` 事件。
    *   **防抖 (Debounce)**: 使用 `setTimeout` (300ms) 避免选区变化时的频繁触发。
    *   **有效性检查**: 检查选区是否在编辑器内 (`isInEditor`)、长度是否达标 (`minSelectionLength`)、是否为空。
    *   **坐标计算**: 获取选区的 `DOMRect`，用于后续 UI 定位。
    *   **单例模式/状态管理**: 维护当前选区状态 (`SelectionInfo`) 并通知订阅者。

### 2.2 SelectionChatWidget (协调者组件)
*   **文件**: `src/components/selection/SelectionChatWidget.tsx`
*   **职责**:
    *   作为 React 根组件挂载到 DOM 中。
    *   **状态机**: 管理 `Indicator` 和 `Menu` 的显示/隐藏逻辑。
    *   **定时器逻辑**:
        *   `showTimeout` (150ms): 悬停在 Indicator 上 150ms 后显示 Menu。
        *   `hideTimeout` (300ms): 鼠标移开后 300ms 隐藏 Menu（给用户移动鼠标到 Menu 上的时间）。
    *   同时渲染 `SelectionIndicator` 和 `SelectionActionsMenu`。

### 2.3 SelectionIndicator (视觉入口)
*   **文件**: `src/components/selection/SelectionIndicator.tsx`
*   **职责**:
    *   渲染浮动的 Sparkles 图标。
    *   **定位逻辑**:
        *   默认显示在选区结束位置的右下方。
        *   **边界检查**: 确保不超出屏幕边界 (Viewport Bounds Check)。
        *   RTL (从右向左) 语言支持。
    *   处理 `MouseEnter`/`MouseLeave` 事件来触发 Menu 的显示。

### 2.4 SelectionActionsMenu (功能菜单)
*   **文件**: `src/components/selection/SelectionActionsMenu.tsx`
*   **职责**:
    *   渲染具体的操作按钮列表。
    *   **定位逻辑**:
        *   相对于 Indicator 定位 (通常在 Indicator 右侧)。
        *   同样包含边界检查（如果右侧空间不足，显示在左侧）。
    *   处理点击事件并调用回调。

## 3. 关键算法与细节

### 3.1 定位算法 (Positioning)
YOLO 不依赖第三方 Popper 库，而是手动计算坐标，逻辑如下：
1.  获取容器 (Container) 和 选区 (Selection Rect) 的 `getBoundingClientRect`。
2.  计算相对坐标：`left = rect.right - containerRect.left + offset`。
3.  **边界修正**:
    ```typescript
    if (left + width > viewportWidth) left = viewportWidth - width - padding;
    if (top + height > viewportHeight) top = rect.top - ...; // 向上翻转
    ```

### 3.2 样式体系 (CSS)
YOLO 使用了 `smtcmp-selection-*` 前缀的类名。复刻时应映射为 `markdown-next-ai-selection-*`。
*   关键动画: `opacity` 和 `transform: scale` 的过渡，实现平滑的出现/消失效果。
*   层级: `z-index` 需确保高于编辑器内容。

## 4. 复刻计划 (Implementation Plan) - React 方案

### 步骤 1: 环境准备
*   安装 React 依赖: `npm install react react-dom` 和 `npm install -D @types/react @types/react-dom`。
*   配置构建工具: 确保 `esbuild` 支持 JSX/TSX 编译。

### 步骤 2: 移植 SelectionManager
*   复制 `src/components/selection/SelectionManager.ts` (参照 YOLO)。
*   保留核心业务逻辑：防抖、选区检测、坐标计算。
*   确保与 Obsidian API (`Editor`, `Workspace`) 的兼容性。

### 步骤 3: 移植 UI 组件 (React 版)
*   **SelectionChatWidget**: 直接复刻 `SelectionChatWidget.tsx`，作为 React 根组件。
    *   负责挂载到 DOM (使用 `createRoot`)。
    *   管理 Indicator 和 Menu 的显示状态。
*   **SelectionIndicator**: 复刻 `SelectionIndicator.tsx`。
*   **SelectionActionsMenu**: 复刻 `SelectionActionsMenu.tsx`。
*   **图标组件**: 使用 `lucide-react` 或适配 Obsidian 的 `setIcon`。

### 步骤 4: 移植 CSS
*   将 `smtcmp-selection-*` 样式提取并重命名为 `markdown-next-ai-selection-*`。
*   确保动画效果 (`opacity`, `transform`) 一致。

### 步骤 5: 集成
*   在 `main.ts` 中初始化 `SelectionManager`。
*   创建 React 挂载点，将 `SelectionChatWidget` 渲染到 Obsidian 的 UI 层中。

## 5. 待解决问题
*   **依赖项**: 确认是否需要 `lucide-react` 图标库，或者直接使用 Obsidian 内置的 `setIcon`。
    *   *方案*: 使用 Obsidian 的 `setIcon(el, "sparkles")`。
*   **事件冲突**: 确保点击 Menu 按钮不会导致选区丢失（使用 `mousedown` + `preventDefault` 或在点击后重新恢复选区）。
