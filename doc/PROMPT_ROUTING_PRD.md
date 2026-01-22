# LLM 智能路由需求文档（PRD)

## 背景与目标
- 目标：由 LLM 基于“选区、光标上下文、参考文档、用户 prompt”等信号，智能判定 `edit | chat | insert`，并默认自动路由；用户可在标题条“模式芯片”一键切换。
- 痛点：用户不希望逐步选择模式；希望体验简洁但在模糊场景下仍准确。
- 设计原则：
  - 纯 LLM 分类；不再使用关键词匹配等启发式逻辑。
  - 分类输出必须可解释（包含 `confidence` 与 `reason`）。
  - 与现有架构低耦合、易接入，优先新增独立服务模块。

## 范围与非目标
- 范围：
  - 新增“路由分类服务”，调用现有 AI 接口完成模式判定。
  - 设置项与标题栏 UI 的模式芯片；系统提示词按场景切换。
  - 与现有 PromptBuilder 分支对接（不重构其内部）。
- 非目标：
  - 不改动服务端/第三方 API；不引入新依赖。
  - 不在本期做复杂的学习反馈（如在线学习）。

## 兼容性与全局规则
- **生成阶段（完全兼容）**：
  - 路由服务仅负责判定模式（`mode`），不直接生成最终内容。
  - 判定完成后，调用 `AIService.sendRequest(mode, ...)`，该方法会自动读取 `enableGlobalRules` 设置。
  - 若开启全局规则，系统会将规则追加到 `SYSTEM_PROMPTS[mode]` 之后，确保最终生成的内容符合用户的全局偏好（如“始终使用中文”、“保持学术风格”等）。
- **路由阶段（隔离保护）**：
  - 路由分类器的 Prompt **不包含** 全局规则。
  - 原因：全局规则通常包含对内容风格的强约束（如“不要废话”），可能会干扰路由器的 JSON 输出格式或逻辑判断。
  - 策略：路由阶段仅关注“意图识别”，生成阶段关注“内容风格”。
- **参考文档处理（分阶段策略）**：
  - **路由阶段（零内容依赖）**：路由判定完全不依赖参考文档的具体内容。路由 Prompt 中仅包含“是否存在参考文档”的布尔信号及文档数量/标题元数据。**绝不**读取或发送文档正文。
  - **生成阶段（全量注入）**：路由完成后，`mode` 被传递给 `AIService`，此时参考文档将按现有逻辑（全量拼接、强提示包裹）注入到生成模型的 Prompt 中，确保回答的准确性。

## 架构与数据流
- 关键文件：
  - AI 服务：`src/services/ai-service.ts`
- 新增模块：`src/services/routing-service.ts`
  - 职责：构造“路由分类提示词”，调用现有 `AIService` 的聊天接口（或直接构建 `/chat/completions` 请求），返回 `mode/confidence/reason`。
  - 接口：
    ```ts
    // 复用现有 TextContext 字段，不新增重复状态；路由服务内部自行计算布尔与长度等指标
    export interface LLMBasedRouteInput {
      prompt: string;
      selectionText?: string;  // 来自 context.selectedText
      cursorBefore?: string;    // 来自 context.beforeText
      cursorAfter?: string;     // 来自 context.afterText
      useCursor?: boolean;      // 来自设置/上下文的开关
      additionalContext?: string; // 来自 context.additionalContext（参考文档文本块）
      contextContent?: string;    // 来自 context.contextContent（参考文档文本块）
      cursorPosition?: { line: number; ch: number } | null; // 来自 context.cursorPosition（可选）
      locale?: string; // zh-CN/en 等
    }
    export interface LLMBasedRouteDecision { mode: 'edit'|'chat'|'insert'; confidence: number; reason: string; }
    export async function routeByLLM(input: LLMBasedRouteInput): Promise<LLMBasedRouteDecision>;
    ```
  - 行为：
    1) 将信号整理为“分类材料”，拼入分类提示词；
    2) 发送到当前模型（文本/思考模型均可）；
    3) 要求模型仅输出严格 JSON；
    4) 解析失败或低置信度时，回退为 UI 二次确认或默认模式（如 `chat`），**不使用启发式规则**。
- 调用链：
  - UI（命令/面板）→ `routing-service.routeByLLM()` → 返回 `mode` → 分发到对应 PromptBuilder → `AIService.sendRequest(mode, ...)`。

## 路由分类提示词规范
- System 提示（示例）：
  - 角色：你是“模式路由分类器”，仅负责判定生成模式。
  - 规则：
    - 仅根据提供的材料与用户指令，判定最合适的模式：`edit`（改写选区）、`chat`（对话/问答）、`insert`（插入/续写）。
    - 输出严格 JSON，不要解释文本，不要添加多余字符。
    - JSON 字段：`mode`（枚举）、`confidence`（0~1）、`reason`（一句话解释）。
    - 判定准则：
      - 有选区且指令倾向“改写/润色/重写/翻译/纠错/降重” → `edit`。
      - 明确“插入/在光标处/添加一段/在这里生成/续写/继续写” → `insert`。
      - 有明显问句或任务型生成，且选区/上下文仅作参考，或无明显信号 → `chat`。
  - 状态来源与复用（由路由服务内部自动计算，不要求调用方传入）：
    - hasSelection = Boolean(context.selectedText?.trim()); selectionLength = context.selectedText?.length || 0。
    - hasCursorContext = Boolean(useCursor && ((context.beforeText||'').trim() || (context.afterText||'').trim()));
      beforeLength/afterLength 分别取 `context.beforeText.length` 与 `context.afterText.length`。
    - hasReferences = Boolean(context.additionalContext?.trim() || context.contextContent?.trim());
      referencesCount：如有结构化列表则计数，否则按是否存在文本块近似为 1。
    - cursorPosition 直接复用 `context.cursorPosition`（如可用）。
- User 提示（示例模板）：
  ```
  用户指令：{{prompt}}
  选中文本（如有）：{{truncate(selectionText)}}
  光标上下文（如允许）：
    - beforeText: {{truncate(cursorBefore)}}
    - afterText:  {{truncate(cursorAfter)}}
  参考文档（{{references.length}} 条）：
    - {{list titles or sources}}
  路由状态（由服务自动计算）：
    - hasSelection={{hasSelection}} length={{selectionLength}}
    - hasCursorContext={{hasCursorContext}} beforeLen={{beforeLength}} afterLen={{afterLength}}
    - hasReferences={{hasReferences}} referencesCount={{referencesCount}}
  输出严格 JSON：{"mode":"chat","confidence":0.72,"reason":"..."}
  ```

## 模式系统提示词（用于对话生成阶段）
 - 与现有 `ai-service.ts` 保持一致的构建流程：
   - 先取 `SYSTEM_PROMPTS[mode]` 作为基础系统提示词。
   - 若开启全局规则（`enableGlobalRules`），按优先级拼接至系统提示尾部（不改变基础提示的核心约束）。
   - 用户提示与参考文档在 user 消息中注入（保持分栏与标签化），系统提示不直接承载大文本，避免 token 膨胀。
 - 每个模式的系统提示词核心约束（建议文案）：
   - `edit`：仅修改选中文本；保持原文风格与结构；不得改动未选内容；必要时说明保留与变化范围。
   - `chat`（合并原 qa/chat）：进行对话、回答问题或创作协助；若存在参考文档，必须以文档为准，避免臆造；除非用户要求，否则不强制引用上下文。
   - `insert`（合并原 insert/continue）：生成可直接插入光标处的新内容；延续当前文风与结构；不复述 `before/afterText`；参考上下文以保证连贯但不复制。
 - 系统提示词结构（建议模板片段）：
   - 通用前言：明确角色与边界、避免幻觉、输出格式/语言要求（与设置保持一致）。
   - 模式专属约束：如上所述的行为约束与禁止项。
   - 质量要求：简洁清晰、层次分明、可选字数/结构（标题/要点/段落）等在设置中控制。
 - 示例（精简版）：
   - `SYSTEM_PROMPTS.edit`
     - 角色：你将仅改写用户提供的选中文本。
     - 约束：保持原风格/结构/术语；不改变事实信息；不得修改未选文本；必要时优化逻辑与表达。
   - `SYSTEM_PROMPTS.chat`
     - 角色：你将进行对话、回答问题或基于参考文档生成。
     - 约束：以参考文档为准（如有）；无依据不臆造；确保回答真实与礼貌。
   - `SYSTEM_PROMPTS.insert`
     - 角色：你将生成可直接插入光标处的新内容或续写。
     - 约束：不复述上下文；保持连贯与风格一致；仅输出新增内容。
 - 额外建议：
   - 思考模型（THINKING）可在系统提示中允许简短“推理先于输出”的策略，但仍需遵循最终输出约束。
   - 多语言：依据设置中的语言偏好，在系统提示追加“使用与源文本一致的语言/用户指定语言”。
   - 可配置：在设置面板提供少量可编辑的模式提示附加条目（如是否保留表述口吻），并按优先级拼接在全局规则后。

## 设置与 UI 需求
- 设置项：
  - `enableAutoRoutingByLLM`: boolean，默认 true。
  - `minConfidenceForAuto`: number（0~1），默认 0.6；低于阈值时在 UI 轻提示并允许一键切换。
  - `fallbackMode`: string，默认 'chat'；解析失败或 API 错误时的默认模式。
- 标题栏“模式芯片”：
  - 展示当前模式（edit/chat/insert）。
  - 点击下拉切换模式，切换后输入不变，等待用户提交后再重跑（
  - 低置信度时以弱警示样式标识（如淡黄色闪点）。
- 空间限制与文案：避免“续写”预设文案；改用“回答/生成/插入/改写”术语。

## 接口与类型
- 新增类型与方法（建议）：
  - `src/services/routing-service.ts`：`routeByLLM(input): Promise<LLMBasedRouteDecision>`。
  - 在调用处（命令/面板控制器）：
    ```ts
    const decision = await routeByLLM({ prompt, selectionText, cursorBefore, cursorAfter, useCursor, references });
    const mode = decision.mode; // 自动路由
    await aiService.sendRequest(mode, context, prompt, images, chatHistory, onStream);
    ```
- 解析失败处理：若返回内容不为合法 JSON或缺字段 → 记录日志并按设置回退（默认模式如 `chat`）。

## 错误处理与容错
- API 错误：沿用 `ai-service.ts` 的错误提示与配额/频率处理。
- 解析错误：增加健壮 JSON 解析（容忍前后噪声，尝试提取 JSON 块）。
- 低置信度：提示“已判定为 Chat（低置信度）”，用户可芯片切换；可在二次执行时传 `explicitMode` 强制模式。

## 性能与预算
- 分类提示词需摘要/截断各材料（如每段 600~1200 字符上限；参考文档仅列标题与关键摘录）。
- 最多一次分类请求；若用户手动切换，则不再二次分类。

## 遥测（可选）
- 记录：`mode`、`confidence`、是否用户切换、是否低置信度、是否回退、耗时。
- 不上报敏感正文内容，仅统计信号规模（字数/文档条数）。

## 验收标准
- 无选区/无上下文/无参考 → 自动判为 `chat`，生成正常。
- 有选区+指令为“改写/润色/重写/翻译” → 自动判为 `edit`，仅改选区。
- 指令含“插入/在光标处/添加一段/续写/继续写”且启用上下文 → 自动判为 `insert`，不复述上下文。
- 有参考文档且为问答：自动判为 `chat`，回答显著基于文档。
- 低置信度时 UI 有轻提示，用户可一键切换；切换后执行新模式。

## 实施计划（最小改动）
1. 新增 `routing-service.ts`：实现 `routeByLLM()`，内用 `AIService.getCurrentModelConfig()` + `buildApiUrl("/chat/completions")` 直接请求，或通过新增轻量 `aiService.sendClassificationRequest()`。
2. 在命令入口处：若 `enableAutoRoutingByLLM` 为 true，则优先 `routeByLLM()`；否则使用默认模式（如 `chat`）或上次使用的模式，**不再使用启发式路由**。
3. 更新设置面板：加入自动路由开关、阈值、回退策略。
4. 标题栏模式芯片：显示当前模式与置信度状态，点击切换并重跑。
5. 校对 `SYSTEM_PROMPTS[mode]` 文案，确保与模式约束一致（见 `ai-service.ts`）。
6. 编写基础单元测试：分类 JSON 解析、低置信度回退、错误路径。

## 路由分类提示词示例（可直接用于实现）
- System：
  ```
  你是一个“生成模式路由分类器”。
  任务：根据用户指令与提供的材料，判定最合适的生成模式（edit|chat|insert）。
  输出要求：仅输出严格的JSON，包含字段：mode（枚举）、confidence（0~1）、reason（一句话解释）。
  不要输出任何非JSON内容。
  判定提示：有选区+改写类需求→edit；插入或续写类需求→insert；问答或创作→chat；无明显信号→chat。
  ```
- User：
  ```
  用户指令：{{prompt}}
  选中文本：{{truncate(selectionText)}}
  光标上下文（如允许）：
    - beforeText: {{truncate(cursorBefore)}}
    - afterText:  {{truncate(cursorAfter)}}
  参考文档（{{references.length}}条）：{{list titles}}
  请仅输出JSON：{"mode":"qa","confidence":0.72,"reason":"..."}
  ```

---

附注：本PRD与现有文件结构兼容，优先新增独立服务与设置/UI，避免大改现有 `AIService.sendRequest()`。如需我继续创建 `routing-service.ts` 的代码骨架与设置项接口，请确认后继续。 
