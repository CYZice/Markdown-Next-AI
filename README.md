<h1 align="center">NextAI</h1>
<p align="center"><b>Your Intelligent Writing Companion for Obsidian.</b></p>

<p align="center">
  A deeply integrated AI assistant for Obsidian that understands your notes' context.
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
  <b>English</b> | <a href="./README_zh-CN.md">简体中文</a>
</p>

## Highlights

### ⚡️ Tab Completion
Experience seamless writing with AI-powered predictive text.

| Predictive Ghost Text | Smart Context Awareness |
|:--:|:--:|
| ![Tab Completion](./assets/auto_completion.png) | AI predicts your next words based on context, supporting both code and natural language. |

### 🎯 Context-Aware Chat
Summon AI anywhere in your vault with a simple `@` trigger.

| File & Folder Reference | Multi-mode Interaction |
|:--:|:--:|
| ![File Reference](./assets/select_file.png) | ![Chat Context](./assets/chat_context.png) |
| Reference specific notes or folders as background knowledge for truly contextual conversations. | Switch between **Ask**, **Edit**, and **Direct** modes to fit your workflow. |

### ✨ Smart Selection Toolbar
Quickly access AI actions by simply selecting text in your editor.

| Floating Toolbar | Visual Diff View |
|:--:|:--:|
| ![Selection Toolbar](./assets/inline_generation.png) | ![Diff View](./assets/inline_generation.png) |
| Instant access to "AI Modify" without remembering shortcuts. | Review changes with a clear Diff interface. Accept, reject, or keep both. |

## Features

| Feature | Description |
|---------|-------------|
| ⌨️ **Tab Completion** | Real-time AI-powered completion for smoother, more natural writing. |
| 🎯 **Context Chat** | Trigger with `@` to reference vault content and chat with context. |
| 🪡 **Selection Toolbar** | Floating "✨" icon for instant AI actions on selected text. |
| 🤖 **Inline Editing** | Polish, translate, or rewrite text with a professional Diff view. |
| ⚡️ **Quick Commands** | Use `#` to call preset prompts (Summarize, Polish, Translate, etc.). |
| 🎛️ **Multi-Model Support** | Support for OpenAI, Claude, Gemini, DeepSeek, and custom API endpoints. |
| 🔐 **Keychain Security** | Securely store your API keys using the system keychain. |

## Quick Start

1. **Install the plugin**: Follow the [Installation](#installation) guide below.
2. **Configure API Keys**:
   - Go to `Settings` -> `NextAI` -> `Models`.
   - Add your provider (OpenAI, Anthropic, Gemini, etc.) and enter your API Key.
   - *Tip: Enable Keychain for secure storage.*
3. **Start Writing**:
   - Type `@` to open the context chat.
   - Type `#` in the chat box to use quick prompts.
   - Select text to see the ✨ toolbar.
   - Just type and wait for grey ghost text to see **Tab Completion**.

## Installation

### Manual Installation (Currently Recommended)

1. Download `main.js`, `manifest.json`, `styles.css`, and `data.json` from the [latest release](https://github.com/CYZice/Obsidian-Next-AI/releases).
2. Create a folder named `markdown-next-ai` in your vault's `.obsidian/plugins/` directory.
3. Copy the downloaded files into that folder.
4. Restart Obsidian and enable the plugin in **Settings** -> **Community plugins**.

## Roadmap

- [ ] Stronger Vault-wide Semantic Search (RAG)
- [ ] Support for local LLMs (Ollama/LM Studio) enhancement
- [ ] More granular selection actions
- [ ] Mobile support optimization
- [ ] Custom skill system (SOP encapsulation)

## Contributing

Contributions are welcome! Whether it's a bug report, a feature suggestion, or a pull request, we appreciate your help in making NextAI better.

## Acknowledgments

Special thanks to all the open-source projects and developers in the Obsidian community that inspired this plugin.

## Support

If you find NextAI helpful, please consider giving it a ⭐️ on GitHub!

## License

[MIT License](LICENSE)
