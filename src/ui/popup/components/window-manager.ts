import { App } from "obsidian";
import type { CursorPosition } from "../../../types";
import type { EventListenerEntry } from "../../at-trigger-popup";

export class WindowManager {
    private app: App;
    private popupEl: HTMLElement | null = null;
    private scrollContainer: HTMLElement | null = null;
    private closeGuards: Set<string> = new Set();
    private eventListeners: EventListenerEntry[] = [];
    public isPinned: boolean = false;
    private xOffset = 0;
    private yOffset = 0;

    constructor(app: App) {
        this.app = app;
    }

    public setPopupEl(el: HTMLElement) {
        this.popupEl = el;
    }

    public getPopupEl(): HTMLElement | null {
        return this.popupEl;
    }

    public setScrollContainer(container: HTMLElement | null) {
        this.scrollContainer = container;
    }

    public addCloseGuard(key: string): void {
        if (!key) return;
        this.closeGuards.add(key);
        if (this.popupEl) {
            this.popupEl.setAttribute("data-close-guard", "true");
        }
    }

    public removeCloseGuard(key: string): void {
        if (!key) return;
        this.closeGuards.delete(key);
        if (this.popupEl && this.closeGuards.size === 0) {
            this.popupEl.removeAttribute("data-close-guard");
        }
    }

    public hasCloseGuard(): boolean {
        return this.closeGuards.size > 0;
    }

    public clearCloseGuards(): void {
        this.closeGuards.clear();
    }

    public positionPopup(
        cursorPosition: CursorPosition | null
    ): void {
        if (!this.popupEl) return;

        // User dragged manually, so we keep the position (pinned).
        if (this.isPinned) {
            this.constrainToViewport();
            return;
        }

        // Reset transform since we are repositioning
        this.xOffset = 0;
        this.yOffset = 0;
        this.popupEl.style.transform = "none";

        if (!cursorPosition) return;

        const { left, top, height = 20 } = cursorPosition;
        const popupRect = this.popupEl.getBoundingClientRect();
        // ... rest of logic relies on rect ...
        // Note: The rest of the function follows...
        // I need to be careful with replace_string since I can't match "remaining logic" easily.
        // I will use a different strategy or just insert constrainToViewport separately.

        const popupWidth = popupRect.width || 450;
        const popupHeight = popupRect.height || 400;

        const computedPos = window.getComputedStyle(this.popupEl).position;
        if (this.scrollContainer && computedPos === "absolute") {
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const scrollTop = this.scrollContainer.scrollTop;
            const scrollLeft = this.scrollContainer.scrollLeft;

            let fixLeft = left - containerRect.left + scrollLeft;
            let fixTop = top + height + 5 - containerRect.top + scrollTop;

            this.popupEl.style.left = `${fixLeft}px`;
            this.popupEl.style.top = `${fixTop}px`;

            const rightEdge = fixLeft + popupWidth;
            const bottomEdge = fixTop + popupHeight;
            const containerRight = scrollLeft + this.scrollContainer.clientWidth;
            const containerBottom = scrollTop + this.scrollContainer.clientHeight;

            if (rightEdge > containerRight - 10) {
                fixLeft = scrollLeft + this.scrollContainer.clientWidth - popupWidth - 10;
                this.popupEl.style.left = `${fixLeft}px`;
            }
            if (fixLeft < scrollLeft + 10) {
                this.popupEl.style.left = `${scrollLeft + 10}px`;
            }
            if (bottomEdge > containerBottom - 10) {
                fixTop = top - containerRect.top + scrollTop - popupHeight - 5;
                this.popupEl.style.top = `${fixTop}px`;
            }
        } else {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let fixLeft = left;
            let fixTop = top + height + 5;

            if (fixLeft + popupWidth > viewportWidth - 20) {
                fixLeft = viewportWidth - popupWidth - 20;
            }
            fixLeft = Math.max(10, fixLeft);

            if (fixTop + popupHeight > viewportHeight - 20) {
                const topSpace = top;
                const bottomSpace = viewportHeight - (top + height);
                if (topSpace > bottomSpace && topSpace > popupHeight) {
                    fixTop = top - popupHeight - 5;
                } else {
                    fixTop = Math.min(fixTop, viewportHeight - popupHeight - 10);
                }
            }

            this.popupEl.style.left = `${fixLeft}px`;
            this.popupEl.style.top = `${fixTop}px`;
        }
    }

    public constrainToViewport(): void {
        if (!this.popupEl) return;

        requestAnimationFrame(() => {
            if (!this.popupEl) return;
            const rect = this.popupEl.getBoundingClientRect();
            let newVisualLeft = rect.left;
            let newVisualTop = rect.top;
            let changed = false;

            const computedPos = window.getComputedStyle(this.popupEl).position;
            if (this.scrollContainer && computedPos === "absolute") {
                // Container based logic
                const containerRect = this.scrollContainer.getBoundingClientRect();
                const scrollLeft = this.scrollContainer.scrollLeft;
                const scrollTop = this.scrollContainer.scrollTop;

                // Visual position relative to container content
                let visualLeftRel = rect.left - containerRect.left + scrollLeft;
                let visualTopRel = rect.top - containerRect.top + scrollTop;

                const contentRight = scrollLeft + this.scrollContainer.clientWidth;
                const contentBottom = scrollTop + this.scrollContainer.clientHeight;

                if (visualLeftRel + rect.width > contentRight) {
                    visualLeftRel = Math.max(scrollLeft, contentRight - rect.width - 10);
                    changed = true;
                }
                if (visualLeftRel < scrollLeft) {
                    visualLeftRel = scrollLeft + 10;
                    changed = true;
                }
                if (visualTopRel + rect.height > contentBottom) {
                    visualTopRel = Math.max(scrollTop, contentBottom - rect.height - 10);
                    changed = true;
                }
                if (visualTopRel < scrollTop) {
                    visualTopRel = scrollTop + 10;
                    changed = true;
                }

                if (changed) {
                    this.popupEl.style.left = `${visualLeftRel - this.xOffset}px`;
                    this.popupEl.style.top = `${visualTopRel - this.yOffset}px`;
                }

            } else {
                // Viewport logic
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (rect.right > viewportWidth) {
                    newVisualLeft = Math.max(10, viewportWidth - rect.width - 10);
                    changed = true;
                }
                if (rect.left < 0) {
                    newVisualLeft = 10;
                    changed = true;
                }
                if (rect.bottom > viewportHeight) {
                    newVisualTop = Math.max(10, viewportHeight - rect.height - 10);
                    changed = true;
                }
                if (rect.top < 0) {
                    newVisualTop = 10;
                    changed = true;
                }

                if (changed) {
                    this.popupEl.style.left = `${newVisualLeft - this.xOffset}px`;
                    this.popupEl.style.top = `${newVisualTop - this.yOffset}px`;
                }
            }
        });
    }

    public enableDragging(headerEl: HTMLElement): void {
        if (!this.popupEl || !headerEl) return;

        let isDragging = false;
        let currentX: number;
        let currentY: number;
        let initialX: number;
        let initialY: number;

        const setTranslate = (xPos: number, yPos: number, el: HTMLElement) => {
            el.style.transform = `translate(${xPos}px, ${yPos}px)`;
        };

        const dragStart = (e: MouseEvent | TouchEvent) => {
            if (!this.popupEl) return;
            const target = e.target as HTMLElement;
            // 确保点击的是 header 区域
            if (target !== headerEl && !headerEl.contains(target)) return;

            // 忽略特定的交互元素
            if (target.closest(".markdown-next-ai-popup-close")) return;
            if (target.closest(".mn-mode-select-container")) return;
            if (target.closest(".markdown-next-ai-model-select")) return;

            if (e.type === "touchstart") {
                initialX = (e as TouchEvent).touches[0].clientX - this.xOffset;
                initialY = (e as TouchEvent).touches[0].clientY - this.yOffset;
            } else {
                initialX = (e as MouseEvent).clientX - this.xOffset;
                initialY = (e as MouseEvent).clientY - this.yOffset;
            }

            if (target === headerEl || headerEl.contains(target)) {
                isDragging = true;
                this.isPinned = true;
                headerEl.style.cursor = "grabbing";
                document.body.dataset.mnaiDraggingAtPopup = "true";
            }
        };

        const dragEnd = () => {
            if (!isDragging) return;

            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            headerEl.style.cursor = "grab";
            delete document.body.dataset.mnaiDraggingAtPopup;
        };

        const drag = (e: MouseEvent | TouchEvent) => {
            if (isDragging && this.popupEl) {
                e.preventDefault();

                if (e.type === "touchmove") {
                    currentX = (e as TouchEvent).touches[0].clientX - initialX;
                    currentY = (e as TouchEvent).touches[0].clientY - initialY;
                } else {
                    currentX = (e as MouseEvent).clientX - initialX;
                    currentY = (e as MouseEvent).clientY - initialY;
                }

                this.xOffset = currentX;
                this.yOffset = currentY;

                setTranslate(currentX, currentY, this.popupEl);
            }
        };

        headerEl.style.cursor = "grab";
        headerEl.style.userSelect = "none";

        headerEl.addEventListener("mousedown", dragStart);
        headerEl.addEventListener("touchstart", dragStart, { passive: false });

        document.addEventListener("mousemove", drag);
        document.addEventListener("touchmove", drag, { passive: false });

        document.addEventListener("mouseup", dragEnd);
        document.addEventListener("touchend", dragEnd);

        this.eventListeners.push(
            { element: headerEl, event: "mousedown", handler: dragStart as EventListener },
            { element: headerEl, event: "touchstart", handler: dragStart as EventListener },
            { element: document, event: "mousemove", handler: drag as EventListener },
            { element: document, event: "touchmove", handler: drag as EventListener },
            { element: document, event: "mouseup", handler: dragEnd as EventListener },
            { element: document, event: "touchend", handler: dragEnd as EventListener }
        );
    }

    public dispose(): void {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        this.popupEl = null;
        this.closeGuards.clear();
        // Reset pinned state so next time it follows cursor until dragged again
        this.isPinned = false;
    }
}
