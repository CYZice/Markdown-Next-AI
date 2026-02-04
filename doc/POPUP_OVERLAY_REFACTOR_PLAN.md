# 弹层（Overlay/Popup）重构计划（参考 Obsidian YOLO Quick Ask）

## 目标范围
- 统一弹层架构：采用 overlay-root 挂载到编辑器 DOM，稳定定位与层级，避免遮挡
- 统一关闭与事件处理：集中管理 Esc、外部点击、滚动/滚轮/触摸等关闭策略
- 统一定位与边界收敛：复用锚点定位与容器/视口边界裁剪逻辑
- 统一列表选择模式：模型下拉、提示词选择、上下文选择器共享键盘/鼠标交互
- 优化聊天流式：弹层内聊天区支持自动滚动与用户滚动时的暂停策略
- 保持现有功能：@ 文件/文件夹选择、# 提示词选择、模型切换、图片上传、编辑模式预览/差异视图
- 完全对齐 Quick Ask 的界面设置：卡片化、统一间距与 24×24 纯图标、幽灵态交互、淡入淡出动画、类驱动样式（替代关键内联）

## 需求清单
- OverlayRoot 挂载到编辑器容器，支持：
  - 绝对定位（相对编辑器）与固定定位（无编辑器时）
  - 滚动/缩放/窗口变化时自动重定位
- 统一关闭策略：
  - Esc 关闭优先级：先关闭内部菜单（模型/模式/助手/提示词/上下文），再关闭主弹层
  - 外部点击白名单：编辑器正文、预览/结果浮窗、子弹层容器、模型下拉等不触发关闭
  - 关闭保护：流式期间或“选择中”阶段启用 guard 防误关闭
- 定位与边界：
  - 以光标锚点为初始位置
  - clamp 到编辑器内容区域宽度与视口边界
  - 面板拖拽/缩放后的绝对位置与尺寸优先
- 列表选择统一：
  - 公共组件：标题、列表、选中项，支持键盘上下/回车与 hover
  - 复用到模型下拉、PromptSelector、ContextSelector
- 聊天区行为：
  - 自动滚动至底部；用户向上滚动时暂停自动滚动，回到底再恢复
  - 流式写入助手消息并在完成后清除关闭保护
- 样式驱动：
  - 引入动态样式管理（类似 YOLO 的 updateDynamicStyleClass），统一维护 `left/top/width/height` 与尺寸记忆
  - 移除关键内联样式，转为类驱动，配合现有 `mn-*` 主题变量

## 可直接抄的代码模块（优先参考）
- OverlayRoot/定位/拖拽/缩放：
  - [quickAskController.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/features/editor/quick-ask/quickAskController.ts)
  - [QuickAskWidget.tsx: QuickAskOverlay](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/panels/quick-ask/QuickAskWidget.tsx)
  - 动态样式管理 utils（动态 class 更新与清理）
- 聊天区自动滚动与用户滚动暂停：
  - [QuickAskPanel.tsx: chatAreaRef + auto scroll](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/panels/quick-ask/QuickAskPanel.tsx#L352-L411)
- 触发拦截与输入上下文：
  - [quickAskController.ts: beforeinput 拦截触发](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/features/editor/quick-ask/quickAskController.ts#L180-L276)
- 菜单优先级与 Esc 行为：
  - [QuickAskPanel.tsx: onOverlayStateChange/Esc 管理](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/obsidian-yolo-1.4.13/obsidian-yolo-1.4.13/src/components/panels/quick-ask/QuickAskPanel.tsx#L433-L447)

说明：Markdown-Next-AI 当前已具备 overlay-root、拖拽/缩放与聊天区基础实现（非 React）。可在不引入 React 的前提下“抄架构与算法”，而非直接抄 UI 组件。

## 与当前实现的映射
- 主弹层 AtTriggerPopup：
  - 已实现：overlay-root 挂载、边界收敛、拖拽与三方向缩放、聊天区流式写入
  - 待统一：外部关闭与 Esc 优先级（子菜单先关）、定位/收敛逻辑抽象复用、列表选择键盘/鼠标统一、聊天区自动滚动行为的恢复/暂停细节
- 子弹层：
  - 模型下拉、PromptSelector、ContextSelector：各自实现关闭/定位/键盘逻辑，存在重复
  - 待统一：抽象公共选择列表与关闭/定位工具
- 主插件 main.ts：
  - 已实现：lastAtTriggerPopup 与流式写入聊天区；编辑模式与全局模式各自流式路径
  - 待统一：StreamingBus 分发流式数据，减少重复

## 分阶段实现方案
- 阶段 1：基础设施与样式驱动
  - OverlayCloseManager：集中注册 Esc/外点/滚动/触摸关闭，支持白名单与关闭保护（已接入，完善优先级）
  - PositioningService：输入锚点 → clamp 到容器/视口边界；拖拽/缩放后的绝对定位更新（已接入，完善记忆）
  - 动态样式管理：引入类驱动的 `left/top/width/height` 更新（替代关键内联）
  - 接入位置：AtTriggerPopup、PromptSelector、ContextSelector、模型下拉
- 阶段 2：统一列表选择组件
  - SuggestionList：header/list/item/selectedIndex/键盘与 hover
  - 替换 PromptSelector 与模型下拉内部列表，ContextSelector 复用
- 阶段 3：统一流式分发
  - StreamingBus：主插件只发一次流式事件；订阅者为预览弹层、结果浮窗、聊天区
  - 合并编辑/全局两处重复的回调逻辑
- 阶段 4：聊天区体验
  - “自动滚动 + 用户滚动暂停”策略落地并完善恢复条件（回到底部附近时自动恢复）
  - 完成后落地到 AtTriggerPopup 的聊天区
- 阶段 5（可选）：触发拦截增强
  - 在编辑器可用时，引入 beforeinput 拦截稳定触发 @ 面板，并自动删除触发字符

## 迁移注意事项
- React 依赖：YOLO 使用 React 组件 + Lexical 编辑器；本项目当前主 UI 为原生 DOM。建议仅抄“架构与算法”，避免引入新的 UI 框架
- 动态样式：YOLO 通过动态 class 注入宽高/位置；本项目可沿用 inline style 或抽象 DOM 样式管理
- 键盘/可访问性：统一选择组件后，确保 Esc/方向键/Enter 行为一致且优先级正确

## 文件与改动计划
- 新增（工具层）
  - `src/ui/overlay/close-manager.ts`：统一关闭管理
  - `src/ui/overlay/positioning.ts`：统一定位/边界收敛
  - `src/ui/overlay/suggestion-list.ts`：统一列表选择行为
- 修改（使用方）
  - [at-trigger-popup.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/at-trigger-popup.ts)：接入 CloseManager/Positioning；聊天区 auto-scroll；复用 SuggestionList
  - [prompt-selector.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/prompt-selector.ts)：改造使用 SuggestionList 与 CloseManager
  - [context-selector.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/ui/context-selector.ts)：定位/关闭改为统一工具；键盘部分复用
  - [main.ts](file:///d:/Microsoft%20VS%20Code/PYTHON/FlowText/Markdown-Next-AI/src/main.ts)：引入 StreamingBus，收敛两处流式回调

## 验收清单
- 弹层始终附着到编辑器容器，滚动/缩放重定位正常
- Esc/外部点击关闭优先级正确，菜单先于主弹层关闭
- @/#/模型下拉的选择列表交互一致（上下/回车/hover）
- 聊天区在流式期间自动滚动；用户滚动上移后暂停自动滚动，回到底部恢复
- 样式由类驱动，无关键内联样式；卡片/阴影/边框/间距与图标规范一致

## 里程碑与时间
- M1（1–2天）：CloseManager/Positioning 工具完善与动态样式管理接入，接入 AtTriggerPopup
- M2（1–2天）：SuggestionList 统一 PromptSelector/模型下拉
- M3（1天）：StreamingBus 收敛流式回调
- M4（0.5天）：聊天区 auto-scroll 策略与回归测试（含恢复条件）

## 可选增强
- 增强幽灵态与出入场动画细节（与 YOLO 保持一致）
- 增加助手/模型/模式三类菜单的统一开合状态与焦点管理
