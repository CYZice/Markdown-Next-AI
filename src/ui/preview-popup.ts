import { App, Editor, MarkdownView } from "obsidian";
import type { CursorPosition } from "../types";

/**
 * AI 预览弹窗
 * 用于显示 AI 生成状态和接受/拒绝按钮
 */
export class AIPreviewPopup {
    private app: App;
    private editor: Editor;
    private view: MarkdownView;
    private onConfirm: (() => void) | null;
    private onReject: (() => void) | null;
    private onAppend: (() => void) | null;
    private isOpen: boolean = false;
    private popupEl: HTMLElement | null = null;
    private scrollContainer: HTMLElement | null = null;

    constructor(
        app: App,
        editor: Editor,
        view: MarkdownView,
        onConfirm: () => void,
        onReject: () => void,
        onAppend: (() => void) | null = null
    ) {
        this.app = app;
        this.editor = editor;
        this.view = view;
        this.onConfirm = onConfirm;
        this.onReject = onReject;
        this.onAppend = onAppend;
    }

    /**
     * 打开弹窗
     */
    open(cursorPos: CursorPosition | null): void {
        if (this.isOpen) return;
        this.isOpen = true;

        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-preview-popup");
        this.popupEl.style.minWidth = "240px";
        this.popupEl.style.maxWidth = "420px";

        this.popupEl.innerHTML = `
            <div class="markdown-next-ai-preview-content">
                <div class="markdown-next-ai-preview-header">
                    <div class="markdown-next-ai-preview-status thinking">
                        <span class="status-dot"></span>
                        <span class="status-text">正在思考中</span>
                    </div>
                </div>
                <div class="markdown-next-ai-preview-actions" style="display: none;">
                    <button class="markdown-next-ai-preview-btn confirm" title="替换原文">替换</button>
                    ${this.onAppend ? '<button class="markdown-next-ai-preview-btn append" title="保留原文并追加">追加</button>' : ''}
                    <button class="markdown-next-ai-preview-btn reject" title="放弃生成">放弃</button>
                </div>
            </div>
        `;

        const confirmBtn = this.popupEl.querySelector(".markdown-next-ai-preview-btn.confirm") as HTMLButtonElement;
        const rejectBtn = this.popupEl.querySelector(".markdown-next-ai-preview-btn.reject") as HTMLButtonElement;
        const appendBtn = this.popupEl.querySelector(".markdown-next-ai-preview-btn.append") as HTMLButtonElement;

        confirmBtn.onclick = () => {
            if (this.onConfirm) this.onConfirm();
            this.close();
        };

        if (appendBtn) {
            appendBtn.onclick = () => {
                if (this.onAppend) this.onAppend();
                this.close();
            };
        }

        rejectBtn.onclick = () => {
            if (this.onReject) this.onReject();
            this.close();
        };

        // 找到编辑器的滚动容器
        this.scrollContainer = this.view.containerEl.querySelector(".cm-scroller");
        if (!this.scrollContainer) {
            this.scrollContainer = this.view.containerEl.querySelector(".cm-editor");
        }

        if (this.scrollContainer) {
            const containerStyle = window.getComputedStyle(this.scrollContainer);
            if (containerStyle.position === "static") {
                this.scrollContainer.style.position = "relative";
            }

            this.popupEl.style.position = "absolute";
            this.scrollContainer.appendChild(this.popupEl);
        } else {
            this.popupEl.style.position = "fixed";
            document.body.appendChild(this.popupEl);
        }

        if (cursorPos) {
            const targetY = cursorPos.top + (cursorPos.height || 0);
            this.positionAt(cursorPos.left, targetY, "below");
        }
    }

    /**
     * 定位弹窗到指定坐标
     */
    positionAt(x: number, y: number, placement: "above" | "below" | "right" = "below"): void {
        if (!this.popupEl) return;

        const popupRect = this.popupEl.getBoundingClientRect();
        const gap = 12;

        if (this.scrollContainer) {
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const scrollTop = this.scrollContainer.scrollTop;
            const scrollLeft = this.scrollContainer.scrollLeft;

            const contentEl = this.scrollContainer.querySelector(".cm-content");
            const contentRect = contentEl ? contentEl.getBoundingClientRect() : containerRect;

            let left = x - containerRect.left + scrollLeft - popupRect.width / 2;
            let top = placement === "above"
                ? y - containerRect.top + scrollTop - popupRect.height - gap
                : y - containerRect.top + scrollTop + gap;

            const minLeft = scrollLeft + 8;
            const maxLeft = Math.max(minLeft, containerRect.width - popupRect.width + scrollLeft - 8);
            left = Math.min(Math.max(minLeft, left), maxLeft);

            const minTop = scrollTop + 8;
            const maxTop = Math.max(minTop, containerRect.height - popupRect.height + scrollTop - 8);

            if (top < minTop && placement === "above") {
                top = y - containerRect.top + scrollTop + gap;
            }
            top = Math.min(Math.max(minTop, top), maxTop);

            this.popupEl.style.left = left + "px";
            this.popupEl.style.top = top + "px";
        } else {
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let left = placement === "right"
                ? x + gap
                : x - popupRect.width / 2;
            let top = placement === "above"
                ? y - popupRect.height - gap
                : y + gap;

            if (placement === "right" && left + popupRect.width > windowWidth - 10) {
                left = windowWidth - popupRect.width - 12;
            }
            if (placement !== "above" && top + popupRect.height > windowHeight - 10) {
                top = y - popupRect.height - gap;
            }

            left = Math.min(Math.max(10, left), windowWidth - popupRect.width - 12);
            top = Math.min(Math.max(10, top), windowHeight - popupRect.height - 12);

            this.popupEl.style.left = left + "px";
            this.popupEl.style.top = top + "px";
        }

        this.popupEl.style.right = "auto";
        this.popupEl.style.bottom = "auto";
    }

    /**
     * 更新状态文本
     */
    updateStatus(text: string): void {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".markdown-next-ai-preview-status");
        const textEl = this.popupEl.querySelector(".status-text");

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

    /**
     * 显示操作按钮
     */
    showActions(): void {
        if (!this.popupEl) return;
        const statusEl = this.popupEl.querySelector(".markdown-next-ai-preview-status") as HTMLElement;
        const actionsEl = this.popupEl.querySelector(".markdown-next-ai-preview-actions") as HTMLElement;

        if (statusEl) statusEl.style.display = "none";
        if (actionsEl) actionsEl.style.display = "flex";
    }

    /**
     * 关闭弹窗
     */
    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;

        if (this.popupEl && this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;
    }
}
