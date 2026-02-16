import { MarkdownView, Notice, Plugin, TFile, setIcon } from "obsidian";
import { AIContextProvider, AIContextRequest, AIPopupContext, AIPopupExtender, MarkdownNextAIAPI } from "./api";
import { DEFAULT_SETTINGS } from "./defaults";
import { TabCompletionController } from "./features/tab-completion/tab-completion-controller";
import { AIService } from "./services";
import { GlobalRuleManager } from "./services/rule-manager";
// Use the refactored settings tab entry
import { MarkdownNextAISettingTab } from "./settings/index";
import type { CursorPosition, ImageData, PluginSettings } from "./types";
import { AtTriggerPopup, PromptSelectorPopup, SelectionManager, SelectionToolbar } from "./ui";
import { APPLY_VIEW_TYPE, ApplyView } from "./ui/apply-view/ApplyView";
import { InlineSuggestionController } from "./ui/inline-suggestion/inline-suggestion-controller";

// API Implementation
class MarkdownNextAIAPIImpl implements MarkdownNextAIAPI {
    private contextProviders: AIContextProvider[] = [];
    private popupExtenders: AIPopupExtender[] = [];

    registerContextProvider(provider: AIContextProvider) {
        // Prevent duplicate registration
        if (this.contextProviders.some(p => p.id === provider.id)) {
            console.warn(`[Markdown-Next-AI] Context provider with id '${provider.id}' is already registered.`);
            return;
        }
        this.contextProviders.push(provider);
        console.log(`[Markdown-Next-AI] Registered context provider: ${provider.name}`);
    }

    unregisterContextProvider(id: string) {
        this.contextProviders = this.contextProviders.filter(p => p.id !== id);
        console.log(`[Markdown-Next-AI] Unregistered context provider: ${id}`);
    }

    registerPopupExtender(extender: AIPopupExtender) {
        if (this.popupExtenders.some(e => e.id === extender.id)) {
            console.warn(`[Markdown-Next-AI] Popup extender with id '${extender.id}' is already registered.`);
            return;
        }
        this.popupExtenders.push(extender);
        console.log(`[Markdown-Next-AI] Registered popup extender: ${extender.name}`);
    }

    unregisterPopupExtender(id: string) {
        this.popupExtenders = this.popupExtenders.filter(e => e.id !== id);
        console.log(`[Markdown-Next-AI] Unregistered popup extender: ${id}`);
    }

    async getAggregatedContext(file: TFile, request?: AIContextRequest): Promise<string> {
        if (this.contextProviders.length === 0) return "";

        const contextPromises = this.contextProviders.map(async (provider) => {
            try {
                const context = await provider.getContext(file, request);
                return context ? context.trim() : "";
            } catch (error) {
                console.error(`[Markdown-Next-AI] Error getting context from provider '${provider.name}':`, error);
                return "";
            }
        });

        const contexts = await Promise.all(contextPromises);
        return contexts.filter(c => c.length > 0).join("\n\n");
    }

    applyPopupExtenders(popupEl: HTMLElement, context: AIPopupContext): void {
        if (this.popupExtenders.length === 0) return;
        for (const extender of this.popupExtenders) {
            try {
                extender.extend(popupEl, context);
            } catch (error) {
                console.error(`[Markdown-Next-AI] Error applying popup extender '${extender.name}':`, error);
            }
        }
    }
}

interface EventListenerEntry {
    element: Document | HTMLElement | any;
    event: string;
    handler: EventListener;
}

/**
 * MarkdownNext AI 主插件类
 */
export default class MarkdownNextAIPlugin extends Plugin {
    settings!: PluginSettings;
    aiService!: AIService;
    ruleManager!: GlobalRuleManager;
    tabCompletionController!: TabCompletionController;
    // Public API instance
    api!: MarkdownNextAIAPIImpl;
    inlineSuggestionController!: InlineSuggestionController;
    selectionManager!: SelectionManager;
    selectionToolbar!: SelectionToolbar;
    private eventListeners: EventListenerEntry[] = [];
    private atTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastAtTriggerPopup: AtTriggerPopup | null = null;
    private activeAbortControllers: Set<AbortController> = new Set();

    // Add a global variable to store the last mouseup position
    private lastMouseUpPosition: CursorPosition | null = null;

    // Track the last active markdown editor (for global mode when sidebar is active)
    private lastActiveMarkdownView: MarkdownView | null = null;
    private headerButtons: HTMLElement[] = [];
    private headerButtonListeners: Array<{ element: HTMLElement | any; event: string; handler: any }> = [];

    async onload(): Promise<void> {
        await this.loadSettings();

        // Initialize API
        this.api = new MarkdownNextAIAPIImpl();

        this.aiService = new AIService(this.settings, this.app);
        this.ruleManager = new GlobalRuleManager(this);

        // Initialize Selection Manager and Toolbar
        this.selectionToolbar = new SelectionToolbar(this.app, this);
        this.selectionManager = new SelectionManager(this.app, (info) => {
            if (info) {
                this.selectionToolbar.show(info);
            } else {
                this.selectionToolbar.hide();
            }
        });

        // Switch to refactored SettingsTab (compatible signature)
        this.addSettingTab(new MarkdownNextAISettingTab(this.app, this));
        this.addCommands();
        this.updateEventListeners();
        this.setupGlobalKeyDomEvents();
        this.setupHeaderButton();

        // 追踪最后活跃的编辑器视图
        this.setupLastActiveViewTracker();

        console.log("MarkdownNext AI 插件已加载");
        this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf));

        this.inlineSuggestionController = new InlineSuggestionController({
            getEditorView: (editor) => {
                // @ts-ignore
                return editor.cm as any;
            },
            getTabCompletionController: () => this.tabCompletionController,
            getSettings: () => this.settings,
            getActiveMarkdownView: () => this.getAnyMarkdownView()
        });
        this.addRibbonIcon("atom", "AI对话", () => {
            const sel = window.getSelection()?.toString().trim() || "";
            this.showAtTriggerModalGlobal(sel);
        });

        const getActiveMarkdownView = () => this.getAnyMarkdownView();
        const getActiveFileTitle = () => {
            const v = getActiveMarkdownView();
            return v?.file?.basename ?? "";
        };
        const resolveContinuationParams = () => {
            const tc = this.settings.tabCompletion ?? {};
            return {
                temperature: typeof tc.temperature === "number" ? tc.temperature : undefined,
                topP: typeof (tc as any).topP === "number" ? (tc as any).topP : undefined,
                stream: true,
                useVaultSearch: false
            };
        };

        this.tabCompletionController = new TabCompletionController({
            getSettings: () => this.settings,
            getEditorView: (editor) => {
                // @ts-ignore
                return editor.cm as any;
            },
            getActiveMarkdownView,
            getActiveConversationOverrides: () => undefined,
            resolveContinuationParams,
            getActiveFileTitle,
            setInlineSuggestionGhost: (view, payload) => this.inlineSuggestionController.setInlineSuggestionGhost(view, payload),
            clearInlineSuggestion: () => this.inlineSuggestionController.clearInlineSuggestion(),
            setActiveInlineSuggestion: (s) => this.inlineSuggestionController.setActiveInlineSuggestion(s),
            addAbortController: (c) => this.activeAbortControllers.add(c),
            removeAbortController: (c) => this.activeAbortControllers.delete(c),
            isContinuationInProgress: () => false,
            ai: {
                streamCompletion: async (messages, modelId, options, onChunk) => {
                    await this.aiService.streamCompletion(messages, modelId, options, onChunk);
                },
                generateCompletion: async (messages, modelId, options) => {
                    const text = await this.aiService.generateCompletion(messages, modelId, options);
                    return text;
                }
            }
        });
        this.registerEditorExtension(this.tabCompletionController.createExtension());

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                try {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const editor = view?.editor;
                    if (!editor) return;
                    this.tabCompletionController.handleEditorChange(editor);
                } catch (err) {
                    console.error("Editor change handler error:", err);
                }
            })
        );
    }

    onunload(): void {
        this.selectionManager?.destroy();
        this.selectionToolbar?.destroy();
        this.cleanupEventListeners();
        this.cleanupHeaderButton();
        console.log("MarkdownNext AI 插件已卸载");
        this.cancelAllAiTasks();
    }

    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

        // 深度合并 providers
        if (loadedData && loadedData.providers) {
            this.settings.providers = { ...DEFAULT_SETTINGS.providers };
            for (const key in loadedData.providers) {
                this.settings.providers[key] = {
                    ...(DEFAULT_SETTINGS.providers[key] || {}),
                    ...loadedData.providers[key]
                };
            }
        }

        // 深度合并 models
        if (loadedData && loadedData.models) {
            this.settings.models = { ...DEFAULT_SETTINGS.models };
            for (const key in loadedData.models) {
                // 过滤无效的模型数据
                if (typeof loadedData.models[key] !== 'object' || loadedData.models[key] === null) {
                    continue;
                }

                this.settings.models[key] = {
                    ...(DEFAULT_SETTINGS.models[key] || {}),
                    ...loadedData.models[key]
                };
            }
        }

        // 确保数组类型的配置始终有效
        if (!Array.isArray(this.settings.globalRules)) {
            this.settings.globalRules = [...DEFAULT_SETTINGS.globalRules];
        }
        if (!Array.isArray(this.settings.commonPrompts)) {
            this.settings.commonPrompts = [...DEFAULT_SETTINGS.commonPrompts];
        }

        // 迁移旧的对话触发配置
        if (loadedData && Array.isArray((loadedData as any).dialogTriggers)) {
            const old = (loadedData as any).dialogTriggers as Array<{ type: string; pattern: string; enabled?: boolean }>;
            if (!Array.isArray(this.settings.dialogTextTriggers)) this.settings.dialogTextTriggers = [];
            const converted = old
                .filter(x => x.type === "char" || x.type === "sequence")
                .map(x => ({ id: String(Date.now()) + Math.random(), type: "string" as const, pattern: x.pattern, enabled: x.enabled !== false }));
            if (converted.length > 0) {
                this.settings.dialogTextTriggers = converted;
            }
        }

        // 尝试自动迁移明文 Key 到 Keychain
        this.migrateKeysToKeychain();
    }

    async migrateKeysToKeychain(): Promise<void> {
        // 等待 app.secretStorage 就绪 (虽然 loadSettings 在 onload 中调用，但有时 API 注入可能稍有延迟，或者我们在 onload 中直接调用)
        // 注意：loadSettings 是异步的，我们在这里执行迁移

        // 检查 secretStorage 是否可用
        let secretStorage = (this.app as any).secretStorage;
        if (!secretStorage) {
            if ((this.app as any).keychain) {
                secretStorage = (this.app as any).keychain;
            } else if ((window as any).secretStorage) {
                secretStorage = (window as any).secretStorage;
            } else if ((this.app as any).vault?.secretStorage) {
                secretStorage = (this.app as any).vault.secretStorage;
            }
        }

        const hasSecretStorage = secretStorage && (typeof secretStorage.save === "function" || typeof secretStorage.setSecret === "function");

        if (!hasSecretStorage) {
            return;
        }

        let hasChanges = false;

        for (const providerId in this.settings.providers) {
            const provider = this.settings.providers[providerId];
            if (provider.apiKey && !provider.apiKey.startsWith("secret:")) {
                try {
                    const secretId = `markdown-next-ai-api-key-${providerId}`;
                    const keyToSave = provider.apiKey.trim();

                    if (typeof secretStorage.save === "function") {
                        await secretStorage.save(secretId, keyToSave);
                    } else {
                        await secretStorage.setSecret(secretId, keyToSave);
                    }

                    provider.apiKey = `secret:${secretId}`;
                    hasChanges = true;
                    console.log(`[MarkdownNextAI] Automatically migrated API key for ${providerId} to Keychain.`);
                } catch (e) {
                    console.error(`[MarkdownNextAI] Failed to migrate API key for ${providerId} to Keychain:`, e);
                }
            }
        }

        if (hasChanges) {
            await this.saveSettings();
            new Notice("已自动将检测到的明文 API Key 迁移至 Keychain 安全存储");
        }
    }

    setupHeaderButton(): void {
        const addBtn = (view: MarkdownView) => {
            const header = view.containerEl.querySelector(".view-header") as HTMLElement | null;
            const actions = view.containerEl.querySelector(".view-actions") as HTMLElement | null;
            if (header && !header.querySelector(".markdown-next-ai-global-dialog-btn")) {
                const btn = document.createElement("button");
                btn.className = "markdown-next-ai-global-dialog-btn clickable-icon";
                btn.setAttribute("aria-label", "AI对话");
                const handler = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sel = window.getSelection()?.toString().trim() || "";
                    this.showAtTriggerModalGlobal(sel);
                };
                btn.addEventListener("click", handler as EventListener);
                this.headerButtons.push(btn);
                if (actions) {
                    actions.insertBefore(btn, actions.firstChild);
                } else {
                    header.appendChild(btn);
                }
                setIcon(btn, "atom");
            }
        };
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) addBtn(view);
        const layoutChangeHandler = () => {
            this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
                if (leaf.view instanceof MarkdownView) {
                    addBtn(leaf.view);
                }
            });
        };
        this.registerEvent(this.app.workspace.on("layout-change", layoutChangeHandler));
    }

    cleanupHeaderButton(): void {
        this.headerButtons.forEach(btn => btn.remove());
        this.headerButtons = [];
        document.querySelectorAll(".markdown-next-ai-global-dialog-btn").forEach(el => el.remove());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        if (this.aiService) {
            this.aiService.updateSettings(this.settings);
        }
    }

    getAvailableModels(): { id: string; name: string; provider: string }[] {
        return Object.values(this.settings.models)
            .filter(model => model.enabled)
            .map(model => ({
                id: model.id,
                name: model.name,
                provider: model.provider
            }));
    }

    addCommands(): void {
        // 唤出AI对话框 - 改为 callback，手动获取编辑器和选中文本（模仿 FlowText）
        this.addCommand({
            id: "open-ai-popup",
            name: "唤出AI对话框",
            hotkeys: [{ modifiers: ["Alt"], key: "Q" }],
            callback: () => {
                try {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const selectedText = view?.editor?.getSelection() || "";
                    this.showAtTriggerModal(selectedText);
                    return true;
                } catch (error) {
                    console.error("唤出AI对话框命令执行错误:", error);
                    new Notice("命令执行失败");
                    return false;
                }
            }
        });

        // 全局对话框命令 - 保持 callback（已经是正确的方式）
        this.addCommand({
            id: "open-ai-popup-global",
            name: "唤出AI对话框（全局模式）",
            callback: () => {
                try {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const selectedText = view?.editor?.getSelection() || "";
                    this.showAtTriggerModal(selectedText);
                    return true;
                } catch (error) {
                    console.error("全局对话框命令执行错误:", error);
                    new Notice("命令执行失败: " + String(error));
                    return false;
                }
            }
        });

        this.addCommand({
            id: "add-selection-to-chat",
            name: "将选区添加到聊天",
            editorCallback: (editor: any, view: MarkdownView) => {
                try {
                    const selectedText = editor.getSelection() || "";
                    if (!selectedText || !String(selectedText).trim()) {
                        new Notice("请先选中文本");
                        return false;
                    }
                    this.showAtTriggerModal(String(selectedText), "chat");
                    return true;
                } catch (error) {
                    console.error("添加选区到聊天命令执行错误:", error);
                    new Notice("命令执行失败");
                    return false;
                }
            }
        });
    }

    updateEventListeners(): void {
        this.cleanupEventListeners();

        this.setupAtTriggerListener();

        this.setupPromptTriggerListener();
        this.setupRightClickListener();

        const mouseUpHandler = (e: MouseEvent) => {
            if (document.body.dataset.mnaiDraggingAtPopup === "1") return;

            // If mouseup happens inside our own UI (e.g. dragging popup header),
            // skip selection measurement to avoid extra layout work.
            const target = e.target as HTMLElement | null;
            if (target?.closest?.(
                ".markdown-next-ai-at-popup, .markdown-next-ai-result-floating-window, .markdown-next-ai-selection-toolbar"
            )) {
                return;
            }

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) {
                    this.lastMouseUpPosition = {
                        left: rect.right,
                        top: rect.top,
                        height: rect.height || 20
                    };
                }
            }
        };

        document.addEventListener("mouseup", mouseUpHandler);
        this.eventListeners.push({ element: document, event: "mouseup", handler: mouseUpHandler });
    }

    /**
     * Track the last active markdown editor view
     * This is useful for global mode when the sidebar is active
     */
    private setupLastActiveViewTracker(): void {
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (leaf?.view instanceof MarkdownView) {
                    this.lastActiveMarkdownView = leaf.view;
                }
            })
        );
    }

    /**
     * Get the last active markdown editor view
     * Falls back to current active view if not in sidebar mode
     */
    private getLastActiveMarkdownView(): MarkdownView | null {
        return this.getAnyMarkdownView();
    }

    /**
     * Find any available markdown view, preferring active, then last-active, then most recent leaf.
     */
    private getAnyMarkdownView(): MarkdownView | null {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) return activeView;

        if (this.lastActiveMarkdownView) return this.lastActiveMarkdownView;

        const recentLeaf = this.app.workspace.getMostRecentLeaf();
        if (recentLeaf?.view instanceof MarkdownView) {
            return recentLeaf.view;
        }

        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        if (markdownLeaves.length > 0 && markdownLeaves[0].view instanceof MarkdownView) {
            return markdownLeaves[0].view as MarkdownView;
        }

        return null;
    }

    public openApplyView(file: TFile, originalContent: string, newContent: string): void {
        const workspace = this.app.workspace;
        const leaf = workspace.getLeaf(true);
        leaf.setViewState({
            type: APPLY_VIEW_TYPE,
            state: { file, originalContent, newContent, ui: this.settings.applyView },
            active: true
        });
        workspace.setActiveLeaf(leaf, { focus: true });
    }

    setupRightClickListener(): void {
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                const selection = editor.getSelection();
                if (selection && selection.trim()) {
                    menu.addItem((item) => {
                        item
                            .setTitle("Markdown-Next-AI：修改所选内容")
                            .setIcon("atom")
                            .onClick(() => {
                                this.showAtTriggerModal(selection);
                            });
                    });
                }
            })
        );

        // 移除全局右键菜单逻辑
    }

    private isInEditor(el: HTMLElement): boolean {
        return !!(el.closest(".cm-editor") || el.closest(".markdown-source-view") || el.closest(".markdown-preview-view"));
    }

    // 删除全局右键菜单函数

    setupPromptTriggerListener(): void {
        // 原本的 # 触发逻辑已移除，改为在各组件内部独立处理
        // 以避免全局监听导致的冲突
    }

    setupGlobalKeyDomEvents(): void {
        this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.cancelAllAiTasks();
            }
        });
    }

    private cancelAllAiTasks(): void {
        try {
            this.tabCompletionController?.cancelRequest();
        } catch { }
        try {
            this.tabCompletionController?.clearTimer();
        } catch { }
        try {
            this.inlineSuggestionController?.clearInlineSuggestion();
        } catch { }
        try {
            this.closeLastAtTriggerPopup();
        } catch { }
        try {
            for (const c of Array.from(this.activeAbortControllers)) {
                try { c.abort(); } catch { }
            }
            this.activeAbortControllers.clear();
        } catch { }
    }

    showPromptSelectorModal(inputEl: HTMLElement): void {
        new PromptSelectorPopup(this.app, this, (content: string) => {
            if ((inputEl as any).contentEditable === "true") {
                const selection = window.getSelection();
                if (!selection || !selection.rangeCount) return;
                const range = selection.getRangeAt(0);

                const node = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent || "";
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
                const input = inputEl as HTMLInputElement | HTMLTextAreaElement;
                const cursorPos = input.selectionStart || 0;
                const text = input.value;
                const before = text.substring(0, cursorPos);
                const after = text.substring(cursorPos);

                const hashIndex = before.lastIndexOf("#");
                if (hashIndex !== -1) {
                    const newBefore = before.substring(0, hashIndex) + content;
                    input.value = newBefore + after;
                    input.selectionStart = input.selectionEnd = newBefore.length;
                    input.focus();
                }
            }
        }).open(inputEl);
    }

    setupAtTriggerListener(): void {
        const keydownHandler = (e: KeyboardEvent) => {
            const activeEl = document.activeElement as HTMLElement;
            if (activeEl && (activeEl.classList.contains("markdown-next-ai-modify-input") ||
                activeEl.classList.contains("markdown-next-ai-continue-input"))) {
                return;
            }

            // Remove manual key handling logic

            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.editor) return;
            if (this.settings.enableAtTrigger) {
                if (this.atTriggerTimeout) {
                    clearTimeout(this.atTriggerTimeout);
                    this.atTriggerTimeout = null;
                }
                this.atTriggerTimeout = setTimeout(() => {
                    const cursor = view.editor.getCursor();
                    const line = view.editor.getLine(cursor.line);
                    const textBefore = line.substring(0, cursor.ch);
                    const list = (this.settings.dialogTextTriggers || []).filter(x => x.enabled);
                    for (const tr of list) {
                        const p = tr.pattern || "";
                        if (!p) continue;
                        if (tr.type === "string") {
                            if (textBefore.endsWith(p)) {
                                this.showAtTriggerModal("", "chat", p);
                                this.atTriggerTimeout = null;
                                return;
                            }
                        } else if (tr.type === "regex") {
                            try {
                                const re = new RegExp(p);
                                const match = textBefore.match(re);
                                if (match) {
                                    // Use the full matched string as the trigger pattern to remove
                                    this.showAtTriggerModal("", "chat", match[0]);
                                    this.atTriggerTimeout = null;
                                    return;
                                }
                            } catch (_e) { }
                        }
                    }
                }, 500);
            }
        };

        document.addEventListener("keydown", keydownHandler);
        this.eventListeners.push({ element: document, event: "keydown", handler: keydownHandler });
    }

    cleanupEventListeners(): void {
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

    private closeLastAtTriggerPopup(): void {
        if (!this.lastAtTriggerPopup) return;
        try {
            this.lastAtTriggerPopup.close();
        } catch (e) {
            console.warn("[MarkdownNextAI] Failed to close last AtTriggerPopup:", e);
        } finally {
            this.lastAtTriggerPopup = null;
        }
    }

    showAtTriggerModal(selectedText: string = "", mode: string = "chat", triggerPattern: string = ""): void {

        // 防多开：打开新弹窗前先关闭旧弹窗
        this.closeLastAtTriggerPopup();

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const cursorPos = this.getCursorPosition(view) || this.lastMouseUpPosition || this.getFallbackPosition(view);

        if (!cursorPos) {
            new Notice("未找到可用的光标位置，请先点击文档区域");
            return;
        }

        const popup = new AtTriggerPopup(
            this.app,
            this,
            async (prompt: string, images: ImageData[], modelId: string, context: string, selectedText: string, md: string, onStatusUpdate?: (status: string) => void) => {
                await this.handleContinueWriting(prompt, images, modelId, context, selectedText, md, onStatusUpdate);
            }
        );

        if (triggerPattern) {
            popup.onCancel = () => {
                if (view && view.editor) {
                    const cursor = view.editor.getCursor();
                    const line = view.editor.getLine(cursor.line);
                    const textBefore = line.substring(0, cursor.ch);
                    if (textBefore.endsWith(triggerPattern)) {
                        view.editor.replaceRange("",
                            { line: cursor.line, ch: cursor.ch - triggerPattern.length },
                            { line: cursor.line, ch: cursor.ch }
                        );
                    }
                }
            };
        }

        this.lastAtTriggerPopup = popup;
        popup.open(cursorPos, selectedText, view);
    }

    showAtTriggerModalGlobal(selectedText: string = "", mode: string = "chat"): void {
        // 防多开：打开新弹窗前先关闭旧弹窗
        this.closeLastAtTriggerPopup();

        const view = this.getAnyMarkdownView();
        const pos = this.getFallbackPosition(view) || this.getFallbackPosition(null);
        const popup = new AtTriggerPopup(
            this.app,
            this,
            async (prompt: string, images: ImageData[], modelId: string, context: string, sel: string, md: string, onStatusUpdate?: (status: string) => void) => {
                const finalSel = sel || selectedText;
                await this.handleContinueWriting(prompt, images, modelId, context, finalSel, md, onStatusUpdate);
            }
        );
        this.lastAtTriggerPopup = popup;
        popup.open(pos!, selectedText, view || null);
    }

    getCursorPosition(view: MarkdownView | null = null): CursorPosition | null {
        const targetView = view ?? this.getAnyMarkdownView();
        const editor = targetView?.editor;

        // --- 场景 1：有选中文本 (执行你的混合定位逻辑) ---
        if (editor?.somethingSelected()) {
            // 1. 获取选区开头的位置 (用于 X 轴 / Left)
            // 'from' 永远是文档流靠前的位置，无论你鼠标是从左往右划还是从右往左划
            const startPos = editor.getCursor("from");
            const startCoords = (editor as any).coordsAtPos(startPos);

            // 2. 获取选区结尾的位置 (用于 Y 轴 / Top 和 Height)
            // 'to' 永远是文档流靠后的位置
            const endPos = editor.getCursor("to");
            const endCoords = (editor as any).coordsAtPos(endPos);

            if (startCoords && endCoords) {
                return {
                    // 【关键修改】横坐标：取自“选区开头”
                    left: startCoords.left,

                    // 【关键修改】纵坐标：取自“选区结尾”
                    // 这样弹窗会出现在最后一行的下方
                    top: endCoords.top,

                    // 高度：取自“选区结尾”这一行的高度，保证弹窗紧贴行底
                    height: endCoords.bottom - endCoords.top
                };
            }
        }

        // 2. 场景：没有选中文本（后续逻辑保持不变）
        try {
            const editorEl = targetView?.containerEl.querySelector(".cm-editor");

            const cursor = editor?.getCursor();
            const coords = cursor ? (editor as any).coordsAtPos(cursor) : null;

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

            if (this.lastMouseUpPosition) {
                return { ...this.lastMouseUpPosition };
            }

            const editorRect = editorEl?.getBoundingClientRect();
            if (editorRect) {
                return {
                    left: editorRect.left + 50,
                    top: editorRect.top + 50,
                    height: 20
                };
            }

            const containerRect = targetView?.containerEl?.getBoundingClientRect();
            if (containerRect) {
                return {
                    left: containerRect.left + containerRect.width / 2,
                    top: containerRect.top + containerRect.height / 3,
                    height: 20
                };
            }

            return {
                left: window.innerWidth / 2,
                top: window.innerHeight / 3,
                height: 20
            };
        } catch (error) {
            console.error("获取光标位置失败:", error);
            return null;
        }
    }

    private getFallbackPosition(view: MarkdownView | null): CursorPosition | null {
        if (view && view.containerEl) {
            const rect = view.containerEl.getBoundingClientRect();
            return {
                left: rect.left + rect.width / 2,
                top: rect.top + rect.height / 3,
                height: 20
            };
        }

        return {
            left: window.innerWidth / 2,
            top: window.innerHeight / 3,
            height: 20
        };
    }

    // handleContinueWritingGlobal removed
    // insertGeneratedContent removed as it was only used by global mode

    async handleContinueWriting(
        prompt: string = "",
        images: ImageData[] = [],
        modelId: string | null = null,
        context: string | null = null,
        selectedText: string = "",
        mode: string = "chat",
        onStatusUpdate?: (status: string) => void
    ): Promise<void> {
        // 编辑器模式：不使用浮窗确认，按预览+差异视图流程处理

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.editor) {
            new Notice("请在Markdown编辑器中使用此功能");
            return;
        }

        // 如果没有任何输入（文字、图片、上下文），则打开输入框
        if (!prompt && images.length === 0 && !context && !selectedText) {
            this.showAtTriggerModal("", mode);
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

        const isModification = selectedText.length > 0;
        const insertPos = isModification ? editor.getCursor("from") : { line: cursor.line, ch: cursor.ch };
        let finalContent = "";

        if (onStatusUpdate) {
            onStatusUpdate("正在思考中");
        } else {
            new Notice("正在思考中...");
        }

        let controller: AbortController | null = null;
        try {
            controller = new AbortController();
            this.activeAbortControllers.add(controller);
            const result = await this.aiService.sendRequest(
                mode,
                {
                    selectedText: selectedText,
                    beforeText: editor.getValue().substring(0, editor.posToOffset(insertPos)),
                    afterText: "",
                    cursorPosition: cursor,
                    additionalContext: context || undefined
                },
                prompt,
                images,
                [],
                (streamData) => {
                    if (streamData.content != null) {
                        finalContent = streamData.content;
                        const statusText = `正在生成中(${streamData.content.length}字)`;
                        if (onStatusUpdate) {
                            onStatusUpdate(statusText);
                        }
                    }
                },
                controller ? controller.signal : undefined
            );
            if (!finalContent && result && result.content) {
                finalContent = result.content;
            }
            const responseText = finalContent || "";
            if (responseText.trim()) {
                // History recording removed
            }
            // 生成内容为空时，避免打开空的 Apply View
            if (!finalContent || finalContent.trim().length === 0) {
                if (previewPopup) previewPopup.close();
                new Notice("生成结果为空，已取消打开差异视图");
                return;
            }

            const originalDoc = editor.getValue();
            const newDoc = (() => {
                if (isModification) {
                    const from = editor.getCursor("from");
                    const to = editor.getCursor("to");
                    const fromOffset = editor.posToOffset(from);
                    const toOffset = editor.posToOffset(to);
                    return originalDoc.slice(0, fromOffset) + (finalContent || selectedText) + originalDoc.slice(toOffset);
                } else {
                    const offset = editor.posToOffset(insertPos);
                    return originalDoc.slice(0, offset) + (finalContent || "") + originalDoc.slice(offset);
                }
            })();

            // Logic Branching based on mode
            if (mode === 'edit-direct') {
                if (this.settings.confirmBeforeDirectApply) {
                    this.openApplyView(view.file!, originalDoc, newDoc);
                } else {
                    editor.operation(() => {
                        if (isModification) {
                            editor.replaceSelection(finalContent);
                        } else {
                            editor.replaceRange(finalContent, insertPos);
                        }
                    });
                    new Notice("已直接应用修改");
                }
            } else {
                // Default / Edit / Ask: Open Apply View for confirmation
                this.openApplyView(view.file!, originalDoc, newDoc);
            }
        } catch (error: any) {
            new Notice("续写失败: " + error.message);
            // Re-throw error so AtTriggerPopup knows it failed and can restore its UI
            throw error;
        } finally {
            if (controller) this.activeAbortControllers.delete(controller);
        }
    }

    // History recording removed
}
