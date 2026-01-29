# Markdown-Next-AI 项目结构说明文档

本文档旨在详细说明 `Markdown-Next-AI` 项目的源码结构与各核心模块功能，帮助开发者快速理解项目架构并进行维护。

## 1. 项目概览

**Markdown-Next-AI** 是一个基于 AI 的 Obsidian 插件，旨在通过大语言模型（LLM）增强用户的写作体验。项目主要使用 TypeScript 编写，基于 Obsidian API 构建。

- **核心功能**: 智能续写、聊天对话、上下文感知、Prompt 路由、多模型支持（OpenAI, Gemini, Ollama 等）。
- **入口文件**: `src/main.ts`
- **构建工具**: `esbuild`

## 2. 目录结构树

```text
Markdown-Next-AI/
├── src/                        # 源代码目录
│   ├── services/               # 核心服务层（业务逻辑）
│   │   ├── adapters/           # LLM 模型适配器
│   │   ├── ai-service.ts       # AI 服务主入口
│   │   ├── embedding-service.ts # 向量嵌入服务
│   │   ├── routing-service.ts  # 智能路由服务（决定 Chat/Completion 模式）
│   │   ├── rule-manager.ts     # 全局规则管理器
│   │   ├── external-loader.ts  # 外部资源加载器
│   │   ├── image-handler.ts    # 图片处理服务
│   │   └── model-cache.ts      # 模型缓存服务
│   ├── ui/                     # 用户界面层
│   │   ├── modals/             # 模态框组件 (文件/文件夹选择)
│   │   ├── at-trigger-popup.ts # '@' 触发的弹出菜单
│   │   ├── context-selector.ts # 上下文选择器 UI
│   │   ├── preview-popup.ts    # AI 预览/补全弹窗
│   │   ├── result-floating-window.ts # 结果展示悬浮窗
│   │   └── prompt-selector.ts  # 提示词选择器
│   ├── utils/                  # 工具函数库
│   │   └── context-extractor.ts # 上下文提取工具
│   ├── main.ts                 # 插件主入口类
│   ├── settings.ts             # 设置页面 UI
│   ├── defaults.ts             # 默认设置配置
│   ├── types.ts                # TypeScript 类型定义
│   └── constants.ts            # 全局常量
├── doc/                        # 项目文档目录
├── styles.css                  # 插件样式文件
├── manifest.json               # Obsidian 插件清单
├── package.json                # NPM 依赖配置
├── tsconfig.json               # TypeScript 编译配置
└── esbuild.config.mjs          # 构建脚本
```

## 3. 核心模块详解

### 3.1 入口与配置 (Core)

*   **`src/main.ts`**:
    *   定义了 `MarkdownNextAIPlugin` 类，继承自 Obsidian 的 `Plugin`。
    *   负责插件的生命周期管理 (`onload`, `onunload`)。
    *   初始化核心服务 (`AIService`, `GlobalRuleManager`)。
    *   注册指令 (Commands) 和事件监听器。
*   **`src/settings.ts`**:
    *   实现了 `MarkdownNextAISettingTab` 类。
    *   负责渲染 Obsidian 设置面板中的插件配置页。
*   **`src/defaults.ts`**:
    *   定义了 `DEFAULT_SETTINGS`，包含所有配置项的初始值。

### 3.2 服务层 (Services)

服务层包含插件的核心业务逻辑，位于 `src/services/`。

*   **`ai-service.ts`**:
    *   **核心**: 负责统筹 AI 请求的发送与响应处理。
    *   **功能**: 管理模型适配器的实例化与调用，处理流式 (Streaming) 响应。
*   **`adapters/`**:
    *   实现了不同 LLM 供应商的接口适配。
    *   `openai-adapter.ts`: 支持 OpenAI 格式 API。
    *   `gemini-adapter.ts`: 支持 Google Gemini API。
    *   `ollama-adapter.ts`: 支持本地 Ollama 模型。
    *   `transformers-adapter.ts`: 支持本地 Transformers 模型（如果适用）。
*   **`routing-service.ts`**:
    *   实现智能路由逻辑 (`routeByLLM`)。
    *   根据用户输入和上下文，决定使用“聊天模式”还是“续写模式”。
*   **`rule-manager.ts`**:
    *   `GlobalRuleManager` 类。
    *   管理全局的 AI 行为规则和提示词策略。
*   **`embedding-service.ts`**:
    *   负责文本的向量化（Embedding）处理，用于增强上下文检索能力。

### 3.3 界面层 (UI)

负责与用户交互的视觉组件，位于 `src/ui/`。

*   **`at-trigger-popup.ts`**:
    *   处理用户在编辑器中输入 `@` 时触发的菜单。
    *   用于快速引用文件、人员或特定上下文。
*   **`preview-popup.ts`**:
    *   `AIPreviewPopup` 类。
    *   在光标处显示的轻量级弹窗，用于展示 AI 的实时建议或续写内容。
*   **`result-floating-window.ts`**:
    *   `AIResultFloatingWindow` 类。
    *   一个更持久的悬浮窗口，用于展示复杂的 AI 对话结果或长文本生成。
*   **`context-selector.ts` & `prompt-selector.ts`**:
    *   辅助 UI 组件，分别用于选择上下文范围和预设提示词。
*   **`modals/`**:
    *   包含标准 Obsidian 模态框的实现，如 `FileModal` 和 `FolderModal`，用于文件系统的交互选择。

### 3.4 工具层 (Utils)

*   **`utils/context-extractor.ts`**:
    *   负责从当前编辑器、选中文本或引用文件中提取用于 AI 上下文的内容。
    *   实现了智能截取和格式化逻辑。

## 4. 开发指南

1.  **环境搭建**:
    *   运行 `npm install` 安装依赖。
2.  **开发模式**:
    *   运行 `npm run dev` 启动监听模式，修改代码后会自动重新构建 `main.js`。
3.  **构建发布**:
    *   运行 `npm run build` 生成生产环境代码。

---
*文档生成日期: 2026-01-29*
