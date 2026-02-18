import { App, MarkdownView, Notice, setIcon } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { MODE_OPTIONS, ModeSelect } from "../components/panels/quick-ask";
import { MODEL_CATEGORIES } from "../constants";
import { generateEditContent } from "../features/quick-ask/edit-mode";
import { applySearchReplaceBlocks, parseSearchReplaceBlocks } from "../features/quick-ask/search-replace";
import MarkdownNextAIPlugin from "../main";
import { ImageHandler } from "../services/image-handler";
import { ChatMessage, CursorPosition, ImageData, QuickAskMode } from "../types";
import { ChatStreamRenderer } from "./popup/components/chat-renderer";
import { InputController } from "./popup/components/input-controller";
import { WindowManager } from "./popup/components/window-manager";

import { SelectedTextDisplay } from "./popup/components/SelectedTextDisplay";

export interface EventListenerEntry {
    element: EventTarget;
    event: string;
    handler: EventListener;
}

export class AtTriggerPopup {
    private app: App;
    private plugin: MarkdownNextAIPlugin;

    // Components
    private windowManager: WindowManager;
    private chatRenderer: ChatStreamRenderer | null = null;
    private inputController: InputController | null = null;
    private imageHandler: ImageHandler;

    private cursorPosition: CursorPosition | null = null;
    private selectedText: string = "";
    private view: MarkdownView | null = null;

    // State
    public isOpen: boolean = false;
    private mode: string = 'ask';
    private messages: ChatMessage[] = [];
    private images: ImageData[] = [];
    private isThinking: boolean = false;

    // UI Elements
    private popupEl: HTMLElement | null = null;
    private chatHistoryContainer: HTMLElement | null = null;
    private reactRoot: Root | null = null;
    private selectedTextRoot: Root | null = null;
    private modelSelectEl: HTMLSelectElement | null = null;
    private scrollContainer: HTMLElement | null = null;

    // Model Dropdown
    private modelDropdownEl: HTMLElement | null = null;
    private dropdownEventListeners: EventListenerEntry[] = [];
    private modelDropdownScrollHandler: EventListener | null = null;
    private modelDropdownWheelHandler: EventListener | null = null;
    private modelDropdownTouchHandler: EventListener | null = null;
    private modelDropdownKeydownHandler: EventListener | null = null;

    private onSubmitCallback: ((prompt: string, images: ImageData[], modelId: string, context: string, selectedText: string, mode: string, onStatusUpdate?: (status: string) => void) => Promise<void> | void) | null = null;
    public onCancel: (() => void) | null = null;
    private isSubmitted: boolean = false;

    constructor(app: App, plugin: MarkdownNextAIPlugin, onSubmit?: (prompt: string, images: ImageData[], modelId: string, context: string, selectedText: string, mode: string, onStatusUpdate?: (status: string) => void) => Promise<void> | void) {
        this.app = app;
        this.plugin = plugin;
        this.windowManager = new WindowManager(app);
        this.imageHandler = new ImageHandler();
        this.onSubmitCallback = onSubmit ?? null;
    }

    public open(cursorPosition: CursorPosition, selectedText: string, view: MarkdownView | null): void {
        this.cursorPosition = cursorPosition;
        this.selectedText = selectedText;
        this.view = view;
        if (this.isOpen) return;
        this.isOpen = true;
        this.isSubmitted = false;
        this.windowManager.isPinned = false;

        this.createPopupShell();

        if (this.popupEl) {
            this.windowManager.setPopupEl(this.popupEl);
            this.windowManager.addCloseGuard("initial-click");

            // Chat Renderer
            this.chatHistoryContainer = this.popupEl.querySelector(".markdown-next-ai-chat-history") as HTMLElement;
            this.chatRenderer = new ChatStreamRenderer(this.app, this.plugin, this.chatHistoryContainer);
            if (this.messages.length > 0) {
                this.messages.forEach(msg => {
                    if (msg.role === "user" || msg.role === "assistant") {
                        this.chatRenderer!.renderChatMessage(msg.role, msg.content);
                    }
                });
            }

            // Input Controller
            const inputEl = this.popupEl.querySelector(".markdown-next-ai-continue-input") as HTMLTextAreaElement;
            const fileInput = this.popupEl.querySelector(".markdown-next-ai-file-input") as HTMLInputElement;
            this.inputController = new InputController(this.app, this.plugin, this.popupEl, inputEl, fileInput);

            this.inputController.onSubmit = () => this.submit();
            this.inputController.onClose = () => this.close();
            this.inputController.onImageSelected = (img) => {
                this.images.push(img);
                const previewContainer = this.popupEl?.querySelector(".markdown-next-ai-image-previews") as HTMLElement;
                if (previewContainer) {
                    this.addImagePreview(img, previewContainer);
                }
                // Auto-switch to vision model if needed logic here...
            };
            this.inputController.onContextChange = () => {
                this.updateContextDisplay();
            };

            // Connect Window Manager
            const headerEl = this.popupEl.querySelector(".markdown-next-ai-popup-header") as HTMLElement;
            this.windowManager.enableDragging(headerEl);

            // Positioning and mount
            this.scrollContainer = null;
            if (this.view) {
                this.scrollContainer = this.view.containerEl.querySelector(".cm-scroller");
                if (!this.scrollContainer) {
                    this.scrollContainer = this.view.containerEl.querySelector(".cm-editor");
                }
            }
            if (this.scrollContainer) {
                const containerStyle = window.getComputedStyle(this.scrollContainer);
                if (containerStyle.position === "static") {
                    this.scrollContainer.style.position = "relative";
                }
                this.popupEl.style.position = "absolute";
                this.popupEl.style.right = "auto";
                this.popupEl.style.bottom = "auto";
                this.scrollContainer.appendChild(this.popupEl);
                this.windowManager.setScrollContainer(this.scrollContainer);
            } else {
                this.popupEl.style.position = "fixed";
                this.popupEl.style.right = "auto";
                this.popupEl.style.bottom = "auto";
                document.body.appendChild(this.popupEl);
                this.windowManager.setScrollContainer(null);
            }

            this.positionPopup();

            this.setupGlobalListeners();
            this.updateUIForModelType(this.plugin.settings.currentModel);
        }

        setTimeout(() => {
            this.windowManager.removeCloseGuard("initial-click");
            if (this.inputController?.inputEl) this.inputController.inputEl.focus();
        }, 100);
    }

    private createPopupShell() {
        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-at-popup");

        if (this.plugin && this.plugin.settings && this.plugin.settings.quickAskMode) {
            this.mode = this.plugin.settings.quickAskMode;
        }

        const isRewriteMode = this.mode === 'edit';
        const titleText = isRewriteMode ? "修改所选内容" : "Markdown-Next-AI";
        const currentOption = MODE_OPTIONS.find(opt => opt.value === this.mode);
        const placeholderText = currentOption?.descFallback || (isRewriteMode ? "请输入修改要求..." : "@选择文件，#选择常用提示词...");
        const selectedTextPreview = this.selectedText;

        this.popupEl.innerHTML = `
            <div class="markdown-next-ai-popup-header">
                <span class="markdown-next-ai-popup-title"><span class="markdown-next-ai-title-icon"></span><span class="markdown-next-ai-title-text">${titleText}</span></span>
                <div class="markdown-next-ai-mode-selector" style="flex: 1; margin-left: 12px;"></div>
                <div class="markdown-next-ai-popup-actions">
                    <button class="markdown-next-ai-header-btn markdown-next-ai-popup-close"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
            </div>
            <div class="markdown-next-ai-popup-content">
                <div class="markdown-next-ai-chat-history" style="display: ${this.mode === 'ask' ? 'flex' : 'none'}; flex-direction: column; overflow-y: auto; max-height: 300px; gap: 8px;"></div>
                <div class="markdown-next-ai-selected-text-root"></div>
                <div class="markdown-next-ai-image-previews"></div>
                <textarea class="markdown-next-ai-continue-input" placeholder="${placeholderText}" rows="3"></textarea>
                <div class="markdown-next-ai-upload-section">
                     <div class="markdown-next-ai-left-section">
                        <button class="markdown-next-ai-at-btn" title="添加上下文 (@)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-at-sign"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg></button>
                        <button class="markdown-next-ai-hash-btn" title="选择提示词 (#)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hash"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg></button>
                        <input type="file" class="markdown-next-ai-file-input" accept="image/*" multiple style="display: none;">
                        <button class="markdown-next-ai-upload-btn" title="上传图片"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-up-icon lucide-image-up" style="display: inline-block; vertical-align: middle;"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg></button>
                    </div>
                    <div class="markdown-next-ai-right-section">
                        <select class="markdown-next-ai-model-select">${this.getModelOptions()}</select>
                        <button class="markdown-next-ai-submit-btn" title="提交"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" style="display: inline-block; vertical-align: middle;"><path d="m22 2-7 19-4-9-9-4 20-6z"/></svg></button>
                    </div>
                </div>
            </div>
        `;

        if (this.plugin?.api && this.popupEl) {
            this.plugin.api.applyPopupExtenders?.(this.popupEl, {
                mode: this.mode,
                selectedText: this.selectedText,
                file: this.view?.file
            });
        }

        const titleIcon = this.popupEl.querySelector(".markdown-next-ai-title-icon") as HTMLElement;
        if (titleIcon) setIcon(titleIcon, "atom");

        const closeBtn = this.popupEl.querySelector(".markdown-next-ai-popup-close") as HTMLElement;
        const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn") as HTMLElement;
        const fileInput = this.popupEl.querySelector(".markdown-next-ai-file-input") as HTMLElement;
        const atBtn = this.popupEl.querySelector(".markdown-next-ai-at-btn") as HTMLElement;
        const hashBtn = this.popupEl.querySelector(".markdown-next-ai-hash-btn") as HTMLElement;
        const submitBtn = this.popupEl.querySelector(".markdown-next-ai-submit-btn") as HTMLElement;
        this.modelSelectEl = this.popupEl.querySelector(".markdown-next-ai-model-select") as HTMLSelectElement;

        closeBtn.onclick = () => this.close();
        uploadBtn.onclick = () => fileInput.click();

        atBtn.onclick = (e) => {
            e.preventDefault();
            if (this.inputController) {
                this.inputController.inputEl.focus();
                document.execCommand('insertText', false, '@');
                this.inputController.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        hashBtn.onclick = (e) => {
            e.preventDefault();
            if (this.inputController) {
                this.inputController.inputEl.focus();
                document.execCommand('insertText', false, '#');
                this.inputController.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        submitBtn.onclick = () => this.submit();

        const onModelChange = (e: Event) => {
            const target = e.target as HTMLSelectElement;
            this.plugin.settings.currentModel = target.value;
            this.plugin.saveSettings();
            this.updateUIForModelType(target.value);
        };
        this.modelSelectEl.addEventListener("change", onModelChange);

        const onModelMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.modelDropdownEl) {
                this.closeModelDropdown();
            } else {
                this.openModelDropdown(this.modelSelectEl as unknown as HTMLElement);
            }
        };
        this.modelSelectEl.addEventListener("mousedown", onModelMouseDown as EventListener);

        const selectedTextContainer = this.popupEl.querySelector(".markdown-next-ai-selected-text-root");
        if (selectedTextContainer && this.selectedText) {
            this.selectedTextRoot = createRoot(selectedTextContainer);
            this.selectedTextRoot.render(
                React.createElement(SelectedTextDisplay, {
                    app: this.app,
                    selectedText: this.selectedText,
                    isRewriteMode: isRewriteMode
                })
            );
        }

        const modeSelectorContainer = this.popupEl.querySelector(".markdown-next-ai-mode-selector");
        if (modeSelectorContainer) {
            this.reactRoot = createRoot(modeSelectorContainer);
            this.renderModeSelect();
        }
    }

    private getModelOptions(): string {
        const models = this.plugin.getAvailableModels();
        const currentModel = this.plugin.settings.currentModel;
        return models.map(m => `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.name}</option>`).join('');
    }

    renderModeSelect(): void {
        if (!this.reactRoot) return;
        this.reactRoot.render(
            React.createElement(ModeSelect, {
                mode: this.mode as QuickAskMode,
                onChange: (newMode: QuickAskMode) => {
                    this.mode = newMode;
                    this.plugin.settings.quickAskMode = newMode;
                    this.plugin.saveSettings();

                    const opt = MODE_OPTIONS.find(o => o.value === newMode);
                    if (opt && this.inputController?.inputEl) {
                        if (this.inputController.inputEl instanceof HTMLTextAreaElement) {
                            this.inputController.inputEl.placeholder = opt.descFallback;
                        } else {
                            this.inputController.inputEl.setAttribute("placeholder", opt.descFallback);
                        }
                    }

                    if (this.chatHistoryContainer) {
                        this.chatHistoryContainer.style.display = newMode === 'ask' ? 'flex' : 'none';
                    }
                    new Notice(`已切换至 ${opt?.labelFallback || newMode}`);
                    this.renderModeSelect();

                    // Constrain popup to viewport in case size change pushed it off screen
                    // AND update position if it's not pinned (to adapt to new size near cursor)
                    // If it IS pinned, constrainToViewport will fix edges.
                    // If it is NOT pinned, we might want to re-run positionPopup logic to flip if needed.
                    if (this.windowManager.isPinned) {
                        this.windowManager.constrainToViewport();
                    } else {
                        // If not pinned, re-calculate cursor relative position with new size
                        // We need slight delay for DOM update
                        setTimeout(() => this.positionPopup(), 0);
                    }
                }
            })
        );
    }

    updateUIForModelType(modelId: string): void {
        if (!this.popupEl || !modelId) return;

        const model = this.plugin.settings.models[modelId];
        if (model) {
            const isImageModel = model.category === MODEL_CATEGORIES.IMAGE;

            const titleTextEl = this.popupEl.querySelector(".markdown-next-ai-title-text") as HTMLElement | null;
            const iconSlot = this.popupEl.querySelector(".markdown-next-ai-title-icon") as HTMLElement | null;
            if (titleTextEl && iconSlot) {
                titleTextEl.textContent = isImageModel ? "AI图片生成" : "Markdown-Next-AI";
                setIcon(iconSlot, isImageModel ? "image" : "atom");
            }
            const uploadBtn = this.popupEl.querySelector(".markdown-next-ai-upload-btn") as HTMLElement;
            if (uploadBtn) {
                uploadBtn.style.display = isImageModel ? "none" : "inline-flex";
            }
            if (this.inputController?.inputEl) {
                const placeholderText = isImageModel ? "请描述您想要生成的图片..." : "@选择文件，#选择常用提示词";
                if (this.inputController.inputEl instanceof HTMLTextAreaElement) {
                    this.inputController.inputEl.placeholder = placeholderText;
                } else {
                    this.inputController.inputEl.setAttribute("data-placeholder", placeholderText);
                    this.inputController.getContextSelector().updatePlaceholder();
                }
            }
        }
    }

    private positionPopup(): void {
        this.windowManager.positionPopup(this.cursorPosition);
    }

    private setupGlobalListeners() {
        const outsideClickHandler = (e: MouseEvent) => {
            if (this.windowManager.hasCloseGuard()) return;
            if (!document.body.contains(e.target as Node)) return;

            if ((e.target as HTMLElement).closest(".markdown-next-ai-prompt-selector-popup")) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-context-suggestions")) return;
            if (this.inputController?.getContextSelector().isOpen) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-model-dropdown")) return;
            if ((e.target as HTMLElement).closest(".markdown-next-ai-result-floating-window")) return;
            if (this.popupEl?.contains(e.target as Node)) return;

            this.close();
        };
        setTimeout(() => document.addEventListener("click", outsideClickHandler), 100);
        this.dropdownEventListeners.push({ element: document, event: "click", handler: outsideClickHandler });
    }

    private setThinking(thinking: boolean): void {
        this.isThinking = thinking;
        if (thinking) {
            this.windowManager.addCloseGuard("thinking");
        } else {
            this.windowManager.removeCloseGuard("thinking");
        }
    }

    public close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.setThinking(false);

        if (!this.isSubmitted && this.onCancel) {
            this.onCancel();
        }

        this.windowManager.dispose();
        this.inputController?.dispose();

        if (this.reactRoot) {
            this.reactRoot.unmount();
            this.reactRoot = null;
        }

        if (this.selectedTextRoot) {
            this.selectedTextRoot.unmount();
            this.selectedTextRoot = null;
        }

        this.dropdownEventListeners.forEach(l => l.element.removeEventListener(l.event, l.handler));
        this.dropdownEventListeners = [];

        if (this.popupEl && this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;

        this.imageHandler.clearImages();
        this.images = [];
        this.closeModelDropdown();
    }

    private async submit() {
        if (!this.inputController || !this.chatRenderer) return;

        const content = this.inputController.getTextContent();
        await this.processInlineImages();
        const imagesToSend = [...this.images];
        if (!content.trim() && imagesToSend.length === 0) {
            new Notice("请输入内容");
            return;
        }

        if (this.mode === "edit-direct") {
            if (!this.view || !this.view.editor || !this.view.file) {
                new Notice("请在Markdown编辑器中使用直改模式");
                return;
            }
            const editor = this.view.editor;
            const file = this.view.file;
            const editorContent = editor.getValue();

            // Set UI to loading state
            const submitBtn = this.popupEl?.querySelector(".markdown-next-ai-submit-btn") as HTMLElement;
            const inputEl = this.inputController?.inputEl;
            const originalBtnContent = submitBtn ? submitBtn.innerHTML : "";

            if (submitBtn) {
                submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
                // Add inline style for spin animation if not present globally
                if (!document.getElementById("markdown-next-ai-spin-keyframes")) {
                    const style = document.createElement("style");
                    style.id = "markdown-next-ai-spin-keyframes";
                    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
                    document.head.appendChild(style);
                }
                submitBtn.style.pointerEvents = "none";
                submitBtn.style.opacity = "0.7";
            }
            if (inputEl) {
                inputEl.disabled = true;
                inputEl.style.opacity = "0.7";
            }

            // Add status message
            let statusEl = this.popupEl?.querySelector(".markdown-next-ai-status-message");
            if (!statusEl && this.popupEl) {
                statusEl = document.createElement("div");
                statusEl.className = "markdown-next-ai-status-message";
                statusEl.style.cssText = "padding: 0 12px 8px; color: var(--text-muted); font-size: 0.8em;";
                const inputSection = this.popupEl.querySelector(".markdown-next-ai-continue-input");
                if (inputSection && inputSection.parentElement) {
                    inputSection.parentElement.insertBefore(statusEl, inputSection.nextSibling);
                }
            }
            if (statusEl) statusEl.textContent = "正在思考并修改文档...";

            this.setThinking(true);
            try {
                // Get additional context from API
                const apiContext = (this.view && this.view.file)
                    ? await this.plugin.api.getAggregatedContext(this.view.file, { mode: this.mode, prompt: content, selectedText: this.selectedText })
                    : "";

                const generatedContent = await generateEditContent({
                    instruction: content,
                    currentFile: file,
                    currentFileContent: editorContent,
                    selectedText: this.selectedText,
                    additionalContext: apiContext,
                    aiService: this.plugin.aiService,
                    modelId: this.plugin.settings.currentModel,
                    mode: "edit-direct"
                });
                const blocks = parseSearchReplaceBlocks(generatedContent);

                // Close popup before showing results/notices
                this.isSubmitted = true;
                this.close();

                if (blocks.length === 0) {
                    new Notice("未能生成有效的修改建议");
                    return;
                }
                const result = applySearchReplaceBlocks(editorContent, blocks);
                if (result.appliedCount > 0) {
                    if (this.plugin.settings.confirmBeforeDirectApply) {
                        this.plugin.openApplyView(file, editorContent, result.newContent);
                    } else {
                        editor.setValue(result.newContent);
                        new Notice(`已应用 ${result.appliedCount} 处修改`);
                    }
                } else {
                    new Notice("未应用任何修改");
                }
                if (result.errors.length > 0) {
                    new Notice(`部分修改未应用：${result.errors[0]}`);
                }
            } catch (error) {
                // Restore UI on error
                if (submitBtn) {
                    submitBtn.innerHTML = originalBtnContent;
                    submitBtn.style.pointerEvents = "";
                    submitBtn.style.opacity = "";
                }
                if (inputEl) {
                    inputEl.disabled = false;
                    inputEl.style.opacity = "";
                }
                if (statusEl) statusEl.textContent = "";

                new Notice("修改失败: " + (error instanceof Error ? error.message : String(error)));
            } finally {
                this.setThinking(false);
            }
            return;
        }

        if (this.mode !== 'ask' && this.onSubmitCallback) {
            const context = await this.inputController.getSelectedContext();
            const apiContext = (this.view && this.view.file)
                ? await this.plugin.api.getAggregatedContext(this.view.file, { mode: this.mode, prompt: content, selectedText: this.selectedText })
                : "";
            const finalContext = (context || "") + (apiContext ? "\n\n" + apiContext : "");

            // Set UI to loading state
            const submitBtn = this.popupEl?.querySelector(".markdown-next-ai-submit-btn") as HTMLElement;
            const inputEl = this.inputController?.inputEl;
            const originalBtnContent = submitBtn ? submitBtn.innerHTML : "";

            if (submitBtn) {
                submitBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
                if (!document.getElementById("markdown-next-ai-spin-keyframes")) {
                    const style = document.createElement("style");
                    style.id = "markdown-next-ai-spin-keyframes";
                    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
                    document.head.appendChild(style);
                }
                submitBtn.style.pointerEvents = "none";
                submitBtn.style.opacity = "0.7";
            }
            if (inputEl) {
                inputEl.disabled = true;
                inputEl.style.opacity = "0.7";
            }

            // Add status message
            let statusEl = this.popupEl?.querySelector(".markdown-next-ai-status-message");
            if (!statusEl && this.popupEl) {
                statusEl = document.createElement("div");
                statusEl.className = "markdown-next-ai-status-message";
                statusEl.style.cssText = "padding: 0 12px 8px; color: var(--text-muted); font-size: 0.8em;";
                const inputSection = this.popupEl.querySelector(".markdown-next-ai-continue-input");
                if (inputSection && inputSection.parentElement) {
                    inputSection.parentElement.insertBefore(statusEl, inputSection.nextSibling);
                }
            }
            if (statusEl) statusEl.textContent = "正在思考中...";

            const updateStatus = (status: string) => {
                if (statusEl) statusEl.textContent = status;
            };

            this.setThinking(true);
            try {
                await this.onSubmitCallback(content, imagesToSend, this.plugin.settings.currentModel, finalContext, this.selectedText, this.mode, updateStatus);
                this.isSubmitted = true;
                this.close();
            } catch (error) {
                // Restore UI on error
                if (submitBtn) {
                    submitBtn.innerHTML = originalBtnContent;
                    submitBtn.style.pointerEvents = "";
                    submitBtn.style.opacity = "";
                }
                if (inputEl) {
                    inputEl.disabled = false;
                    inputEl.style.opacity = "";
                }
                if (statusEl) statusEl.textContent = "";
                new Notice("Request failed: " + (error instanceof Error ? error.message : String(error)));
            } finally {
                this.setThinking(false);
            }
            return;
        }

        const context = await this.inputController.getSelectedContext();

        // Get additional context from API
        const apiContext = (this.view && this.view.file)
            ? await this.plugin.api.getAggregatedContext(this.view.file, { mode: this.mode, prompt: content, selectedText: this.selectedText })
            : "";
        const finalContext = (context || "") + (apiContext ? "\n\n" + apiContext : "");

        const userVisiblePrompt = (() => {
            const trimmed = (content || "").trim();
            if (trimmed) return trimmed;
            const parts: string[] = [];
            if (imagesToSend.length > 0) parts.push(`图片 ${imagesToSend.length} 张`);
            if (context && context.trim()) parts.push("已附加上下文");
            if (parts.length === 0) return "（无文本）";
            return `（${parts.join("，")}）`;
        })();

        if (this.inputController) {
            this.inputController.clear();
        }
        this.messages.push({ role: "user", content: userVisiblePrompt });
        await this.chatRenderer.renderChatMessage("user", userVisiblePrompt);
        this.chatRenderer.createStreamingAssistantMessage();

        this.setThinking(true);
        try {
            let finalContent = "";
            let finalThinking = "";
            await this.plugin.aiService.sendRequest(
                "chat",
                {
                    selectedText: this.selectedText,
                    beforeText: "",
                    afterText: "",
                    cursorPosition: { line: 0, ch: 0 },
                    additionalContext: finalContext || undefined
                },
                content,
                imagesToSend,
                this.messages,
                (streamData) => {
                    if (streamData.thinking != null) {
                        finalThinking = streamData.thinking;
                        this.chatRenderer!.updateStreamingThinking(finalThinking);
                    }
                    if (streamData.content != null) {
                        finalContent = streamData.content;
                        if (finalContent.trim()) {
                            this.chatRenderer!.updateStreamingMessage(finalContent);
                        }
                    }
                }
            );
            await this.chatRenderer.finalizeStreamingMessage(finalContent);
            this.messages.push({ role: "assistant", content: finalContent });
            this.images = [];
        } catch (error) {
            new Notice("Generation failed: " + (error as any)?.message || String(error));
            this.chatRenderer.updateStreamingMessage("Error: " + ((error as any)?.message || String(error)));
            this.chatRenderer.finalizeStreamingMessage("Error: " + ((error as any)?.message || String(error)));
        } finally {
            this.setThinking(false);
        }
    }

    private addImagePreview(imageData: ImageData, container: HTMLElement) {
        const previewEl = this.imageHandler.createImagePreview(imageData, () => {
            this.images = this.images.filter(i => i !== imageData);
            previewEl.remove();
        });
        container.appendChild(previewEl);
    }

    private updateContextDisplay() {
        return;
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
        this.dropdownEventListeners.push({ element: document, event: "click", handler: outsideClickHandler as EventListener });

        this.modelDropdownScrollHandler = (e: Event) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("scroll", this.modelDropdownScrollHandler as EventListener, true);
        this.dropdownEventListeners.push({ element: document, event: "scroll", handler: this.modelDropdownScrollHandler as EventListener });

        this.modelDropdownWheelHandler = (e: WheelEvent) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("wheel", this.modelDropdownWheelHandler as EventListener, true);
        this.dropdownEventListeners.push({ element: document, event: "wheel", handler: this.modelDropdownWheelHandler as EventListener });

        this.modelDropdownTouchHandler = (e: TouchEvent) => {
            const t = e.target as HTMLElement | null;
            if (this.modelDropdownEl && t && (this.modelDropdownEl === t || this.modelDropdownEl.contains(t))) return;
            this.closeModelDropdown();
        };
        document.addEventListener("touchmove", this.modelDropdownTouchHandler as EventListener, true);
        this.dropdownEventListeners.push({ element: document, event: "touchmove", handler: this.modelDropdownTouchHandler as EventListener });

        let selectedIndexForKeys = selectedIndex;
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
                selectedIndexForKeys = Math.min(selectedIndexForKeys + 1, items.length - 1);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndexForKeys = Math.max(selectedIndexForKeys - 1, 0);
            } else if (e.key === "Enter") {
                e.preventDefault();
                const m = models[selectedIndexForKeys];
                if (m) {
                    this.selectModelId(m.id);
                    this.closeModelDropdown();
                    return;
                }
            } else {
                return;
            }
            items.forEach(el => el.classList.remove("selected"));
            const sel = items[selectedIndexForKeys] as HTMLElement | undefined;
            if (sel) {
                sel.classList.add("selected");
                sel.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        };
        document.addEventListener("keydown", this.modelDropdownKeydownHandler as EventListener, true);
        this.dropdownEventListeners.push({ element: document, event: "keydown", handler: this.modelDropdownKeydownHandler as EventListener });
    }

    private closeModelDropdown(): void {
        if (this.modelDropdownEl && this.modelDropdownEl.parentNode) {
            this.modelDropdownEl.parentNode.removeChild(this.modelDropdownEl);
        }
        this.modelDropdownEl = null;

        this.dropdownEventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler, true);
        });
        this.dropdownEventListeners = [];
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

    private async processInlineImages(): Promise<void> {
        if (!this.inputController || !this.inputController.inputEl) return;
        const inlineTags = this.inputController.inputEl.querySelectorAll(".markdown-next-ai-inline-tag");
        for (const tag of Array.from(inlineTags)) {
            const type = tag.getAttribute("data-type");
            const path = tag.getAttribute("data-path");
            if (type === "image" && path) {
                try {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path) as any;
                    if (!file || !file.extension) continue;
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
                    if (!this.images.some(img => img.name === imageData.name && img.size === imageData.size)) {
                        this.images.push(imageData);
                        const previewContainer = this.popupEl?.querySelector(".markdown-next-ai-image-previews") as HTMLElement;
                        if (previewContainer) {
                            this.addImagePreview(imageData, previewContainer);
                        }
                    }
                } catch (error) {
                    new Notice("无法读取图片: " + path);
                }
            }
        }
    }
}
