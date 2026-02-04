import { MarkdownView, Notice, Plugin, TFile, setIcon } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import { AIService } from "./services";
import { GlobalRuleManager } from "./services/rule-manager";
import { MarkdownNextAISettingTab } from "./settings";
import type { CursorPosition, ImageData, PluginSettings } from "./types";
import { AIPreviewPopup, AIResultFloatingWindow, AtTriggerPopup, PromptSelectorPopup, SelectionManager, SelectionToolbar } from "./ui";
import { APPLY_VIEW_TYPE, ApplyView } from "./ui/apply-view/ApplyView";

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
    selectionManager!: SelectionManager;
    selectionToolbar!: SelectionToolbar;
    private eventListeners: EventListenerEntry[] = [];
    private atTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastAtTriggerPopup: AtTriggerPopup | null = null;

    // Add a global variable to store the last mouseup position
    private lastMouseUpPosition: CursorPosition | null = null;

    // Track the last active markdown editor (for global mode when sidebar is active)
    private lastActiveMarkdownView: MarkdownView | null = null;
    private headerButtons: HTMLElement[] = [];
    private headerButtonListeners: Array<{ element: HTMLElement | any; event: string; handler: any }> = [];

    async onload(): Promise<void> {
        await this.loadSettings();

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

        this.addSettingTab(new MarkdownNextAISettingTab(this.app, this));
        this.addCommands();
        this.updateEventListeners();
        this.setupHeaderButton();

        // 追踪最后活跃的编辑器视图
        this.setupLastActiveViewTracker();

        console.log("MarkdownNext AI 插件已加载");
        this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf));
    }

    onunload(): void {
        this.selectionManager?.destroy();
        this.selectionToolbar?.destroy();
        this.cleanupEventListeners();
        this.cleanupHeaderButton();
        console.log("MarkdownNext AI 插件已卸载");
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
            callback: () => {
                try {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view || !view.editor) {
                        // 如果没有活跃编辑器，尝试全局模式
                        this.showAtTriggerModalGlobal("");
                        return true;
                    }
                    const selectedText = view.editor.getSelection() || "";
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
                    console.log("[markdown-next-ai] 执行全局对话框命令");
                    const globalSelection = window.getSelection()?.toString().trim() || "";
                    this.showAtTriggerModalGlobal(globalSelection);
                    console.log("[markdown-next-ai] 全局对话框已打开");
                    return true;
                } catch (error) {
                    console.error("全局对话框命令执行错误:", error);
                    new Notice("命令执行失败: " + String(error));
                    return false;
                }
            }
        });
    }

    updateEventListeners(): void {
        this.cleanupEventListeners();

        if (this.settings.enableAtTrigger) {
            this.setupAtTriggerListener();
        }

        this.setupPromptTriggerListener();
        this.setupRightClickListener();

        const mouseUpHandler = (e: MouseEvent) => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
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

    private openApplyView(file: TFile, originalContent: string, newContent: string): void {
        const workspace = this.app.workspace;
        const leaf = workspace.getLeaf(true);
        leaf.setViewState({
            type: APPLY_VIEW_TYPE,
            state: { file, originalContent, newContent },
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
            // @ 或 &
            if (e.key === "@" || (e.shiftKey && e.key === "2") ||
                e.key === "&" || (e.shiftKey && e.key === "7")) {

                const activeEl = document.activeElement as HTMLElement;
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

    showAtTriggerModal(selectedText: string = "", mode: string = "chat"): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const cursorPos = this.getCursorPosition(view) || this.lastMouseUpPosition || this.getFallbackPosition(view);

        if (!cursorPos) {
            new Notice("未找到可用的光标位置，请先点击文档区域");
            return;
        }

        const popup = new AtTriggerPopup(
            this.app,
            (prompt: string, images: ImageData[], modelId: string, context: string, selectedText: string, mode: string) => {
                this.handleContinueWriting(prompt, images, modelId, context, selectedText, mode);
            },
            cursorPos,
            this,
            view,
            selectedText,
            mode
        );
        this.lastAtTriggerPopup = popup;
        popup.open();
    }

    showAtTriggerModalGlobal(selectedText: string = "", mode: string = "chat"): void {
        console.log("[markdown-next-ai] 进入 showAtTriggerModalGlobal");

        // 无需依赖 Markdown 编辑器，直接使用当前屏幕中心作为定位
        console.log("[markdown-next-ai] 正在创建 AtTriggerPopup (全局模式，无需编辑器)");

        const fallbackPos = this.getFallbackPosition(null);
        const mergedSelection = selectedText || window.getSelection()?.toString().trim() || "";

        const popup = new AtTriggerPopup(
            this.app,
            (prompt: string, images: ImageData[], modelId: string, context: string, sel: string, mode: string) => {
                const finalSel = sel || mergedSelection;
                this.handleContinueWritingGlobal(prompt, images, modelId, context, finalSel, mode);
            },
            fallbackPos,
            this,
            null,
            mergedSelection,
            mode
        );

        this.lastAtTriggerPopup = popup;
        popup.open();
        console.log("[markdown-next-ai] AtTriggerPopup 已打开");
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

    async handleContinueWritingGlobal(
        prompt: string = "",
        images: ImageData[] = [],
        modelId: string | null = null,
        context: string | null = null,
        selectedText: string = "",
        mode: string = "chat"
    ): Promise<void> {
        const view = this.getAnyMarkdownView();

        // 验证有输入
        if (!prompt && images.length === 0 && !context && !selectedText) {
            new Notice("请输入续写要求或上传图片");
            return;
        }

        // 生成时的数据缓存（不写入编辑器）
        let streamedContent = "";
        const resultWindowPos = this.getCursorPosition(view) || this.getFallbackPosition(view);

        // 创建结果浮窗（初始状态）
        const resultWindow = new AIResultFloatingWindow(
            this.app,
            view || null,
            modelId || this.settings.currentModel,
            resultWindowPos
        );
        resultWindow.open();
        resultWindow.updateStatus("正在思考中");

        try {
            const beforeText = view?.editor
                ? view.editor.getValue().substring(0, view.editor.posToOffset(view.editor.getCursor()))
                : "";
            const cursorPos = view?.editor?.getCursor() || { line: 0, ch: 0 };

            const result = await this.aiService.sendRequest(
                mode,
                {
                    selectedText,
                    beforeText,
                    afterText: "",
                    cursorPosition: cursorPos,
                    additionalContext: context || undefined
                },
                prompt,
                images,
                [],
                (streamData) => {
                    if (streamData.content != null) {
                        streamedContent = streamData.content;
                        resultWindow.updateContent(streamedContent);
                        resultWindow.updateStatus(`正在生成中(${streamData.content.length}字)`);
                    }
                    if (streamData.isComplete) {
                        resultWindow.showActions();
                        void resultWindow.renderMarkdown(streamedContent);
                    }
                }
            );

            if (!streamedContent && result?.content) {
                streamedContent = result.content;
                resultWindow.updateContent(streamedContent);
                resultWindow.showActions();
                void resultWindow.renderMarkdown(streamedContent);
            }

            // 设置结果窗的回调
            resultWindow.setOnInsert(() => {
                this.insertGeneratedContent(view || null, "insert", streamedContent, selectedText);
                resultWindow.close();
            });
            resultWindow.setOnReplace(() => {
                this.insertGeneratedContent(view || null, "replace", streamedContent, selectedText);
                resultWindow.close();
            });
            resultWindow.setOnCopy(() => {
                navigator.clipboard.writeText(streamedContent);
                new Notice("已复制到剪贴板");
            });

            // 记录对话 - 已移除
            /*
            await this.recordConversation({
                prompt,
                response: streamedContent,
                modelId: modelId || this.settings.currentModel,
                selectedText,
                contextSnippet: context || undefined
            });
            */

        } catch (error: any) {
            if (this.lastAtTriggerPopup) {
                this.lastAtTriggerPopup.updateAssistantStreaming(streamData.content || "", !!streamData.isComplete);
            }
            resultWindow.showError(`生成失败: ${error.message}`);
            console.error("全局对话生成失败", error);
        }
    }

    private async insertGeneratedContent(
        view: MarkdownView | null,
        action: "insert" | "replace" | "copy",
        content: string,
        selectedText: string
    ): Promise<void> {
        if (!view || !view.editor) {
            new Notice("请先聚焦编辑器");
            return;
        }

        const editor = view.editor;
        const activeEl = document.activeElement as HTMLElement | null;
        if (action === "insert") {
            if (!activeEl || !this.isInEditor(activeEl)) {
                new Notice("请先聚焦编辑器");
                return;
            }
        }
        if (action === "replace") {
            if (!activeEl || !this.isInEditor(activeEl)) {
                new Notice("请先聚焦编辑器");
                return;
            }
        }
        const isModification = selectedText.length > 0 && action === "replace";

        try {
            if (isModification) {
                // 替换模式：替换当前选区
                editor.replaceSelection(content);
            } else {
                // 插入模式：在光标处插入
                const cursor = editor.getCursor();
                editor.replaceRange(content, cursor);
            }

            new Notice("内容已插入");

            // 记住用户选择
            this.settings.lastInsertAction = action;
            await this.saveSettings();
        } catch (error: any) {
            new Notice(`插入失败: ${error.message}`);
            console.error("插入内容失败", error);
        }
    }

    async handleContinueWriting(
        prompt: string = "",
        images: ImageData[] = [],
        modelId: string | null = null,
        context: string | null = null,
        selectedText: string = "",
        mode: string = "chat"
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
        // 恢复“正在思考中”状态框，仅显示状态，不显示确认按钮
        const cursorPos = this.getCursorPosition(view) || this.lastMouseUpPosition || this.getFallbackPosition(view);
        const previewPopup = new AIPreviewPopup(
            this.app,
            editor,
            view,
            () => { },
            () => { },
            null
        );
        previewPopup.open(cursorPos);
        previewPopup.updateStatus("正在思考中");
        try {
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
                        previewPopup.updateStatus(`正在生成中(${streamData.content.length}字)`);
                    }
                }
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
                previewPopup.close();
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
                if (this.lastAtTriggerPopup) {
                    this.lastAtTriggerPopup.updateAssistantStreaming(streamData.content || "", !!streamData.isComplete);
                }
            })();
            previewPopup.close();
            this.openApplyView(view.file!, originalDoc, newDoc);
        } catch (error: any) {
            previewPopup.close();
            new Notice("续写失败: " + error.message);
        }
    }

    // History recording removed
}
