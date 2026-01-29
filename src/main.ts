import { MarkdownView, Menu, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import { AIService } from "./services";
import { GlobalRuleManager } from "./services/rule-manager";
import { MarkdownNextAISettingTab } from "./settings";
import type { CursorPosition, ImageData, PluginSettings } from "./types";
import { AIPreviewPopup, AIResultFloatingWindow, AtTriggerPopup, PromptSelectorPopup, SelectionManager, SelectionToolbar } from "./ui";

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

    // Add a global variable to store the last mouseup position
    private lastMouseUpPosition: CursorPosition | null = null;

    // Track the last active markdown editor (for global mode when sidebar is active)
    private lastActiveMarkdownView: MarkdownView | null = null;

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

        // 追踪最后活跃的编辑器视图
        this.setupLastActiveViewTracker();

        console.log("MarkdownNext AI 插件已加载");
    }

    onunload(): void {
        this.selectionManager?.destroy();
        this.selectionToolbar?.destroy();
        this.cleanupEventListeners();
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

        if (!Array.isArray(this.settings.conversationHistory)) {
            this.settings.conversationHistory = [];
        }
        if (!this.settings.conversationHistoryLimit || this.settings.conversationHistoryLimit <= 0) {
            this.settings.conversationHistoryLimit = DEFAULT_SETTINGS.conversationHistoryLimit;
        }
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
            hotkeys: [{ modifiers: ["Alt"], key: "v" }],
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
            hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "m" }],
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

    setupRightClickListener(): void {
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                const selection = editor.getSelection();
                if (selection && selection.trim()) {
                    menu.addItem((item) => {
                        item
                            .setTitle("Markdown-Next-AI：修改所选内容")
                            .setIcon("bot")
                            .onClick(() => {
                                this.showAtTriggerModal(selection);
                            });
                    });
                }
            })
        );

        // 全局模式：在非编辑器区域也能触发右键菜单
        if (this.settings.enableGlobalDialog) {
            document.addEventListener("contextmenu", (event: MouseEvent) => {
                const selection = window.getSelection()?.toString().trim() || "";

                // 只在编辑器外部的选中文本上显示菜单
                if (selection && !this.isInEditor(event.target as HTMLElement)) {
                    // 显示自定义上下文菜单
                    this.showGlobalContextMenu(selection, event);
                }
            }, true);
        }
    }

    private isInEditor(el: HTMLElement): boolean {
        return !!(el.closest(".cm-editor") || el.closest(".markdown-source-view") || el.closest(".markdown-preview-view"));
    }

    private showGlobalContextMenu(selectedText: string, event: MouseEvent): void {
        const menu = new Menu();
        menu.addItem((item) => {
            item
                .setTitle("Markdown-Next-AI：修改所选内容")
                .setIcon("bot")
                .onClick(() => {
                    this.showAtTriggerModalGlobal(selectedText);
                });
        });
        menu.showAtPosition({
            x: event.clientX,
            y: event.clientY
        });
    }

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

        new AtTriggerPopup(
            this.app,
            (prompt: string, images: ImageData[], modelId: string, context: string, selectedText: string, mode: string) => {
                this.handleContinueWriting(prompt, images, modelId, context, selectedText, mode);
            },
            cursorPos,
            this,
            view,
            selectedText,
            mode
        ).open();
    }

    showAtTriggerModalGlobal(selectedText: string = "", mode: string = "chat"): void {
        console.log("[markdown-next-ai] 进入 showAtTriggerModalGlobal");

        // 无需依赖 Markdown 编辑器，直接使用当前屏幕中心作为定位
        const fallbackPos = this.getFallbackPosition(null);
        console.log("[markdown-next-ai] fallbackPos:", fallbackPos);

        const mergedSelection = selectedText || window.getSelection()?.toString().trim() || "";

        console.log("[markdown-next-ai] 正在创建 AtTriggerPopup (全局模式，无需编辑器)");
        new AtTriggerPopup(
            this.app,
            (prompt: string, images: ImageData[], modelId: string, context: string, sel: string, mode: string) => {
                const finalSel = sel || mergedSelection;
                if (this.settings.useFloatingPreview) {
                    this.handleContinueWritingGlobal(prompt, images, modelId, context, finalSel, mode);
                } else {
                    this.handleContinueWriting(prompt, images, modelId, context, finalSel, mode);
                }
            },
            fallbackPos,
            this,
            null,
            mergedSelection,
            mode
        ).open();
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

            // 记录对话
            await this.recordConversation({
                prompt,
                response: streamedContent,
                modelId: modelId || this.settings.currentModel,
                selectedText,
                contextSnippet: context || undefined
            });

        } catch (error: any) {
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
            navigator.clipboard.writeText(content);
            new Notice("无可用编辑器，内容已复制到剪贴板");
            return;
        }

        const editor = view.editor;
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
        // 如果启用了浮窗预览模式，转为全局模式处理
        if (this.settings.useFloatingPreview) {
            return this.handleContinueWritingGlobal(prompt, images, modelId, context, selectedText, mode);
        }

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
        // 记录插入起始位置 (如果是修改模式，使用选区开头)
        const insertPos = isModification ? editor.getCursor("from") : { line: cursor.line, ch: cursor.ch };

        // 用<span>包裹AI输出，实现绿色背景；修改模式下还用橙色背景包裹原文（无删除线）
        const previewId = "markdown-next-ai-preview-" + Date.now();
        const originalId = "markdown-next-ai-original-" + Date.now();
        const greenOpenTag = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
        // 修改为暖橙色背景，移除删除线，添加底部边框以示聚焦
        const redOpenTag = `<span style="background:#FFF3E0;border-bottom: 2px solid #FFB74D;" data-original-id="${originalId}">`;
        const closingTag = "</span>";

        // 插入/替换标签
        if (isModification) {
            // 修改模式：橙色背景包裹原文 + 绿色背景用于AI生成内容
            const combinedTags = `${redOpenTag}${selectedText}${closingTag}${greenOpenTag}${closingTag}`;
            editor.replaceSelection(combinedTags);
        } else {
            // 续写模式：只有绿色背景
            editor.replaceRange(`${greenOpenTag}${closingTag}`, insertPos);
        }

        // 计算内容区域的偏移量
        let startOffset: number;
        if (isModification) {
            // 修改模式：AI内容插入在红色span之后的绿色span内
            startOffset = editor.posToOffset(insertPos) + redOpenTag.length + selectedText.length + closingTag.length + greenOpenTag.length;
        } else {
            startOffset = editor.posToOffset(insertPos) + greenOpenTag.length;
        }
        let currentContentLength = 0;
        let hasStarted = false;
        let finalContent = "";

        // 获取光标的屏幕坐标（用于定位弹窗）
        const cursorCoords = (editor as any).coordsAtPos(insertPos);
        const initialCursorPos = cursorCoords ? { left: cursorCoords.left, top: cursorCoords.top } : null;

        // 创建并显示预览弹窗
        const previewPopup = new AIPreviewPopup(
            this.app,
            editor,
            view,
            () => {
                // 替换（原接受）：删除橙色span及其内容（原文），移除绿色span标签但保留内容（AI生成）
                const docText = editor.getValue();
                const greenOpenTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
                const redOpenTagStr = `<span style="background:#FFF3E0;border-bottom: 2px solid #FFB74D;" data-original-id="${originalId}">`;

                if (isModification) {
                    // 修改模式：先处理绿色span，再处理橙色span
                    // 1. 找到并移除绿色span标签（保留内容）
                    let currentDoc = editor.getValue();
                    const greenStart = currentDoc.indexOf(greenOpenTagStr);
                    if (greenStart !== -1) {
                        const greenOpenEnd = greenStart + greenOpenTagStr.length;
                        // 找到对应的闭合标签（绿色span后的第一个</span>）
                        const greenCloseStart = currentDoc.indexOf(closingTag, greenOpenEnd);
                        if (greenCloseStart !== -1) {
                            const greenCloseEnd = greenCloseStart + closingTag.length;
                            // 先删除闭合标签
                            editor.replaceRange("", editor.offsetToPos(greenCloseStart), editor.offsetToPos(greenCloseEnd));
                            // 再删除开始标签
                            editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenOpenEnd));
                        }
                    }

                    // 2. 找到并删除橙色span及其内容（整个删除）
                    currentDoc = editor.getValue();
                    const redStart = currentDoc.indexOf(redOpenTagStr);
                    if (redStart !== -1) {
                        const redOpenEnd = redStart + redOpenTagStr.length;
                        const redCloseStart = currentDoc.indexOf(closingTag, redOpenEnd);
                        if (redCloseStart !== -1) {
                            const redCloseEnd = redCloseStart + closingTag.length;
                            editor.replaceRange("", editor.offsetToPos(redStart), editor.offsetToPos(redCloseEnd));
                            editor.setCursor(editor.offsetToPos(redStart));
                        }
                    }
                } else {
                    // 续写模式：只移除绿色span标签
                    const greenStart = docText.indexOf(greenOpenTagStr);
                    if (greenStart !== -1) {
                        const greenOpenEnd = greenStart + greenOpenTagStr.length;
                        const greenCloseStart = docText.indexOf(closingTag, greenOpenEnd);
                        if (greenCloseStart !== -1) {
                            const greenCloseEnd = greenCloseStart + closingTag.length;
                            editor.replaceRange("", editor.offsetToPos(greenCloseStart), editor.offsetToPos(greenCloseEnd));
                            editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenOpenEnd));
                            const contentEndOffset = greenCloseStart - greenOpenTagStr.length;
                            editor.setCursor(editor.offsetToPos(contentEndOffset));
                        }
                    }
                }
                new Notice("已替换原文");
            },
            () => {
                // 放弃（原拒绝）：删除绿色span及其内容（AI生成），移除橙色span标签但保留内容（原文）
                const docText = editor.getValue();
                const greenOpenTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
                const redOpenTagStr = `<span style="background:#FFF3E0;border-bottom: 2px solid #FFB74D;" data-original-id="${originalId}">`;

                if (isModification) {
                    // 修改模式：先删除绿色span及其内容，再移除橙色span标签
                    // 1. 删除绿色span及其内容
                    let currentDoc = editor.getValue();
                    const greenStart = currentDoc.indexOf(greenOpenTagStr);
                    if (greenStart !== -1) {
                        const greenOpenEnd = greenStart + greenOpenTagStr.length;
                        const greenCloseStart = currentDoc.indexOf(closingTag, greenOpenEnd);
                        if (greenCloseStart !== -1) {
                            const greenCloseEnd = greenCloseStart + closingTag.length;
                            editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenCloseEnd));
                        }
                    }

                    // 2. 移除橙色span标签（保留内容）
                    currentDoc = editor.getValue();
                    const redStart = currentDoc.indexOf(redOpenTagStr);
                    if (redStart !== -1) {
                        const redOpenEnd = redStart + redOpenTagStr.length;
                        const redCloseStart = currentDoc.indexOf(closingTag, redOpenEnd);
                        if (redCloseStart !== -1) {
                            const redCloseEnd = redCloseStart + closingTag.length;
                            // 先删除闭合标签
                            editor.replaceRange("", editor.offsetToPos(redCloseStart), editor.offsetToPos(redCloseEnd));
                            // 再删除开始标签
                            editor.replaceRange("", editor.offsetToPos(redStart), editor.offsetToPos(redOpenEnd));
                            editor.setCursor(editor.offsetToPos(redStart));
                        }
                    }
                } else {
                    // 续写模式：删除绿色span及其内容
                    const greenStart = docText.indexOf(greenOpenTagStr);
                    if (greenStart !== -1) {
                        const greenOpenEnd = greenStart + greenOpenTagStr.length;
                        const greenCloseStart = docText.indexOf(closingTag, greenOpenEnd);
                        if (greenCloseStart !== -1) {
                            const greenCloseEnd = greenCloseStart + closingTag.length;
                            editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenCloseEnd));
                            editor.setCursor(editor.offsetToPos(greenStart));
                        }
                    }
                }
                new Notice("已放弃生成");
            },
            // 追加（新增）：移除橙色span标签（保留原文），移除绿色span标签（保留AI生成）
            isModification ? () => {
                const greenOpenTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
                const redOpenTagStr = `<span style="background:#FFF3E0;border-bottom: 2px solid #FFB74D;" data-original-id="${originalId}">`;

                // 1. 移除绿色span标签（保留内容）
                let currentDoc = editor.getValue();
                const greenStart = currentDoc.indexOf(greenOpenTagStr);
                if (greenStart !== -1) {
                    const greenOpenEnd = greenStart + greenOpenTagStr.length;
                    const greenCloseStart = currentDoc.indexOf(closingTag, greenOpenEnd);
                    if (greenCloseStart !== -1) {
                        const greenCloseEnd = greenCloseStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(greenCloseStart), editor.offsetToPos(greenCloseEnd));
                        editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenOpenEnd));
                    }
                }

                // 2. 移除橙色span标签（保留内容）
                currentDoc = editor.getValue();
                const redStart = currentDoc.indexOf(redOpenTagStr);
                if (redStart !== -1) {
                    const redOpenEnd = redStart + redOpenTagStr.length;
                    const redCloseStart = currentDoc.indexOf(closingTag, redOpenEnd);
                    if (redCloseStart !== -1) {
                        const redCloseEnd = redCloseStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(redCloseStart), editor.offsetToPos(redCloseEnd));
                        editor.replaceRange("", editor.offsetToPos(redStart), editor.offsetToPos(redOpenEnd));
                    }
                }
                new Notice("已追加内容");
            } : null
        );
        previewPopup.open(initialCursorPos);

        try {
            const result = await this.aiService.sendRequest(mode, {
                selectedText: selectedText,
                beforeText: editor.getValue().substring(0, editor.posToOffset(insertPos)),
                afterText: "",
                cursorPosition: cursor,
                additionalContext: context || undefined
            }, prompt, images, [], (streamData) => {
                if (streamData.content != null) {
                    const contentStartPos = editor.offsetToPos(startOffset);
                    const contentEndPos = editor.offsetToPos(startOffset + currentContentLength);
                    editor.replaceRange(streamData.content, contentStartPos, contentEndPos);

                    currentContentLength = streamData.content.length;
                    finalContent = streamData.content;
                    const newCursorPos = editor.offsetToPos(startOffset + currentContentLength);
                    editor.setCursor(newCursorPos);
                    hasStarted = true;

                    previewPopup.updateStatus(`正在生成中(${currentContentLength}字)`);
                }

                if (streamData.isComplete) {
                    previewPopup.showActions();
                    // 使用生成内容的末尾位置来定位弹窗
                    const endPos = editor.offsetToPos(startOffset + currentContentLength);
                    const endCoords = (editor as any).coordsAtPos(endPos);
                    if (endCoords) {
                        // 优先显示在下方，符合阅读顺序
                        previewPopup.positionAt(endCoords.left, endCoords.bottom, "below");
                    }
                }
            });

            if (!hasStarted && result && result.content) {
                const contentStartPos = editor.offsetToPos(startOffset);
                const contentEndPos = editor.offsetToPos(startOffset + currentContentLength);
                editor.replaceRange(result.content, contentStartPos, contentEndPos);
                currentContentLength = result.content.length;
                finalContent = result.content;
                const newCursorPos = editor.offsetToPos(startOffset + currentContentLength);
                editor.setCursor(newCursorPos);

                previewPopup.showActions();
                // 使用生成内容的末尾位置来定位弹窗
                const endPos = editor.offsetToPos(startOffset + currentContentLength);
                const endCoords = (editor as any).coordsAtPos(endPos);
                if (endCoords) {
                    previewPopup.positionAt(endCoords.left, endCoords.bottom, "below");
                }
            }

            const responseText = finalContent || (result && result.content) || "";
            if (responseText.trim()) {
                const contextForHistory = context || "";
                await this.recordConversation({
                    prompt,
                    response: responseText,
                    modelId: modelId || this.settings.currentModel,
                    contextSnippet: contextForHistory,
                    selectedText
                });
            }
        } catch (error: any) {
            // 错误处理：恢复原始状态
            const greenOpenTagStr = `<span style="background:#90EE90;" data-preview-id="${previewId}">`;
            const redOpenTagStr = `<span style="background:#FFCCCB;text-decoration:line-through;" data-original-id="${originalId}">`;

            if (isModification) {
                // 修改模式：删除两个span，恢复原文
                let currentDoc = editor.getValue();
                // 1. 删除绿色span及其内容
                const greenStart = currentDoc.indexOf(greenOpenTagStr);
                if (greenStart !== -1) {
                    const greenOpenEnd = greenStart + greenOpenTagStr.length;
                    const greenCloseStart = currentDoc.indexOf(closingTag, greenOpenEnd);
                    if (greenCloseStart !== -1) {
                        const greenCloseEnd = greenCloseStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenCloseEnd));
                    }
                }
                // 2. 移除红色span标签（保留原文内容）
                currentDoc = editor.getValue();
                const redStart = currentDoc.indexOf(redOpenTagStr);
                if (redStart !== -1) {
                    const redOpenEnd = redStart + redOpenTagStr.length;
                    const redCloseStart = currentDoc.indexOf(closingTag, redOpenEnd);
                    if (redCloseStart !== -1) {
                        const redCloseEnd = redCloseStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(redCloseStart), editor.offsetToPos(redCloseEnd));
                        editor.replaceRange("", editor.offsetToPos(redStart), editor.offsetToPos(redOpenEnd));
                    }
                }
            } else {
                // 续写模式：删除绿色span及其内容
                const docText = editor.getValue();
                const greenStart = docText.indexOf(greenOpenTagStr);
                if (greenStart !== -1) {
                    const greenOpenEnd = greenStart + greenOpenTagStr.length;
                    const greenCloseStart = docText.indexOf(closingTag, greenOpenEnd);
                    if (greenCloseStart !== -1) {
                        const greenCloseEnd = greenCloseStart + closingTag.length;
                        editor.replaceRange("", editor.offsetToPos(greenStart), editor.offsetToPos(greenCloseEnd));
                    }
                }
            }
            editor.setCursor(insertPos);
            previewPopup.close();
            new Notice("续写失败: " + error.message);
        }
    }

    private async recordConversation(entry: { prompt: string; response: string; modelId: string; contextSnippet?: string; selectedText?: string }): Promise<void> {
        if (!this.settings.conversationHistory) {
            this.settings.conversationHistory = [];
        }

        const limit = this.settings.conversationHistoryLimit || DEFAULT_SETTINGS.conversationHistoryLimit || 50;
        const trimmedContext = (entry.contextSnippet || "").slice(0, 4000);
        const newEntry = {
            id: `conv-${Date.now()}`,
            timestamp: Date.now(),
            ...entry,
            contextSnippet: trimmedContext
        };

        this.settings.conversationHistory.push(newEntry);

        if (this.settings.conversationHistory.length > limit) {
            this.settings.conversationHistory = this.settings.conversationHistory.slice(-limit);
        }

        await this.saveSettings();
    }
}
