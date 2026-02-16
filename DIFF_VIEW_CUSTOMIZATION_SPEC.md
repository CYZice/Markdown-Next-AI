# Diff（Apply View）个性化设置扩展：需求与代码对接说明

## 1. 背景与现状

插件当前的差异确认界面为 Apply View（Review Changes），打开入口在 [main.ts:openApplyView](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/main.ts#L530-L539)，渲染与交互主要在 [ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx)。

当前已实现的核心行为：
- 差异按 block 生成并逐块决策（Accept / Reject / Keep & Insert）
- 对“已决策”的 block：不再展示红删绿增 diff，而展示“决策标签 + 最终生效文本预览”（结果导向）
- 顶栏按钮在宽度不足时进入 compact：收敛为 More 菜单
- 底部（当前在内容上方）存在 Cancel / Apply 的 pill 条

### 1.1 改造范围
- 仅扩展 Apply View 的展示与交互策略，不改动 diff 计算算法
- 不改变生成内容的来源与写入机制，仅在 Apply 时提供更可控的默认策略
- 设置项落盘与设置页 UI 对接在同一轮完成

### 1.2 非目标
- 不新增新的 diff 算法或跨文件对比能力
- 不引入新视图类型，仍复用 Apply View

## 2. 目标用户与场景

### 2.1 写作/润色（结果导向）
- 用户希望在接受修改后迅速回到“通读最终文本”的阅读流
- 视觉噪点应尽量低，已决策内容应呈现为干净段落

### 2.2 合同/审计/定稿（留痕审计）
- 用户希望随时回溯“刚才删了什么、加了什么”
- 可接受更高噪点，但希望通过降权（灰化/半透明）降低干扰

## 3. 需求说明（功能需求优先级）

### 3.1 决策后展示策略（核心）

新增设置：`diff.decidedBlockViewMode`
- `result`（结果导向，默认）：已决策 block 只展示最终生效文本 + 决策标签（保持当前实现）
- `audit`（留痕审计）：已决策 block 仍展示红删绿增 diff，但整体降权，并显示“已采纳/已拒绝/已合并”徽章或水印
- `hybrid`（混合）：默认展示最终生效文本，但允许一键展开查看 diff（按需回溯）

配套设置（建议作为同一组高级项）：
- `diff.showDecisionBadge`（boolean）：是否展示“已采纳/已拒绝/已合并”等徽章/水印
- `diff.decidedBlockOpacity`（number，0~1）：audit/hybrid 展开状态下的降权透明度
- `diff.collapseDecidedBlocks`（boolean）：已决策 block 是否默认折叠（主要服务 audit，控制页面长度）

验收要点：
- result 模式：与当前表现一致，不出现红删绿增
- audit 模式：已决策也能看到 diff（删改增），但视觉权重明显降低
- hybrid 模式：默认“干净预览”，可切换/展开“diff 明细”

### 3.2 Apply/Cancel 按钮位置（布局）

新增设置：`layout.applyBarPosition`
- `top`：按钮条在顶部（当前实现位置）
- `bottom`：按钮条固定在底部（更适合长文滚动）

配套设置：
- `layout.applyBarSticky`（boolean）：top/bottom 位置是否采用 sticky（滚动时保持可用）
- `layout.applyBarAlignment`（可选）：`center` / `right`

验收要点：
- 位置切换后不影响 diff 内容滚动
- sticky 打开时按钮条不会遮挡内容（需要留出 padding/占位）

### 3.3 顶栏按钮可配置（增减/隐藏/提出）

新增设置：`header.visibleButtons`（多选集合）
- `prevNext`（Prev/Next）
- `bulkAcceptReject`（Accept All / Reject All）
- `keepInsert`（Keep & Insert）
- `progress`（进度条）
- `moreMenu`（More 菜单入口）

新增设置：`header.overflowPolicy`
- `auto`（默认）：沿用当前 compact 行为（宽度不足时收进 More）
- `alwaysMenu`：始终收进 More（极简）
- `alwaysToolbar`：尽量都在顶栏展示（审计型）

新增设置：`header.moreMenuItems`（多选集合）
- 允许将部分按钮强制放入 More（即使 alwaysToolbar）
- 允许将 Prev/Next 也加入 More（当前未加入）

验收要点：
- visibleButtons 变化能即时体现在 Apply View 顶栏与 More 菜单中
- overflowPolicy 不与 visibleButtons 冲突（例如：moreMenu 被隐藏时，auto 模式应强制转为 alwaysToolbar 或降级逻辑）

### 3.4 “决策后自动跳转下一处”行为（体验细项）

新增设置：`behavior.autoAdvanceAfterDecision`（boolean）
- 开：维持当前（做完决策后自动滚动到下一处未决策）
- 关：留在当前 block，方便审计型用户二次确认

配套设置：`behavior.autoAdvanceDelayMs`（number，可选高级项）

验收要点：
- 关闭 autoAdvance 后，makeDecision 不触发 scrollToNextUndecided

### 3.5 Apply 前是否必须全部决策（安全感）

现状：Apply 时对“未决策 block”按 incoming 处理（见 [ApplyViewRoot.tsx:applyAndClose](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L208-L214) 传入 `generateFinalContent('incoming')`）。

新增设置：`behavior.requireAllDecidedBeforeApply`（boolean）
- 开：必须全部决策才允许 Apply（按钮 disabled，或弹出提示）
- 关：维持当前快速模式

新增设置：`behavior.pendingDefaultDecisionOnApply`
- `incoming`（默认，当前行为）
- `current`（更保守，适用于审计场景）

验收要点：
- requireAllDecidedBeforeApply=true 时，未全部决策 Apply 不可用（或触发拦截提示）

### 3.6 预设方案（推荐）

面向写作与审计两个典型场景，提供可一键切换的预设（可选实现为 Settings Preset）：

- 写作/润色（默认）
  - decidedBlockViewMode: result
  - applyBarPosition: top
  - overflowPolicy: auto
  - autoAdvanceAfterDecision: true
  - requireAllDecidedBeforeApply: false
  - pendingDefaultDecisionOnApply: incoming
  - visibleButtons: prevNext, bulkAcceptReject, keepInsert, progress, moreMenu

- 审计/定稿
  - decidedBlockViewMode: audit
  - applyBarPosition: bottom
  - overflowPolicy: alwaysToolbar
  - autoAdvanceAfterDecision: false
  - requireAllDecidedBeforeApply: true
  - pendingDefaultDecisionOnApply: current
  - visibleButtons: prevNext, bulkAcceptReject, keepInsert, progress, moreMenu

## 4. 数据结构设计（设置项落盘）

### 4.1 插件设置结构扩展

在 [types.ts:PluginSettings](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/types.ts) 中新增一个集中配置对象（避免顶层字段膨胀）：

- `applyView?: ApplyViewSettings`

建议类型（命名可调整，但字段含义建议保持一致）：
- `ApplyViewSettings.diff.decidedBlockViewMode: 'result' | 'audit' | 'hybrid'`
- `ApplyViewSettings.diff.showDecisionBadge: boolean`
- `ApplyViewSettings.diff.decidedBlockOpacity: number`
- `ApplyViewSettings.diff.collapseDecidedBlocks: boolean`
- `ApplyViewSettings.layout.applyBarPosition: 'top' | 'bottom'`
- `ApplyViewSettings.layout.applyBarSticky: boolean`
- `ApplyViewSettings.layout.applyBarAlignment?: 'center' | 'right'`
- `ApplyViewSettings.header.visibleButtons: string[]`
- `ApplyViewSettings.header.overflowPolicy: 'auto' | 'alwaysMenu' | 'alwaysToolbar'`
- `ApplyViewSettings.header.moreMenuItems: string[]`
- `ApplyViewSettings.behavior.autoAdvanceAfterDecision: boolean`
- `ApplyViewSettings.behavior.autoAdvanceDelayMs?: number`
- `ApplyViewSettings.behavior.requireAllDecidedBeforeApply: boolean`
- `ApplyViewSettings.behavior.pendingDefaultDecisionOnApply: 'incoming' | 'current'`

### 4.2 默认值与兼容性

在 [defaults.ts:DEFAULT_SETTINGS](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/defaults.ts) 增加 `applyView` 默认配置，建议默认对齐写作用户（结果导向）：
- decidedBlockViewMode=`result`
- applyBarPosition=`top`
- overflowPolicy=`auto`
- requireAllDecidedBeforeApply=`false`
- pendingDefaultDecisionOnApply=`incoming`

兼容性要求：
- 老用户 settings.json 中没有 applyView 字段时，运行时应自动使用默认值

## 5. Apply View 代码对接（接口与函数）

### 5.1 Apply View 打开时注入 UI 配置（建议方案）

现状：Apply View 的 state 只有 `{file, originalContent, newContent}`（见 [ApplyViewRoot.tsx:ApplyViewState](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L18-L22)）。

建议扩展为：
- `ApplyViewState.ui?: ApplyViewSettings`（从插件 settings 拷贝一份快照）

对接点：
- 修改 [main.ts:openApplyView](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/main.ts#L530-L539)
  - 组装 state 时增加 `ui: this.settings.applyView`
- 修改 [ApplyView.ts:setState](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyView.ts#L29-L34)
  - 类型跟随 ApplyViewState 扩展

接口定义（需要对齐 TS 类型）：
- `openApplyView(file, originalContent, newContent)` 不必改签名，仅改 state 内容

### 5.2 ApplyViewRoot 内部需要改造的关键函数

1) 决策后展示策略（result/audit/hybrid）
- 主要改造函数：[ApplyViewRoot.tsx:renderDiffContent](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L315-L507)
  - 当前分支：`decision === 'pending'` 显示 diff；否则显示 “decision header + decided preview”
  - 新增分支：根据 `state.ui.diff.decidedBlockViewMode` 决定“已决策”渲染形态

2) 自动跳转下一处
- 主要改造函数：[ApplyViewRoot.tsx:makeDecision](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L223-L236)
  - 目前固定 setTimeout + scrollToNextUndecided
  - 改为受 `behavior.autoAdvanceAfterDecision` 控制，并使用可配置 delay

3) Apply 前强制全部决策 / 未决策默认策略
- 主要改造函数：[ApplyViewRoot.tsx:applyAndClose](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L208-L214)
  - `generateFinalContent(defaultDecision)` 的 defaultDecision 改为读取 `behavior.pendingDefaultDecisionOnApply`
  - `requireAllDecidedBeforeApply` 打开时：按钮 disabled 或在点击时拦截并提示

4) 顶栏按钮增减与 overflow 策略
- 顶栏区域：[ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L525-L654)
- More 菜单构建：[ApplyViewRoot.tsx:showMoreMenu](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L266-L299)
  - 当前 compact 时 only More；需要基于 visibleButtons/moreMenuItems/overflowPolicy 重排

5) Apply/Cancel 位置 top/bottom
- 按钮条区域：[ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx#L658-L704)
  - 需要将 applyBar 抽成可复用渲染块，并根据 position 决定插入到 header 下方或容器底部
  - sticky 需要配合容器布局与样式（见下一节）

## 6. 样式对接（CSS）

Apply View 相关样式集中在 [styles.css](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/styles.css)（包含 diff block 决策样式、header 按钮、apply bar 等）。

建议新增/调整的样式点：
- audit 模式下的“已决策 diff”降权：新增如 `.markdown-next-ai-diff-block.is-decided-audit` 的 opacity/滤镜规则
- hybrid 模式的“展开/折叠 diff”按钮样式与展开态容器样式
- applyBarPosition=bottom 时：
  - `.markdown-next-ai-apply-topbar` 改为可配置的 `position: sticky; bottom: 0`（或改名以避免语义冲突）
  - 为滚动区域增加对应的底部 padding，防止最后一段被遮挡

## 7. 设置页（UI）对接

设置页入口在 [settings-tab.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings/settings-tab.ts)，建议把 Apply View 的个性化配置放到“编辑器”页：
- 修改文件：[editor-tab-view.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings/views/editor-tab-view.ts)
- 增加一个分组标题：Diff/Apply View
- 以 Toggle / Dropdown / Multi-select 的方式暴露核心项（建议先做 MVP）

MVP（建议最先落地的 6~8 项）：
- decidedBlockViewMode（result/audit/hybrid）
- applyBarPosition（top/bottom）
- overflowPolicy（auto/alwaysMenu/alwaysToolbar）
- visibleButtons（至少支持隐藏 bulk 操作与 progress）
- requireAllDecidedBeforeApply（开关）
- pendingDefaultDecisionOnApply（incoming/current）
- autoAdvanceAfterDecision（开关）

建议下一阶段扩展：
- decidedBlockOpacity
- collapseDecidedBlocks
- applyBarSticky
- moreMenuItems

## 8. 需要修改的文件清单（按职责分组）

### 8.1 类型与默认值
- [types.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/types.ts)
  - 扩展 PluginSettings，新增 ApplyViewSettings 类型
- [defaults.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/defaults.ts)
  - 增加 applyView 默认配置

### 8.2 设置页 UI
- [editor-tab-view.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/settings/views/editor-tab-view.ts)
  - 增加 Apply View 个性化设置项并保存

### 8.3 Apply View 入口与状态传递
- [main.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/main.ts)
  - openApplyView 注入 UI 配置到 state
- [ApplyView.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyView.ts)
  - ApplyViewState 类型跟随扩展

### 8.4 Apply View 交互与渲染
- [ApplyViewRoot.tsx](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/src/ui/apply-view/ApplyViewRoot.tsx)
  - decided 渲染策略切换（result/audit/hybrid）
  - applyBarPosition & sticky
  - header 按钮动态可配与 overflow 策略
  - autoAdvance、requireAllDecidedBeforeApply、pending 默认决策策略

### 8.5 样式
- [styles.css](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/test_ai/.obsidian/plugins/Markdown-Next-AI/styles.css)
  - audit/hybrid 展示与 applyBar bottom/sticky 的样式补齐

## 9. 函数/接口对接表（摘要）

- 打开 Apply View：`openApplyView(file, originalContent, newContent)`（不改签名）
  - 修改点：state 增加 `ui` 配置快照
- 渲染 diff：`renderDiffContent(block, index)`
  - 修改点：按 decidedBlockViewMode 渲染不同形态
- 单块决策：`makeDecision(index, decision)`
  - 修改点：autoAdvance 可开关与 delay 可配
- 应用写入：`applyAndClose()`
  - 修改点：requireAllDecided 拦截与 pending 默认策略可配
- 顶栏与菜单：`showMoreMenu(e)`
  - 修改点：可配置条目集合与 overflow 策略
