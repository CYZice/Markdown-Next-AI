// MarkdownNext AI - 完整开源版本
const { Plugin, Setting, Modal, Notice, requestUrl, PluginSettingTab, MarkdownView } = require("obsidian");

// ============================================
// 常量定义
// ============================================
const MODEL_CATEGORIES = {
    THINKING: "thinking",
    VISION: "vision",
    MULTIMODAL: "multimodal",
    TEXT: "text",
    IMAGE: "image"
};

const CATEGORY_NAMES = {
    [MODEL_CATEGORIES.THINKING]: "思考模型",
    [MODEL_CATEGORIES.VISION]: "视觉模型",
    [MODEL_CATEGORIES.MULTIMODAL]: "多模态模型",
    [MODEL_CATEGORIES.TEXT]: "文本模型",
    [MODEL_CATEGORIES.IMAGE]: "图片模型"
};

const CATEGORY_ICONS = {
    [MODEL_CATEGORIES.THINKING]: "🧠",
    [MODEL_CATEGORIES.VISION]: "👁️",
    [MODEL_CATEGORIES.MULTIMODAL]: "🌈",
    [MODEL_CATEGORIES.TEXT]: "📝",
    [MODEL_CATEGORIES.IMAGE]: "🖼️"
};

const DEFAULT_MODEL_IDS = [
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gpt-5"
];

const DEFAULT_SETTINGS = {
    providers: {
        openai: {
            apiKey: "",
            baseUrl: "https://api.openai.com/v1",
            enabled: true
        }
    },
    models: {
        "gemini-3-pro-preview": {
            id: "gemini-3-pro-preview",
            name: "Gemini 3 Pro Preview",
            provider: "openai",
            model: "gemini-3-pro-preview",
            enabled: true,
            category: MODEL_CATEGORIES.TEXT
        },
        "gemini-3-flash-preview": {
            id: "gemini-3-flash-preview",
            name: "Gemini 3 Flash Preview",
            provider: "openai",
            model: "gemini-3-flash-preview",
            enabled: true,
            category: MODEL_CATEGORIES.TEXT
        },
        "gpt-5": {
            id: "gpt-5",
            name: "GPT-5",
            provider: "openai",
            model: "gpt-5",
            enabled: true,
            category: MODEL_CATEGORIES.TEXT
        }
    },
    currentModel: "gemini-3-flash-preview",
    timeout: 30000,
    enableRightClick: true,
    enableAtTrigger: true,
    maxTokens: 5000,
    maxContextLines: 20,
    maxContextChars: 3000,
    globalRules: [],
    enableGlobalRules: true,
    commonPrompts: [
        { id: "expand", name: "扩展内容", content: "请扩展这段内容，增加更多细节和例子" },
        { id: "summarize", name: "总结概括", content: "请总结这段内容的要点" },
        { id: "improve", name: "改进文本", content: "请改进这段文本的表达和逻辑" },
        { id: "translate", name: "翻译", content: "请将这段内容翻译成英文" },
        { id: "continue", name: "继续写作", content: "请根据上下文继续写作，保持风格一致" }
    ]
};

const SYSTEM_PROMPTS = {
    continue: "你是一个专业的写作助手。请根据用户提供的上下文，从光标位置开始续写后续内容。重要：只生成新的内容，不要重复或重写已有的内容。"
};

// ============================================
// 工具类：图片处理器
// ============================================
class ImageHandler {
    constructor() {
        this.images = [];
        this.maxFileSize = 10485760; // 10MB
        this.allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    }

    handlePaste(event, callback) {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf("image") !== -1) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    this.processImageFile(file, callback);
                }
                break;
            }
        }
    }

    handleFileSelect(files, callback) {
        for (const file of files) {
            if (this.allowedTypes.includes(file.type)) {
                this.processImageFile(file, callback);
            } else {
                new Notice("不支持的文件类型: " + file.type);
            }
        }
    }

    processImageFile(file, callback) {
        if (file.size > this.maxFileSize) {
            new Notice("图片文件过大，请选择小于10MB的图片");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = {
                id: Date.now() + Math.random(),
                name: file.name,
                size: file.size,
                type: file.type,
                base64: e.target.result,
                url: e.target.result
            };
            this.images.push(imageData);
            if (callback) callback(imageData);
        };
        reader.onerror = () => {
            new Notice("读取图片失败");
        };
        reader.readAsDataURL(file);
    }

    removeImage(id, callback) {
        this.images = this.images.filter(img => img.id !== id);
        if (callback) callback(id);
    }

    getImages() {
        return this.images;
    }

    clearImages() {
        this.images = [];
    }

    createImagePreview(imageData, onRemove) {
        const previewEl = document.createElement("div");
        previewEl.className = "markdown-next-ai-image-preview";
        previewEl.setAttribute("data-image-id", imageData.id);
        previewEl.innerHTML = `
			<div class="markdown-next-ai-image-container">
				<img src="${imageData.url}" alt="${imageData.name}" class="markdown-next-ai-preview-img">
				<button class="markdown-next-ai-remove-image" title="删除图片">✕</button>
			</div>
			<div class="markdown-next-ai-image-info">
				<span class="markdown-next-ai-image-name">${imageData.name}</span>
				<span class="markdown-next-ai-image-size">${this.formatFileSize(imageData.size)}</span>
			</div>
		`;

        const removeBtn = previewEl.querySelector(".markdown-next-ai-remove-image");
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeImage(imageData.id, onRemove);
            previewEl.remove();
        };

        return previewEl;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}

// ============================================
// 工具类：上下文选择器
// ============================================
class InputContextSelector {
    constructor(app, inputEl, onSelect) {
        this.app = app;
        this.inputEl = inputEl;
        this.onSelect = onSelect;
        this.suggestionEl = null;
        this.isOpen = false;
        this.selectedIndex = 0;
        this.items = [];
        this.searchQuery = "";
        this.atPosition = 0;
        this.selectedTags = [];
    }

    convertToContentEditable() {
        if (this.inputEl.tagName === "TEXTAREA") {
            const div = document.createElement("div");
            div.className = this.inputEl.className + " markdown-next-ai-editable-input";
            div.contentEditable = "true";
            div.setAttribute("data-placeholder", this.inputEl.placeholder);
            div.style.minHeight = "80px";
            div.style.maxHeight = "300px";
            div.style.overflowY = "auto";
            div.textContent = this.inputEl.value;

            this.inputEl.parentNode.replaceChild(div, this.inputEl);
            this.inputEl = div;

            this.updatePlaceholder();
            div.addEventListener("input", () => this.updatePlaceholder());
        }
    }

    updatePlaceholder() {
        if (this.inputEl.textContent.trim() === "" &&
            this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag").length === 0) {
            this.inputEl.classList.add("empty");
        } else {
            this.inputEl.classList.remove("empty");
        }
    }

    getTextContent() {
        let text = "";
        this.inputEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.classList && node.classList.contains("markdown-next-ai-inline-tag")) {
                const type = node.getAttribute("data-type");
                const path = node.getAttribute("data-path");
                text += `@[${type}:${path}]`;
            }
        });
        return text;
    }

    getCursorPosition() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return 0;

        const range = selection.getRangeAt(0);
        let position = 0;

        const walkNodes = (node) => {
            if (node === range.endContainer) {
                position += range.endOffset;
                return true;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                position += node.textContent.length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList && node.classList.contains("markdown-next-ai-inline-tag")) {
                    const tagText = `@[${node.getAttribute("data-type")}:${node.getAttribute("data-path")}]`;
                    position += tagText.length;
                } else {
                    for (const child of node.childNodes) {
                        if (walkNodes(child)) return true;
                    }
                }
            }
            return false;
        };

        for (const node of this.inputEl.childNodes) {
            if (walkNodes(node)) break;
        }

        return position;
    }

    setCursorPosition(pos) {
        const selection = window.getSelection();
        const range = document.createRange();
        let currentPos = 0;
        let found = false;

        const walkNodes = (node) => {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const length = node.textContent.length;
                if (currentPos + length >= pos) {
                    range.setStart(node, pos - currentPos);
                    range.collapse(true);
                    found = true;
                } else {
                    currentPos += length;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                for (const child of node.childNodes) {
                    walkNodes(child);
                    if (found) return;
                }
            }
        };

        walkNodes(this.inputEl);

        if (!found && this.inputEl.lastChild) {
            range.setStartAfter(this.inputEl.lastChild);
            range.collapse(true);
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    show(atPos, query = "") {
        this.atPosition = atPos;
        this.searchQuery = query;
        this.isOpen = true;

        this.items = this.getAllItems(query);

        if (this.items.length === 0) {
            this.close();
            return;
        }

        if (!this.suggestionEl) {
            this.suggestionEl = document.createElement("div");
            this.suggestionEl.className = "markdown-next-ai-context-suggestions";
            this.suggestionEl.addEventListener("click", (e) => e.stopPropagation());
            this.suggestionEl.addEventListener("mousedown", (e) => e.stopPropagation());
            document.body.appendChild(this.suggestionEl);
        }

        this.render();
        this.position();
        this.bindKeyboardEvents();
    }

    getAllItems(searchQuery) {
        const items = [];
        const query = searchQuery.toLowerCase();
        const imageExtensions = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"];
        const docExtensions = ["txt", "docx", "doc", "pdf", "xlsx", "xls", "epub", "mobi", "csv", "json"];

        this.app.vault.getFiles().forEach(file => {
            const ext = file.extension.toLowerCase();
            let type = "file";
            let icon = "📄";

            if (ext === "md") {
                type = "file";
                icon = "📄";
            } else if (imageExtensions.includes(ext)) {
                type = "image";
                icon = "🖼️";
            } else if (docExtensions.includes(ext)) {
                type = "document";
                icon = ext === "pdf" ? "📕" :
                    ["xlsx", "xls", "csv"].includes(ext) ? "📊" :
                        ["docx", "doc", "txt"].includes(ext) ? "📝" :
                            ["epub", "mobi"].includes(ext) ? "📚" :
                                ext === "json" ? "📋" : "📄";
            } else {
                return;
            }

            if (searchQuery && !file.basename.toLowerCase().includes(query) &&
                !file.path.toLowerCase().includes(query)) {
                return;
            }

            items.push({
                type: type,
                name: file.basename,
                path: file.path,
                icon: icon
            });
        });

        const folders = this.app.vault.getAllLoadedFiles().filter(f => f.children);
        folders.forEach(folder => {
            if (searchQuery && !folder.name.toLowerCase().includes(query) &&
                !folder.path.toLowerCase().includes(query)) {
                return;
            }

            items.push({
                type: "folder",
                name: folder.name,
                path: folder.path,
                icon: "📁"
            });
        });

        return items.slice(0, 50);
    }

    render() {
        if (!this.suggestionEl) return;

        this.suggestionEl.innerHTML = "";

        const header = document.createElement("div");
        header.className = "markdown-next-ai-suggestions-header";
        header.textContent = `选择上下文 (${this.items.length}项)`;
        this.suggestionEl.appendChild(header);

        const list = document.createElement("div");
        list.className = "markdown-next-ai-suggestions-list";

        this.items.forEach((item, index) => {
            const itemEl = document.createElement("div");
            itemEl.className = "markdown-next-ai-suggestion-item";
            if (index === this.selectedIndex) {
                itemEl.classList.add("selected");
            }

            itemEl.innerHTML = `
				<span class="markdown-next-ai-suggestion-icon">${item.icon}</span>
				<div class="markdown-next-ai-suggestion-content">
					<div class="markdown-next-ai-suggestion-name">${item.name}</div>
					<div class="markdown-next-ai-suggestion-path">${item.path}</div>
				</div>
			`;

            itemEl.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.selectItem(index);
            };

            list.appendChild(itemEl);
        });

        this.suggestionEl.appendChild(list);
    }

    position() {
        if (!this.suggestionEl || !this.inputEl) return;

        const inputRect = this.inputEl.getBoundingClientRect();
        const selection = window.getSelection();

        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            this.suggestionEl.style.position = "fixed";
            this.suggestionEl.style.left = rect.left + "px";
            this.suggestionEl.style.top = (rect.bottom + 5) + "px";
        } else {
            this.suggestionEl.style.position = "fixed";
            this.suggestionEl.style.left = inputRect.left + "px";
            this.suggestionEl.style.top = (inputRect.bottom + 5) + "px";
        }

        this.suggestionEl.style.maxHeight = "300px";
        this.suggestionEl.style.overflowY = "auto";
        this.suggestionEl.style.zIndex = "10000";
    }

    bindKeyboardEvents() {
        if (this.keydownHandler) {
            this.inputEl.removeEventListener("keydown", this.keydownHandler);
        }

        this.keydownHandler = (e) => {
            if (!this.isOpen) return;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
                    this.render();
                    this.scrollToSelected();
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                    this.render();
                    this.scrollToSelected();
                    break;
                case "Enter":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectItem(this.selectedIndex);
                    break;
                case "Escape":
                    e.preventDefault();
                    e.stopPropagation();
                    this.close();
                    break;
            }
        };

        this.inputEl.addEventListener("keydown", this.keydownHandler);
    }

    scrollToSelected() {
        if (!this.suggestionEl) return;
        const selected = this.suggestionEl.querySelector(".markdown-next-ai-suggestion-item.selected");
        if (selected) {
            selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    selectItem(index) {
        if (index < 0 || index >= this.items.length) return;

        const item = this.items[index];
        const tag = document.createElement("span");
        tag.className = "markdown-next-ai-inline-tag";
        tag.contentEditable = "false";
        tag.setAttribute("data-type", item.type);
        tag.setAttribute("data-path", item.path);
        tag.innerHTML = `<span class="markdown-next-ai-inline-tag-icon">${item.icon}</span><span class="markdown-next-ai-inline-tag-name">${item.name}</span>`;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const deleteLength = this.getCursorPosition() - this.atPosition;

        let position = 0;
        let found = false;

        const deleteText = (node, start, length) => {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const textLength = node.textContent.length;
                if (position + textLength > start) {
                    const startOffset = start - position;
                    const endOffset = Math.min(startOffset + length, textLength);
                    const text = node.textContent;
                    node.textContent = text.substring(0, startOffset) + text.substring(endOffset);
                    range.setStart(node, startOffset);
                    range.collapse(true);
                    found = true;
                } else {
                    position += textLength;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList && node.classList.contains("markdown-next-ai-inline-tag")) {
                    const tagText = `@[${node.getAttribute("data-type")}:${node.getAttribute("data-path")}]`;
                    position += tagText.length;
                } else {
                    for (const child of node.childNodes) {
                        deleteText(child, start, length);
                        if (found) return;
                    }
                }
            }
        };

        deleteText(this.inputEl, this.atPosition, deleteLength);

        if (!found) {
            range.deleteContents();
        }

        range.insertNode(tag);

        const space = document.createTextNode(" ");
        range.setStartAfter(tag);
        range.insertNode(space);
        range.setStartAfter(space);
        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);

        this.inputEl.focus();
        this.updatePlaceholder();

        this.selectedTags.push(item);
        if (this.onSelect) {
            this.onSelect(item);
        }

        this.close();
    }

    updateSearch(query) {
        this.searchQuery = query;
        this.items = this.getAllItems(query);
        this.selectedIndex = 0;

        if (this.items.length === 0) {
            this.close();
        } else {
            this.render();
        }
    }

    close() {
        this.isOpen = false;
        if (this.suggestionEl && this.suggestionEl.parentNode) {
            this.suggestionEl.parentNode.removeChild(this.suggestionEl);
        }
        this.suggestionEl = null;

        if (this.keydownHandler) {
            this.inputEl.removeEventListener("keydown", this.keydownHandler);
            this.keydownHandler = null;
        }
    }
}

// ============================================
// 核心类：@ 触发弹窗
// ============================================
class AtTriggerPopup {
    constructor(app, onSubmit, cursorPosition, plugin) {
        this.app = app;
        this.onSubmit = onSubmit;
        this.cursorPosition = cursorPosition;
        this.plugin = plugin;
        this.popupEl = null;
        this.inputEl = null;
        this.modelSelectEl = null;
        this.isOpen = false;
        this.imageHandler = new ImageHandler();
        this.eventListeners = [];
        this.selectedContext = { files: [], folders: [] };
    }

    async submit() {
        const prompt = this.contextSelector.getTextContent().trim();
        await this.processInlineImages();
        const images = this.imageHandler.getImages();
        const modelId = this.modelSelectEl.value;
        const contextContent = await this.getContextContent();

        if (!prompt && images.length === 0 && !contextContent) {
            new Notice("请输入续写要求或上传图片");
            return;
        }

        this.onSubmit(prompt, images, modelId, contextContent);
        this.close();
    }

    getModelOptions() {
        const models = this.plugin.getAvailableModels();
        const currentModel = this.plugin.settings.currentModel;

        return models.map(model => {
            const selected = model.id === currentModel ? 'selected' : '';
            return `<option value="${model.id}" ${selected}>${model.name}</option>`;
        }).join('');
    }

    addImagePreview(imageData, container) {
        const previewEl = this.imageHandler.createImagePreview(imageData, () => { });
        container.appendChild(previewEl);
    }

    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-at-popup");

        this.popupEl.innerHTML = `
			<div class="markdown-next-ai-popup-header">
				<span class="markdown-next-ai-popup-title">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#863097" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
					Ai智能续写
				</span>
				<button class="markdown-next-ai-popup-close">✕</button>
			</div>
			<div class="markdown-next-ai-popup-content">
				<div class="markdown-next-ai-context-section">
					<div class="markdown-next-ai-selected-context" style="display: none;">
						<div class="markdown-next-ai-context-header">
							<span class="markdown-next-ai-context-title">已选择上下文:</span>
							<button class="markdown-next-ai-clear-context-btn" title="清除上下文">✕</button>
						</div>
						<div class="markdown-next-ai-context-list"></div>
					</div>
				</div>
				<textarea class="markdown-next-ai-continue-input" placeholder="请输入续写要求（@选择文件）..." rows="3"></textarea>
				<div class="markdown-next-ai-upload-section">
					<div class="markdown-next-ai-left-section">
						<select class="markdown-next-ai-model-select">
							${this.getModelOptions()}
						</select>
						<input type="file" class="markdown-next-ai-file-input" accept="image/*" multiple style="display: none;">
						<button class="markdown-next-ai-upload-btn" title="上传图片"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-up-icon lucide-image-up" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg></button>
						<div class="markdown-next-ai-context-buttons">
							<button class="markdown-next-ai-select-file-btn" title="选择文档作为上下文"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg></button>
							<button class="markdown-next-ai-select-folder-btn" title="选择文件夹作为上下文"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></button>
						</div>
					</div>
					<button class="markdown-next-ai-submit-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-more-icon lucide-message-square-more" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/></svg>提交</button>
				</div>
				<div class="markdown-next-ai-image-previews"></div>
			</div>
		`;

        this.inputEl = this.popupEl.querySelector(".markdown-next-ai-continue-input");
        this.modelSelectEl = this.popupEl.querySelector(".markdown-next-ai-model-select");

        const submitBtn = this.popupEl.querySelector(".markdown-next-ai-submit-btn");
        const closeBtn = this.popupEl.querySelector(".markdown-next-ai-popup-close");
        const fileInput = this.popupEl.querySelector(".markdown-next-ai-file-input");
        const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn");
        const imagePreviewsEl = this.popupEl.querySelector(".markdown-next-ai-image-previews");
        const selectFileBtn = this.popupEl.querySelector(".markdown-next-ai-select-file-btn");
        const selectFolderBtn = this.popupEl.querySelector(".markdown-next-ai-select-folder-btn");
        const clearContextBtn = this.popupEl.querySelector(".markdown-next-ai-clear-context-btn");

        this.contextSelector = new InputContextSelector(this.app, this.inputEl, () => { });
        this.contextSelector.convertToContentEditable();
        this.inputEl = this.contextSelector.inputEl;

        closeBtn.onclick = () => this.close();

        submitBtn.onclick = () => this.submit();

        uploadBtn.onclick = () => fileInput.click();

        selectFileBtn.onclick = () => this.showFileSelector();
        selectFolderBtn.onclick = () => this.showFolderSelector();
        clearContextBtn.onclick = () => this.clearContext();

        const modelChangeHandler = (e) => {
            if (this.plugin && this.plugin.settings) {
                this.plugin.settings.currentModel = e.target.value;
                this.plugin.saveSettings();
            }
            this.updateUIForModelType(e.target.value);
        };
        this.modelSelectEl.addEventListener("change", modelChangeHandler);
        this.eventListeners.push({ element: this.modelSelectEl, event: "change", handler: modelChangeHandler });

        this.updateUIForModelType(this.modelSelectEl.value);

        const fileChangeHandler = (e) => {
            this.imageHandler.handleFileSelect(e.target.files, (imageData) => {
                this.addImagePreview(imageData, imagePreviewsEl);
            });
            e.target.value = "";
        };
        fileInput.addEventListener("change", fileChangeHandler);
        this.eventListeners.push({ element: fileInput, event: "change", handler: fileChangeHandler });

        const pasteHandler = (e) => {
            this.imageHandler.handlePaste(e, (imageData) => {
                this.addImagePreview(imageData, imagePreviewsEl);
            });
        };
        this.inputEl.addEventListener("paste", pasteHandler);
        this.eventListeners.push({ element: this.inputEl, event: "paste", handler: pasteHandler });

        const inputHandler = (e) => {
            const cursorPos = this.contextSelector.getCursorPosition();
            const textBefore = this.contextSelector.getTextContent().substring(0, cursorPos);
            const atIndex = textBefore.lastIndexOf("@");

            if (atIndex === -1) {
                this.contextSelector.close();
                return;
            }

            const query = textBefore.substring(atIndex + 1);
            if (query.includes(" ") || query.includes("\n")) {
                this.contextSelector.close();
            } else {
                this.contextSelector.show(atIndex, query);
            }
        };
        this.inputEl.addEventListener("input", inputHandler);
        this.eventListeners.push({ element: this.inputEl, event: "input", handler: inputHandler });

        const keydownHandler = (e) => {
            if (this.contextSelector && this.contextSelector.isOpen) return;

            if (e.key === "Enter") {
                if (!e.shiftKey) {
                    e.preventDefault();
                    submitBtn.click();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.close();
            }
        };
        this.inputEl.addEventListener("keydown", keydownHandler);
        this.eventListeners.push({ element: this.inputEl, event: "keydown", handler: keydownHandler });

        const outsideClickHandler = (e) => {
            if (this.popupEl.hasAttribute("data-prompt-selecting")) return;
            if (e.target.closest(".markdown-next-ai-prompt-selector-popup")) return;
            if (e.target.closest(".markdown-next-ai-context-suggestions")) return;
            if (this.contextSelector && this.contextSelector.isOpen) return;
            if (e.target.closest(".markdown-next-ai-file-selection-window")) return;
            if (e.target.closest(".markdown-next-ai-folder-selection-window")) return;
            if (this.popupEl.contains(e.target)) return;

            this.close();
        };

        setTimeout(() => {
            document.addEventListener("click", outsideClickHandler);
        }, 100);
        this.outsideClickHandler = outsideClickHandler;

        this.positionPopup();
        document.body.appendChild(this.popupEl);

        setTimeout(() => {
            if (this.inputEl) this.inputEl.focus();
        }, 100);
    }

    positionPopup() {
        if (!this.popupEl || !this.cursorPosition) return;

        const { left, top, height } = this.cursorPosition;

        this.popupEl.style.position = "fixed";
        this.popupEl.style.left = left + "px";
        this.popupEl.style.top = (top + height + 5) + "px";
        this.popupEl.style.zIndex = "10000";

        const rect = this.popupEl.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (rect.right > windowWidth) {
            this.popupEl.style.left = (windowWidth - rect.width - 10) + "px";
        }
        if (rect.left < 0) {
            this.popupEl.style.left = "10px";
        }
        if (rect.bottom > windowHeight) {
            this.popupEl.style.top = (top - rect.height - 5) + "px";
        }
    }

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;

        if (this.contextSelector) {
            this.contextSelector.close();
            this.contextSelector = null;
        }

        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];

        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler);
            this.outsideClickHandler = null;
        }

        this.imageHandler.clearImages();

        if (this.popupEl && this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;
        this.inputEl = null;
    }

    updateUIForModelType(modelId) {
        if (!this.popupEl || !modelId) return;

        const model = this.plugin.settings.models[modelId];
        if (model) {
            const isImageModel = model.category === MODEL_CATEGORIES.IMAGE;

            const titleEl = this.popupEl.querySelector(".markdown-next-ai-popup-title");
            if (titleEl) {
                titleEl.innerHTML = isImageModel ?
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#863097" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>AI图片生成' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#863097" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>Ai智能续写';
            }

            if (this.inputEl) {
                this.inputEl.setAttribute("data-placeholder", isImageModel ? "请描述您想要生成的图片..." : "请输入续写要求（@选择文件）...");
                this.contextSelector.updatePlaceholder();
            }

            const submitBtn = this.popupEl.querySelector(".markdown-next-ai-submit-btn");
            if (submitBtn) {
                submitBtn.innerHTML = isImageModel ?
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-plus-icon lucide-image-plus" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>生成图片' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-more-icon lucide-message-square-more" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/></svg>提交';
            }

            const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn");
            if (uploadBtn) {
                uploadBtn.style.display = isImageModel ? "none" : "inline-flex";
            }
        }
    }

    showFileSelector() {
        const extensions = ["md", "txt", "docx", "doc", "pdf", "xlsx", "xls", "epub", "mobi", "csv", "json"];
        const files = this.plugin.app.vault.getFiles()
            .filter(file => extensions.includes(file.extension.toLowerCase()))
            .map(file => ({
                name: file.basename,
                path: file.path,
                extension: file.extension.toLowerCase()
            }));

        const header = this.popupEl.querySelector(".markdown-next-ai-popup-header");
        if (header) {
            const rect = header.getBoundingClientRect();
            new FileSelectionWindow(this.plugin.app, files, (selected) => {
                this.addFilesToContext(selected);
            }).open(rect);
        }
    }

    showFolderSelector() {
        const folders = this.plugin.app.vault.getAllLoadedFiles()
            .filter(f => f.children)
            .map(f => ({
                name: f.name,
                path: f.path
            }));

        const header = this.popupEl.querySelector(".markdown-next-ai-popup-header");
        if (header) {
            const rect = header.getBoundingClientRect();
            new FolderSelectionWindow(this.plugin.app, folders, (selected) => {
                this.addFoldersToContext(selected);
            }).open(rect);
        }
    }

    addFilesToContext(files) {
        files.forEach(file => {
            if (!this.selectedContext.files.find(f => f.path === file.path)) {
                this.selectedContext.files.push(file);
            }
        });
        this.updateContextDisplay();
    }

    addFoldersToContext(folders) {
        folders.forEach(folder => {
            if (!this.selectedContext.folders.find(f => f.path === folder.path)) {
                this.selectedContext.folders.push(folder);
            }
        });
        this.updateContextDisplay();
    }

    updateContextDisplay() {
        const container = this.popupEl.querySelector(".markdown-next-ai-selected-context");
        const list = this.popupEl.querySelector(".markdown-next-ai-context-list");

        if (this.selectedContext.files.length === 0 && this.selectedContext.folders.length === 0) {
            container.style.display = "none";
        } else {
            container.style.display = "block";
            list.innerHTML = "";

            this.selectedContext.files.forEach(file => {
                const item = document.createElement("div");
                item.className = "markdown-next-ai-context-item";
                item.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
					<polyline points="14,2 14,8 20,8"/>
					<line x1="16" y1="13" x2="8" y2="13"/>
					<line x1="16" y1="17" x2="8" y2="17"/>
					<polyline points="10,9 9,9 8,9"/>
				</svg>
				<span class="markdown-next-ai-context-name">${file.name}</span>
				<button class="markdown-next-ai-remove-context" data-type="file" data-path="${file.path}">×</button>
			`;
                list.appendChild(item);
            });

            this.selectedContext.folders.forEach(folder => {
                const item = document.createElement("div");
                item.className = "markdown-next-ai-context-item";
                item.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
				</svg>
				<span class="markdown-next-ai-context-name">${folder.name}</span>
				<button class="markdown-next-ai-remove-context" data-type="folder" data-path="${folder.path}">×</button>
			`;
                list.appendChild(item);
            });

            list.querySelectorAll(".markdown-next-ai-remove-context").forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const type = btn.getAttribute("data-type");
                    const path = btn.getAttribute("data-path");
                    this.removeFromContext(type, path);
                };
            });
        }
    }

    removeFromContext(type, path) {
        if (type === "file") {
            this.selectedContext.files = this.selectedContext.files.filter(f => f.path !== path);
        } else if (type === "folder") {
            this.selectedContext.folders = this.selectedContext.folders.filter(f => f.path !== path);
        }
        this.updateContextDisplay();
    }

    clearContext() {
        this.selectedContext = { files: [], folders: [] };
        this.updateContextDisplay();
    }

    async processInlineImages() {
        if (!this.contextSelector || !this.contextSelector.inputEl) return;

        const inlineTags = this.contextSelector.inputEl.querySelectorAll(".markdown-next-ai-inline-tag");
        for (const tag of inlineTags) {
            const type = tag.getAttribute("data-type");
            const path = tag.getAttribute("data-path");

            if (type === "image") {
                try {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (!file) continue;

                    const arrayBuffer = await this.plugin.app.vault.readBinary(file);
                    const uint8Array = new Uint8Array(arrayBuffer);
                    let binary = "";
                    for (let i = 0; i < uint8Array.length; i++) {
                        binary += String.fromCharCode(uint8Array[i]);
                    }
                    const base64 = btoa(binary);

                    const mimeTypes = {
                        "jpg": "image/jpeg",
                        "jpeg": "image/jpeg",
                        "png": "image/png",
                        "gif": "image/gif",
                        "webp": "image/webp",
                        "bmp": "image/bmp",
                        "svg": "image/svg+xml"
                    };
                    const mimeType = mimeTypes[file.extension?.toLowerCase() || "png"] || "image/png";
                    const dataUrl = `data:${mimeType};base64,${base64}`;

                    const imageData = {
                        id: Date.now() + Math.random(),
                        name: file.name,
                        size: arrayBuffer.byteLength,
                        type: mimeType,
                        base64: dataUrl,
                        url: dataUrl,
                        fromInline: true
                    };

                    if (!this.imageHandler.images.some(img => img.name === imageData.name && img.size === imageData.size)) {
                        this.imageHandler.images.push(imageData);
                    }
                } catch (error) {
                    console.error("无法读取图片: " + path, error);
                    new Notice("无法读取图片: " + path);
                }
            }
        }
    }

    async getContextContent() {
        let content = "";

        for (const file of this.selectedContext.files) {
            try {
                const fileObj = this.plugin.app.vault.getAbstractFileByPath(file.path);
                if (fileObj) {
                    const text = await this.plugin.app.vault.read(fileObj);
                    content += `\n\n=== 文档: ${file.name} ===\n${text}`;
                }
            } catch (error) {
                console.error("读取文件失败:", error);
            }
        }

        const getAllMarkdownFiles = (folder, baseFolderName) => {
            const files = [];
            if (folder && folder.children) {
                for (const child of folder.children) {
                    if (child.extension === "md") {
                        files.push({
                            file: child,
                            sourcePath: child.path,
                            baseFolderName: baseFolderName
                        });
                    } else if (child.children) {
                        const subFiles = getAllMarkdownFiles(child, baseFolderName);
                        files.push(...subFiles);
                    }
                }
            }
            return files;
        };

        for (const folder of this.selectedContext.folders) {
            try {
                const folderObj = this.plugin.app.vault.getAbstractFileByPath(folder.path);
                if (folderObj) {
                    const mdFiles = getAllMarkdownFiles(folderObj, folder.name);
                    for (const { file, sourcePath, baseFolderName } of mdFiles) {
                        const text = await this.plugin.app.vault.read(file);
                        content += `\n\n=== 文档: ${file.basename} (来自文件夹: ${baseFolderName}, 路径: ${sourcePath}) ===\n${text}`;
                    }
                }
            } catch (error) {
                console.error("读取文件夹失败:", error);
            }
        }

        return content.trim();
    }
}

// ============================================
// 工具类：文本上下文提取器
// ============================================
class TextContextExtractor {
    static getContext(editor, selectedText = null, settings = null) {
        const cursor = editor.getCursor();
        const doc = editor.getDoc();
        const totalLines = doc.lineCount();

        let selected = "";
        let beforeText = "";
        let afterText = "";

        if (selectedText) {
            selected = selectedText;

            if (editor.getSelection()) {
                const fromPos = editor.getCursor("from");
                const toPos = editor.getCursor("to");

                for (let i = Math.max(0, fromPos.line - 2); i < fromPos.line; i++) {
                    beforeText += doc.getLine(i) + "\n";
                }
                beforeText += doc.getLine(fromPos.line).substring(0, fromPos.ch);

                afterText = doc.getLine(toPos.line).substring(toPos.ch);
                const maxLine = Math.min(totalLines, toPos.line + 3);
                for (let i = toPos.line + 1; i < maxLine; i++) {
                    afterText += "\n" + doc.getLine(i);
                }
            }
        } else {
            const maxLines = (settings && settings.maxContextLines) ? settings.maxContextLines : DEFAULT_SETTINGS.maxContextLines;
            const maxChars = (settings && settings.maxContextChars) ? settings.maxContextChars : DEFAULT_SETTINGS.maxContextChars;

            let contextText = "";
            for (let i = Math.max(0, cursor.line - maxLines); i < cursor.line; i++) {
                contextText += doc.getLine(i) + "\n";
            }
            contextText += doc.getLine(cursor.line).substring(0, cursor.ch);

            if (contextText.length > maxChars) {
                beforeText = "..." + contextText.substring(contextText.length - maxChars);
            } else {
                beforeText = contextText;
            }

            afterText = doc.getLine(cursor.line).substring(cursor.ch);
            const maxLine = Math.min(totalLines, cursor.line + 5);
            for (let i = cursor.line + 1; i < maxLine; i++) {
                afterText += "\n" + doc.getLine(i);
            }

            if (afterText.length > 1000) {
                afterText = afterText.substring(0, 1000) + "...";
            }
        }

        return {
            selectedText: selected.trim(),
            beforeText: beforeText.trim(),
            afterText: afterText.trim(),
            cursorPosition: cursor,
            filePath: editor.getDoc().getValue(),
            lineNumber: cursor.line
        };
    }
}

// ============================================
// AI服务类
// ============================================
class AIService {
    constructor(settings, app) {
        this.settings = settings;
        this.app = app;
        this.requestQueue = [];
        this.isProcessing = false;
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    getCurrentModelConfig() {
        // 如果有全局配置，优先使用
        if (this.settings.apiKey && this.settings.baseUrl && this.settings.model) {
            return {
                apiKey: this.settings.apiKey,
                baseUrl: this.settings.baseUrl,
                model: this.settings.model
            };
        }

        const currentModelId = this.settings.currentModel;
        if (!currentModelId) {
            throw new Error("未选择当前模型");
        }

        const modelConfig = this.settings.models[currentModelId];
        if (!modelConfig || !modelConfig.enabled) {
            throw new Error(`模型 ${currentModelId} 未启用或不存在`);
        }

        const providerConfig = this.settings.providers[modelConfig.provider];
        if (!providerConfig || !providerConfig.enabled) {
            throw new Error(`供应商 ${modelConfig.provider} 未启用或不存在`);
        }

        return {
            apiKey: providerConfig.apiKey,
            baseUrl: providerConfig.baseUrl,
            model: modelConfig.actualModel || modelConfig.model || modelConfig.id
        };
    }

    isVisionModel(model) {
        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];

        if (!modelConfig) return false;

        let category = modelConfig.category;
        if (!category && modelConfig.type) {
            category = modelConfig.type === "image" ? MODEL_CATEGORIES.IMAGE : MODEL_CATEGORIES.TEXT;
        }

        return category === MODEL_CATEGORIES.VISION;
    }

    isThinkingModel(model = null) {
        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];

        if (!modelConfig) return false;

        let category = modelConfig.category;
        if (!category && modelConfig.type) {
            category = modelConfig.type === "image" ? MODEL_CATEGORIES.IMAGE : MODEL_CATEGORIES.TEXT;
        }

        return category === MODEL_CATEGORIES.THINKING;
    }

    normalizeBaseUrl(url) {
        if (!url) return "";
        return url.replace(/\/$/, "");
    }

    async testConnection() {
        try {
            const config = this.getCurrentModelConfig();
            const url = this.buildApiUrl("/chat/completions");

            const response = await requestUrl({
                url: url,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 5
                })
            });

            if (response.status === 200) {
                return { success: true };
            } else {
                return { success: false, message: `HTTP ${response.status}: ${response.text}` };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    buildApiUrl(endpoint) {
        const config = this.getCurrentModelConfig();
        const baseUrl = this.normalizeBaseUrl(config.baseUrl);
        const isOpenAI = baseUrl.includes("api.openai.com");

        if (baseUrl.endsWith("/v1")) {
            return `${baseUrl}${endpoint}`;
        } else if (!isOpenAI && (baseUrl.includes("/chat/completions") || baseUrl.includes("/images/generations"))) {
            const cleanBase = baseUrl.split("/chat/completions")[0].split("/images/generations")[0];
            return `${cleanBase}${endpoint}`;
        } else {
            return `${baseUrl}/v1${endpoint}`;
        }
    }

    async sendRequest(mode, context, prompt = "", images = [], chatHistory = [], onStream = null) {
        const config = this.getCurrentModelConfig();

        if (!config.apiKey) {
            throw new Error("请先配置API Key");
        }

        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];
        let category = modelConfig?.category;

        if (!category && modelConfig) {
            if (modelConfig.type === "image") {
                category = MODEL_CATEGORIES.IMAGE;
            } else {
                category = MODEL_CATEGORIES.TEXT;
            }
            modelConfig.category = category;
            await this.saveSettings();
        }

        // 图片生成模型
        if (category === MODEL_CATEGORIES.IMAGE) {
            if (mode === "continue" && context.selectedText && context.selectedText.trim()) {
                throw new Error("AI原文修改模式不支持图片生成模型，请选择文本生成模型进行文本修改。");
            }
            return this.handleImageGeneration(prompt, config, context.cursorPosition);
        }

        // 思考模型
        const isThinking = category === MODEL_CATEGORIES.THINKING || this.isThinkingModel(config.model);
        const isStreaming = onStream && typeof onStream === "function";
        const isMultimodal = category === MODEL_CATEGORIES.MULTIMODAL;
        const isVision = category === MODEL_CATEGORIES.VISION || this.isVisionModel(config.model);

        // 检查图片支持
        if (images && images.length > 0 && !(isMultimodal || isVision)) {
            new Notice(`当前模型 ${config.model} 不支持图片和附件，请切换到多模态模型或视觉模型`);
            images = [];
        }

        // 构建系统提示词
        let systemPrompt = SYSTEM_PROMPTS[mode];

        // 添加全局规则
        if (this.settings.enableGlobalRules && this.settings.globalRules && this.settings.globalRules.length > 0) {
            const enabledRules = this.settings.globalRules
                .filter(rule => rule.enabled !== false)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0));

            if (enabledRules.length > 0) {
                const rulesText = enabledRules.map(rule => rule.content).join("\n");
                systemPrompt += "\n\n全局规则（请严格遵循以下规则）：\n" + rulesText;
            }
        }

        // 构建用户提示词
        let userPrompt = "";
        if (mode === "continue") {
            if (context.selectedText && context.selectedText.trim()) {
                userPrompt = `需要修改的完整内容：${context.selectedText}\n\n修改要求：${prompt}`;
            } else {
                userPrompt = `以下是光标前的上下文内容：\n${context.beforeText}\n\n请从光标位置开始续写，只生成新内容，不要重复上述内容。续写要求：${prompt}`;
            }
        } else {
            userPrompt = `上下文：${context.beforeText}\n\n选中文本：${context.selectedText}\n\n后续内容：${context.afterText}`;
            if (prompt) {
                userPrompt += `\n\n特殊要求：${prompt}`;
            }
        }

        // 添加额外上下文
        if (context.additionalContext && context.additionalContext.trim()) {
            userPrompt += `\n\n【重要提示：以下是必须参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.additionalContext}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
        }

        if (context.contextContent && context.contextContent.trim()) {
            userPrompt += `\n\n【重要提示：以下是必须参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.contextContent}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
        }

        // 构建API请求URL
        const apiUrl = this.buildApiUrl("/chat/completions");

        // 构建消息数组
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // 添加聊天历史
        if (chatHistory && chatHistory.length > 0) {
            chatHistory.forEach(msg => {
                if (msg.role === "user" || msg.role === "assistant") {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            });
        }

        // 添加图片
        if (images && images.length > 0) {
            userPrompt += `\n\n附加图片：共${images.length}张图片`;

            const content = [
                { type: "text", text: userPrompt }
            ];

            images.forEach((img, idx) => {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: img.base64 || img.url
                    }
                });
            });

            messages.push({
                role: "user",
                content: content
            });
        } else {
            messages.push({
                role: "user",
                content: userPrompt
            });
        }

        // 构建请求体
        const requestBody = {
            model: config.model,
            messages: messages,
            temperature: 0.7,
            max_tokens: this.getMaxTokens(mode)
        };

        if (isStreaming) {
            requestBody.stream = true;
        }

        try {
            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.apiKey}`
            };

            if (isStreaming) {
                return await this.handleStreamRequest(apiUrl, headers, requestBody, onStream);
            }

            const response = await requestUrl({
                url: apiUrl,
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody),
                throw: false
            });

            if (response.status !== 200) {
                const errorText = response.text;

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                throw new Error(`API请求失败: ${response.status} ${errorText}`);
            }

            const data = response.json;

            if (!data.choices || data.choices.length === 0) {
                throw new Error("API返回数据格式错误：缺少choices数组");
            }

            const choice = data.choices[0];
            if (!choice.message) {
                throw new Error("API返回数据格式错误：缺少message对象");
            }

            let content = "";
            if (choice.message.content) {
                content = choice.message.content.trim();
            } else if (choice.text) {
                content = choice.text.trim();
            } else if (choice.message.text) {
                content = choice.message.text.trim();
            } else {
                throw new Error("API返回数据格式错误：找不到内容字段");
            }

            const usage = data.usage || {};
            const finishReason = choice.finish_reason;

            return {
                content: content,
                usage: usage
            };
        } catch (error) {
            throw error;
        }
    }

    getMaxTokens(mode) {
        return this.settings.maxTokens || DEFAULT_SETTINGS.maxTokens;
    }

    async handleStreamRequest(apiUrl, headers, requestBody, onStream) {
        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                throw new Error(`API请求失败: ${response.status} ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = "";
            let content = "";
            let fullContent = "";
            let thinking = "";
            let streamedContent = "";

            const config = this.getCurrentModelConfig();
            const currentModelId = this.settings.currentModel;
            const modelConfig = this.settings.models[currentModelId];
            const provider = modelConfig?.provider;

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6);

                            if (data === "[DONE]") {
                                break;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta;

                                if (delta?.reasoning_content) {
                                    const reasoningChunk = delta.reasoning_content;
                                    thinking += reasoningChunk;
                                    fullContent += reasoningChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }

                                if (delta?.content) {
                                    const contentChunk = delta.content;
                                    streamedContent += contentChunk;
                                    fullContent += contentChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }

                                if (delta?.text) {
                                    const textChunk = delta.text;
                                    streamedContent += textChunk;
                                    fullContent += textChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }

                onStream({
                    content: streamedContent,
                    thinking: thinking,
                    fullContent: fullContent,
                    isComplete: true
                });

                return {
                    content: streamedContent.trim(),
                    thinking: thinking.trim(),
                    usage: {}
                };
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            throw error;
        }
    }

    async handleImageGeneration(prompt, config, cursorPosition = null) {
        if (!prompt || !prompt.trim()) {
            throw new Error("请输入图片描述");
        }

        const apiUrl = this.buildApiUrl("/images/generations");
        let model = config.model;

        const requestBody = {
            model: model,
            prompt: prompt.trim(),
            response_format: "b64_json",
            n: 1,
            size: this.settings.imageGenerationSize || "1024x1024"
        };

        if (model.includes("dall-e") && model === "dall-e-3") {
            requestBody.quality = "standard";
            requestBody.style = "vivid";
        }

        try {
            const response = await requestUrl({
                url: apiUrl,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
                },
                body: JSON.stringify(requestBody),
                throw: false
            });

            if (response.status !== 200) {
                const errorText = response.text;

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                if (response.status === 401) {
                    throw new Error("API密钥无效，请检查配置。");
                }

                throw new Error(`图片生成API请求失败: ${response.status} ${errorText}`);
            }

            const data = response.json;

            if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
                throw new Error("图片生成API返回数据格式错误");
            }

            const imageData = data.data[0];
            let base64Data = null;

            if (imageData.b64_json) {
                base64Data = imageData.b64_json;
            } else {
                throw new Error("图片生成API返回数据中缺少图片内容");
            }

            try {
                const fileName = `image_${Date.now()}.png`;
                const savePath = this.settings.imageSavePath || "Extras/附件";
                const fullPath = savePath + "/" + fileName;

                try {
                    const folder = this.app.vault.getAbstractFileByPath(savePath);
                    if (!folder) {
                        await this.app.vault.createFolder(savePath);
                    }
                } catch (e) {
                    try {
                        await this.app.vault.adapter.mkdir(savePath);
                    } catch (err) {
                        throw new Error(`无法创建目录 ${savePath}: ${err.message}`);
                    }
                }

                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                await this.app.vault.createBinary(fullPath, bytes.buffer);

                const imageSize = this.settings.imageSize || 300;

                let insertAtNewLine = true;
                if (cursorPosition && cursorPosition.ch > 0) {
                    insertAtNewLine = false;
                }

                let markdown;
                if (insertAtNewLine) {
                    markdown = `![Generated Image|${imageSize}](${fullPath})`;
                } else {
                    markdown = `<span class="image-mask-rounded-R" style="width: 200px; height: 200px;"><img src="${fullPath}" alt="" style="width: 100%; height: 100%; object-fit: cover;"></span>`;
                }

                return {
                    content: markdown,
                    imageData: {
                        filePath: fullPath,
                        format: "png",
                        prompt: prompt
                    },
                    usage: data.usage || {}
                };
            } catch (error) {
                throw new Error("图片保存失败: " + error.message);
            }
        } catch (error) {
            throw error;
        }
    }

    getAvailableImageModels() {
        const imageModels = [];
        for (const [key, model] of Object.entries(this.settings.models)) {
            if (model.type === "image" && model.enabled) {
                imageModels.push(model.name || key);
            }
        }
        return imageModels;
    }

    async testConnection() {
        try {
            await this.sendRequest(
                "continue",
                {
                    selectedText: "测试文本",
                    beforeText: "",
                    afterText: ""
                },
                "",
                [],
                []
            );

            return {
                success: true,
                message: "API连接成功"
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
}

// ============================================
// 文件选择窗口
// ============================================
class FileSelectionWindow {
    constructor(app, files, onSelect) {
        this.app = app;
        this.files = files;
        this.onSelect = onSelect;
        this.selectedFiles = [];
        this.windowEl = null;
        this.isOpen = false;
        this.eventListeners = [];
        this.outsideClickHandler = null;
    }

    open(popupRect) {
        if (this.isOpen) return;

        this.isOpen = true;
        this.windowEl = document.createElement("div");
        this.windowEl.className = "markdown-next-ai-file-selection-window";

        this.windowEl.innerHTML = `
            <div class="markdown-next-ai-window-content">
                <div class="markdown-next-ai-window-header">
                    <span class="markdown-next-ai-window-title">选择文档</span>
                    <button class="markdown-next-ai-window-close">✕</button>
                </div>
                <div class="markdown-next-ai-window-search">
                    <input type="text" class="markdown-next-ai-search-input" placeholder="搜索文件...">
                </div>
                <div class="markdown-next-ai-file-list"></div>
                <div class="markdown-next-ai-window-footer">
                    <span class="markdown-next-ai-selected-count">已选择: 0</span>
                    <button class="markdown-next-ai-confirm-btn">确定</button>
                </div>
            </div>
        `;

        const closeBtn = this.windowEl.querySelector(".markdown-next-ai-window-close");
        const searchInput = this.windowEl.querySelector(".markdown-next-ai-search-input");
        const fileList = this.windowEl.querySelector(".markdown-next-ai-file-list");
        const confirmBtn = this.windowEl.querySelector(".markdown-next-ai-confirm-btn");
        const selectedCount = this.windowEl.querySelector(".markdown-next-ai-selected-count");

        closeBtn.onclick = () => this.close();
        confirmBtn.onclick = () => {
            this.onSelect(this.selectedFiles);
            this.close();
        };

        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            this.renderFileList(fileList, query, selectedCount);
        });

        this.renderFileList(fileList, "", selectedCount);

        // 点击外部关闭
        this.outsideClickHandler = (e) => {
            if (!this.windowEl.contains(e.target)) {
                this.close();
            }
        };

        setTimeout(() => {
            document.addEventListener("click", this.outsideClickHandler);
        }, 100);

        // 定位窗口
        this.windowEl.style.position = "fixed";
        if (popupRect) {
            this.windowEl.style.left = popupRect.left + "px";
            this.windowEl.style.top = (popupRect.bottom + 5) + "px";
        } else {
            this.windowEl.style.left = "50%";
            this.windowEl.style.top = "50%";
            this.windowEl.style.transform = "translate(-50%, -50%)";
        }
        this.windowEl.style.zIndex = "10001";

        document.body.appendChild(this.windowEl);
        searchInput.focus();
    }

    renderFileList(container, query, selectedCountEl) {
        container.innerHTML = "";

        const filteredFiles = this.files.filter(file => {
            if (query === "") return true;
            return file.name.toLowerCase().includes(query) ||
                file.path.toLowerCase().includes(query);
        });

        filteredFiles.forEach(file => {
            const fileEl = document.createElement("div");
            fileEl.className = "markdown-next-ai-file-item";

            const isSelected = this.selectedFiles.find(f => f.path === file.path);
            if (isSelected) {
                fileEl.classList.add("selected");
            }

            const iconMap = {
                "md": "📄",
                "txt": "📝",
                "pdf": "📕",
                "docx": "📝",
                "doc": "📝",
                "xlsx": "📊",
                "xls": "📊",
                "csv": "📊",
                "json": "📋",
                "epub": "📚",
                "mobi": "📚"
            };

            const icon = iconMap[file.extension] || "📄";

            fileEl.innerHTML = `
                <span class="markdown-next-ai-file-icon">${icon}</span>
                <div class="markdown-next-ai-file-info">
                    <div class="markdown-next-ai-file-name">${file.name}</div>
                    <div class="markdown-next-ai-file-path">${file.path}</div>
                </div>
                <span class="markdown-next-ai-file-checkbox">${isSelected ? "✓" : ""}</span>
            `;

            fileEl.onclick = () => {
                if (isSelected) {
                    this.selectedFiles = this.selectedFiles.filter(f => f.path !== file.path);
                } else {
                    this.selectedFiles.push(file);
                }
                this.renderFileList(container, query, selectedCountEl);
            };

            container.appendChild(fileEl);
        });

        selectedCountEl.textContent = `已选择: ${this.selectedFiles.length}`;
    }

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;

        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler);
            this.outsideClickHandler = null;
        }

        if (this.windowEl && this.windowEl.parentNode) {
            this.windowEl.parentNode.removeChild(this.windowEl);
        }
        this.windowEl = null;
    }
}

// ============================================
// 文件夹选择窗口
// ============================================
class FolderSelectionWindow {
    constructor(app, folders, onSelect) {
        this.app = app;
        this.folders = folders;
        this.onSelect = onSelect;
        this.selectedFolders = [];
        this.windowEl = null;
        this.isOpen = false;
        this.outsideClickHandler = null;
    }

    open(popupRect) {
        if (this.isOpen) return;

        this.isOpen = true;
        this.windowEl = document.createElement("div");
        this.windowEl.className = "markdown-next-ai-folder-selection-window";

        this.windowEl.innerHTML = `
            <div class="markdown-next-ai-window-content">
                <div class="markdown-next-ai-window-header">
                    <span class="markdown-next-ai-window-title">选择文件夹</span>
                    <button class="markdown-next-ai-window-close">✕</button>
                </div>
                <div class="markdown-next-ai-window-search">
                    <input type="text" class="markdown-next-ai-search-input" placeholder="搜索文件夹...">
                </div>
                <div class="markdown-next-ai-folder-list"></div>
                <div class="markdown-next-ai-window-footer">
                    <span class="markdown-next-ai-selected-count">已选择: 0</span>
                    <button class="markdown-next-ai-confirm-btn">确定</button>
                </div>
            </div>
        `;

        const closeBtn = this.windowEl.querySelector(".markdown-next-ai-window-close");
        const searchInput = this.windowEl.querySelector(".markdown-next-ai-search-input");
        const folderList = this.windowEl.querySelector(".markdown-next-ai-folder-list");
        const confirmBtn = this.windowEl.querySelector(".markdown-next-ai-confirm-btn");
        const selectedCount = this.windowEl.querySelector(".markdown-next-ai-selected-count");

        closeBtn.onclick = () => this.close();
        confirmBtn.onclick = () => {
            this.onSelect(this.selectedFolders);
            this.close();
        };

        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            this.renderFolderList(folderList, query, selectedCount);
        });

        this.renderFolderList(folderList, "", selectedCount);

        // 点击外部关闭
        this.outsideClickHandler = (e) => {
            if (!this.windowEl.contains(e.target)) {
                this.close();
            }
        };

        setTimeout(() => {
            document.addEventListener("click", this.outsideClickHandler);
        }, 100);

        // 定位窗口
        this.windowEl.style.position = "fixed";
        if (popupRect) {
            this.windowEl.style.left = popupRect.left + "px";
            this.windowEl.style.top = (popupRect.bottom + 5) + "px";
        } else {
            this.windowEl.style.left = "50%";
            this.windowEl.style.top = "50%";
            this.windowEl.style.transform = "translate(-50%, -50%)";
        }
        this.windowEl.style.zIndex = "10001";

        document.body.appendChild(this.windowEl);
        searchInput.focus();
    }

    renderFolderList(container, query, selectedCountEl) {
        container.innerHTML = "";

        const filteredFolders = this.folders.filter(folder => {
            if (query === "") return true;
            return folder.name.toLowerCase().includes(query) ||
                folder.path.toLowerCase().includes(query);
        });

        filteredFolders.forEach(folder => {
            const folderEl = document.createElement("div");
            folderEl.className = "markdown-next-ai-folder-item";

            const isSelected = this.selectedFolders.find(f => f.path === folder.path);
            if (isSelected) {
                folderEl.classList.add("selected");
            }

            folderEl.innerHTML = `
                <span class="markdown-next-ai-folder-icon">📁</span>
                <div class="markdown-next-ai-folder-info">
                    <div class="markdown-next-ai-folder-name">${folder.name}</div>
                    <div class="markdown-next-ai-folder-path">${folder.path}</div>
                </div>
                <span class="markdown-next-ai-folder-checkbox">${isSelected ? "✓" : ""}</span>
            `;

            folderEl.onclick = () => {
                if (isSelected) {
                    this.selectedFolders = this.selectedFolders.filter(f => f.path !== folder.path);
                } else {
                    this.selectedFolders.push(folder);
                }
                this.renderFolderList(container, query, selectedCountEl);
            };

            container.appendChild(folderEl);
        });

        selectedCountEl.textContent = `已选择: ${this.selectedFolders.length}`;
    }

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;

        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler);
            this.outsideClickHandler = null;
        }

        if (this.windowEl && this.windowEl.parentNode) {
            this.windowEl.parentNode.removeChild(this.windowEl);
        }
        this.windowEl = null;
    }
}

// ============================================
// AI预览弹窗
// ============================================
class AIPreviewPopup {
    constructor(app, editor, view, onConfirm, onReject) {
        this.app = app;
        this.editor = editor;
        this.view = view;
        this.onConfirm = onConfirm;
        this.onReject = onReject;
        this.isOpen = false;
        this.popupEl = null;
        this.scrollContainer = null;
    }

    open(cursorPos) {
        if (this.isOpen) return;
        this.isOpen = true;

        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-preview-popup");

        this.popupEl.innerHTML = `
            <div class="markdown-next-ai-preview-content">
                <div class="markdown-next-ai-preview-header">
                    <span class="markdown-next-ai-preview-status thinking">⏳正在思考中</span>
                </div>
                <div class="markdown-next-ai-preview-actions" style="display: none;">
                    <button class="markdown-next-ai-preview-confirm-btn">✓ 接受</button>
                    <button class="markdown-next-ai-preview-reject-btn">✗ 拒绝</button>
                </div>
            </div>
        `;

        const confirmBtn = this.popupEl.querySelector(".markdown-next-ai-preview-confirm-btn");
        const rejectBtn = this.popupEl.querySelector(".markdown-next-ai-preview-reject-btn");

        confirmBtn.onclick = () => {
            if (this.onConfirm) this.onConfirm();
            this.close();
        };

        rejectBtn.onclick = () => {
            if (this.onReject) this.onReject();
            this.close();
        };

        // 找到编辑器的滚动容器，将弹窗添加到其中实现相对文本固定
        this.scrollContainer = this.view.containerEl.querySelector(".cm-scroller");
        if (!this.scrollContainer) {
            // 备用：直接使用编辑器容器
            this.scrollContainer = this.view.containerEl.querySelector(".cm-editor");
        }

        if (this.scrollContainer) {
            // 设置滚动容器为相对定位（如果还没有）
            const containerStyle = window.getComputedStyle(this.scrollContainer);
            if (containerStyle.position === "static") {
                this.scrollContainer.style.position = "relative";
            }

            this.popupEl.style.position = "absolute";
            this.scrollContainer.appendChild(this.popupEl);
        } else {
            // 最后备用：添加到body
            this.popupEl.style.position = "fixed";
            document.body.appendChild(this.popupEl);
        }

        // 定位到光标上方
        if (cursorPos) {
            this.positionAt(cursorPos.left, cursorPos.top, "above");
        }
    }

    // 定位弹窗到指定坐标
    positionAt(x, y, placement = "above") {
        if (!this.popupEl) return;

        const popupRect = this.popupEl.getBoundingClientRect();

        if (this.scrollContainer) {
            // 相对于滚动容器定位
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const scrollTop = this.scrollContainer.scrollTop;
            const scrollLeft = this.scrollContainer.scrollLeft;

            // 获取编辑器内容区域（.cm-content）的左边界
            const contentEl = this.scrollContainer.querySelector(".cm-content");
            const contentRect = contentEl ? contentEl.getBoundingClientRect() : containerRect;

            let left;
            let top;

            if (placement === "above") {
                // 定位到文本区域左侧外部，高度与光标对齐
                // 弹窗右边缘对齐内容区域左边缘
                left = contentRect.left - containerRect.left + scrollLeft - popupRect.width - 8;
                top = y - containerRect.top + scrollTop - popupRect.height / 2;

                // 如果左侧空间不足，显示在右侧（内容区域右边）
                if (left < 0) {
                    left = contentRect.right - containerRect.left + scrollLeft + 8;
                }
            } else {
                // 定位到光标下方（用于完成后的按钮）
                left = x - containerRect.left + scrollLeft;
                top = y - containerRect.top + scrollTop + 8;

                // 确保不超出右边界
                if (left + popupRect.width > containerRect.width - 10) {
                    left = containerRect.width - popupRect.width - 10;
                }
            }

            // 确保不超出上边界
            if (top < scrollTop) {
                top = scrollTop + 10;
            }

            this.popupEl.style.left = left + "px";
            this.popupEl.style.top = top + "px";
        } else {
            // fixed 定位的备用逻辑
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let left;
            let top;

            if (placement === "above") {
                // 定位到文本区域左侧外部，高度与光标对齐
                left = x - popupRect.width - 50;
                top = y - popupRect.height / 2;

                // 如果左侧空间不足，显示在右侧
                if (left < 10) {
                    left = x + 50;
                }
            } else {
                // 定位到光标下方（用于完成后的按钮）
                left = x;
                top = y + 8;
                if (top + popupRect.height > windowHeight - 10) {
                    top = y - popupRect.height - 8;
                }
            }

            // 确保不超出上下边界
            if (top < 10) {
                top = 10;
            }
            if (top + popupRect.height > windowHeight - 10) {
                top = windowHeight - popupRect.height - 10;
            }
            if (left + popupRect.width > windowWidth - 10) {
                left = windowWidth - popupRect.width - 10;
            }
            if (left < 10) {
                left = 10;
            }
            if (top < 10) {
                top = 10;
            }

            this.popupEl.style.left = left + "px";
            this.popupEl.style.top = top + "px";
        }

        this.popupEl.style.right = "auto";
        this.popupEl.style.bottom = "auto";
    }

    updateStatus(text) {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".markdown-next-ai-preview-status");
        if (statusEl) {
            statusEl.textContent = text;
            // 根据内容切换状态胶囊底色
            statusEl.classList.remove("thinking", "generating");
            if (text.includes("生成")) {
                statusEl.classList.add("generating");
            } else {
                statusEl.classList.add("thinking");
            }
        }
    }

    showActions() {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".markdown-next-ai-preview-status");
        const actionsEl = this.popupEl.querySelector(".markdown-next-ai-preview-actions");

        if (statusEl) statusEl.style.display = "none";
        if (actionsEl) actionsEl.style.display = "flex";
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        if (this.popupEl && this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;
    }
}

// ============================================
// 常用提示词选择弹窗
// ============================================
class PromptSelectorPopup {
    constructor(app, plugin, onSelect) {
        this.app = app;
        this.plugin = plugin;
        this.onSelect = onSelect;
        this.isOpen = false;
        this.modalEl = null;
        this.eventListeners = [];
        this.selectedIndex = 0;
        this.commonPrompts = [];
    }

    open(inputEl) {
        if (this.isOpen) return;
        this.isOpen = true;

        try {
            this.modalEl = document.createElement("div");
            this.modalEl.className = "markdown-next-ai-prompt-selector-popup";

            const prompts = this.plugin.settings.commonPrompts || [];
            this.commonPrompts = prompts;
            this.selectedIndex = 0;

            if (this.commonPrompts.length === 0) {
                this.modalEl.innerHTML = `
					<div class="markdown-next-ai-prompt-list">
						<div class="markdown-next-ai-prompt-empty">暂无常用提示词，请在设置中添加</div>
					</div>
				`;
            } else {
                const itemsHtml = this.commonPrompts.map((prompt, index) => `
					<div class="markdown-next-ai-prompt-item ${index === 0 ? "selected" : ""}" data-index="${index}">
						<div class="markdown-next-ai-prompt-name">${prompt.name}</div>
						<div class="markdown-next-ai-prompt-preview">${prompt.content.substring(0, 50)}${prompt.content.length > 50 ? "..." : ""}</div>
					</div>
				`).join("");

                this.modalEl.innerHTML = `
					<div class="markdown-next-ai-prompt-list">
						${itemsHtml}
					</div>
				`;
            }

            this.modalEl.querySelectorAll(".markdown-next-ai-prompt-item").forEach(item => {
                const clickHandler = () => {
                    const index = parseInt(item.dataset.index);
                    this.selectPrompt(index);
                };
                item.addEventListener("click", clickHandler);
                this.eventListeners.push({ element: item, event: "click", handler: clickHandler });

                const mouseEnterHandler = () => {
                    const index = parseInt(item.dataset.index);
                    this.updateSelection(index);
                };
                item.addEventListener("mouseenter", mouseEnterHandler);
                this.eventListeners.push({ element: item, event: "mouseenter", handler: mouseEnterHandler });
            });

            const outsideClickHandler = (e) => {
                if (e.target.closest(".markdown-next-ai-at-popup") || this.modalEl.contains(e.target)) return;
                this.close();
            };
            document.addEventListener("click", outsideClickHandler);
            this.eventListeners.push({ element: document, event: "click", handler: outsideClickHandler });

            const keydownHandler = (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    this.close();
                } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    this.moveSelection(1);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    this.moveSelection(-1);
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    this.selectPrompt(this.selectedIndex);
                }
            };
            document.addEventListener("keydown", keydownHandler);
            this.eventListeners.push({ element: document, event: "keydown", handler: keydownHandler });

            document.body.appendChild(this.modalEl);
            this.positionPopup(inputEl);

        } catch (e) {
            console.error("Failed to open prompt selector:", e);
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.eventListeners.forEach(({ element, event, handler }) => {
            if (element && typeof element.removeEventListener === "function") {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners = [];

        if (this.modalEl && this.modalEl.parentNode) {
            this.modalEl.parentNode.removeChild(this.modalEl);
        }
        this.modalEl = null;
    }

    positionPopup(inputEl) {
        if (this.modalEl && inputEl) {
            try {
                const inputRect = inputEl.getBoundingClientRect();
                const modalRect = this.modalEl.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;

                let left = inputRect.left;
                let top = inputRect.bottom + 5;

                if (left + modalRect.width > windowWidth) {
                    left = windowWidth - modalRect.width - 10;
                }

                if (top + modalRect.height > windowHeight) {
                    top = inputRect.top - modalRect.height - 5;
                }

                left = Math.max(10, left);
                top = Math.max(10, top);

                this.modalEl.style.position = "fixed";
                this.modalEl.style.left = left + "px";
                this.modalEl.style.top = top + "px";
                this.modalEl.style.zIndex = "10002";
            } catch (e) {
                console.error("Failed to position prompt selector:", e);
            }
        }
    }

    moveSelection(direction) {
        if (this.commonPrompts.length === 0) return;

        let newIndex = this.selectedIndex + direction;
        if (newIndex < 0) newIndex = this.commonPrompts.length - 1;
        if (newIndex >= this.commonPrompts.length) newIndex = 0;

        this.updateSelection(newIndex);
    }

    updateSelection(index) {
        if (!this.modalEl || this.commonPrompts.length === 0) return;

        this.selectedIndex = index;
        this.modalEl.querySelectorAll(".markdown-next-ai-prompt-item").forEach(item => item.classList.remove("selected"));

        const selectedItem = this.modalEl.querySelector(`[data-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add("selected");
            selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    selectPrompt(index) {
        if (index < 0 || index >= this.commonPrompts.length) return;

        const prompt = this.commonPrompts[index];
        if (prompt && this.onSelect) {
            this.onSelect(prompt.content);
        }
        this.close();
    }
}

// ============================================
// 主插件类
// ============================================
class MarkdownNextAIPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.aiService = new AIService(this.settings, this.app);

        this.addSettingTab(new MarkdownNextAISettingTab(this.app, this));
        this.addCommands();
        this.updateEventListeners();

        console.log("MarkdownNext AI 插件已加载");
    }

    onunload() {
        this.cleanupEventListeners();
        console.log("MarkdownNext AI 插件已卸载");
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

        // 深度合并 providers 和 models，确保新增的默认配置能同步给老用户
        if (loadedData) {
            if (loadedData.providers) {
                this.settings.providers = Object.assign({}, DEFAULT_SETTINGS.providers, loadedData.providers);
            }
            if (loadedData.models) {
                this.settings.models = Object.assign({}, DEFAULT_SETTINGS.models, loadedData.models);
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.aiService) {
            this.aiService.updateSettings(this.settings);
        }
    }

    getAvailableModels() {
        return Object.values(this.settings.models)
            .filter(model => model.enabled)
            .map(model => ({
                id: model.id,
                name: model.name,
                provider: model.provider
            }));
    }

    addCommands() {
        this.addCommand({
            id: "continue-writing",
            name: "智能续写",
            callback: () => {
                this.handleContinueWriting();
            }
        });
    }

    updateEventListeners() {
        this.cleanupEventListeners();

        if (this.settings.enableAtTrigger) {
            this.setupAtTriggerListener();
        }

        this.setupPromptTriggerListener();
    }

    setupPromptTriggerListener() {
        const keydownHandler = (e) => {
            if (e.key === "#" || (e.shiftKey && e.key === "3")) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.classList.contains("markdown-next-ai-modify-input") ||
                    activeEl.classList.contains("markdown-next-ai-continue-input"))) {

                    setTimeout(() => {
                        this.showPromptSelectorModal(activeEl);
                    }, 50);
                }
            }
        };

        document.addEventListener("keydown", keydownHandler);
        this.eventListeners = this.eventListeners || [];
        this.eventListeners.push({ element: document, event: "keydown", handler: keydownHandler });
    }

    showPromptSelectorModal(inputEl) {
        new PromptSelectorPopup(this.app, this, (content) => {
            if (inputEl.contentEditable === "true") {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const range = selection.getRangeAt(0);

                const node = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    const offset = range.startOffset;
                    const hashIndex = text.lastIndexOf("#", offset - 1);

                    if (hashIndex !== -1) {
                        const newText = text.substring(0, hashIndex) + content + text.substring(offset);
                        node.textContent = newText;

                        const newCursorPos = hashIndex + content.length;
                        try {
                            const newRange = document.createRange();
                            newRange.setStart(node, newCursorPos);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        } catch (e) {
                            console.error("Failed to set cursor position", e);
                        }
                    }
                }
            } else {
                const cursorPos = inputEl.selectionStart;
                const text = inputEl.value;
                const before = text.substring(0, cursorPos);
                const after = text.substring(cursorPos);

                const hashIndex = before.lastIndexOf("#");
                if (hashIndex !== -1) {
                    const newBefore = before.substring(0, hashIndex) + content;
                    inputEl.value = newBefore + after;
                    inputEl.selectionStart = inputEl.selectionEnd = newBefore.length;
                    inputEl.focus();
                }
            }
        }).open(inputEl);
    }

    setupAtTriggerListener() {
        const keydownHandler = (e) => {
            // @ 或 &
            if (e.key === "@" || (e.shiftKey && e.key === "2") ||
                e.key === "&" || (e.shiftKey && e.key === "7")) {

                const activeEl = document.activeElement;
                if (activeEl && (activeEl.classList.contains("markdown-next-ai-modify-input") ||
                    activeEl.classList.contains("markdown-next-ai-continue-input"))) {
                    return;
                }

                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view || !view.editor) return;

                if (this.atTriggerTimeout) {
                    clearTimeout(this.atTriggerTimeout);
                    this.atTriggerTimeout = null;
                }

                this.atTriggerTimeout = setTimeout(() => {
                    const cursor = view.editor.getCursor();
                    const line = view.editor.getLine(cursor.line);
                    const textBefore = line.substring(0, cursor.ch);
                    const lastChar = textBefore.charAt(textBefore.length - 1);

                    if (lastChar === "@" || lastChar === "&") {
                        if (!textBefore.endsWith("@@") && !textBefore.endsWith("&&")) {
                            this.showAtTriggerModal();
                            this.atTriggerTimeout = null;
                        }
                    }
                }, 500);
            }
        };

        document.addEventListener("keydown", keydownHandler);
        this.eventListeners = this.eventListeners || [];
        this.eventListeners.push({ element: document, event: "keydown", handler: keydownHandler });
    }

    cleanupEventListeners() {
        if (this.eventListeners) {
            this.eventListeners.forEach(({ element, event, handler }) => {
                if (element && handler) {
                    if (element === this.app.workspace && typeof element.off === "function") {
                        element.off(event, handler);
                    } else if (typeof element.removeEventListener === "function") {
                        element.removeEventListener(event, handler);
                    }
                }
            });
            this.eventListeners = [];
        }
    }



    showAtTriggerModal() {
        const cursorPos = this.getCursorPosition();
        if (!cursorPos) return;

        new AtTriggerPopup(
            this.app,
            (prompt, images, modelId, context) => {
                this.handleContinueWriting(prompt, images, modelId, context);
            },
            cursorPos,
            this
        ).open();
    }

    getCursorPosition() {
        try {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.editor) return null;

            const editorEl = view.containerEl.querySelector(".cm-editor");
            if (!editorEl) return null;

            const cursor = view.editor.getCursor();
            const coords = view.editor.coordsAtPos(cursor);

            if (coords) {
                return {
                    left: coords.left,
                    top: coords.top,
                    height: coords.bottom - coords.top
                };
            }

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) {
                    return {
                        left: rect.left,
                        top: rect.top,
                        height: rect.height || 20
                    };
                }
            }

            const editorRect = editorEl.getBoundingClientRect();
            return {
                left: editorRect.left + 50,
                top: editorRect.top + 50,
                height: 20
            };
        } catch (error) {
            console.error("获取光标位置失败:", error);
            return null;
        }
    }

    async handleContinueWriting(prompt = "", images = [], modelId = null, context = null) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.editor) {
            new Notice("请在Markdown编辑器中使用此功能");
            return;
        }

        if (!prompt) {
            this.showAtTriggerModal();
            return;
        }

        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const lastChar = cursor.ch > 0 ? line.charAt(cursor.ch - 1) : "";

        // 如果光标前是 @ 或 &，删除它
        if (lastChar === "@" || lastChar === "&") {
            const from = { line: cursor.line, ch: cursor.ch - 1 };
            const to = { line: cursor.line, ch: cursor.ch };
            editor.replaceRange("", from, to);
            cursor.ch = cursor.ch - 1;
        }

        // 记录插入起始位置
        const insertPos = { line: cursor.line, ch: cursor.ch };

        // 用<span>包裹AI输出，实现绿色背景
        const previewId = "markdown-next-ai-preview-" + Date.now();
        const openTag = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
        const closingTag = "</span>";

        // 先插入空的包裹标签
        editor.replaceRange(`${openTag}${closingTag}`, insertPos);

        // 计算内容区域的偏移量
        const startOffset = editor.posToOffset(insertPos) + openTag.length;
        let currentContentLength = 0;
        let hasStarted = false;

        // 获取光标的屏幕坐标（用于定位弹窗）
        const cursorCoords = editor.coordsAtPos(insertPos);
        const initialCursorPos = cursorCoords ? { left: cursorCoords.left, top: cursorCoords.top } : null;

        // 创建并显示预览弹窗（用于显示状态和接受/拒绝按钮）
        const previewPopup = new AIPreviewPopup(
            this.app,
            editor,
            view,
            () => {
                // 接受：移除<span>标签，仅保留内容
                const docText = editor.getValue();
                const openTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
                const openStart = docText.indexOf(openTagStr);
                if (openStart !== -1) {
                    const openEnd = openStart + openTagStr.length;
                    const closeStart = docText.indexOf(closingTag, openEnd);
                    if (closeStart !== -1) {
                        const closeEnd = closeStart + closingTag.length;
                        // 先删除关闭标签
                        editor.replaceRange("", editor.offsetToPos(closeStart), editor.offsetToPos(closeEnd));
                        // 再删除开始标签
                        editor.replaceRange("", editor.offsetToPos(openStart), editor.offsetToPos(openEnd));
                        // 光标移到内容末尾
                        const contentEndOffset = closeStart - openTagStr.length;
                        editor.setCursor(editor.offsetToPos(contentEndOffset));
                    }
                }
                new Notice("已接受AI生成内容");
            },
            () => {
                // 拒绝：删除整个<span>包括内容
                const docText = editor.getValue();
                const openTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
                const openStart = docText.indexOf(openTagStr);
                if (openStart !== -1) {
                    const openEnd = openStart + openTagStr.length;
                    const closeStart = docText.indexOf(closingTag, openEnd);
                    if (closeStart !== -1) {
                        const closeEnd = closeStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(openStart), editor.offsetToPos(closeEnd));
                        editor.setCursor(editor.offsetToPos(openStart));
                    }
                }
                new Notice("已拒绝AI生成内容");
            }
        );
        previewPopup.open(initialCursorPos);

        try {
            const result = await this.aiService.sendRequest("continue", {
                selectedText: "",
                beforeText: editor.getValue().substring(0, editor.posToOffset(insertPos)),
                afterText: "",
                cursorPosition: cursor,
                additionalContext: context
            }, prompt, images, [], (streamData) => {
                if (streamData.content != null) {
                    // 在<span>标签内流式输出文字
                    const contentStartPos = editor.offsetToPos(startOffset);
                    const contentEndPos = editor.offsetToPos(startOffset + currentContentLength);
                    editor.replaceRange(streamData.content, contentStartPos, contentEndPos);

                    currentContentLength = streamData.content.length;
                    const newCursorPos = editor.offsetToPos(startOffset + currentContentLength);
                    editor.setCursor(newCursorPos);
                    hasStarted = true;

                    // 更新弹窗状态
                    previewPopup.updateStatus(`✍️正在生成中(${currentContentLength}字)`);
                }

                // 输出完成后显示接受/拒绝按钮，并重新定位到内容末尾
                if (streamData.isComplete) {
                    const endPos = editor.offsetToPos(startOffset + currentContentLength);
                    const endCoords = editor.coordsAtPos(endPos);
                    if (endCoords) {
                        previewPopup.positionAt(endCoords.left, endCoords.bottom, "below");
                    }
                    previewPopup.showActions();
                }
            });

            // 非流式返回或流式未触发时，写入最终结果
            if (!hasStarted && result && result.content) {
                const contentStartPos = editor.offsetToPos(startOffset);
                const contentEndPos = editor.offsetToPos(startOffset + currentContentLength);
                editor.replaceRange(result.content, contentStartPos, contentEndPos);
                currentContentLength = result.content.length;
                const newCursorPos = editor.offsetToPos(startOffset + currentContentLength);
                editor.setCursor(newCursorPos);

                // 显示接受/拒绝按钮，并重新定位到内容末尾
                const endCoords = editor.coordsAtPos(newCursorPos);
                if (endCoords) {
                    previewPopup.positionAt(endCoords.left, endCoords.bottom, "below");
                }
                previewPopup.showActions();
            }
        } catch (error) {
            // 发生错误，删除整个<span>包裹，关闭弹窗
            const docText = editor.getValue();
            const openTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
            const openStart = docText.indexOf(openTagStr);
            if (openStart !== -1) {
                const openEnd = openStart + openTagStr.length;
                const closeStart = docText.indexOf(closingTag, openEnd);
                if (closeStart !== -1) {
                    const closeEnd = closeStart + closingTag.length;
                    editor.replaceRange("", editor.offsetToPos(openStart), editor.offsetToPos(closeEnd));
                }
            }
            editor.setCursor(insertPos);
            previewPopup.close();
            new Notice("续写失败: " + error.message);
        }
    }
}

class MarkdownNextAISettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "MarkdownNext AI 设置" });

        // 供应商和API设置
        containerEl.createEl("h3", { text: "供应商、API设置" });
        containerEl.createEl("p", {
            text: "APIKey：需在供应商API密钥中设置APIKey",
            attr: { style: "color: var(--text-muted); margin-bottom: 5px;" }
        });
        containerEl.createEl("p", {
            text: "Base URL：可选填第三方URL，使用openai兼容格式",
            attr: { style: "color: var(--text-muted); margin-bottom: 15px;" }
        });

        // 供应商表格
        const providerTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const thead = providerTable.createEl("thead").createEl("tr");
        thead.createEl("th", { text: "ID" });
        thead.createEl("th", { text: "Type" });
        thead.createEl("th", { text: "API Key" });
        thead.createEl("th", { text: "Get API keys" });
        thead.createEl("th", { text: "Actions" });

        const tbody = providerTable.createEl("tbody");
        Object.keys(this.plugin.settings.providers).forEach(providerId => {
            const provider = this.plugin.settings.providers[providerId];
            const row = tbody.createEl("tr");

            row.createEl("td", { text: providerId });
            row.createEl("td", { text: provider.type || "openai" });

            const apiKeyCell = row.createEl("td", { cls: "markdown-next-ai-api-key-cell" });
            if (provider.apiKey && provider.apiKey.trim()) {
                apiKeyCell.createEl("span", {
                    text: "••••••••",
                    attr: { style: "color: var(--text-muted); margin-right: 8px;" }
                });
            }
            const settingsBtn = apiKeyCell.createEl("button", {
                cls: "markdown-next-ai-settings-btn",
                attr: { title: "设置API Key" }
            });
            settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>';
            settingsBtn.onclick = () => this.showApiKeyModal(providerId);

            const linkCell = row.createEl("td", { attr: { style: "text-align: left;" } });
            const links = {
                openai: "https://platform.openai.com/api-keys",
                anthropic: "https://console.anthropic.com/",
                gemini: "https://aistudio.google.com/app/apikey",
                ollama: "https://ollama.com/"
            };
            const link = links[providerId] || (this.plugin.settings.apiKeyLinks && this.plugin.settings.apiKeyLinks[providerId]);
            if (link) {
                linkCell.createEl("a", {
                    text: "获取API Key",
                    attr: {
                        href: link,
                        target: "_blank",
                        style: "color: var(--text-accent); text-decoration: underline; font-size: 0.9em;"
                    }
                });
            } else {
                linkCell.createEl("span", { text: "-", attr: { style: "color: var(--text-muted);" } });
            }

            const actionsCell = row.createEl("td", { cls: "markdown-next-ai-actions-cell" });
            if (["openai", "anthropic", "gemini", "deepseek", "ollama"].includes(providerId)) {
                actionsCell.createEl("span", { text: "-", attr: { style: "color: var(--text-muted);" } });
            } else {
                const editBtn = actionsCell.createEl("button", { text: "编辑" });
                editBtn.onclick = () => this.showEditProviderModal(providerId);
                const deleteBtn = actionsCell.createEl("button", { text: "删除" });
                deleteBtn.onclick = async () => {
                    if (confirm(`确定要删除供应商 "${providerId}" ？这将同时删除该供应商下的所有模型。`)) {
                        Object.keys(this.plugin.settings.models).forEach(modelId => {
                            if (this.plugin.settings.models[modelId].provider === providerId) {
                                delete this.plugin.settings.models[modelId];
                            }
                        });
                        delete this.plugin.settings.providers[providerId];
                        await this.plugin.saveSettings();
                        this.display();
                    }
                };
            }
        });

        containerEl.createEl("div", { attr: { style: "margin-top: 15px; margin-bottom: 20px;" } })
            .createEl("button", {
                text: "+ 添加供应商",
                attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;" }
            }).onclick = () => this.showAddProviderModal();

        // 模型设置
        const modelHeader = containerEl.createEl("div", {
            attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-top: 30px; margin-bottom: 15px;" }
        });
        modelHeader.createEl("h3", { text: "模型设置", attr: { style: "margin: 0;" } });
        modelHeader.createEl("button", {
            text: "+ 添加模型",
            attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" }
        }).onclick = () => this.showAddModelModal();

        const modelTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const mThead = modelTable.createEl("thead").createEl("tr");
        mThead.createEl("th", { text: "ID" });
        mThead.createEl("th", { text: "Provider" });
        mThead.createEl("th", { text: "Model" });
        mThead.createEl("th", { text: "Enable" });
        mThead.createEl("th", { text: "Actions" });

        const mTbody = modelTable.createEl("tbody");
        const allModels = Object.keys(this.plugin.settings.models).map(id => ({ id, ...this.plugin.settings.models[id] }));

        if (allModels.length > 0) {
            allModels.forEach(model => {
                const row = mTbody.createEl("tr");
                row.createEl("td", { text: model.id });
                row.createEl("td", { text: model.provider });
                row.createEl("td", { text: model.name });

                const enableCell = row.createEl("td", { cls: "markdown-next-ai-enable-cell" });
                const checkbox = enableCell.createEl("input", { type: "checkbox" });
                checkbox.checked = model.enabled;
                checkbox.onchange = async () => {
                    this.plugin.settings.models[model.id].enabled = checkbox.checked;
                    await this.plugin.saveSettings();
                    if (!checkbox.checked && this.plugin.settings.currentModel === model.id) {
                        const firstEnabled = Object.keys(this.plugin.settings.models).find(id => this.plugin.settings.models[id].enabled);
                        if (firstEnabled) {
                            this.plugin.settings.currentModel = firstEnabled;
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    }
                };

                const mActionsCell = row.createEl("td", { cls: "markdown-next-ai-actions-cell" });
                const editBtn = mActionsCell.createEl("button", { text: "编辑" });
                editBtn.onclick = () => this.showEditModelModal(model.id);
                const deleteBtn = mActionsCell.createEl("button", { text: "删除" });
                deleteBtn.onclick = async () => {
                    if (confirm(`确定要删除模型 "${model.name}" ？`)) {
                        if (this.plugin.settings.currentModel === model.id) {
                            const otherEnabled = Object.keys(this.plugin.settings.models).find(id => id !== model.id && this.plugin.settings.models[id].enabled);
                            this.plugin.settings.currentModel = otherEnabled || "";
                        }
                        delete this.plugin.settings.models[model.id];
                        await this.plugin.saveSettings();
                        this.display();
                    }
                };
            });
        } else {
            const emptyRow = mTbody.createEl("tr");
            emptyRow.createEl("td", {
                text: "暂无模型，点击上方按钮添加",
                attr: { colspan: "5", style: "text-align: center; color: var(--text-muted); font-style: italic; padding: 20px;" }
            });
        }

        new Setting(containerEl)
            .setName("当前模型")
            .setDesc("选择当前使用的AI模型")
            .addDropdown(dropdown => {
                const enabledModels = Object.keys(this.plugin.settings.models)
                    .filter(id => this.plugin.settings.models[id].enabled);

                enabledModels.forEach(id => {
                    const model = this.plugin.settings.models[id];
                    dropdown.addOption(id, `${model.name} (${model.provider})`);
                });

                if (!enabledModels.includes(this.plugin.settings.currentModel) && enabledModels.length > 0) {
                    this.plugin.settings.currentModel = enabledModels[0];
                    this.plugin.saveSettings();
                }

                dropdown.setValue(this.plugin.settings.currentModel || "")
                    .onChange(async (value) => {
                        this.plugin.settings.currentModel = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 测试连接
        new Setting(containerEl)
            .setName("测试API连接")
            .setDesc("测试当前API配置是否正常")
            .addButton(button => button
                .setButtonText("测试连接")
                .onClick(async () => {
                    button.setButtonText("测试中...");
                    try {
                        const result = await this.plugin.aiService.testConnection();
                        if (result.success) {
                            new Notice("✅ API连接成功");
                        } else {
                            new Notice("❌ API连接失败: " + result.message);
                        }
                    } catch (error) {
                        new Notice("❌ 测试失败: " + error.message);
                    } finally {
                        button.setButtonText("测试连接");
                    }
                }));

        // 请求超时设置
        new Setting(containerEl)
            .setName("请求超时时间")
            .setDesc("API请求超时时间（毫秒）")
            .addText(text => text
                .setPlaceholder("30000")
                .setValue(String(this.plugin.settings.timeout))
                .onChange(async (value) => {
                    const timeout = parseInt(value) || 30000;
                    this.plugin.settings.timeout = timeout;
                    await this.plugin.saveSettings();
                }));

        // 功能设置
        containerEl.createEl("h3", { text: "功能设置" });

        new Setting(containerEl)
            .setName("启用右键菜单")
            .setDesc("在选中文本时显示AI处理选项")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRightClick)
                .onChange(async (value) => {
                    this.plugin.settings.enableRightClick = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateEventListeners();
                }));

        new Setting(containerEl)
            .setName("启用@或&符号触发")
            .setDesc("输入@或&符号时呼出续写对话框")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAtTrigger)
                .onChange(async (value) => {
                    this.plugin.settings.enableAtTrigger = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateEventListeners();
                }));

        // 最大Token数
        new Setting(containerEl)
            .setName("最大Token数")
            .setDesc("AI生成文本的最大长度限制")
            .addText(text => text
                .setPlaceholder("5000")
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const tokens = parseInt(value) || 5000;
                    if (tokens > 0) {
                        this.plugin.settings.maxTokens = tokens;
                        await this.plugin.saveSettings();
                    } else {
                        new Notice("Token数必须为正整数");
                    }
                }));

        // 常用提示词管理
        containerEl.createEl("h3", { text: "常用提示词管理" });
        containerEl.createEl("p", {
            text: "管理常用提示词，可在输入框中使用#符号快速调用",
            attr: { style: "color: var(--text-muted); margin-bottom: 15px;" }
        });

        new Setting(containerEl)
            .setName("添加新提示词")
            .setDesc("创建一个新的常用提示词")
            .addButton(button => button
                .setButtonText("添加提示词")
                .onClick(() => this.showPromptModal()));

        if (this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts.length > 0) {
            const promptsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 15px;" } });

            this.plugin.settings.commonPrompts.forEach((prompt, index) => {
                const promptEl = promptsContainer.createEl("div", {
                    attr: {
                        style: "display: flex; align-items: center; justify-content: space-between; padding: 10px; margin-bottom: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-secondary);"
                    }
                });

                const infoEl = promptEl.createEl("div", { attr: { style: "flex: 1;" } });
                infoEl.createEl("div", {
                    text: prompt.name || "未命名提示词",
                    attr: { style: "font-weight: bold; margin-bottom: 4px;" }
                });
                infoEl.createEl("div", {
                    text: prompt.content && prompt.content.length > 100 ? prompt.content.substring(0, 100) + "..." : (prompt.content || ""),
                    attr: { style: "color: var(--text-muted); font-size: 0.7em;" }
                });

                const actionsEl = promptEl.createEl("div", { attr: { style: "display: flex; gap: 8px;" } });

                actionsEl.createEl("button", {
                    text: "编辑",
                    attr: { style: "padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); border-radius: 4px; cursor: pointer;" }
                }).onclick = () => this.showPromptModal(index);

                actionsEl.createEl("button", {
                    text: "删除",
                    attr: { style: "padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--text-error); background: var(--background-primary); color: var(--text-error); border-radius: 4px; cursor: pointer;" }
                }).onclick = () => this.deletePrompt(index);
            });
        } else {
            containerEl.createEl("p", {
                text: "暂无常用提示词，点击上方按钮添加",
                attr: { style: "color: var(--text-muted); font-style: italic; margin-top: 15px;" }
            });
        }
    }

    showPromptModal(index = null) {
        const modal = new Modal(this.app);
        modal.titleEl.setText(index !== null ? "编辑提示词" : "添加新提示词");

        const { contentEl } = modal;
        const isEdit = index !== null;
        const prompt = isEdit && this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts[index]
            ? this.plugin.settings.commonPrompts[index]
            : null;

        contentEl.createEl("label", {
            text: "提示词名称:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const nameInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "请输入提示词名称",
            attr: { style: "width: 100%; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        });
        if (isEdit && prompt) nameInput.value = prompt.name;

        contentEl.createEl("label", {
            text: "提示词内容:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const contentInput = contentEl.createEl("textarea", {
            placeholder: "请输入提示词内容",
            attr: { style: "width: 100%; height: 120px; padding: 8px; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px; resize: vertical; font-family: var(--font-text);" }
        });
        if (isEdit && prompt) contentInput.value = prompt.content;

        const buttonContainer = contentEl.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" }
        });

        buttonContainer.createEl("button", {
            text: "取消",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: isEdit ? "更新" : "添加",
            cls: "mod-cta",
            attr: { style: "padding: 6px 12px;" }
        });

        const saveHandler = async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();

            if (!name) {
                new Notice("请输入提示词名称");
                return;
            }
            if (!content) {
                new Notice("请输入提示词内容");
                return;
            }

            // Check for duplicate names
            const duplicateIndex = this.plugin.settings.commonPrompts.findIndex((p, i) => p.name === name && i !== index);
            if (duplicateIndex !== -1) {
                new Notice("提示词名称已存在，请使用其他名称");
                return;
            }

            if (!this.plugin.settings.commonPrompts) {
                this.plugin.settings.commonPrompts = [];
            }

            const newPrompt = {
                id: isEdit ? prompt.id : Date.now().toString(),
                name: name,
                content: content
            };

            if (isEdit) {
                this.plugin.settings.commonPrompts[index] = newPrompt;
                new Notice("提示词已更新");
            } else {
                this.plugin.settings.commonPrompts.push(newPrompt);
                new Notice("提示词已添加");
            }

            await this.plugin.saveSettings();
            modal.close();
            this.display();
        };

        saveBtn.onclick = saveHandler;

        const keydownHandler = (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveHandler();
            }
        };
        nameInput.addEventListener("keydown", keydownHandler);
        contentInput.addEventListener("keydown", keydownHandler);

        modal.open();
        nameInput.focus();
    }

    async deletePrompt(index) {
        if (this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts[index]) {
            const prompt = this.plugin.settings.commonPrompts[index];

            const confirmModal = new Modal(this.app);
            confirmModal.titleEl.setText("确认删除");
            const { contentEl } = confirmModal;

            contentEl.createEl("p", {
                text: `确定要删除提示词 "${prompt.name || "未命名提示词"}" 吗？此操作无法撤销。`,
                attr: { style: "margin-bottom: 20px;" }
            });

            const btnContainer = contentEl.createEl("div", {
                attr: { style: "display: flex; justify-content: flex-end; gap: 10px;" }
            });

            btnContainer.createEl("button", {
                text: "取消",
                attr: { style: "padding: 6px 12px;" }
            }).onclick = () => confirmModal.close();

            btnContainer.createEl("button", {
                text: "删除",
                cls: "mod-warning",
                attr: { style: "padding: 6px 12px;" }
            }).onclick = async () => {
                this.plugin.settings.commonPrompts.splice(index, 1);
                await this.plugin.saveSettings();
                new Notice("提示词已删除");
                confirmModal.close();
                this.display();
            };

            confirmModal.open();
        }
    }

    showApiKeyModal(providerId) {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`设置 ${providerId.toUpperCase()} 配置`);

        const { contentEl } = modal;
        const provider = this.plugin.settings.providers[providerId];

        contentEl.createEl("label", {
            text: "API Key:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });

        const apiKeyInput = contentEl.createEl("input", {
            type: "password",
            placeholder: "请输入API Key",
            attr: {
                style: "width: 100%; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px;"
            }
        });
        apiKeyInput.value = provider?.apiKey || "";

        contentEl.createEl("label", {
            text: "Base URL (可选):",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });

        const baseUrlInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "例如: https://api.example.com/v1",
            value: provider?.baseUrl || "",
            attr: {
                style: "width: 100%; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px;"
            }
        });

        const buttonContainer = contentEl.createEl("div", {
            attr: {
                style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;"
            }
        });

        const cancelBtn = buttonContainer.createEl("button", {
            text: "取消",
            attr: { style: "padding: 6px 12px;" }
        });
        cancelBtn.onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: "保存",
            cls: "mod-cta",
            attr: { style: "padding: 6px 12px;" }
        });

        const saveHandler = async () => {
            if (!this.plugin.settings.providers[providerId]) {
                this.plugin.settings.providers[providerId] = { apiKey: "", baseUrl: "", enabled: true };
            }
            this.plugin.settings.providers[providerId].apiKey = apiKeyInput.value.trim();
            this.plugin.settings.providers[providerId].baseUrl = baseUrlInput.value.trim();

            if (apiKeyInput.value.trim()) {
                this.plugin.settings.providers[providerId].enabled = true;
            }

            await this.plugin.saveSettings();
            new Notice(providerId.toUpperCase() + " 配置已保存");
            modal.close();
            this.display();
        };

        saveBtn.onclick = saveHandler;

        const keydownHandler = (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveHandler();
            }
        };

        apiKeyInput.addEventListener("keydown", keydownHandler);
        baseUrlInput.addEventListener("keydown", keydownHandler);

        modal.open();
        apiKeyInput.focus();
    }

    showAddProviderModal() {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加供应商");

        const { contentEl } = modal;

        contentEl.createEl("label", { text: "供应商ID:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const idInput = contentEl.createEl("input", { type: "text", placeholder: "例如: custom-provider", attr: { style: "width: 100%; margin-bottom: 15px;" } });

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", placeholder: "例如: 自定义供应商", attr: { style: "width: 100%; margin-bottom: 15px;" } });

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } });
        ["openai", "anthropic", "gemini", "ollama"].forEach(type => {
            typeSelect.createEl("option", { value: type, text: type.toUpperCase() });
        });

        contentEl.createEl("label", { text: "默认Base URL:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const baseUrlInput = contentEl.createEl("input", { type: "text", placeholder: "例如: https://api.example.com/v1", attr: { style: "width: 100%; margin-bottom: 15px;" } });

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "添加", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const type = typeSelect.value;
            const baseUrl = baseUrlInput.value.trim();

            if (!id || !name) {
                new Notice("请填写必填字段");
                return;
            }

            if (this.plugin.settings.providers[id]) {
                new Notice("供应商ID已存在");
                return;
            }

            this.plugin.settings.providers[id] = {
                name: name,
                type: type,
                enabled: true,
                apiKey: "",
                baseUrl: baseUrl
            };

            await this.plugin.saveSettings();
            new Notice("供应商已添加");
            modal.close();
            this.display();
        };

        modal.open();
        idInput.focus();
    }

    showEditProviderModal(providerId) {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑供应商");

        const { contentEl } = modal;
        const provider = this.plugin.settings.providers[providerId];

        contentEl.createEl("label", { text: "供应商ID:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        contentEl.createEl("input", { type: "text", value: providerId, attr: { style: "width: 100%; margin-bottom: 15px;", disabled: "disabled" } });

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", value: provider.name || providerId, attr: { style: "width: 100%; margin-bottom: 15px;" } });

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } });
        ["openai", "anthropic", "gemini", "ollama"].forEach(type => {
            const option = typeSelect.createEl("option", { value: type, text: type.toUpperCase() });
            if (type === provider.type) option.selected = true;
        });

        contentEl.createEl("label", { text: "默认Base URL:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const baseUrlInput = contentEl.createEl("input", { type: "text", value: provider.baseUrl || "", attr: { style: "width: 100%; margin-bottom: 15px;" } });

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "保存", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const type = typeSelect.value;
            const baseUrl = baseUrlInput.value.trim();

            if (!name) {
                new Notice("请填写显示名称");
                return;
            }

            this.plugin.settings.providers[providerId] = {
                ...provider,
                name: name,
                type: type,
                baseUrl: baseUrl
            };

            await this.plugin.saveSettings();
            new Notice("供应商已更新");
            modal.close();
            this.display();
        };

        modal.open();
        nameInput.focus();
    }

    showAddModelModal(category = MODEL_CATEGORIES.TEXT) {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加新模型");

        const { contentEl } = modal;

        // 模型 ID
        contentEl.createEl("label", {
            text: "模型 ID (API参数):",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const idInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "例如: gpt-4-turbo",
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        });

        // 显示名称
        contentEl.createEl("label", {
            text: "显示名称:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const nameInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "例如: 我的自定义模型",
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        });

        // 供应商选择
        contentEl.createEl("label", {
            text: "供应商:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const providerSelect = contentEl.createEl("select", {
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        });
        Object.keys(this.plugin.settings.providers).forEach(providerId => {
            providerSelect.createEl("option", {
                value: providerId,
                text: providerId.toUpperCase()
            });
        });

        const buttonContainer = contentEl.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" }
        });

        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: "添加",
            cls: "mod-cta"
        });

        saveBtn.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const provider = providerSelect.value;
            const cat = category; // 使用默认类别

            if (!id || !name) {
                new Notice("请填写所有必填字段");
                return;
            }

            if (this.plugin.settings.models[id]) {
                new Notice("模型 ID 已存在，请使用其他 ID");
                return;
            }

            this.plugin.settings.models[id] = {
                id: id,
                name: name,
                provider: provider,
                model: id,
                actualModel: id,
                enabled: true,
                category: cat
            };

            await this.plugin.saveSettings();
            new Notice("模型已添加");
            modal.close();
            this.display();
        };

        modal.open();
        idInput.focus();
    }

    showEditModelModal(modelId) {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑模型");

        const { contentEl } = modal;
        const model = this.plugin.settings.models[modelId];

        contentEl.createEl("label", { text: "模型 ID (API参数):", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        contentEl.createEl("input", { type: "text", value: modelId, attr: { style: "width: 100%; margin-bottom: 15px;", disabled: "disabled" } });

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", value: model.name, attr: { style: "width: 100%; margin-bottom: 15px;" } });

        contentEl.createEl("label", { text: "供应商:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const providerSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } });
        Object.keys(this.plugin.settings.providers).forEach(pId => {
            const option = providerSelect.createEl("option", { value: pId, text: pId.toUpperCase() });
            if (pId === model.provider) option.selected = true;
        });

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "保存", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const provider = providerSelect.value;

            if (!name) {
                new Notice("请填写必填字段");
                return;
            }

            this.plugin.settings.models[modelId] = {
                ...model,
                name: name,
                provider: provider,
                model: modelId,
                actualModel: modelId
            };

            await this.plugin.saveSettings();
            new Notice("模型已更新");
            modal.close();
            this.display();
        };

        modal.open();
        nameInput.focus();
    }
}

module.exports = MarkdownNextAIPlugin;
