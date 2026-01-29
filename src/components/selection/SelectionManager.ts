import { App, MarkdownView } from "obsidian";

export interface SelectionInfo {
    text: string;
    range: Range;
    rect: DOMRect;
    view: MarkdownView;
}

type SelectionCallback = (info: SelectionInfo | null) => void;

export class SelectionManager {
    private app: App;
    private listeners: SelectionCallback[] = [];
    private debounceTimer: number | null = null;
    private currentSelection: SelectionInfo | null = null;

    constructor(app: App) {
        this.app = app;
        this.init();
    }

    private init() {
        document.addEventListener("selectionchange", this.handleSelectionChange);
    }

    public destroy() {
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    }

    public subscribe(callback: SelectionCallback) {
        this.listeners.push(callback);
        // Immediately notify with current state
        callback(this.currentSelection);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private handleSelectionChange = () => {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(this.processSelection, 300);
    };

    private processSelection = () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.updateSelection(null);
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            this.updateSelection(null);
            return;
        }

        const text = selection.toString().trim();
        if (text.length < 6) {
            this.updateSelection(null);
            return;
        }

        // Check if selection is within the active view
        if (!view.containerEl.contains(selection.anchorNode)) {
            this.updateSelection(null);
            return;
        }

        // Avoid showing if selection is inside our own UI
        let node = selection.anchorNode;
        while (node) {
            if (node instanceof HTMLElement) {
                // Check for our new React root or other UI elements
                if (node.id === "markdown-next-ai-selection-root" ||
                    node.classList.contains("markdown-next-ai-at-popup") ||
                    node.classList.contains("markdown-next-ai-result-floating-window")) {
                    return;
                }
            }
            node = node.parentNode;
        }

        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();

        if (rects.length === 0) {
            this.updateSelection(null);
            return;
        }

        // Use the last line's rect for multi-line selections
        const rect = rects[rects.length - 1];

        // Check if rect is visible
        if (rect.width === 0 || rect.height === 0) {
            this.updateSelection(null);
            return;
        }

        this.updateSelection({
            text,
            range,
            rect,
            view
        });
    };

    private updateSelection(info: SelectionInfo | null) {
        this.currentSelection = info;
        this.listeners.forEach(listener => listener(info));
    }

    public getSelection() {
        return this.currentSelection;
    }
}
