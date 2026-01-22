import { App } from "obsidian";

interface FileInfo {
    name: string;
    path: string;
    extension?: string;
}

/**
 * 文件选择窗口
 */
export class FileSelectionWindow {
    private app: App;
    private files: FileInfo[];
    private onSelect: (files: FileInfo[]) => void;
    private onClose?: () => void;
    private selectedFiles: FileInfo[] = [];
    private windowEl: HTMLElement | null = null;
    private isOpen: boolean = false;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

    constructor(app: App, files: FileInfo[], onSelect: (files: FileInfo[]) => void, onClose?: () => void) {
        this.app = app;
        this.files = files;
        this.onSelect = onSelect;
        this.onClose = onClose;
    }

    /**
     * 打开窗口
     */
    open(popupRect?: DOMRect): void {
        if (this.isOpen) return;

        this.isOpen = true;
        this.windowEl = document.createElement("div");
        this.windowEl.className = "markdown-next-ai-file-selection-window";

        this.windowEl.innerHTML = `
            <div class="markdown-next-ai-window-content">
                <div class="markdown-next-ai-window-header">
                    <h2>选择文档</h2>
                    <button class="markdown-next-ai-window-close">✕</button>
                </div>
                <div class="markdown-next-ai-window-body">
                    <div class="markdown-next-ai-search-container">
                        <input type="text" class="markdown-next-ai-search-input" placeholder="搜索文件...">
                    </div>
                    <div class="markdown-next-ai-file-list"></div>
                </div>
                <div class="markdown-next-ai-window-buttons">
                    <button class="markdown-next-ai-confirm-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>
                    <button class="markdown-next-ai-cancel-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
            </div>
        `;

        const closeBtn = this.windowEl.querySelector(".markdown-next-ai-window-close") as HTMLButtonElement;
        const searchInput = this.windowEl.querySelector(".markdown-next-ai-search-input") as HTMLInputElement;
        const fileList = this.windowEl.querySelector(".markdown-next-ai-file-list") as HTMLElement;
        const confirmBtn = this.windowEl.querySelector(".markdown-next-ai-confirm-btn") as HTMLButtonElement;
        const cancelBtn = this.windowEl.querySelector(".markdown-next-ai-cancel-btn") as HTMLButtonElement;

        const closeHandler = (e?: Event) => {
            if (e) e.stopPropagation();
            this.close();
        };

        closeBtn.onclick = closeHandler;
        cancelBtn.onclick = closeHandler;

        confirmBtn.onclick = (e) => {
            e.stopPropagation();
            this.onSelect(this.selectedFiles);
            this.close();
        };

        searchInput.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            this.renderFileList(fileList, query);
        });

        this.renderFileList(fileList, "");

        // 点击外部关闭
        this.outsideClickHandler = (e: MouseEvent) => {
            if (!this.windowEl!.contains(e.target as Node)) {
                this.close();
            }
        };

        setTimeout(() => {
            document.addEventListener("click", this.outsideClickHandler!);
        }, 100);

        // 定位窗口
        this.windowEl.style.position = "fixed";
        document.body.appendChild(this.windowEl);

        // 计算位置
        const contentEl = this.windowEl.querySelector(".markdown-next-ai-window-content") as HTMLElement;
        if (popupRect) {
            let left = popupRect.left;
            if (left + 600 > window.innerWidth - 20) {
                left = window.innerWidth - 600 - 20;
            }
            if (left < 20) left = 20;

            const top = popupRect.bottom + 8;
            const maxHeight = Math.max(300, Math.min(window.innerHeight - top - 20, 500));

            contentEl.style.maxHeight = maxHeight + "px";
            contentEl.style.overflowY = "auto";
            contentEl.style.transform = "none";
            contentEl.style.left = left + "px";
            contentEl.style.top = top + "px";
        } else {
            contentEl.style.left = "50%";
            contentEl.style.top = "50%";
            contentEl.style.transform = "translate(-50%, -50%)";
        }

        this.windowEl.style.zIndex = "10001";
        searchInput.focus();

        contentEl.addEventListener("click", (e) => e.stopPropagation());
    }

    /**
     * 渲染文件列表
     */
    renderFileList(container: HTMLElement, query: string): void {
        container.innerHTML = "";

        const filteredFiles = this.files.filter(file => {
            if (query === "") return true;
            return (file.name || file.path).toLowerCase().includes(query);
        });

        filteredFiles.forEach(file => {
            const fileEl = document.createElement("div");
            fileEl.className = "markdown-next-ai-file-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "markdown-next-ai-file-checkbox";
            checkbox.checked = this.selectedFiles.some(f => f.path === file.path);

            const label = document.createElement("label");
            label.className = "markdown-next-ai-file-label";

            const nameSpan = document.createElement("span");
            nameSpan.className = "markdown-next-ai-file-name";
            nameSpan.textContent = file.name;

            const extSpan = document.createElement("span");
            extSpan.className = "markdown-next-ai-file-extension";
            extSpan.textContent = file.extension ? "." + file.extension : "";

            label.appendChild(nameSpan);
            label.appendChild(extSpan);

            fileEl.appendChild(checkbox);
            fileEl.appendChild(label);
            container.appendChild(fileEl);

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    if (!this.selectedFiles.some(f => f.path === file.path)) {
                        this.selectedFiles.push(file);
                    }
                } else {
                    this.selectedFiles = this.selectedFiles.filter(f => f.path !== file.path);
                }
            });
        });
    }

    /**
     * 关闭窗口
     */
    close(): void {
        if (!this.isOpen) return;

        this.isOpen = false;

        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler);
            this.outsideClickHandler = null;
        }

        if (this.windowEl && this.windowEl.parentNode) {
            this.windowEl.parentNode.removeChild(this.windowEl);
        }
        this.windowEl = null;

        if (this.onClose) {
            this.onClose();
        }
    }
}
