import { App, MarkdownView } from "obsidian";

export interface SelectionInfo {
    text: string;
    range: Range;
    rect: DOMRect;
    view: MarkdownView;
}

export class SelectionManager {
    private app: App;
    private onSelection: (info: SelectionInfo | null) => void;
    private debounceTimer: number | null = null;
    
    constructor(app: App, onSelection: (info: SelectionInfo | null) => void) {
        this.app = app;
        this.onSelection = onSelection;
        this.init();
    }

    private init() {
        document.addEventListener("selectionchange", this.handleSelectionChange);
    }

    public destroy() {
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    }

    private handleSelectionChange = () => {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(this.processSelection, 300);
    };

    private processSelection = () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.onSelection(null);
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            this.onSelection(null);
            return;
        }

        const text = selection.toString().trim();
        if (text.length < 2) { 
            this.onSelection(null);
            return;
        }

        // Check if selection is within the active view
        if (!view.containerEl.contains(selection.anchorNode)) {
            this.onSelection(null);
            return;
        }

        // Avoid showing if selection is inside our own UI (e.g. popups)
        let node = selection.anchorNode;
        while (node) {
            if (node instanceof HTMLElement) {
                if (node.classList.contains("markdown-next-ai-at-popup") || 
                    node.classList.contains("markdown-next-ai-result-floating-window") ||
                    node.classList.contains("markdown-next-ai-selection-toolbar")) {
                    return; // Don't hide, but don't trigger new selection event for UI interaction?
                    // Actually if we select text in our popup, we probably don't want the toolbar to show up for THAT.
                    // But if we select text in editor, we want it.
                }
            }
            node = node.parentNode;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Check if rect is visible
        if (rect.width === 0 || rect.height === 0) {
            this.onSelection(null);
            return;
        }

        this.onSelection({
            text,
            range,
            rect,
            view
        });
    };
}
