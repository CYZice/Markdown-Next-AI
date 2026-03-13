<h1 align="center">NextAI</h1>
<p align="center"><b>深度集成到 Obsidian 的 AI 助手插件。</b></p>

<p align="center">
  懂你笔记上下文的智能写作伴侣，助力灵感捕捉与内容润色。
</p>

<p align="center">
  <a href="https://github.com/CYZice/Obsidian-Next-AI/stargazers">
    <img src="https://img.shields.io/github/stars/CYZice/Obsidian-Next-AI?style=flat-square&color=6c5ce7" alt="GitHub Stars">
  </a>
  <a href="https://github.com/CYZice/Obsidian-Next-AI/releases/latest">
    <img src="https://img.shields.io/github/v/release/CYZice/Obsidian-Next-AI?style=flat-square&color=00b894" alt="Latest Release">
  </a>
  <a href="https://github.com/CYZice/Obsidian-Next-AI/releases">
    <img src="https://img.shields.io/github/downloads/CYZice/Obsidian-Next-AI/total?style=flat-square&color=0984e3" alt="Downloads">
  </a>
  <a href="https://github.com/CYZice/Obsidian-Next-AI/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/CYZice/Obsidian-Next-AI?style=flat-square&color=636e72" alt="License">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> | <b>简体中文</b>
</p>

## ✨ 核心特性

### ⚡️ Tab 自动补全
体验 AI 驱动的即时文本/代码补全，提升写作效率。

| 智能虚影预览 | 强大的上下文感知 |
|:--:|:--:|
| ![Tab 自动补全](./assets/auto_completion.png) | AI 根据上下文自动预测后续内容，支持代码段落与自然语言。 |

### 🎯 上下文多模态对话
在文档中输入 `@` 即可唤出 AI，支持引用笔记库内容。

| 文件与文件夹引用 | 多模式交互 |
|:--:|:--:|
| ![文件引用](./assets/select_file.png) | ![上下文引用](./assets/chat_context.png) |
| 支持引用特定笔记或文件夹作为背景知识，实现真正的“基于知识库对话”。 | 在 **Ask / Edit / Direct** 模式间自由切换，适配问答、修改与应用场景。 |

### ✨ 选中工具栏
选中文本即可唤出快捷工具栏，常用操作触手可及。

| 悬浮工具栏 | 可视化 Diff 视图 |
|:--:|:--:|
| ![选中工具栏](./assets/inline_generation.png) | ![Diff 视图](./assets/inline_generation.png) |
| 无需记忆快捷键，选中文本后点击 ✨ 图标即可快速发起 AI 修改。 | 引入全新的 Diff 界面，支持逐段确认（接受/拒绝/保留两者）。 |

## 🛠️ 功能列表

| 功能 | 描述 |
|---------|-------------|
| ⌨️ **Tab 自动补全** | 实时 AI 补全建议，让写作过程更加流畅自然。 |
| 🎯 **上下文对话** | 通过 `@` 触发，引用库内文件并结合上下文进行问答。 |
| 🪡 **选中工具栏** | 悬浮的 “✨” 图标，提供即时文本处理选项。 |
| 🤖 **内联编辑** | 智能润色、翻译或改写，配合专业的差异对比视图。 |
| ⚡️ **快捷指令** | 输入 `#` 快速调用常用提示词（摘要、润色、翻译等）。 |
| 🎛️ **多模型支持** | 兼容 OpenAI, Claude, Gemini, DeepSeek 及任意自定义接口。 |
| 🔐 **安全存储** | 支持系统 Keychain，加密存储 API Key，安全且便捷。 |

## 🚀 快速开始

1. **安装插件**: 参考下方的 [安装指南](#📦-安装指南)。
2. **配置模型**:
   - 进入 `设置` -> `NextAI` -> `模型 (Models)`。
   - 添加供应商并填写 API Key。
   - *提示: 开启 Keychain 可实现跨设备/跨模型安全存储。*
3. **开始写作**:
   - 输入 `@` 唤出对话框。
   - 在对话框中输入 `#` 使用快捷指令。
   - 选中文本使用 ✨ 工具栏。
   - 直接输入并稍作停顿，体验 **Tab 补全**。

## 📦 安装指南

### 手动安装 (推荐)

1. 从 [最新 Release](https://github.com/CYZice/Obsidian-Next-AI/releases) 下载 `main.js`, `manifest.json`, `styles.css`, `data.json`。
2. 在您的库目录下创建 `.obsidian/plugins/markdown-next-ai` 文件夹。
3. 将下载的文件放入该文件夹。
4. 重启 Obsidian，在 **设置** -> **第三方插件** 中启用 "NextAI"。

## 🗺️ 路线图

- [ ] 更强大的全库语义搜索 (RAG)
- [ ] 本地模型支持 (Ollama/LM Studio) 深度适配
- [ ] 更细粒度的选中处理动作
- [ ] 移动端交互优化
- [ ] 自定义技能系统 (SOP 封装)

## 🤝 贡献

欢迎任何形式的贡献！无论是 Bug 反馈、功能建议还是 Pull Request，我们都非常期待。

## 🙏 致谢

感谢 Obsidian 社区中所有为插件开发提供灵感的开源项目与开发者。

## ☕️ 支持

如果您觉得 NextAI 对您有帮助，请在 GitHub 上点个 ⭐️！

## 📄 许可证

[MIT License](LICENSE)
