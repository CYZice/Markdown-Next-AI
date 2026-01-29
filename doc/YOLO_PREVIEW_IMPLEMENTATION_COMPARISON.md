# YOLO 预览确认方案对比与实现总结

## 概览
- 目标：在 Markdown-Next-AI 中实现与 obsidian-yolo 一致的“源文件无缝插入→预览确认→应用并回到原界面”的工作流
- 关键组件与职责
  - 打开确认视图：通过 setViewState 切换到 ApplyView（不新开独立窗口）
  - 差异计算：按行级 diff 生成区块，支持逐块裁决与全局操作
  - 应用与聚焦：写回文件后优先聚焦已有该文件的 markdown leaf；确实不存在时只打开一次

## 确认视图打开流程
- Markdown-Next-AI
  - 入口：AIPreviewPopup 在生成完成后展示“替换 / 追加 / 放弃”按钮  
    [main.ts:760-807](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts#L760-L807)
  - 替换路径：根据是否选区计算 replaceDoc（选区则整体替换；否则在光标位置插入）  
    [main.ts:767-781](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts#L767-L781)
  - 追加路径：保留原文，并在选区后或光标处追加生成内容  
    [main.ts:786-805](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts#L786-L805)
  - 打开 ApplyView：复用当前文件的 leaf，避免新开 pane；设置 state 为 { file, originalContent, newContent }  
    [main.ts:251-266](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts#L251-L266)
- obsidian-yolo
  - 入口：handleCustomRewrite 生成 rewritten 后，计算 head/tail 拼接 newContent  
    [writeAssistController.ts:195-202](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/features/editor/write-assist/writeAssistController.ts#L195-L202)
  - 打开 ApplyView：setViewState(APPLY_VIEW_TYPE) 并传入 { file, originalContent, newContent }  
    [writeAssistController.ts:203-211](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/features/editor/write-assist/writeAssistController.ts#L203-L211)

结论：两者均在同一工作区 leaf 上切换视图并携带原文与候选新文，确保“就地确认”体验一致。

## 无缝插入与确认
- 差异视图
  - M-NAI：ApplyViewRoot 通过 createDiffBlocks 产生日志块，支持接受 incoming/current/both、全局接受/重置、预览决策结果  
    [ApplyViewRoot.tsx:239-331](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L239-L331)
  - YOLO：同样按区块渲染 diff，并提供逐块与全局操作  
    [ApplyViewRoot.tsx:312-341](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/apply-view/ApplyViewRoot.tsx#L312-L341)
- 生成最终内容
  - M-NAI：根据各区块裁决（incoming/current/both/pending）拼接最终文本  
    [ApplyViewRoot.tsx:90-116](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L90-L116)
  - YOLO：同等逻辑，保证应用结果与用户裁决一致  
    [ApplyViewRoot.tsx:90-116](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/apply-view/ApplyViewRoot.tsx#L90-L116)

结论：裁决与最终内容生成流程等价；视觉样式不同属命名与风格差异，但交互与功能一致。

## 应用与聚焦
- Markdown-Next-AI
  - 应用：写回 vault.modify(file, newContent)  
    [ApplyViewRoot.tsx:123-125](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L123-L125)
  - 聚焦：关闭视图后，优先寻找已有该文件的 markdown leaf 并聚焦；若无则打开一次  
    [ApplyViewRoot.tsx:127-146](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L127-L146)
  - Close 回调：优先恢复到文件（leaf.openFile(file)），否则 detach  
    [ApplyView.ts:55-62](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/apply-view/ApplyView.ts#L55-L62)
- obsidian-yolo
  - 应用：写回后尝试聚焦现有 leaf；若不存在则打开一次  
    [ApplyViewRoot.tsx:118-143](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/apply-view/ApplyViewRoot.tsx#L118-L143)
  - Close 回调：detach，然后通过聚焦逻辑返回到文件  
    [ApplyView.tsx:63-66](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/ApplyView.tsx#L63-L66)

结论：两者都保证“应用后仍在当前界面工作”，仅在必要时打开一次以确保用户可见。

## 与 YOLO 的一致性检查
- 视图切换：均使用 setViewState 打开 ApplyView，并在当前工作区内进行确认视图展示
- 文本合成：均基于选区/光标位置构造 head + rewritten + tail 或等价的 slice 合成
- 差异裁决：逐区块 + 全局操作 + 决策预览，生成最终内容规则一致
- 关闭与聚焦：写回后保证回到原文件，避免新窗口/新 pane 干扰

现存差异（不影响功能一致性）
- 命名与样式：M-NAI 使用 markdown-next-ai-* 样式类，YOLO 使用 smtcmp-* 前缀
- 关闭回调：M-NAI close 回调倾向直接恢复到文件视图；YOLO 是 detach + 聚焦，这两种都能保持就地体验

## 结论
- Markdown-Next-AI 已实现与 obsidian-yolo 等价的“无缝插入→预览确认→应用并保持当前界面”方案
- 通过复用当前文件的 leaf、对齐 ApplyView 的应用与聚焦逻辑，实现了不打开新窗口的确认体验
- 若后续需要完全镜像 YOLO 的 leaf 生命周期（始终 detach 再聚焦），可微调 close 回调；不影响核心体验与一致性

