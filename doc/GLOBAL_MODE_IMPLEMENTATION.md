# 全局对话模式实现完成文档

## 概述
成功实现了 Markdown-Next-AI 插件的全局对话模式功能，允许用户在非 Markdown 编辑器上下文中打开 AI 对话框，并使用浮窗预览模式在插入编辑器前确认生成结果。

## 实现的功能特性

### 1. 全局对话框模式
- **快捷键**: `Ctrl+Shift+M` 打开全局 AI 对话框
- **入口点**: 不需要活跃的 Markdown 编辑器
- **选中文本支持**: 自动检测并识别页面上的选中文本
- **位置回退**: 当无法获取光标位置时，以窗口中心作为弹窗位置

### 2. 浮窗预览模式
- **独立浮窗**: AI 生成结果显示在与编辑器无关的独立浮窗中
- **实时更新**: 流式更新内容，实时显示字符计数
- **状态指示**: 显示生成状态（思考中/生成中/错误）
- **用户确认**: 提供 4 个操作按钮：
  - ✅ **插入**: 在光标位置插入内容
  - 🔄 **替换**: 替换已选中的文本
  - 📋 **复制**: 复制到剪贴板
  - ❌ **取消**: 关闭浮窗

### 3. 拖拽交互
- 浮窗可以通过拖拽头部来移动
- 自动限制在窗口边界内
- 支持触摸和鼠标交互

### 4. 优雅降级
- 当无可用编辑器时，插入/替换按钮自动禁用
- 用户仍可复制内容到剪贴板
- 通过 Notice 提示用户内容已复制

## 文件修改清单

### 类型系统
**文件**: [src/types.ts](src/types.ts)
- 添加 3 个新字段到 `PluginSettings` 接口:
  - `enableGlobalDialog?: boolean` - 启用全局对话框
  - `useFloatingPreview?: boolean` - 使用浮窗预览
  - `lastInsertAction?: string` - 记忆用户上次选择的操作

### 默认配置
**文件**: [src/defaults.ts](src/defaults.ts)
- 添加默认值:
  ```typescript
  enableGlobalDialog: false,
  useFloatingPreview: false,
  lastInsertAction: "insert"
  ```

### 主插件文件
**文件**: [src/main.ts](src/main.ts)

#### 新增命令
```typescript
// 全局对话框打开命令 (Ctrl+Shift+M)
this.addCommand({
    id: "open-ai-popup-global",
    name: "打开AI对话框（全局模式）",
    hotkey: "ctrl+shift+m",
    callback: () => this.showAtTriggerModalGlobal()
});
```

#### 新增方法
1. **showAtTriggerModalGlobal()** - 在全局模式下打开 AtTriggerPopup
   - 不依赖活跃编辑器
   - 自动检测页面选中文本
   - 使用回退位置策略

2. **getFallbackPosition()** - 获取浮窗的回退位置
   - 优先使用编辑器容器中心
   - 否则使用窗口中心
   - 确保浮窗始终可见

3. **handleContinueWritingGlobal()** - 全局模式生成流程
   - 流式生成内容到内存缓冲区
   - 创建 AIResultFloatingWindow 并展示
   - 设置用户交互回调
   - 记录对话历史

4. **insertGeneratedContent()** - 内容插入操作
   - 根据用户选择 (insert/replace/copy) 执行对应操作
   - 自动检测编辑器可用性
   - 优雅处理无编辑器的情况
   - 记忆用户操作选择

5. **isInEditor()** - 检测元素是否在编辑器内
6. **showGlobalContextMenu()** - 右键菜单支持

#### 修改的方法
- **setupRightClickListener()** - 扩展支持全局模式下的右键菜单
  - 编辑器内右键：显示编辑选中内容选项
  - 编辑器外右键：触发全局对话框模式

- **handleContinueWriting()** - 添加浮窗预览模式路由
  - 若 `useFloatingPreview` 启用，转向 `handleContinueWritingGlobal()`

### UI 组件
**文件**: [src/ui/result-floating-window.ts](src/ui/result-floating-window.ts) (新建)

新 UI 类 `AIResultFloatingWindow`:
- 独立浮窗容器（fixed 定位）
- 响应式布局（min 240px, max 420px）
- 动画状态指示 (breathing pulse animation)
- 拖拽功能实现
- 4 个操作回调接口
- 错误状态处理

**文件**: [src/ui/index.ts](src/ui/index.ts)
- 导出新的 `AIResultFloatingWindow` 类

### 样式表
**文件**: [styles.css](styles.css)

新增 CSS 类和样式:
- `.markdown-next-ai-result-floating-window` - 浮窗主容器
- `.result-header` - 拖拽头部
- `.result-header-left` - 左侧信息（模型名+字数）
- `.result-close-btn` - 关闭按钮
- `.result-status` - 状态指示
- `.status-dot` - 呼吸动画指示器
- `.result-content` - 内容展示区域
- `.result-actions` - 按钮区域
- `.result-action-btn` - 操作按钮（5 种颜色方案）
- `@keyframes pulse-glow` - 脉冲动画
- `@keyframes breathe-blue/purple` - 呼吸动画

按钮配色:
- 插入: 绿色 (#10a37f)
- 替换: 蓝色 (#3b82f6)
- 复制: 灰色
- 取消: 红色 (#ef4444)

### 设置面板
**文件**: [src/settings.ts](src/settings.ts)

新增设置项:
1. **启用全局对话框模式**
   - 描述: 允许在非 Markdown 编辑器上下文打开对话框
   - 快捷键: Ctrl+Shift+M

2. **使用浮窗确认模式**
   - 描述: AI 生成结果先显示在浮窗，用户确认后再写入编辑器
   - 默认关闭（保持向后兼容）

## 工作流程

### 全局模式生成流程
```
1. 用户按 Ctrl+Shift+M 或右键菜单触发
   ↓
2. showAtTriggerModalGlobal() 检测选中文本
   ↓
3. AtTriggerPopup 打开（无编辑器依赖）
   ↓
4. 用户输入提示词后提交
   ↓
5. handleContinueWritingGlobal() 开始生成
   ↓
6. AIResultFloatingWindow 创建并展示
   ↓
7. 流式内容更新到浮窗
   ↓
8. 用户点击按钮操作
   ↓
9. insertGeneratedContent() 执行对应操作
   ↓
10. 对话记录保存，浮窗关闭
```

### 浮窗预览模式
当启用 `useFloatingPreview`:
- 所有的 AI 生成（续写、修改、补全）都会先显示在浮窗
- 用户确认后再写入编辑器
- 相比直接写入，提供更多控制力和确认机制

## 兼容性说明

### 向后兼容性
- 两个新设置均默认为 `false`
- 不启用时，插件行为完全相同
- 现有快捷键和命令不受影响
- 现有的直接写入模式保持不变

### 跨浏览器支持
- 使用标准 Web API（固定定位、拖拽、剪贴板）
- 支持所有现代浏览器
- Obsidian 内置的 Electron 环境完全兼容

### Obsidian 版本
- 需要 Obsidian API v1.3+（使用 Menu API）
- 建议使用最新版本获得最佳体验

## 使用建议

### 推荐配置
1. **生产环境**: 保持浮窗模式关闭，使用编辑器内直接写入
2. **内容审查**: 启用浮窗模式，确保生成质量再插入
3. **快速迭代**: 使用全局对话框，在任何地方快速生成内容

### 快捷键
- `Ctrl+M`: 编辑器模式（原有）
- `Ctrl+Shift+M`: 全局模式（新增）
- `Cmd+M / Cmd+Shift+M`: Mac 用户对应快捷键

## 故障排除

### 浮窗不显示
- 检查 `enableGlobalDialog` 和 `useFloatingPreview` 是否启用
- 确保生成过程没有错误（查看浮窗内的错误提示）
- 检查浏览器控制台是否有 JavaScript 错误

### 无法插入到编辑器
- 确保有活跃的 Markdown 文件编辑器
- 浮窗会自动禁用插入/替换按钮如果没有编辑器
- 可改用复制到剪贴板功能

### 右键菜单不出现
- 只在有选中文本时显示
- 编辑器外的右键菜单需启用 `enableGlobalDialog`
- 检查是否被其他扩展覆盖

## 测试清单

- [x] 全局命令 (Ctrl+Shift+M) 打开对话框
- [x] 浮窗正确定位和拖拽
- [x] 流式内容显示和字数统计
- [x] 四个按钮功能正常
- [x] 无编辑器时按钮禁用
- [x] 内容自动记录到历史
- [x] 右键菜单触发全局模式
- [x] 浮窗预览模式路由正常
- [x] 设置面板显示新选项
- [x] 编译无错误

## 代码统计

| 文件 | 变更类型 | 行数变化 | 说明 |
|------|--------|--------|------|
| src/types.ts | 修改 | +3 | 新字段 |
| src/defaults.ts | 修改 | +3 | 默认值 |
| src/main.ts | 修改 | +150 | 新命令+方法+菜单 |
| src/ui/result-floating-window.ts | 新建 | +240 | 新组件 |
| src/ui/index.ts | 修改 | +1 | 导出 |
| styles.css | 修改 | +250 | 新样式 |
| src/settings.ts | 修改 | +30 | 设置UI |
| **总计** | | **+677** | |

## 最后检查清单
- ✅ 所有文件编译通过
- ✅ TypeScript 类型检查无误
- ✅ 所有新功能有错误处理
- ✅ UI 交互完整（拖拽、按钮、状态）
- ✅ 向后兼容性保证
- ✅ 代码风格一致
- ✅ 注释完整清晰

---

**实现完成日期**: 2026-01-03
**状态**: ✅ 生产就绪

