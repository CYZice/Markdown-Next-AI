import { App, setIcon } from "obsidian";
import { SelectionInfo } from "./selection-manager";

export class SelectionToolbar {
    private indicatorEl: HTMLElement;
    private menuEl: HTMLElement;
    private app: App;
    private plugin: any;
    private currentSelection: SelectionInfo | null = null;

    private hideTimeout: number | null = null;
    private showTimeout: number | null = null;
    private isHovering: boolean = false;

    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;

        // Create Indicator
        this.indicatorEl = document.createElement("div");
        this.indicatorEl.addClass("markdown-next-ai-selection-indicator");
        setIcon(this.indicatorEl, "sparkles");
        document.body.appendChild(this.indicatorEl);

        // Create Menu
        this.menuEl = document.createElement("div");
        this.menuEl.addClass("markdown-next-ai-selection-menu");
        document.body.appendChild(this.menuEl);

        this.initEvents();
    }

    private initEvents() {
        // Indicator Events
        this.indicatorEl.addEventListener("mouseenter", () => {
            this.isHovering = true;
            this.scheduleShowMenu();
        });

        this.indicatorEl.addEventListener("mouseleave", () => {
            this.isHovering = false;
            this.scheduleHideMenu();
        });

        this.indicatorEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showMenuNow();
        });

        // Menu Events
        this.menuEl.addEventListener("mouseenter", () => {
            this.isHovering = true;
            if (this.hideTimeout) {
                window.clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });

        this.menuEl.addEventListener("mouseleave", () => {
            this.isHovering = false;
            this.scheduleHideMenu();
        });
    }

    private scheduleShowMenu() {
        if (this.showTimeout) window.clearTimeout(this.showTimeout);
        if (this.hideTimeout) window.clearTimeout(this.hideTimeout);

        this.showTimeout = window.setTimeout(() => {
            this.showMenuNow();
        }, 150);
    }

    private scheduleHideMenu() {
        if (this.showTimeout) window.clearTimeout(this.showTimeout);

        this.hideTimeout = window.setTimeout(() => {
            if (!this.isHovering) {
                this.menuEl.removeClass("visible");
            }
        }, 300);
    }

    private showMenuNow() {
        if (!this.currentSelection) return;

        // Re-render menu content each time to ensure it's up to date with settings
        this.renderMenu();

        this.menuEl.addClass("visible");
        this.updateMenuPosition();
    }

    private renderMenu() {
        const content = document.createElement("div");
        content.addClass("markdown-next-ai-selection-menu-content");

        // 1. Core Actions
        // AI Modify
        content.appendChild(this.createMenuItem("AI Modify", "pencil", () => {
            if (this.currentSelection) {
                this.plugin.showAtTriggerModal(this.currentSelection.text, "edit");
                this.hide();
            }
        }));

        // Add to Chat
        content.appendChild(this.createMenuItem("Add to Chat", "message-square", () => {
            if (this.currentSelection) {
                this.plugin.showAtTriggerModal(this.currentSelection.text, "chat");
                this.hide();
            }
        }));

        // 2. Custom Prompts from Settings
        if (this.plugin.settings && this.plugin.settings.commonPrompts) {
            this.plugin.settings.commonPrompts.forEach((prompt: any) => {
                content.appendChild(this.createMenuItem(prompt.name, "zap", () => {
                    if (this.currentSelection) {
                        this.plugin.handleContinueWriting(prompt.content, [], null, null, this.currentSelection.text, "chat");
                        this.hide();
                    }
                }));
            });
        }

        this.menuEl.innerHTML = "";
        this.menuEl.appendChild(content);
    }

    private createMenuItem(label: string, icon: string, onClick: () => void): HTMLElement {
        const item = document.createElement("div");
        item.addClass("markdown-next-ai-selection-menu-item");

        const iconEl = document.createElement("div");
        iconEl.addClass("markdown-next-ai-selection-menu-item-icon");
        setIcon(iconEl, icon);

        const labelEl = document.createElement("div");
        labelEl.addClass("markdown-next-ai-selection-menu-item-label");
        labelEl.innerText = label;

        item.appendChild(iconEl);
        item.appendChild(labelEl);

        item.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });

        return item;
    }

    public show(info: SelectionInfo) {
        this.currentSelection = info;
        this.updateIndicatorPosition();
        this.indicatorEl.addClass("visible");

        // Hide menu initially when new selection appears
        this.menuEl.removeClass("visible");
    }

    public hide() {
        this.currentSelection = null;
        this.indicatorEl.removeClass("visible");
        this.menuEl.removeClass("visible");
        this.isHovering = false;

        if (this.showTimeout) window.clearTimeout(this.showTimeout);
        if (this.hideTimeout) window.clearTimeout(this.hideTimeout);
    }

    private updateIndicatorPosition() {
        if (!this.currentSelection) return;

        const rect = this.currentSelection.rect;
        const offset = 8;
        const indicatorSize = 28;

        // Position at the end of the selection, aligned with the top of the line
        let left = rect.right + offset;
        let top = rect.top;

        // Boundary checks
        if (left + indicatorSize > window.innerWidth) {
            left = rect.left - indicatorSize - offset;
        }

        // Ensure it's not off-screen top/bottom
        if (top + indicatorSize > window.innerHeight) {
            top = window.innerHeight - indicatorSize - offset;
        }
        if (top < 0) {
            top = offset;
        }

        this.indicatorEl.style.left = `${left}px`;
        this.indicatorEl.style.top = `${top}px`;
    }

    private updateMenuPosition() {
        // Position menu relative to indicator
        const indicatorRect = this.indicatorEl.getBoundingClientRect();

        let left = indicatorRect.left;
        let top = indicatorRect.bottom + 8;

        const menuWidth = 220; // Estimated max width
        const menuHeight = 200; // Estimated max height

        // Adjust if going off-screen
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 8;
        }

        if (top + menuHeight > window.innerHeight) {
            top = indicatorRect.top - menuHeight - 8; // Show above if no space below
        }

        this.menuEl.style.left = `${left}px`;
        this.menuEl.style.top = `${top}px`;
    }

    public destroy() {
        this.indicatorEl.remove();
        this.menuEl.remove();
        if (this.showTimeout) window.clearTimeout(this.showTimeout);
        if (this.hideTimeout) window.clearTimeout(this.hideTimeout);
    }
}
