import { App } from "obsidian";

interface FolderInfo {
    name: string;
    path: string;
}

/**
 * 文件夹选择窗口
 */
export class FolderSelectionWindow {
    private app: App;
    private folders: FolderInfo[];
    private onSelect: (folders: FolderInfo[]) => void;
    private onClose?: () => void;
    private selectedFolders: FolderInfo[] = [];
    private windowEl: HTMLElement | null = null;
    private isOpen: boolean = false;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

    constructor(app: App, folders: FolderInfo[], onSelect: (folders: FolderInfo[]) => void, onClose?: () => void) {
        this.app = app;
        this.folders = folders;
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
        this.windowEl.className = "markdown-next-ai-folder-selection-window";

        this.windowEl.innerHTML = `
            <div class="markdown-next-ai-window-content">
                <div class="markdown-next-ai-window-header">
                    <h2>选择文件夹</h2>
                    <button class="markdown-next-ai-window-close">✕</button>
                </div>
                <div class="markdown-next-ai-window-body">
                    <div class="markdown-next-ai-search-container">
                        <input type="text" class="markdown-next-ai-search-input" placeholder="搜索文件夹...">
                    </div>
                    <div class="markdown-next-ai-folder-list"></div>
                </div>
                <div class="markdown-next-ai-window-buttons">
                    <button class="markdown-next-ai-confirm-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>
                    <button class="markdown-next-ai-cancel-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
            </div>
        `;

        const closeBtn = this.windowEl.querySelector(".markdown-next-ai-window-close") as HTMLButtonElement;
        const searchInput = this.windowEl.querySelector(".markdown-next-ai-search-input") as HTMLInputElement;
        const folderList = this.windowEl.querySelector(".markdown-next-ai-folder-list") as HTMLElement;
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
            this.onSelect(this.selectedFolders);
            this.close();
        };

        searchInput.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            this.renderFolderList(folderList, query);
        });

        this.renderFolderList(folderList, "");

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
     * 渲染文件夹列表
     */
    renderFolderList(container: HTMLElement, query: string): void {
        container.innerHTML = "";

        const filteredFolders = this.folders.filter(folder => {
            if (query === "") return true;
            return (folder.name || folder.path).toLowerCase().includes(query);
        });

        filteredFolders.forEach(folder => {
            const folderEl = document.createElement("div");
            folderEl.className = "markdown-next-ai-folder-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "markdown-next-ai-folder-checkbox";
            checkbox.checked = this.selectedFolders.some(f => f.path === folder.path);

            const label = document.createElement("label");
            label.className = "markdown-next-ai-folder-label";
            label.textContent = folder.name || folder.path;

            folderEl.appendChild(checkbox);
            folderEl.appendChild(label);
            container.appendChild(folderEl);

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    if (!this.selectedFolders.some(f => f.path === folder.path)) {
                        this.selectedFolders.push(folder);
                    }
                } else {
                    this.selectedFolders = this.selectedFolders.filter(f => f.path !== folder.path);
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
