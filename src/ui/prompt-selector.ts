import { App } from "obsidian";
import type { CommonPrompt, EventListenerInfo } from "../types";
import { OverlayCloseManager } from "./overlay/close-manager";
import { positionFixedBelowOrAbove } from "./overlay/positioning";
import { SuggestionList } from "./overlay/suggestion-list";

/**
 * 提示词选择弹窗
 * 用于通过 # 触发快速选择常用提示词
 */
export class PromptSelectorPopup {
    private app: App;
    private plugin: any;
    private onSelect: ((content: string) => void) | null;
    private isOpen: boolean = false;
    private modalEl: HTMLElement | null = null;
    private eventListeners: EventListenerInfo[] = [];
    private selectedIndex: number = 0;
    private commonPrompts: CommonPrompt[] = [];
    private scrollHandler: ((e: Event) => void) | null = null;
    private wheelHandler: ((e: WheelEvent) => void) | null = null;
    private touchMoveHandler: ((e: TouchEvent) => void) | null = null;
    private closeManager: OverlayCloseManager | null = null;

    constructor(app: App, plugin: any, onSelect: (content: string) => void) {
        this.app = app;
        this.plugin = plugin;
        this.onSelect = onSelect;
    }

    /**
     * 打开弹窗
     */
    open(inputEl: HTMLElement): void {
        if (this.isOpen) return;
        this.isOpen = true;

        try {
            this.modalEl = document.createElement("div");
            this.modalEl.className = "markdown-next-ai-context-suggestions"; // 复用上下文选择器的样式类

            const prompts = this.plugin.settings.commonPrompts || [];
            this.commonPrompts = prompts;
            this.selectedIndex = 0;

            // 添加标题头
            const header = document.createElement("div");
            header.className = "markdown-next-ai-suggestions-header";
            header.textContent = `常用提示词 (${this.commonPrompts.length})`;
            this.modalEl.appendChild(header);

            const list = document.createElement("div");
            list.className = "markdown-next-ai-suggestions-list";

            if (this.commonPrompts.length === 0) {
                list.innerHTML = `
                    <div class="markdown-next-ai-suggestion-item" style="cursor: default;">
                        <div class="markdown-next-ai-suggestion-content">
                            <div class="markdown-next-ai-suggestion-name">暂无常用提示词</div>
                            <div class="markdown-next-ai-suggestion-path">请在设置中添加</div>
                        </div>
                    </div>
                `;
            } else {
                new SuggestionList({
                    container: list,
                    items: this.commonPrompts,
                    renderItem: (prompt) => ({
                        icon: "💡",
                        name: prompt.name,
                        path: `${prompt.content.substring(0, 50)}${prompt.content.length > 50 ? "..." : ""}`,
                    }),
                    onSelect: (index) => this.selectPrompt(index),
                    selectedIndex: 0,
                });
            }
            this.modalEl.appendChild(list);

            this.modalEl.querySelectorAll(".markdown-next-ai-suggestion-item").forEach(item => {
                if (this.commonPrompts.length === 0) return;
            });

            const keydownHandler = (e: KeyboardEvent) => {
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
            document.addEventListener("keydown", keydownHandler as EventListener);
            this.eventListeners.push({ element: document, event: "keydown", handler: keydownHandler as EventListener });

            document.body.appendChild(this.modalEl);
            this.positionPopup(inputEl);

            if (this.closeManager) {
                this.closeManager.destroy();
                this.closeManager = null;
            }
            this.closeManager = new OverlayCloseManager({
                overlayEl: this.modalEl,
                anchorEl: inputEl,
                onClose: () => this.close(),
                onEsc: () => this.close(),
            });
            this.closeManager.start();

        } catch (e) {
            console.error("Failed to open prompt selector:", e);
        }
    }

    /**
     * 关闭弹窗
     */
    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.eventListeners.forEach(({ element, event, handler }) => {
            if (element && typeof element.removeEventListener === "function") {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners = [];

        if (this.closeManager) {
            this.closeManager.destroy();
            this.closeManager = null;
        }

        if (this.modalEl && this.modalEl.parentNode) {
            this.modalEl.parentNode.removeChild(this.modalEl);
        }
        this.modalEl = null;
    }

    /**
     * 定位弹窗
     */
    positionPopup(inputEl: HTMLElement): void {
        if (!this.modalEl) return;
        positionFixedBelowOrAbove(inputEl, this.modalEl, 5);
    }

    /**
     * 移动选择
     */
    moveSelection(direction: number): void {
        if (this.commonPrompts.length === 0) return;

        let newIndex = this.selectedIndex + direction;
        if (newIndex < 0) newIndex = this.commonPrompts.length - 1;
        if (newIndex >= this.commonPrompts.length) newIndex = 0;

        this.updateSelection(newIndex);
    }

    /**
     * 更新选择
     */
    updateSelection(index: number): void {
        if (!this.modalEl || this.commonPrompts.length === 0) return;

        this.selectedIndex = index;
        this.modalEl.querySelectorAll(".markdown-next-ai-suggestion-item").forEach(item => item.classList.remove("selected"));

        const selectedItem = this.modalEl.querySelector(`[data-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add("selected");
            selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    /**
     * 选择提示词
     */
    selectPrompt(index: number): void {
        if (index < 0 || index >= this.commonPrompts.length) return;

        const prompt = this.commonPrompts[index];
        if (prompt && this.onSelect) {
            this.onSelect(prompt.content);
        }
        this.close();
    }
}
