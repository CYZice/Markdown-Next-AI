import { App, Component, MarkdownRenderer, MarkdownView } from "obsidian";
import type { CursorPosition } from "../types";

/**
 * AI 生成结果浮窗
 * 显示 AI 生成的内容，提供插入/替换/复制操作
 */
export class AIResultFloatingWindow {
    private app: App;
    private view: MarkdownView | null;
    private modelId: string;
    private position: CursorPosition | null;
    private popupEl: HTMLElement | null = null;
    private isOpen: boolean = false;
    private isDragging: boolean = false;
    private markdownComponent: Component | null = null;
    private onInsertCallback: (() => void) | null = null;
    private onReplaceCallback: (() => void) | null = null;
    private onCopyCallback: (() => void) | null = null;
    private onCancelCallback: (() => void) | null = null;

    constructor(
        app: App,
        view: MarkdownView | null,
        modelId: string,
        position: CursorPosition | null
    ) {
        this.app = app;
        this.view = view;
        this.modelId = modelId;
        this.position = position;
    }

    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-result-floating-window");

        this.popupEl.innerHTML = `
            <div class="result-header">
                <div class="result-header-left">
                    <span class="model-info">模型: ${this.modelId}</span>
                    <span class="char-count">0 字</span>
                </div>
                <button class="result-close-btn">✕</button>
            </div>
            <div class="result-status thinking">
                <span class="status-dot"></span>
                <span class="status-text">正在思考中</span>
            </div>
            <div class="result-content markdown-preview-view markdown-rendered"></div>
            <div class="result-actions" style="display: none;">
                <button class="btn-insert" title="在光标处插入">插入</button>
                <button class="btn-replace" title="替换选中文本">替换</button>
                <button class="btn-copy" title="复制到剪贴板">复制</button>
                <button class="btn-cancel" title="取消">取消</button>
            </div>
        `;

        document.body.appendChild(this.popupEl);

        // 设置位置
        if (this.position) {
            this.popupEl.style.position = "fixed";
            this.popupEl.style.left = this.position.left + "px";
            this.popupEl.style.top = (this.position.top + (this.position.height || 20) + 10) + "px";
        } else {
            this.popupEl.style.position = "fixed";
            this.popupEl.style.left = (window.innerWidth / 2 - 200) + "px";
            this.popupEl.style.top = (window.innerHeight / 3) + "px";
        }

        // 拖动功能
        this.enableDragging();

        // markdown 渲染组件
        this.markdownComponent = new Component();

        // 按钮事件
        const closeBtn = this.popupEl.querySelector(".result-close-btn") as HTMLButtonElement;
        const insertBtn = this.popupEl.querySelector(".btn-insert") as HTMLButtonElement;
        const replaceBtn = this.popupEl.querySelector(".btn-replace") as HTMLButtonElement;
        const copyBtn = this.popupEl.querySelector(".btn-copy") as HTMLButtonElement;
        const cancelBtn = this.popupEl.querySelector(".btn-cancel") as HTMLButtonElement;

        closeBtn?.addEventListener("click", () => this.close());
        insertBtn?.addEventListener("click", () => {
            if (this.onInsertCallback) this.onInsertCallback();
        });
        replaceBtn?.addEventListener("click", () => {
            if (this.onReplaceCallback) this.onReplaceCallback();
        });
        copyBtn?.addEventListener("click", () => {
            if (this.onCopyCallback) this.onCopyCallback();
        });
        cancelBtn?.addEventListener("click", () => {
            if (this.onCancelCallback) this.onCancelCallback();
            this.close();
        });

        // 若无编辑器，禁用插入和替换按钮
        if (!this.view || !this.view.editor) {
            if (insertBtn) insertBtn.disabled = true;
            if (replaceBtn) replaceBtn.disabled = true;
        }
    }

    updateContent(text: string): void {
        if (!this.popupEl) return;
        const contentEl = this.popupEl.querySelector(".result-content") as HTMLElement;
        const charCountEl = this.popupEl.querySelector(".char-count") as HTMLElement;

        if (contentEl) {
            contentEl.textContent = text;
        }
        if (charCountEl) {
            charCountEl.textContent = `${text.length} 字`;
        }
    }

    async renderMarkdown(markdown: string): Promise<void> {
        if (!this.popupEl) return;
        const contentEl = this.popupEl.querySelector(".result-content") as HTMLElement;
        if (!contentEl) return;

        // 为空或空白则不渲染
        if (!markdown || !markdown.trim()) {
            contentEl.textContent = "";
            return;
        }

        // 确保有组件上下文
        if (!this.markdownComponent) {
            this.markdownComponent = new Component();
        }

        // 清空并渲染
        contentEl.empty?.();
        contentEl.innerHTML = "";

        try {
            await MarkdownRenderer.render(
                this.app,
                markdown,
                contentEl,
                "",
                this.markdownComponent
            );
        } catch (err) {
            console.error("渲染 Markdown 失败", err);
            contentEl.textContent = markdown;
        }
    }

    updateStatus(text: string): void {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".result-status") as HTMLElement;
        const textEl = this.popupEl.querySelector(".status-text") as HTMLElement;

        if (statusEl && textEl) {
            textEl.textContent = text;
            statusEl.classList.remove("thinking", "generating");
            if (text.includes("生成")) {
                statusEl.classList.add("generating");
            } else {
                statusEl.classList.add("thinking");
            }
        }
    }

    showError(msg: string): void {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".result-status") as HTMLElement;
        const contentEl = this.popupEl.querySelector(".result-content") as HTMLElement;

        if (statusEl) {
            statusEl.classList.add("error");
            const textEl = statusEl.querySelector(".status-text") as HTMLElement;
            if (textEl) textEl.textContent = "生成失败";
        }
        if (contentEl) {
            contentEl.textContent = msg;
        }
        this.showActions();
    }

    showActions(): void {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".result-status") as HTMLElement;
        const actionsEl = this.popupEl.querySelector(".result-actions") as HTMLElement;

        if (statusEl) statusEl.style.display = "none";
        if (actionsEl) actionsEl.style.display = "flex";
    }

    setOnInsert(callback: () => void): void {
        this.onInsertCallback = callback;
    }

    setOnReplace(callback: () => void): void {
        this.onReplaceCallback = callback;
    }

    setOnCopy(callback: () => void): void {
        this.onCopyCallback = callback;
    }

    setOnCancel(callback: () => void): void {
        this.onCancelCallback = callback;
    }

    close(): void {
        if (!this.isOpen || !this.popupEl) return;
        this.isOpen = false;
        // Clean up drag event listeners
        const dragListeners = (this as any).dragListeners;
        if (dragListeners) {
            dragListeners.forEach(({ element, event, handler }: any) => {
                element.removeEventListener(event, handler);
            });
            (this as any).dragListeners = null;
        }
        if (this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;

        if (this.markdownComponent) {
            this.markdownComponent.unload();
            this.markdownComponent = null;
        }
    }

    private enableDragging(): void {
        if (!this.popupEl) return;
        const header = this.popupEl.querySelector(".result-header") as HTMLElement;
        if (!header) return;

        let startX = 0;
        let startY = 0;
        let currentTranslateX = 0;
        let currentTranslateY = 0;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || !this.popupEl) return;
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

        // Store listeners for cleanup in close()
        (this as any).dragListeners = [
            { element: header, event: "mousedown", handler: onMouseDown },
            { element: document, event: "mousemove", handler: onMouseMove },
            { element: document, event: "mouseup", handler: onMouseUp },
            { element: header, event: "touchstart", handler: onTouchStart },
            { element: document, event: "touchmove", handler: onTouchMove },
            { element: document, event: "touchend", handler: onTouchEnd }
        ];
    }
}
