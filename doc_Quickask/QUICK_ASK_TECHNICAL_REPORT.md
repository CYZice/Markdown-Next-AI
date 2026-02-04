# QuickAsk 对话框技术拆解报告

## 1. 概述
本报告基于对 `src/ui/quick-ask/` 目录下 `QuickAskOverlay.tsx` 和 `QuickAskPanel.tsx` 的逆向分析，详细拆解了 Quick Ask 风格对话框的 UI 结构、交互逻辑及技术实现细节。

## 2. DOM 节点层级图
Quick Ask 使用 React Portals 或直接挂载 Root 的方式将对话框渲染到 `document.body` 下，独立于 Obsidian 的 workspace 结构。

```html
body
├── ... (Obsidian App Shell)
└── div.quick-ask-overlay (绝对定位容器)
    └── div.quick-ask-panel (React 组件根节点)
        ├── div (Header 区域)
        │   ├── div.markdown-next-ai-react-handle (拖拽手柄)
        │   └── div (输入行容器)
        │       ├── textarea (自动高度输入框)
        │       └── button (关闭按钮)
        ├── div (内容区域)
        │   ├── div (消息列表容器, overflow:auto)
        │   │   ├── div.message-item (用户消息)
        │   │   └── div.message-item (AI 消息)
        │   └── div (底部工具栏)
        │       ├── div (左侧工具: 模型名称)
        │       └── button (发送按钮)
        ├── div.resize-handle-right (右侧缩放手柄)
        ├── div.resize-handle-bottom (底部缩放手柄)
        └── div.resize-handle-bottom-right (右下角缩放手柄)
```

## 3. 样式变量与主题映射表
Quick Ask 组件主要通过内联样式结合 CSS 变量实现主题适配，减少了对外部 CSS 文件的强依赖。

| CSS 变量 | 默认值 | 用途 | 对应 Obsidian 变量 (推测) |
| :--- | :--- | :--- | :--- |
| `--mn-bg` | `#fff` | 背景色 | `--background-primary` |
| `--mn-border` | `#e5e7eb` | 边框/分割线 | `--background-modifier-border` |
| `--mn-text` | (继承) | 文本颜色 | `--text-normal` |
| `--mn-accent` | (未显式使用) | 强调色 | `--interactive-accent` |

**注**: 大量样式直接写在 JSX 的 `style` 属性中（如 `boxSizing: 'border-box'`, `display: 'flex'`），这使得组件自包含性强，但也增加了样式定制的难度。

## 4. 交互事件流

### 4.1 打开流程
1. **触发**: 外部调用 `QuickAskOverlay.open()`。
2. **定位**:
   - 获取当前光标位置 (`CursorPosition`)。
   - 计算弹窗坐标，确保不溢出屏幕边界。
3. **挂载**:
   - 创建 `div.quick-ask-overlay` 容器。
   - 使用 `ReactDOM.createRoot` 渲染 `QuickAskPanel`。
   - 添加到 `document.body`。
4. **聚焦**: `QuickAskPanel` 挂载后，`useEffect` 触发 `textarea` 聚焦。

### 4.2 输入与发送
1. **输入**: 用户在 `textarea` 输入文本，React `useState` 更新状态。
2. **自动高度**: 监听输入变化，动态调整 `textarea` 高度。
3. **发送**:
   - 用户点击发送按钮或按 `Enter`（非 Shift+Enter）。
   - 调用 `props.onSubmit(text)`。
   - 父组件 (`QuickAskOverlay`) 接收回调，调用 `AIService`。
   - UI 状态更新：添加用户消息到列表。

### 4.3 接收与流式更新
1. **开始**: `QuickAskOverlay` 调用 `panelRef.current.startAssistantMessage()`，UI 显示 "正在思考中..."。
2. **流式更新**: `AIService` 回调触发 `QuickAskOverlay.updateAssistantStreaming`，进而调用 `panelRef.current.updateAssistantMessage(text)`。
3. **滚动锁定**:
   - 默认开启自动滚动（Auto-scroll）。
   - 若用户向上滚动查看历史，触发 `handleScroll`，暂时禁用自动滚动。
   - 若用户滚动到底部，重新启用自动滚动。
4. **完成**: 流结束，调用 `finishAssistantMessage()`。

### 4.4 关闭流程
1. **触发**: 点击关闭按钮、按下 `Esc` 键、或点击弹窗外部（如果配置了点击外部关闭）。
2. **清理**:
   - `ReactDOM` 卸载组件。
   - 移除 `div.quick-ask-overlay` 容器。
   - 恢复编辑器焦点（可选）。

## 5. 依赖的 Obsidian API 清单

| API 名称 | 用途 | 备注 |
| :--- | :--- | :--- |
| `App` | 获取全局状态 | 传递给 Overlay |
| `MarkdownView` | 获取编辑器视图 | 用于获取选中文本、光标位置 |
| `editor.getCursor()` | 获取光标坐标 | 用于弹窗定位 |
| `editor.getSelection()` | 获取选中文本 | 作为上下文传递给 AI |
| `Menu` | (潜在) 上下文菜单 | 目前 Quick Ask 代码中未直接使用，但可能需要 |

## 6. 生命周期钩子
- **Overlay**:
  - `constructor`: 初始化属性。
  - `open()`: 挂载 DOM。
  - `close()`: 卸载 DOM，清理引用。
- **Panel (React)**:
  - `useEffect` (mount): 绑定滚动事件、全局事件监听。
  - `useEffect` (messages change): 触发自动滚动。
  - `useImperativeHandle`: 暴露方法给 Overlay 调用。

