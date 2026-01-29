# AI 改写底色实现分析与对比报告

本分析报告详细对比了 `Markdown-Next-AI` 与 `obsidian-yolo` 两个项目中 AI 改写功能的底色实现方式。

## 1. Markdown-Next-AI 的实现

### 核心机制：内联 HTML 注入 (Inline HTML Injection)
`Markdown-Next-AI` 采用了一种直接修改编辑器内容的"侵入式"预览方案。它通过直接向 Markdown 文档中插入带有内联样式（Inline Styles）的 HTML `<span>` 标签来实现高亮效果。

### 具体实现代码
**文件**: [src/main.ts](src/main.ts) (约第 740-760 行)

在处理改写请求时，代码会构建包含硬编码颜色的 HTML 字符串，并使用 `editor.replaceSelection` 或 `editor.replaceRange` 插入到文档中。

```typescript
// 引用自 src/main.ts
// 用<span>包裹AI输出，实现绿色背景；修改模式下还用橙色背景包裹原文（无删除线）
const previewId = "markdown-next-ai-preview-" + Date.now();
const originalId = "markdown-next-ai-original-" + Date.now();

// 1. AI 生成内容：浅绿色背景 (#90EE90)
const greenOpenTag = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;

// 2. 原文内容（修改模式）：暖橙色背景 (#FFF3E0) + 橙色底部边框 (#FFB74D)
const redOpenTag = `<span style="background:#FFF3E0;border-bottom: 2px solid #FFB74D;" data-original-id="${originalId}">`;
const closingTag = "</span>";

// 插入逻辑
if (isModification) {
    // 修改模式：橙色背景包裹原文 + 绿色背景用于AI生成内容
    const combinedTags = `${redOpenTag}${selectedText}${closingTag}${greenOpenTag}${closingTag}`;
    editor.replaceSelection(combinedTags);
} else {
    // 续写模式：只有绿色背景
    editor.replaceRange(`${greenOpenTag}${closingTag}`, insertPos);
}
```

### 颜色定义
- **AI 生成内容 (新增)**: `background: #90EE90` (LightGreen - 浅绿色)
- **原文内容 (待修改)**: 
  - 背景: `background: #FFF3E0` (Light Orange - 浅橙色)
  - 边框: `border-bottom: 2px solid #FFB74D` (Orange - 橙色)
- **特点**: 颜色是**硬编码**在 TypeScript 代码中的，未直接使用 CSS 类或变量（虽然 `styles.css` 中有定义 `.markdown-next-ai-diff-added` 等类，但在此处内联预览逻辑中未使用）。

---

## 2. Obsidian-Yolo 的实现

### 核心机制：独立差异视图 (Separate Diff View)
`obsidian-yolo` 采用了更为分离的架构。它不修改原始文档的内容，而是计算 Diff（差异）并在一个独立的 React 组件视图（Apply View）中展示对比结果。

### 具体实现代码
**组件**: `ApplyViewRoot.tsx`
**样式**: `styles.css`

它通过 React 组件渲染 `DiffBlock`，并根据差异类型应用 CSS 类。

### 颜色定义
**文件**: `styles.css`

颜色是通过 CSS 变量定义，并在样式表中应用透明度：

1. **定义变量**:
   ```css
   --smtcmp-current-color-rgb: 185, 28, 28; /* red-700 (红色) */
   --smtcmp-incoming-color-rgb: 4, 120, 87; /* emerald-700 (祖母绿/深绿色) */
   ```

2. **应用背景 (带 30% 透明度)**:
   - **新增内容 (Added)**: 
     ```css
     .smtcmp-diff-block.added {
       background-color: rgba(var(--smtcmp-incoming-color-rgb), 0.3);
     }
     ```
   - **删除内容 (Removed)**: 
     ```css
     .smtcmp-diff-block.removed {
       background-color: rgba(var(--smtcmp-current-color-rgb), 0.3);
     }
     ```

---

## 3. 对比总结

| 特性 | Markdown-Next-AI | Obsidian-Yolo |
| :--- | :--- | :--- |
| **实现方式** | **内联 HTML 注入** (Inline Injection) | **独立视图渲染** (Separate View Rendering) |
| **对文档的影响** | **侵入式**：临时修改了用户文档内容（插入 HTML 标签），用户若在预览时保存文件，标签会被保存。 | **非侵入式**：文档内容保持不变，仅在独立 UI 中展示差异。 |
| **颜色管理** | **硬编码** (Hardcoded Hex Colors) 在 `.ts` 文件中。 | **CSS 变量** (CSS Variables) 在 `.css` 文件中，支持主题定制。 |
| **视觉风格** | 橙色 (原文) + 浅绿色 (AI) | 红色 (删除) + 绿色 (新增) |
| **Diff 粒度** | 简单的文本替换/追加。 | 基于字符/单词的详细 Diff 算法 (Diff Blocks)。 |
| **交互体验** | 在编辑器内直接看到“高亮”文本。 | 在侧边或浮动面板中查看“对比”视图。 |

### 建议
- 如果追求**开发速度和直观性**，`Markdown-Next-AI` 的内联方式实现简单，用户能直接在光标处看到结果。
- 如果追求**代码整洁、主题适配和数据安全**（防止意外保存 HTML 标签），`obsidian-yolo` 的独立视图或使用 CodeMirror 的 `Decoration`（装饰器）API 是更专业的做法。

---

## 4. 实施规划 (Refactoring Plan)

**目标**: 将 `Markdown-Next-AI` 的改写预览功能重构为使用独立的 React 差异视图 (Apply View)，复用 `obsidian-yolo` 的实现代码。

### 4.1. 依赖项 (Dependencies)

`obsidian-yolo` 使用了 `vscode-diff` 库来计算文本差异。
- **操作**: 需要在 `Markdown-Next-AI` 中安装 `vscode-diff`。
  ```bash
  npm install vscode-diff
  ```

### 4.2. 文件迁移与创建 (Files to Port)

我们将从 `obsidian-yolo` 移植以下核心文件，并根据项目结构进行调整：

1.  **Diff 工具类**:
    - **源文件**: `src/utils/chat/diff.ts`
    - **目标文件**: `src/utils/diff.ts`
    - **内容**: 包含 `createDiffBlocks` 函数和 `DiffBlock` 类型定义。

2.  **React 视图组件**:
    - **源文件**: `src/components/apply-view/ApplyViewRoot.tsx`
    - **目标文件**: `src/ui/apply-view/ApplyViewRoot.tsx`
    - **调整**:
        - 移除 `useApp`, `useLanguage` 等 `yolo` 特有的 Context 钩子。
        - 将 `app` 作为 props 传递，或创建一个简单的 `AppContext`。
        - 将 `t` (翻译函数) 简化或替换为直接的字符串/简单的 i18n 实现。

3.  **Obsidian 视图容器**:
    - **源文件**: `src/ApplyView.tsx`
    - **目标文件**: `src/ui/apply-view/ApplyView.ts`
    - **内容**: 继承 `ItemView`，负责挂载 React Root 并渲染 `ApplyViewRoot` 组件。

### 4.3. 样式迁移 (Styles Migration)

需要将 `obsidian-yolo` 中 `styles.css` 里关于 Diff Block 的样式复制过来。

- **源 CSS 选择器**:
    - `.smtcmp-diff-block` 及其子类 (`.added`, `.removed`)
    - `.smtcmp-diff-block-container`
    - `.smtcmp-diff-block-actions`
    - `.smtcmp-apply-toolbar` 相关样式
    - CSS 变量: `--smtcmp-incoming-color-rgb`, `--smtcmp-current-color-rgb` 等。
- **目标文件**: `styles.css` (追加到末尾)

### 4.4. 集成逻辑 (Integration Logic)

1.  **注册视图**:
    - 在 `src/main.ts` 的 `onload` 方法中注册 `ApplyView`。
    - 定义视图常量 `APPLY_VIEW_TYPE = 'markdown-next-ai-apply-view'`.

2.  **触发预览**:
    - 修改 `src/main.ts` 中的改写处理逻辑 (原 `replaceSelection` 处)。
    - **新逻辑**:
        1. 获取原文内容 (`selectedText`)。
        2. 获取 AI 生成的新内容 (`replacement`).
        3. 打开 `ApplyView` (使用 `workspace.getLeaf(true)` 或 `getRightLeaf`).
        4. 设置视图状态: `{ file: currentFile, originalContent: ..., newContent: ... }`.

### 4.5. 待办事项清单 (Checklist)

- [ ] 安装 `vscode-diff` 依赖。
- [ ] 创建 `src/utils/diff.ts` 并移植代码。
- [ ] 创建 `src/ui/apply-view/` 目录。
- [ ] 移植并适配 `ApplyViewRoot.tsx` (移除复杂 Context 依赖)。
- [ ] 创建 `ApplyView.ts` 容器类。
- [ ] 迁移 CSS 样式变量和类定义。
- [ ] 修改 `main.ts` 注册视图。
- [ ] 修改 `main.ts` 业务逻辑，调用视图展示结果。
