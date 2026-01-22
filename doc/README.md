# Markdown-Next-AI 源码结构

本目录包含 Markdown-Next-AI Obsidian 插件的 TypeScript 源代码。

## 重构说明

原始的 `main.js` (~3900 行) 已被重构为模块化的 TypeScript 架构，提升代码的可维护性和可读性。

## 目录结构

```
src/
├── main.ts              # 插件主入口 (MarkdownNextAIPlugin)
├── settings.ts          # 设置页面 (MarkdownNextAISettingTab)
├── constants.ts         # 常量定义
├── types.ts             # TypeScript 类型定义
├── defaults.ts          # 默认设置
├── services/            # 服务层 - 业务逻辑
│   ├── index.ts         # barrel export
│   ├── ai-service.ts    # AI API 调用服务
│   └── image-handler.ts # 图片处理服务
├── ui/                  # UI 层 - 界面组件
│   ├── index.ts         # barrel export
│   ├── at-trigger-popup.ts    # @ 触发的主弹窗
│   ├── preview-popup.ts       # AI 输出预览弹窗
│   ├── context-selector.ts    # 上下文选择器
│   ├── prompt-selector.ts     # 提示词选择器
│   └── modals/                # 模态框组件
│       ├── index.ts
│       ├── file-modal.ts      # 文件选择窗口
│       └── folder-modal.ts    # 文件夹选择窗口
└── utils/               # 工具层 - 辅助函数
    ├── index.ts         # barrel export
    └── context-extractor.ts   # 文本上下文提取器
```

## 模块职责

### 核心模块

| 文件 | 职责 |
|------|------|
| `main.ts` | 插件生命周期管理、命令注册、事件监听 |
| `settings.ts` | 设置页面 UI、供应商/模型管理、提示词管理 |
| `constants.ts` | 模型类别、系统提示词、文件扩展名等常量 |
| `types.ts` | 所有 TypeScript 接口和类型定义 |
| `defaults.ts` | 插件默认设置配置 |

### 服务层 (services/)

| 文件 | 类 | 职责 |
|------|-----|------|
| `ai-service.ts` | `AIService` | 处理所有 AI API 调用，支持 OpenAI/Anthropic/Gemini/Ollama |
| `image-handler.ts` | `ImageHandler` | 图片粘贴、选择、预览、Base64 转换 |

### UI 层 (ui/)

| 文件 | 类 | 职责 |
|------|-----|------|
| `at-trigger-popup.ts` | `AtTriggerPopup` | @ 或 & 触发的主对话弹窗 |
| `preview-popup.ts` | `AIPreviewPopup` | 显示 AI 生成状态和接受/拒绝按钮 |
| `context-selector.ts` | `InputContextSelector` | 输入框中 @ 触发的文件选择 |
| `prompt-selector.ts` | `PromptSelectorPopup` | # 触发的提示词选择 |
| `modals/file-modal.ts` | `FileSelectionWindow` | 文件多选窗口 |
| `modals/folder-modal.ts` | `FolderSelectionWindow` | 文件夹多选窗口 |

### 工具层 (utils/)

| 文件 | 类 | 职责 |
|------|-----|------|
| `context-extractor.ts` | `TextContextExtractor` | 从编辑器提取光标周围的上下文 |

## 构建命令

```bash
# 安装依赖
npm install

# 开发模式 (监听文件变化)
npm run dev

# 生产构建
npm run build
```

## 构建输出

esbuild 将所有 TypeScript 模块打包成单一的 `main.js` 文件（位于项目根目录），保持与 Obsidian 插件的兼容性。

## 技术栈

- **TypeScript** - 类型安全
- **esbuild** - 快速打包
- **Obsidian API** - 插件接口

## 导入约定

使用 barrel exports 简化导入：

```typescript
// 推荐
import { AIService, ImageHandler } from "./services";
import { AtTriggerPopup, AIPreviewPopup } from "./ui";

// 而不是
import { AIService } from "./services/ai-service";
import { ImageHandler } from "./services/image-handler";
```

## 注意事项

1. **Obsidian 私有 API**: 某些功能使用了 Obsidian 未公开的 API（如 `coordsAtPos`），通过 `as any` 类型断言处理
2. **类型兼容**: `ImageData.id` 类型为 `string | number` 以兼容不同创建方式
3. **tslib 警告**: VS Code 可能显示 tslib 警告，但 esbuild 已正确处理 async/await 转换，不影响构建
