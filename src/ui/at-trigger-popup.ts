import { App, Notice, TFile, TFolder, setIcon } from "obsidian";
import { MODEL_CATEGORIES } from "../constants";
import { ImageHandler } from "../services/image-handler";
import { CursorPosition, ImageData, PluginSettings, SelectedContext } from "../types";
import { InputContextSelector } from "./context-selector";
import { PromptSelectorPopup } from "./prompt-selector";

interface FileInfo {
    name: string;
    path: string;
    extension?: string;
}

interface FolderInfo {
    name: string;
    path: string;
}

interface EventListenerEntry {
    element: HTMLElement | Document;
    event: string;
    handler: EventListener;
}

interface PluginInterface {
    app: App;
    settings: PluginSettings;
    getAvailableModels(): { id: string; name: string }[];
    saveSettings(): Promise<void>;
}

interface EditorView {
    containerEl: HTMLElement;
}

/**
 * @ 触发弹窗
 * 主要的 AI 对话输入界面
 */
export class AtTriggerPopup {
    private app: App;
    private onSubmit: (prompt: string, images: ImageData[], modelId: string, contextContent: string, selectedText: string, mode: string) => void;
    private cursorPosition: CursorPosition | null;
    private plugin: PluginInterface;
    private view: EditorView | null;
    private selectedText: string;
    private mode: string;
    private popupEl: HTMLElement | null = null;
    private inputEl: HTMLElement | null = null;
    private modelSelectEl: HTMLSelectElement | null = null;
    private isOpen: boolean = false;
    private imageHandler: ImageHandler;
    private eventListeners: EventListenerEntry[] = [];
    private selectedContext: SelectedContext = { files: [], folders: [] };
    private scrollContainer: HTMLElement | null = null;
    private contextSelector: InputContextSelector | null = null;
    private promptSelector: PromptSelectorPopup | null = null;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
    private historyContainer: HTMLElement | null = null;
    private historyVisible: boolean = false;
    private isDragging: boolean = false;
    private closeGuards: Set<string> = new Set();
    private modelDropdownEl: HTMLElement | null = null;
    private modelDropdownScrollHandler: ((e: Event) => void) | null = null;
    private modelDropdownWheelHandler: ((e: WheelEvent) => void) | null = null;
    private modelDropdownTouchHandler: ((e: TouchEvent) => void) | null = null;
    private modelDropdownKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        app: App,
        onSubmit: (prompt: string, images: ImageData[], modelId: string, contextContent: string, selectedText: string, mode: string) => void,
        cursorPosition: CursorPosition | null,
        plugin: PluginInterface,
        view: EditorView | null,
        selectedText: string = "",
        mode: string = "chat"
    ) {
        this.app = app;
        this.onSubmit = onSubmit;
        this.cursorPosition = cursorPosition;
        this.plugin = plugin;
        this.view = view;
        this.selectedText = selectedText;
        this.mode = mode;
        this.imageHandler = new ImageHandler();
    }

    private addCloseGuard(key: string): void {
        if (!key) return;
        this.closeGuards.add(key);
        if (this.popupEl) {
            this.popupEl.setAttribute("data-close-guard", "true");
        }
    }

    private removeCloseGuard(key: string): void {
        if (!key) return;
        this.closeGuards.delete(key);
        if (this.popupEl && this.closeGuards.size === 0) {
            this.popupEl.removeAttribute("data-close-guard");
        }
    }

    private hasCloseGuard(): boolean {
        return this.closeGuards.size > 0;
    }

    /**
     * 提交对话
     */
    async submit(): Promise<void> {
        const prompt = this.contextSelector?.getTextContent().trim() || "";
        await this.processInlineImages();
        const images = this.imageHandler.getImages();
        const modelId = this.modelSelectEl?.value || "";
        let contextContent = await this.getContextContent();

        const hasSelectedText = Boolean(this.selectedText && this.selectedText.trim());
        if (!prompt && images.length === 0 && !contextContent && !hasSelectedText) {
            new Notice("请输入续写要求或上传图片");
            return;
        }

        this.onSubmit(prompt, images, modelId, contextContent, this.selectedText, this.mode);
        this.close();
    }

    /**
     * 获取模型选项 HTML
     */
    getModelOptions(): string {
        const models = this.plugin.getAvailableModels();
        const currentModel = this.plugin.settings.currentModel;

        return models.map(model => {
            const selected = model.id === currentModel ? "selected" : "";
            return `<option value="${model.id}" ${selected}>${model.name}</option>`;
        }).join("");
    }

    private getModelNameById(modelId: string): string {
        const models = this.plugin.getAvailableModels();
        return models.find(m => m.id === modelId)?.name || modelId || "选择模型";
    }

    /**
     * 添加图片预览
     */
    addImagePreview(imageData: ImageData, container: HTMLElement): void {
        const previewEl = this.imageHandler.createImagePreview(imageData, () => { });
        container.appendChild(previewEl);
    }

    /**
     * 打开弹窗
     */
    open(): void {
        if (this.isOpen) return;

        this.isOpen = true;
        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-at-popup");
        this.addCloseGuard("initial-click");

        const isRewriteMode = this.mode === 'edit';
        const titleText = isRewriteMode ? "修改所选内容" : "Markdown-Next-AI";
        const placeholderText = isRewriteMode ? "请输入修改要求..." : "（@选择文件，#选择常用提示词）...";
        const selectedTextPreview = this.selectedText;
        const currentModelName = this.getModelNameById(this.plugin.settings.currentModel);

        this.popupEl.innerHTML = `
            <div class="markdown-next-ai-popup-header">
                <span class="markdown-next-ai-popup-title"><span class="markdown-next-ai-title-icon"></span><span class="markdown-next-ai-title-text">${titleText}</span></span>
                <div class="markdown-next-ai-popup-actions">
                    <button class="markdown-next-ai-upload-btn markdown-next-ai-history-btn" title="查看历史"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
                    <button class="markdown-next-ai-popup-close">✕</button>
                </div>
            </div>
            <div class="markdown-next-ai-history-panel" style="display:none;"></div>
            <div class="markdown-next-ai-popup-content">
                ${this.selectedText ? `
                <div class="markdown-next-ai-selected-text-section">
                    <div class="markdown-next-ai-selected-text-header">
                        <span class="markdown-next-ai-selected-text-label">${isRewriteMode ? "待修改内容:" : "已选中文本:"}</span>
                    </div>
                    <div class="markdown-next-ai-selected-text-preview">${selectedTextPreview}</div>
                </div>
                ` : ''}
                <textarea class="markdown-next-ai-continue-input" placeholder="${placeholderText}" rows="3"></textarea>
                <div class="markdown-next-ai-upload-section">
                    <div class="markdown-next-ai-left-section">
                        <select class="markdown-next-ai-model-select">
                            ${this.getModelOptions()}
                        </select>
                        <input type="file" class="markdown-next-ai-file-input" accept="image/*" multiple style="display: none;">
                        <button class="markdown-next-ai-upload-btn" title="上传图片"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-up-icon lucide-image-up" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg></button>
                    </div>
                    <button class="markdown-next-ai-submit-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="m22 2-7 19-4-9-9-4 20-6z"/></svg>提交</button>
                </div>
                <div class="markdown-next-ai-image-previews"></div>
            </div>
        `;

        // 设置标题图标为 atom
        const titleEl = this.popupEl.querySelector(".markdown-next-ai-popup-title") as HTMLElement | null;
        const iconSlot = this.popupEl.querySelector(".markdown-next-ai-title-icon") as HTMLElement | null;
        if (iconSlot) {
            setIcon(iconSlot, "atom");
            (iconSlot as HTMLElement).style.display = "inline-block";
            (iconSlot as HTMLElement).style.verticalAlign = "middle";
            (iconSlot as HTMLElement).style.marginRight = "4px";
            (iconSlot as HTMLElement).style.width = "16px";
            (iconSlot as HTMLElement).style.height = "16px";
            (iconSlot as HTMLElement).style.color = "#863097";
        }

        this.inputEl = this.popupEl.querySelector(".markdown-next-ai-continue-input");
        this.modelSelectEl = this.popupEl.querySelector(".markdown-next-ai-model-select") as HTMLSelectElement;

        const submitBtn = this.popupEl.querySelector(".markdown-next-ai-submit-btn") as HTMLButtonElement;
        const closeBtn = this.popupEl.querySelector(".markdown-next-ai-popup-close") as HTMLButtonElement;
        const fileInput = this.popupEl.querySelector(".markdown-next-ai-file-input") as HTMLInputElement;
        const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn") as HTMLButtonElement;
        const imagePreviewsEl = this.popupEl.querySelector(".markdown-next-ai-image-previews") as HTMLElement;
        const historyBtn = this.popupEl.querySelector(".markdown-next-ai-history-btn") as HTMLButtonElement;
        this.historyContainer = this.popupEl.querySelector(".markdown-next-ai-history-panel") as HTMLElement | null;

        this.contextSelector = new InputContextSelector(
            this.app,
            this.inputEl as HTMLTextAreaElement,
            () => {
                this.updateContextDisplay();
            }
        );
        this.contextSelector.convertToContentEditable();
        this.inputEl = this.contextSelector.inputEl;

        this.promptSelector = new PromptSelectorPopup(
            this.app,
            this.plugin,
            (content) => {
                // 插入选中的提示词
                const cursorPos = this.contextSelector!.getCursorPosition();
                const textBefore = this.contextSelector!.getTextContent().substring(0, cursorPos);
                const hashIndex = textBefore.lastIndexOf("#");

                if (hashIndex !== -1) {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        // 删除 # 符号
                        const deleteLength = cursorPos - hashIndex;

                        // 简单的文本替换逻辑，这里需要更精细的操作来处理 contentEditable
                        // 为了简化，我们重新设置整个内容，但这可能会丢失光标位置或格式
                        // 更好的做法是像 InputContextSelector 那样操作 Range

                        // 模拟 InputContextSelector 的删除逻辑
                        let position = 0;
                        let found = false;

                        const deleteText = (node: Node, start: number, length: number): void => {
                            if (found) return;

                            if (node.nodeType === Node.TEXT_NODE) {
                                const textLength = node.textContent!.length;
                                if (position + textLength > start) {
                                    const startOffset = start - position;
                                    const endOffset = Math.min(startOffset + length, textLength);
                                    const text = node.textContent!;
                                    node.textContent = text.substring(0, startOffset) + text.substring(endOffset);

                                    // 插入新内容
                                    const textNode = document.createTextNode(content);
                                    if (node.parentNode) {
                                        node.parentNode.insertBefore(textNode, node.nextSibling);
                                        range.setStartAfter(textNode);
                                        range.collapse(true);
                                    }

                                    found = true;
                                } else {
                                    position += textLength;
                                }
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                for (const child of Array.from(node.childNodes)) {
                                    deleteText(child, start, length);
                                    if (found) return;
                                }
                            }
                        };

                        deleteText(this.inputEl!, hashIndex, deleteLength);

                        selection.removeAllRanges();
                        selection.addRange(range);
                        this.inputEl!.focus();
                    }
                }
            }
        );

        closeBtn.onclick = () => this.close();
        submitBtn.onclick = () => this.submit();
        uploadBtn.onclick = () => fileInput.click();
        if (historyBtn) {
            historyBtn.onclick = () => this.toggleHistoryPanel();
        }

        // 模型下拉切换
        if (this.modelSelectEl) {
            const onModelChange = (e: Event) => {
                const target = e.target as HTMLSelectElement;
                if (this.plugin && this.plugin.settings) {
                    this.plugin.settings.currentModel = target.value;
                    this.plugin.saveSettings();
                }
                this.updateUIForModelType(target.value);
            };
            this.modelSelectEl.addEventListener("change", onModelChange);
            this.eventListeners.push({ element: this.modelSelectEl, event: "change", handler: onModelChange });
            this.updateUIForModelType(this.modelSelectEl.value);

            const onModelMouseDown = (e: MouseEvent) => {
                e.preventDefault();
                this.openModelDropdown(this.modelSelectEl as unknown as HTMLElement);
            };
            this.modelSelectEl.addEventListener("mousedown", onModelMouseDown as EventListener);
            this.eventListeners.push({ element: this.modelSelectEl, event: "mousedown", handler: onModelMouseDown as EventListener });

            const onModelKeyDown = (e: KeyboardEvent) => {
                if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this.openModelDropdown(this.modelSelectEl as unknown as HTMLElement);
                }
            };
            this.modelSelectEl.addEventListener("keydown", onModelKeyDown as EventListener);
            this.eventListeners.push({ element: this.modelSelectEl, event: "keydown", handler: onModelKeyDown as EventListener });
        }

        // 文件选择处理
        const fileChangeHandler = (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files) {
                this.imageHandler.handleFileSelect(target.files, (imageData) => {
                    this.addImagePreview(imageData, imagePreviewsEl);
                });
            }
            target.value = "";
        };
        fileInput.addEventListener("change", fileChangeHandler);
        this.eventListeners.push({ element: fileInput, event: "change", handler: fileChangeHandler });

        // 粘贴处理
        const pasteHandler = (e: ClipboardEvent) => {
            this.imageHandler.handlePaste(e, (imageData) => {
                this.addImagePreview(imageData, imagePreviewsEl);
            });
        };
        this.inputEl!.addEventListener("paste", pasteHandler as EventListener);
        this.eventListeners.push({ element: this.inputEl!, event: "paste", handler: pasteHandler as EventListener });

        // 输入处理
        const inputHandler = (e: Event) => {
            e.stopPropagation(); // 防止事件冒泡
            this.adjustPopupWidth();

            const cursorPos = this.contextSelector!.getCursorPosition();
            const textBefore = this.contextSelector!.getTextContent().substring(0, cursorPos);

            // 处理 @ 触发
            const atIndex = textBefore.lastIndexOf("@");
            if (atIndex !== -1) {
                const query = textBefore.substring(atIndex + 1);
                if (!query.includes(" ") && !query.includes("\n")) {
                    this.contextSelector!.show(atIndex, query);
                    return; // 优先处理 @
                } else {
                    this.contextSelector!.close();
                }
            } else {
                this.contextSelector!.close();
            }

            // 处理 # 触发
            const hashIndex = textBefore.lastIndexOf("#");
            if (hashIndex !== -1) {
                // 确保 # 前面是空格或者行首，避免误触
                const charBefore = hashIndex > 0 ? textBefore.charAt(hashIndex - 1) : " ";
                if (charBefore === " " || charBefore === "\n") {
                    // 简单的逻辑：只要检测到 # 就打开
                    this.promptSelector!.open(this.inputEl!);

                    // 定位 PromptSelector
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        const modalEl = document.querySelector(".markdown-next-ai-context-suggestions") as HTMLElement;
                        if (modalEl) {
                            modalEl.style.position = "fixed";
                            modalEl.style.left = rect.left + "px";
                            modalEl.style.top = (rect.bottom + 5) + "px";
                        }
                    }
                } else {
                    this.promptSelector!.close();
                }
            } else {
                this.promptSelector!.close();
            }
        };
        this.inputEl!.addEventListener("input", inputHandler);
        this.eventListeners.push({ element: this.inputEl!, event: "input", handler: inputHandler });

        // 键盘处理
        const keydownHandler = (e: KeyboardEvent) => {
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
        this.inputEl!.addEventListener("keydown", keydownHandler as EventListener);
        this.eventListeners.push({ element: this.inputEl!, event: "keydown", handler: keydownHandler as EventListener });

        // 点击外部关闭（但允许点击编辑器/预览/结果浮窗以移动光标或查看结果）
        const outsideClickHandler = (e: MouseEvent) => {
            if (this.hasCloseGuard()) return;
            if (this.popupEl!.hasAttribute("data-prompt-selecting")) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-prompt-selector-popup")) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-context-suggestions")) return;
            if (this.contextSelector && this.contextSelector.isOpen) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-model-dropdown")) return;
            // 允许点击编辑器 / 预览区域（避免改变光标时关闭弹窗）
            if ((e.target as HTMLElement).closest(".cm-editor")) return;
            if ((e.target as HTMLElement).closest(".markdown-source-view")) return;
            if ((e.target as HTMLElement).closest(".markdown-preview-view")) return;
            // 允许点击生成结果浮窗（避免查看/操作时关闭弹窗）
            if ((e.target as HTMLElement).closest(".markdown-next-ai-result-floating-window")) return;
            if (this.popupEl!.contains(e.target as Node)) return;

            this.close();
        };

        setTimeout(() => {
            document.addEventListener("click", outsideClickHandler);
        }, 100);
        this.outsideClickHandler = outsideClickHandler;
        setTimeout(() => {
            this.removeCloseGuard("initial-click");
        }, 200);

        // 找到编辑器的滚动容器
        if (this.view) {
            this.scrollContainer = this.view.containerEl.querySelector(".cm-scroller");
            if (!this.scrollContainer) {
                this.scrollContainer = this.view.containerEl.querySelector(".cm-editor");
            }
        }

        if (this.scrollContainer) {
            const containerStyle = window.getComputedStyle(this.scrollContainer);
            if (containerStyle.position === "static") {
                (this.scrollContainer as HTMLElement).style.position = "relative";
            }
            this.scrollContainer.appendChild(this.popupEl);
        } else {
            document.body.appendChild(this.popupEl);
        }

        this.positionPopup();
        this.enableDragging();
        this.adjustPopupWidth();

        setTimeout(() => {
            if (this.inputEl) this.inputEl.focus();
        }, 100);
    }

    /**
     * 定位弹窗
     */
    positionPopup(): void {
        if (!this.popupEl || !this.cursorPosition) return;

        const { left, top, height = 20 } = this.cursorPosition;

        if (this.scrollContainer) {
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const scrollTop = this.scrollContainer.scrollTop;
            const scrollLeft = this.scrollContainer.scrollLeft;

            let posLeft = left - containerRect.left + scrollLeft;
            let posTop = top + height + 5 - containerRect.top + scrollTop;

            this.popupEl.style.position = "absolute";
            this.popupEl.style.left = posLeft + "px";
            this.popupEl.style.top = posTop + "px";
            this.popupEl.style.zIndex = "10000";

            const popupRect = this.popupEl.getBoundingClientRect();
            const containerWidth = containerRect.width;

            if (popupRect.right > containerRect.right) {
                posLeft = containerWidth + scrollLeft - popupRect.width - 10;
                this.popupEl.style.left = posLeft + "px";
            }
            if (posLeft < scrollLeft) {
                this.popupEl.style.left = (scrollLeft + 10) + "px";
            }
            if (popupRect.bottom > containerRect.bottom) {
                posTop = top - containerRect.top + scrollTop - popupRect.height - 5;
                this.popupEl.style.top = posTop + "px";
            }
        } else {
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
    }

    /**
     * 根据文本内容动态调整弹窗宽度
     */
    adjustPopupWidth(): void {
        if (!this.popupEl || !this.inputEl) return;

        const measureEl = document.createElement("span");
        measureEl.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            font-size: inherit;
            padding: 0;
            max-width: 80vw;
        `;

        const text = this.contextSelector ? this.contextSelector.getTextContent() : "";
        measureEl.textContent = text || "";

        document.body.appendChild(measureEl);
        const textWidth = measureEl.offsetWidth;
        document.body.removeChild(measureEl);

        const minWidth = 520;
        const maxWidth = Math.min(window.innerWidth * 0.8, 900);
        const padding = 120;
        const calculatedWidth = Math.min(
            Math.max(textWidth + padding, minWidth),
            maxWidth
        );

        this.popupEl.style.width = calculatedWidth + "px";
    }

    private toggleHistoryPanel(): void {
        if (!this.historyContainer) return;

        this.historyVisible = !this.historyVisible;
        this.historyContainer.style.display = this.historyVisible ? "block" : "none";

        if (this.historyVisible) {
            this.renderHistoryPanel();
        }

        this.adjustPopupWidth();
    }

    private renderHistoryPanel(): void {
        if (!this.historyContainer) return;

        const history = (this.plugin.settings.conversationHistory || []).slice(-10).reverse();

        if (!history.length) {
            this.historyContainer.innerHTML = "<div class=\"markdown-next-ai-history-empty\">暂无历史记录</div>";
            return;
        }

        const formatTime = (ts: number): string => {
            const d = new Date(ts);
            const pad = (n: number) => n.toString().padStart(2, "0");
            return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const itemsHtml = history.map((entry, idx) => {
            const promptPreview = entry.prompt.length > 80 ? `${entry.prompt.slice(0, 80)}...` : entry.prompt;
            const responsePreview = entry.response.length > 120 ? `${entry.response.slice(0, 120)}...` : entry.response;
            return `
                <div class="markdown-next-ai-history-item" 
                     data-history-id="${entry.id}" 
                     data-history-idx="${idx}"
                     title="点击恢复此对话">
                    <div class="markdown-next-ai-history-header">
                        <span class="markdown-next-ai-history-time">${formatTime(entry.timestamp)}</span>
                        <span class="markdown-next-ai-history-model">${entry.modelId}</span>
                    </div>
                    <div class="markdown-next-ai-history-prompt">${promptPreview || "(空提示)"}</div>
                    <div class="markdown-next-ai-history-response">${responsePreview || "(无回复)"}</div>
                </div>
            `;
        }).join("");

        this.historyContainer.innerHTML = itemsHtml;

        // 添加点击事件委托
        this.historyContainer.querySelectorAll(".markdown-next-ai-history-item").forEach(item => {
            item.addEventListener("click", () => {
                const historyId = item.getAttribute("data-history-id");
                if (historyId) {
                    this.restoreHistoryEntry(historyId);
                }
            });
        });
    }

    /**
     * 恢复历史对话条目
     */
    private restoreHistoryEntry(historyId: string): void {
        if (!this.inputEl) return;
        const entry = (this.plugin.settings.conversationHistory || []).find(e => e.id === historyId);
        if (!entry) return;
        const text = entry.prompt || "";
        if (this.inputEl instanceof HTMLTextAreaElement) {
            this.inputEl.value = text;
        } else {
            this.inputEl.textContent = text;
        }
        if (this.modelSelectEl && entry.modelId) {
            this.modelSelectEl.value = entry.modelId;
            this.updateUIForModelType(entry.modelId);
        }
        this.contextSelector?.updatePlaceholder();
        this.adjustPopupWidth();
        if (this.historyContainer) {
            this.historyVisible = false;
            this.historyContainer.style.display = "none";
        }
        if (!(this.inputEl instanceof HTMLTextAreaElement)) {
            const pos = text.length;
            this.contextSelector?.setCursorPosition(pos);
        }
        this.inputEl.focus();
        new Notice(`已恢复: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`);
    }

    private enableDragging(): void {
        if (!this.popupEl) return;
        const header = this.popupEl.querySelector(".markdown-next-ai-popup-header") as HTMLElement | null;
        if (!header) return;

        let startX = 0;
        let startY = 0;
        let currentTranslateX = 0;
        let currentTranslateY = 0;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || !this.popupEl) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-popup-actions")) return;
            this.isDragging = true;

            startX = e.clientX;
            startY = e.clientY;

            // Extract current transform values
            const transform = this.popupEl.style.transform || "translate(0, 0)";
            const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (matches) {
                currentTranslateX = parseFloat(matches[1]) || 0;
                currentTranslateY = parseFloat(matches[2]) || 0;
            }

            document.body.style.userSelect = "none";
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isDragging || !this.popupEl) return;
            e.preventDefault();

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            const nextTranslateX = currentTranslateX + deltaX;
            const nextTranslateY = currentTranslateY + deltaY;

            // Apply transform: translate
            this.popupEl.style.transform = `translate(${nextTranslateX}px, ${nextTranslateY}px)`;
        };

        const onMouseUp = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.removeProperty("user-select");
        };

        const onTouchStart = (e: TouchEvent) => {
            if (!this.popupEl) return;
            this.isDragging = true;

            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            // Extract current transform values
            const transform = this.popupEl.style.transform || "translate(0, 0)";
            const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (matches) {
                currentTranslateX = parseFloat(matches[1]) || 0;
                currentTranslateY = parseFloat(matches[2]) || 0;
            }

            document.body.style.userSelect = "none";
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!this.isDragging || !this.popupEl) return;
            e.preventDefault();

            const deltaX = e.touches[0].clientX - startX;
            const deltaY = e.touches[0].clientY - startY;

            const nextTranslateX = currentTranslateX + deltaX;
            const nextTranslateY = currentTranslateY + deltaY;

            // Apply transform: translate
            this.popupEl.style.transform = `translate(${nextTranslateX}px, ${nextTranslateY}px)`;
        };

        const onTouchEnd = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.removeProperty("user-select");
        };

        header.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);

        // Add touch support
        header.addEventListener("touchstart", onTouchStart, { passive: false });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);

        this.eventListeners.push(
            { element: header, event: "mousedown", handler: onMouseDown },
            { element: document, event: "mousemove", handler: onMouseMove as EventListener },
            { element: document, event: "mouseup", handler: onMouseUp as EventListener },
            { element: header, event: "touchstart", handler: onTouchStart as EventListener },
            { element: document, event: "touchmove", handler: onTouchMove as EventListener },
            { element: document, event: "touchend", handler: onTouchEnd as EventListener }
        );
    }

    /**
     * 关闭弹窗
     */
    close(): void {
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

        this.closeGuards.clear();
        if (this.popupEl) {
            this.popupEl.removeAttribute("data-close-guard");
        }

        if (this.popupEl && this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;
        this.inputEl = null;
        this.closeModelDropdown();
    }



    /**
     * 根据模型类型更新 UI
     */
    updateUIForModelType(modelId: string): void {
        if (!this.popupEl || !modelId) return;

        const model = this.plugin.settings.models[modelId];
        if (model) {
            const isImageModel = model.category === MODEL_CATEGORIES.IMAGE;

            const titleEl = this.popupEl.querySelector(".markdown-next-ai-popup-title") as HTMLElement | null;
            const titleTextEl = this.popupEl.querySelector(".markdown-next-ai-title-text") as HTMLElement | null;
            const iconSlot = this.popupEl.querySelector(".markdown-next-ai-title-icon") as HTMLElement | null;
            if (titleEl && titleTextEl && iconSlot) {
                titleTextEl.textContent = isImageModel ? "AI图片生成" : "Markdown-Next-AI";
                setIcon(iconSlot, isImageModel ? "image" : "atom");
                (iconSlot as HTMLElement).style.color = "#863097";
            }

            if (this.inputEl) {
                this.inputEl.setAttribute("data-placeholder", isImageModel ? "请描述您想要生成的图片..." : "(@选择文件，#选择常用提示词)");
                this.contextSelector?.updatePlaceholder();
            }

            const submitBtn = this.popupEl.querySelector(".markdown-next-ai-submit-btn");
            if (submitBtn) {
                submitBtn.innerHTML = isImageModel ?
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-plus-icon lucide-image-plus" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>生成图片' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="m22 2-7 19-4-9-9-4 20-6z"/></svg>提交';
            }

            const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn") as HTMLElement;
            if (uploadBtn) {
                uploadBtn.style.display = isImageModel ? "none" : "inline-flex";
            }
        }
    }

    private openModelDropdown(anchorEl: HTMLElement): void {
        if (this.modelDropdownEl) this.closeModelDropdown();
        const models = this.plugin.getAvailableModels();
        const currentModel = this.plugin.settings.currentModel;
        this.modelDropdownEl = document.createElement("div");
        this.modelDropdownEl.className = "markdown-next-ai-context-suggestions markdown-next-ai-model-dropdown";
        const header = document.createElement("div");
        header.className = "markdown-next-ai-suggestions-header";
        header.textContent = `选择模型 (${models.length})`;
        this.modelDropdownEl.appendChild(header);
        const list = document.createElement("div");
        list.className = "markdown-next-ai-suggestions-list";
        let selectedIndex = Math.max(0, models.findIndex(m => m.id === currentModel));
        models.forEach((m, idx) => {
            const item = document.createElement("div");
            item.className = "markdown-next-ai-suggestion-item" + (idx === selectedIndex ? " selected" : "");
            item.innerHTML = `<div class="markdown-next-ai-suggestion-content"><div class="markdown-next-ai-suggestion-name">${m.name}</div></div>`;
            item.addEventListener("mouseenter", () => {
                selectedIndex = idx;
                list.querySelectorAll(".markdown-next-ai-suggestion-item").forEach(el => el.classList.remove("selected"));
                item.classList.add("selected");
            });
            item.addEventListener("click", () => {
                this.selectModelId(m.id);
                this.closeModelDropdown();
            });
            list.appendChild(item);
        });
        this.modelDropdownEl.appendChild(list);
        document.body.appendChild(this.modelDropdownEl);
        const rect = anchorEl.getBoundingClientRect();
        this.modelDropdownEl.style.position = "fixed";
        this.modelDropdownEl.style.left = rect.left + "px";
        this.modelDropdownEl.style.top = (rect.bottom + 5) + "px";
        this.modelDropdownEl.style.zIndex = "10002";
        this.modelDropdownEl.style.width = rect.width + "px";
        this.modelDropdownEl.style.minWidth = rect.width + "px";
        this.modelDropdownEl.style.maxWidth = rect.width + "px";

        const outsideClickHandler = (e: MouseEvent) => {
            if (!this.modelDropdownEl) return;
            const t = e.target as HTMLElement;
            if (this.modelDropdownEl.contains(t) || anchorEl.contains(t)) return;
            this.closeModelDropdown();
        };
        document.addEventListener("click", outsideClickHandler as EventListener, true);
        this.eventListeners.push({ element: document, event: "click", handler: outsideClickHandler as EventListener });

        this.modelDropdownScrollHandler = (e: Event) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("scroll", this.modelDropdownScrollHandler as EventListener, true);
        this.eventListeners.push({ element: document, event: "scroll", handler: this.modelDropdownScrollHandler as EventListener });

        this.modelDropdownWheelHandler = (e: WheelEvent) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("wheel", this.modelDropdownWheelHandler as EventListener, true);
        this.eventListeners.push({ element: document, event: "wheel", handler: this.modelDropdownWheelHandler as EventListener });

        this.modelDropdownTouchHandler = (e: TouchEvent) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("touchmove", this.modelDropdownTouchHandler as EventListener, true);
        this.eventListeners.push({ element: document, event: "touchmove", handler: this.modelDropdownTouchHandler as EventListener });

        this.modelDropdownKeydownHandler = (e: KeyboardEvent) => {
            if (!this.modelDropdownEl) return;
            const items = Array.from(this.modelDropdownEl.querySelectorAll(".markdown-next-ai-suggestion-item"));
            if (e.key === "Escape") {
                e.preventDefault();
                this.closeModelDropdown();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
            } else if (e.key === "Enter") {
                e.preventDefault();
                const m = models[selectedIndex];
                if (m) {
                    this.selectModelId(m.id);
                    this.closeModelDropdown();
                    return;
                }
            } else {
                return;
            }
            items.forEach(el => el.classList.remove("selected"));
            const sel = items[selectedIndex] as HTMLElement | undefined;
            if (sel) {
                sel.classList.add("selected");
                sel.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        };
        document.addEventListener("keydown", this.modelDropdownKeydownHandler as EventListener, true);
        this.eventListeners.push({ element: document, event: "keydown", handler: this.modelDropdownKeydownHandler as EventListener });
    }

    private closeModelDropdown(): void {
        if (this.modelDropdownEl && this.modelDropdownEl.parentNode) {
            this.modelDropdownEl.parentNode.removeChild(this.modelDropdownEl);
        }
        this.modelDropdownEl = null;
        this.modelDropdownScrollHandler = null;
        this.modelDropdownWheelHandler = null;
        this.modelDropdownTouchHandler = null;
        this.modelDropdownKeydownHandler = null;
    }

    private selectModelId(modelId: string): void {
        if (this.modelSelectEl) {
            this.modelSelectEl.value = modelId;
            const evt = new Event("change");
            this.modelSelectEl.dispatchEvent(evt);
        } else {
            this.plugin.settings.currentModel = modelId;
            this.plugin.saveSettings();
            this.updateUIForModelType(modelId);
        }
    }

    /**
     * 更新上下文显示
     */
    updateContextDisplay(): void {
        const container = this.popupEl!.querySelector(".markdown-next-ai-selected-context") as HTMLElement;
        const list = this.popupEl!.querySelector(".markdown-next-ai-context-list") as HTMLElement;
        if (!container || !list || !this.inputEl) return;
        const tags = Array.from(this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag")) as HTMLElement[];
        if (tags.length === 0) {
            container.style.display = "none";
            list.innerHTML = "";
            return;
        }
        container.style.display = "block";
        list.innerHTML = "";
        tags.forEach(tag => {
            const type = tag.getAttribute("data-type") || "file";
            const path = tag.getAttribute("data-path") || "";
            const nameEl = tag.querySelector(".markdown-next-ai-inline-tag-name") as HTMLElement | null;
            const name = nameEl ? nameEl.textContent || "" : "";
            const item = document.createElement("div");
            item.className = "markdown-next-ai-context-item";
            item.innerHTML = `
                <span class="markdown-next-ai-context-name">${name}</span>
                <button class="markdown-next-ai-remove-context" data-type="${type}" data-path="${path}">×</button>
            `;
            list.appendChild(item);
        });
        list.querySelectorAll(".markdown-next-ai-remove-context").forEach(btn => {
            (btn as HTMLButtonElement).onclick = (e) => {
                e.stopPropagation();
                const type = btn.getAttribute("data-type")!;
                const path = btn.getAttribute("data-path")!;
                this.removeFromContext(type, path);
            };
        });
    }

    /**
     * 从上下文中移除
     */
    removeFromContext(type: string, path: string): void {
        if (!this.inputEl) return;
        const tags = Array.from(this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag")) as HTMLElement[];
        const toRemove = tags.find(t => t.getAttribute("data-type") === type && t.getAttribute("data-path") === path);
        if (toRemove && toRemove.parentNode) {
            toRemove.parentNode.removeChild(toRemove);
        }
        this.updateContextDisplay();
        this.contextSelector?.updatePlaceholder();
    }

    /**
     * 清除上下文
     */
    clearContext(): void {
        if (!this.inputEl) return;
        const tags = Array.from(this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag"));
        tags.forEach(tag => tag.parentNode && tag.parentNode.removeChild(tag));
        this.updateContextDisplay();
        this.contextSelector?.updatePlaceholder();
    }

    /**
     * 处理内联图片
     */
    async processInlineImages(): Promise<void> {
        if (!this.contextSelector || !this.contextSelector.inputEl) return;

        const inlineTags = this.contextSelector.inputEl.querySelectorAll(".markdown-next-ai-inline-tag");
        for (const tag of Array.from(inlineTags)) {
            const type = tag.getAttribute("data-type");
            const path = tag.getAttribute("data-path");

            if (type === "image" && path) {
                try {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path) as TFile;
                    if (!file) continue;

                    const arrayBuffer = await this.plugin.app.vault.readBinary(file);
                    const uint8Array = new Uint8Array(arrayBuffer);
                    let binary = "";
                    for (let i = 0; i < uint8Array.length; i++) {
                        binary += String.fromCharCode(uint8Array[i]);
                    }
                    const base64 = btoa(binary);

                    const mimeTypes: Record<string, string> = {
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

                    const imageData: ImageData = {
                        id: Date.now() + Math.random(),
                        name: file.name,
                        size: arrayBuffer.byteLength,
                        type: mimeType,
                        base64: dataUrl,
                        url: dataUrl,
                        fromInline: true
                    };

                    const images = this.imageHandler.getImages();
                    if (!images.some(img => img.name === imageData.name && img.size === imageData.size)) {
                        this.imageHandler.addImage(imageData);
                    }
                } catch (error) {
                    console.error("无法读取图片: " + path, error);
                    new Notice("无法读取图片: " + path);
                }
            }
        }
    }

    /**
     * 获取上下文内容
     */
    async getContextContent(): Promise<string> {
        let content = "";
        if (!this.inputEl) return content;
        const tags = Array.from(this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag")) as HTMLElement[];
        const getAllMarkdownFiles = (folder: TFolder, baseFolderName: string): { file: TFile; sourcePath: string; baseFolderName: string }[] => {
            const files: { file: TFile; sourcePath: string; baseFolderName: string }[] = [];
            if (folder && folder.children) {
                for (const child of folder.children) {
                    if ((child as TFile).extension === "md") {
                        files.push({
                            file: child as TFile,
                            sourcePath: child.path,
                            baseFolderName: baseFolderName
                        });
                    } else if ((child as TFolder).children) {
                        const subFiles = getAllMarkdownFiles(child as TFolder, baseFolderName);
                        files.push(...subFiles);
                    }
                }
            }
            return files;
        };
        for (const tag of tags) {
            const type = tag.getAttribute("data-type");
            const path = tag.getAttribute("data-path") || "";
            if (!type || !path) continue;
            try {
                if (type === "file") {
                    const fileObj = this.plugin.app.vault.getAbstractFileByPath(path) as TFile;
                    if (fileObj) {
                        const text = await this.plugin.app.vault.read(fileObj);
                        content += `\n\n=== 文档: ${fileObj.basename} ===\n${text}`;
                    }
                } else if (type === "folder") {
                    const folderObj = this.plugin.app.vault.getAbstractFileByPath(path) as TFolder;
                    if (folderObj) {
                        const mdFiles = getAllMarkdownFiles(folderObj, folderObj.name);
                        for (const { file, sourcePath, baseFolderName } of mdFiles) {
                            const text = await this.plugin.app.vault.read(file);
                            content += `\n\n=== 文档: ${file.basename} (来自文件夹: ${baseFolderName}, 路径: ${sourcePath}) ===\n${text}`;
                        }
                    }
                }
            } catch (error) {
                console.error("读取上下文失败:", error);
            }
        }
        return content.trim();
    }
}
