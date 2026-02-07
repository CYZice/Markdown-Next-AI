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

        if (!cursorPosition) return;

        const { left, top, height = 20 } = cursorPosition;
        const popupRect = this.popupEl.getBoundingClientRect();
        // ... rest of logic relies on rect ...
        // Note: The rest of the function follows...
        // I need to be careful with replace_string since I can't match "remaining logic" easily.
        // I will use a different strategy or just insert constrainToViewport separately.

        const popupWidth = popupRect.width || 450;
        const popupHeight = popupRect.height || 400;

        if (this.scrollContainer && this.popupEl.style.position === "absolute") {
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
            let newLeft = rect.left;
            let newTop = rect.top;
            let changed = false;

            if (this.scrollContainer && this.popupEl.style.position === "absolute") {
                // Container based logic
                const containerRect = this.scrollContainer.getBoundingClientRect();
                const scrollLeft = this.scrollContainer.scrollLeft;
                const scrollTop = this.scrollContainer.scrollTop;

                // Current position relative to container content
                let currentLeft = parseFloat(this.popupEl.style.left || "0");
                let currentTop = parseFloat(this.popupEl.style.top || "0");

                const contentRight = scrollLeft + this.scrollContainer.clientWidth;
                const contentBottom = scrollTop + this.scrollContainer.clientHeight;

                const rightEdge = currentLeft + rect.width;
                const bottomEdge = currentTop + rect.height;

                if (rightEdge > contentRight) {
                    currentLeft = Math.max(scrollLeft, contentRight - rect.width - 10);
                    changed = true;
                }
                if (currentLeft < scrollLeft) {
                    currentLeft = scrollLeft + 10;
                    changed = true;
                }
                if (bottomEdge > contentBottom) {
                    currentTop = Math.max(scrollTop, contentBottom - rect.height - 10);
                    changed = true;
                }
                // Top check? maybe

                if (changed) {
                    this.popupEl.style.left = `${currentLeft}px`;
                    this.popupEl.style.top = `${currentTop}px`;
                }

            } else {
                // Viewport logic
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (rect.right > viewportWidth) {
                    newLeft = Math.max(10, viewportWidth - rect.width - 10);
                    changed = true;
                }
                if (rect.left < 0) {
                    newLeft = 10;
                    changed = true;
                }
                if (rect.bottom > viewportHeight) {
                    newTop = Math.max(10, viewportHeight - rect.height - 10);
                    changed = true;
                }
                if (rect.top < 0) {
                    newTop = 10;
                    changed = true;
                }

                if (changed) {
                    this.popupEl.style.left = `${newLeft}px`;
                    this.popupEl.style.top = `${newTop}px`;
                }
            }
        });
    }

    public enableDragging(headerEl: HTMLElement): void {
        if (!this.popupEl || !headerEl) return;

        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        let rafId: number | null = null;
        let pendingDx = 0;
        let pendingDy = 0;

        const commitPosition = (dx: number, dy: number) => {
            if (!this.popupEl) return;
            const newLeft = startLeft + dx;
            const newTop = startTop + dy;
            this.popupEl.style.transform = "none";
            this.popupEl.style.left = `${newLeft}px`;
            this.popupEl.style.top = `${newTop}px`;
        };

        const onMouseDown = (e: MouseEvent) => {
            if (e.target !== headerEl && !headerEl.contains(e.target as Node)) return;
            const targetEl = e.target as HTMLElement;
            if (targetEl.closest(".markdown-next-ai-popup-close")) return;
            if (targetEl.closest(".mn-mode-select-container")) return;
            if (targetEl.closest(".markdown-next-ai-model-select")) return;

            this.isPinned = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this.popupEl!.getBoundingClientRect();
            if (this.scrollContainer && this.popupEl!.style.position === "absolute") {
                const containerRect = this.scrollContainer.getBoundingClientRect();
                const scrollLeft = this.scrollContainer.scrollLeft;
                const scrollTop = this.scrollContainer.scrollTop;
                startLeft = rect.left - containerRect.left + scrollLeft;
                startTop = rect.top - containerRect.top + scrollTop;
                this.popupEl!.style.left = `${startLeft}px`;
                this.popupEl!.style.top = `${startTop}px`;
            } else {
                startLeft = rect.left;
                startTop = rect.top;
                this.popupEl!.style.left = `${startLeft}px`;
                this.popupEl!.style.top = `${startTop}px`;
            }

            document.body.dataset.mnaiDraggingAtPopup = "true";

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            pendingDx = e.clientX - startX;
            pendingDy = e.clientY - startY;

            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    if (this.popupEl) {
                        this.popupEl.style.transform = `translate(${pendingDx}px, ${pendingDy}px)`;
                    }
                    rafId = null;
                });
            }
        };

        const onMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            commitPosition(pendingDx, pendingDy);

            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            delete document.body.dataset.mnaiDraggingAtPopup;
        };

        headerEl.addEventListener("mousedown", onMouseDown);

        this.eventListeners.push(
            { element: headerEl, event: "mousedown", handler: onMouseDown as EventListener },
        );

        const onTouchStart = (e: TouchEvent) => {
            if (!this.popupEl) return;
            if (e.target !== headerEl && !headerEl.contains(e.target as Node)) return;
            const targetEl = e.target as HTMLElement;
            if (targetEl.closest(".markdown-next-ai-popup-close")) return;
            if (targetEl.closest(".mn-mode-select-container")) return;
            if (targetEl.closest(".markdown-next-ai-model-select")) return;

            this.isPinned = true;
            document.body.dataset.mnaiDraggingAtPopup = "true";
            e.preventDefault(); // Prevent scroll while dragging header
            e.stopPropagation();

            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            const rect = this.popupEl!.getBoundingClientRect();
            // ... Initialize start positions (same as mouse) ...
            if (this.scrollContainer && this.popupEl!.style.position === "absolute") {
                const containerRect = this.scrollContainer.getBoundingClientRect();
                const scrollLeft = this.scrollContainer.scrollLeft;
                const scrollTop = this.scrollContainer.scrollTop;
                startLeft = rect.left - containerRect.left + scrollLeft;
                startTop = rect.top - containerRect.top + scrollTop;
                this.popupEl!.style.left = `${startLeft}px`;
                this.popupEl!.style.top = `${startTop}px`;
            } else {
                startLeft = rect.left;
                startTop = rect.top;
                this.popupEl!.style.left = `${startLeft}px`;
                this.popupEl!.style.top = `${startTop}px`;
            }

            this.popupEl.style.willChange = "transform";
            this.popupEl.style.transform = "translate3d(0px, 0px, 0)";

            // Dynamically attach move/end listeners
            document.addEventListener("touchmove", onTouchMove, { passive: false });
            document.addEventListener("touchend", onTouchEnd);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!this.popupEl) return;
            // Prevent default ONLY when dragging
            e.preventDefault();
            e.stopPropagation();

            pendingDx = e.touches[0].clientX - startX;
            pendingDy = e.touches[0].clientY - startY;

            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    if (this.popupEl) {
                        this.popupEl.style.transform = `translate(${pendingDx}px, ${pendingDy}px)`;
                    }
                    rafId = null;
                });
            }
        };

        const onTouchEnd = () => {
            if (!this.popupEl) return;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            commitPosition(pendingDx, pendingDy);
            delete document.body.dataset.mnaiDraggingAtPopup;

            // Cleanup dynamic listeners
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
        };

        // Only listen for start initially
        headerEl.addEventListener("touchstart", onTouchStart, { passive: false });

        // Register ONLY the start listener for cleanup
        this.eventListeners.push(
            { element: headerEl, event: "touchstart", handler: onTouchStart as EventListener }
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
