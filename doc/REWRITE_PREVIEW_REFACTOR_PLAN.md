# 改写预览重构方案（对齐 obsidian-yolo）

本方案基于 REWRITE_COLOR_ANALYSIS.md 的目标：将当前“内联/浮窗确认”改写流程，重构为“独立 Apply View 差异视图”，并在生成后直接打开新窗口进行对比与选择，移除旧的确认逻辑。

## 目标与范围
- 将改写预览从编辑器内联/浮窗确认，切换为独立视图窗口展示 Diff（新增/删除）。
- 生成完成后自动打开新窗口，不再停留在旧的 AIPreviewPopup 确认流程。
- 保留对比与选择能力：逐块接受 incoming（AI 结果）、保留 current（原文）、或合并 both。
- 统一颜色与样式为 CSS 变量驱动（已在样式表中存在 markdown-next-ai-* 变量与类）。

## 参考实现与需要“照抄”的代码
- 视图组件：从 obsidian-yolo 直接对齐交互与结构
  - 源文件: d:\\Microsoft VS Code\\PYTHON\\FlowText\\obsidian-yolo-1.4.13\\obsidian-yolo-1.4.13\\src\\components\\apply-view\\ApplyViewRoot.tsx
  - 现有目标: [ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx)
  - 差异要点: 本项目已存在同名实现与类名，将对齐行为细节（决定态、工具栏、滚动定位），确保开窗后体验一致。

- 控制器逻辑：改写生成后直接打开 Apply View
  - 源文件: d:\\Microsoft VS Code\\PYTHON\\FlowText\\obsidian-yolo-1.4.13\\obsidian-yolo-1.4.13\\src\\features\\editor\\write-assist\\writeAssistController.ts
  - 迁移重点:
    - 计算 newContent: 用“头部 + 重写文本 + 尾部”拼接，而不是直接替换选区后写回。
    - 直接打开视图: workspace.getLeaf(true).setViewState({ type: APPLY_VIEW_TYPE, state: { file, originalContent, newContent } })
    - 不经过旧的 AIPreviewPopup；生成完成后自动进入差异视图。

- Diff 工具：使用 vscode-diff 生成块级差异
  - 已存在目标: [diff.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/utils/diff.ts)
  - 依赖: package.json 已包含 "vscode-diff"（无需再次安装）

## 需要改动的模块
- 主流程入口与生成后行为
  - 文件: [main.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts)
  - 现状: 仍保留 AIPreviewPopup（“确认插入/替换”）并在确认后才调用 openApplyView
  - 修改:
    - 在续写/改写的生成完成后，直接构造 { originalContent, newContent } 并调用 openApplyView，跳过 AIPreviewPopup 的确认环节
    - openApplyView 调整为“总是创建新 leaf”（使用 workspace.getLeaf(true)），确保“打开新窗口”
    - 在右键菜单与 @ 触发入口中，统一走“生成后直接打开 Apply View”的路径

- 视图容器与注册
  - 文件: [ApplyView.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyView.ts)
  - 现状: 已注册 APPLY_VIEW_TYPE 并可渲染 Root
  - 修改:
    - 保持现有注册与渲染逻辑
    - close 时回到原文件视图的策略保持与 obsidian-yolo 一致（优先聚焦已打开的 markdown 叶）

- 视图组件（Diff 块与交互）
  - 文件: [ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx)
  - 现状: 已实现与 obsidian-yolo 等价的“块级决定”、“接受全部/拒绝全部”、“滚动定位”等
  - 修改:
    - 对齐类名/结构已完成；后续仅在需要时微调 t() 文本与工具栏按钮文案

- 样式与颜色
  - 文件: [styles.css](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/styles.css#L3216-L3489)
  - 现状: 已包含 markdown-next-ai-apply-view 区域类与 CSS 变量（--markdown-next-ai-incoming-color-rgb / --markdown-next-ai-current-color-rgb）
  - 修改:
    - 如需对齐 obsidian-yolo 的透明度与线条样式，可在现有类上微调参数，无需额外新增命名空间

## 关键数据流与行为调整
- 原文与新文的构造
  - 获取原文 originalContent: 读取当前文件全量文本
  - 选区信息:
    - 头部 head = 文档开头至选区 from
    - 选中文本 selectedText
    - 尾部 tail = 文档 from+selected.length 至文档末尾
  - newContent = head + rewritten + tail

- 打开视图与回焦
  - 打开: workspace.getLeaf(true).setViewState({ type: APPLY_VIEW_TYPE, active: true, state })
  - 回焦: 应用后，优先聚焦已存在展示该文件的 leaf；如无则打开一次并聚焦

- 决策应用
  - 视图在“Apply & Close”时，将 decisions 折叠为最终合成文本，并写回 vault.modify(file, newText)

## 清理与禁用旧逻辑
- 移除或绕过 AIPreviewPopup 流程（不再“确认后插入/替换”）
- 不再使用“内联 span 注入”或“浮窗按钮确认”作为主路径
- 历史兼容组件可保留代码，但从入口逻辑中移除其调用

## 任务清单
- 在 main.ts 中改写生成后流程，直接打开 Apply View（移除 AIPreviewPopup 确认）
- 将 openApplyView 调整为总是 workspace.getLeaf(true) 打开新窗口
- 保持 ApplyView.ts/ApplyViewRoot.tsx 与样式对齐（必要时微调文案与类）
- 验证 Diff 生成与样式（新增/删除块、工具栏、滚动定位）
- 验证右键菜单与 @ 触发入口均走“新窗口差异视图”路径

## 代码参考索引
- 主插件入口: [main.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts)
- 打开视图容器: [ApplyView.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyView.ts)
- 视图组件: [ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx)
- Diff 工具: [diff.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/utils/diff.ts)
- 样式: [styles.css](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/styles.css#L3216-L3489)

