toolName: todo_write
            
status: success
          
Todos updated: 1 items
          
**迁移目标**
- 将 YOLO 的 Tab 自动补全“逻辑函数”完整迁入，保持触发体验、建议质量、接受/取消交互与 YOLO 一致。
- 保持 Markdown-Next-AI 的总体架构不变：继续使用现有编辑器扩展注册、幽灵文字渲染、AIService 流式接口与设置面板。
- 避免引入 YOLO 的大型 UI/会话/路由/RAG 等非必要模块，只迁入纯逻辑与策略。

**一致性要求**
- 触发一致：字符串/正则触发器、空闲停顿触发、延迟与冷却策略与 YOLO 对齐。
- 上下文一致：段落/语句级的上下文切片策略与掩码标记一致（或更优）。
- 清洗一致：流式增量清洗（空白裁剪、断句控制、代码块截断等）一致。
- 行为一致：Tab 接受建议、Esc 取消建议，建议显示为幽灵文字。
- 失败反馈：模型不可用/APIKey缺失/网络异常时提供轻量反馈，不让用户误判为“功能没有工作”。

**架构对齐**
- 编辑器扩展注册
  - 保持在插件加载时注册扩展：[main.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/main.ts#L66-L69)
- 触发策略
  - 宿主入口：[createTriggerExtension](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/features/tab-completion/tab-completion-controller.ts#L101-L123)
  - 迁入 YOLO 的触发状态机与判定函数，映射至 TabCompletionOptions:
    - enabled、idleTriggerEnabled、autoTriggerDelayMs、triggerDelayMs、autoTriggerCooldownMs
    - triggers: {type: 'regex'|'string', pattern, enabled}
  - 扩展空闲触发的来源：除 docChanged 外，增加 selectionSet 或独立 idle 定时器，以支持“移动光标停顿即触发”（与 YOLO 行为一致）
- 上下文切片
  - 现有策略：[extractMaskedContext](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/features/tab-completion/tab-completion-controller.ts#L40-L59)
  - 替换/增强为 YOLO 的段落/语句切片：例如按最近段落分界（双换行）、语句标点（.?!:;）与括号平衡进行窗口裁剪，避免提示词漂移
  - 放宽 run() 的前置条件：允许 before 为空但 after 存在时触发，以覆盖“新行续写”等常见场景
- 建议清洗
  - 现有清洗点：[updateSuggestion](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/features/tab-completion/tab-completion-controller.ts#L303-L341)
  - 迁入 YOLO 的清洗策略：统一换行、去除尾随空白、按最大长度裁剪、必要时对半角/全角标点做兼容；代码补全场景中避免过度裁剪导致语法残缺
- 流式接口与系统提示词
  - 继续使用：[AIService.streamCompletion](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/services/ai-service.ts#L370-L440)
  - 系统提示词来源于 Tab 设置；如 YOLO 有特定系统 prompt 语义，合并到现有 systemPrompt 字段，保持“只输出补全文本”的约束
- 幽灵文字与键位
  - 继续使用幽灵文字渲染：[inline-suggestion.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/inline-suggestion/inline-suggestion.ts)
  - 键位行为保持：Tab 接受、Esc 清除：[createExtension 键位](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/features/tab-completion/tab-completion-controller.ts#L79-L99)

**配置映射**
- 目标字段
  - TabCompletionOptions 中保留/扩展：enabled、modelId、systemPrompt、maxSuggestionLength、contextRange、idleTriggerEnabled、autoTriggerDelayMs、triggerDelayMs、autoTriggerCooldownMs、triggers[]
- 默认值
  - 触发器默认与 YOLO 对齐：行尾句点、换行、左括号、左中括号、冒号、等号、语言起始关键字（如 return、import）
  - 延迟与冷却：idle 300–800ms；cooldown 适度开启以减压请求频率
- 设置面板
  - 使用现有设置页入口：[settings.ts:Tab 补全设置](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings.ts#L275-L393)
  - 触发器增改入口：[showAddTriggerModal](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings.ts#L1489-L1539)、[showEditTriggerModal](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings.ts#L1542-L1590)

**错误与边界处理**
- 预检
  - run() 前确认：当前模型启用、供应商启用、APIKey/BaseURL 配置完整；失败则给出轻量提示（Notice/状态条），避免“静默失败”
- 光标/选择
  - 有选区时不触发补全；接受时确保光标位置与建议起点一致，避免竞态
- 退避与取消
  - 变更时清除幽灵文字、取消在途请求（AbortController），避免脏状态残留
- 视觉反馈
  - 补充 smtcmp-ghost-text 样式（浅灰、不可点击），必要时加入 thinkingIndicatorEffect 显示“思考中”弱提示

**构建与依赖**
- 保持 Obsidian 的唯一 CodeMirror 实例
  - 在构建中 external：@codemirror/state、@codemirror/view（已配置）
- 构建入口与类型检查
  - 构建：npm run build；类型检查：npx tsc（项目未提供 lint/typecheck 脚本）<mccoremem id="01KGPF3789Y80865V44NC7JBWC" />

**实施步骤**
- 第 1 步：策略适配层
  - 创建 YOLO 策略适配函数集合（触发判定、上下文切片、清洗），仅依赖通用字符串与 AST-free 操作
- 第 2 步：集成 TabCompletionController
  - 在 shouldTrigger 与 run 的上下文构造/清洗处替换为适配函数；保留 AIService.streamCompletion/幽灵文字更新与键位行为
- 第 3 步：配置对齐
  - 将 YOLO 的行为参数映射到 TabCompletionOptions 并在 settings.ts 加载/展示；默认值与 YOLO 一致
- 第 4 步：视觉与反馈
  - 增加 smtcmp-ghost-text 样式；添加“思考中”弱提示（可选）
- 第 5 步：验证
  - 手工用例：句末续写、换行续写、括号内补全、代码行补全；不同延迟/冷却/窗口大小组合测试
  - API 连接测试：设置页“测试连接”，以及在控制台观察错误路径
- 第 6 步：调优
  - 依据 YOLO 行为对上下文窗口与清洗规则微调，保证语义与断句风格一致

**验收标准**
- 行为一致：触发时机、建议风格、增量清洗与长度控制与 YOLO 一致
- 交互一致：Tab 接受文本、Esc 清除建议；建议位置/对齐与光标一致
- 稳定性：快速输入/移动光标时无残留幽灵文字、无异常闪烁；请求及时取消
- 兼容性：构建成功，Obsidian 不出现“多实例 CodeMirror”错误；设置项可被正确读取/持久化

**风险与缓解**
- 运行时冲突：继续 external @codemirror/*；避免引入 YOLO 的编辑器内核或 UI 框架
- 依赖膨胀：只迁入纯逻辑函数，不复制 YOLO 的大型模块
- 行为差异：通过验证用例与参数对齐，必要时对策略做可配置化开关

**回退策略**
- 以特性开关包裹 YOLO 策略适配：配置项允许切换回原有策略
- 保留现有逻辑与配置结构，确保出现问题时能快速禁用 YOLO 适配

**里程碑**
- 第 1 周：适配层实现与初步集成，完成基本用例
- 第 2 周：设置映射与视觉优化、失败反馈补齐、全量验证
- 第 3 周：行为微调与性能/稳定性测试，输出对齐报告并上线

这份规划保证迁入 YOLO 的 Tab 补全核心体验，同时不破坏 Markdown-Next-AI 的架构与构建生态。若你确认，我们可以按“实施步骤”逐项推进，并在每个阶段提供验证报告与对齐结果。