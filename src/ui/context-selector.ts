import { App } from "obsidian";
import { FILE_EXTENSIONS } from "../constants";
import type { ContextItem } from "../types";

/**
 * 输入上下文选择器
 * 用于在输入框中通过 @ 触发文件/文件夹选择
 */
export class InputContextSelector {
    private app: App;
    public inputEl: HTMLElement;
    private onSelect: ((item: ContextItem) => void) | null;
    private suggestionEl: HTMLElement | null = null;
    public isOpen: boolean = false;
    private selectedIndex: number = 0;
    private items: ContextItem[] = [];
    private searchQuery: string = "";
    private atPosition: number = 0;
    public selectedTags: ContextItem[] = [];
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(app: App, inputEl: HTMLElement, onSelect: (item: ContextItem) => void) {
        this.app = app;
        this.inputEl = inputEl;
        this.onSelect = onSelect;
    }

    /**
     * 将 textarea 转换为 contentEditable div
     */
    convertToContentEditable(): void {
        if (this.inputEl.tagName === "TEXTAREA") {
            const div = document.createElement("div");
            div.className = this.inputEl.className + " markdown-next-ai-editable-input";
            div.contentEditable = "true";
            div.setAttribute("data-placeholder", (this.inputEl as HTMLTextAreaElement).placeholder);
            div.style.minHeight = "80px";
            div.style.maxHeight = "300px";
            div.style.overflowY = "auto";
            div.textContent = (this.inputEl as HTMLTextAreaElement).value;

            this.inputEl.parentNode!.replaceChild(div, this.inputEl);
            this.inputEl = div;

            this.updatePlaceholder();
            div.addEventListener("input", () => this.updatePlaceholder());
        }
    }

    /**
     * 更新占位符显示
     */
    updatePlaceholder(): void {
        if (this.inputEl.textContent!.trim() === "" &&
            this.inputEl.querySelectorAll(".markdown-next-ai-inline-tag").length === 0) {
            this.inputEl.classList.add("empty");
        } else {
            this.inputEl.classList.remove("empty");
        }
    }

    /**
     * 获取文本内容
     */
    getTextContent(): string {
        let text = "";
        this.inputEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if ((node as HTMLElement).classList && (node as HTMLElement).classList.contains("markdown-next-ai-inline-tag")) {
                const type = (node as HTMLElement).getAttribute("data-type");
                const path = (node as HTMLElement).getAttribute("data-path");
                text += `@[${type}:${path}]`;
            }
        });
        return text;
    }

    /**
     * 获取光标位置
     */
    getCursorPosition(): number {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return 0;

        const range = selection.getRangeAt(0);
        let position = 0;

        const walkNodes = (node: Node): boolean => {
            if (node === range.endContainer) {
                position += range.endOffset;
                return true;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                position += node.textContent!.length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if ((node as HTMLElement).classList && (node as HTMLElement).classList.contains("markdown-next-ai-inline-tag")) {
                    const tagText = `@[${(node as HTMLElement).getAttribute("data-type")}:${(node as HTMLElement).getAttribute("data-path")}]`;
                    position += tagText.length;
                } else {
                    for (const child of Array.from(node.childNodes)) {
                        if (walkNodes(child)) return true;
                    }
                }
            }
            return false;
        };

        for (const node of Array.from(this.inputEl.childNodes)) {
            if (walkNodes(node)) break;
        }

        return position;
    }

    /**
     * 设置光标位置
     */
    setCursorPosition(pos: number): void {
        const selection = window.getSelection();
        const range = document.createRange();
        let currentPos = 0;
        let found = false;

        const walkNodes = (node: Node): void => {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const length = node.textContent!.length;
                if (currentPos + length >= pos) {
                    range.setStart(node, pos - currentPos);
                    range.collapse(true);
                    found = true;
                } else {
                    currentPos += length;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                for (const child of Array.from(node.childNodes)) {
                    walkNodes(child);
                    if (found) return;
                }
            }
        };

        walkNodes(this.inputEl);

        if (!found && this.inputEl.lastChild) {
            range.setStartAfter(this.inputEl.lastChild);
            range.collapse(true);
        }

        selection!.removeAllRanges();
        selection!.addRange(range);
    }

    /**
     * 显示选择器
     */
    show(atPos: number, query: string = ""): void {
        this.atPosition = atPos;
        this.searchQuery = query;
        this.isOpen = true;

        this.items = this.getAllItems(query);

        if (this.items.length === 0) {
            this.close();
            return;
        }

        if (!this.suggestionEl) {
            this.suggestionEl = document.createElement("div");
            this.suggestionEl.className = "markdown-next-ai-context-suggestions";
            this.suggestionEl.addEventListener("click", (e) => e.stopPropagation());
            this.suggestionEl.addEventListener("mousedown", (e) => e.stopPropagation());
            document.body.appendChild(this.suggestionEl);
        }

        this.render();
        this.position();
        this.bindKeyboardEvents();
    }

    /**
     * 获取所有可选项
     */
    getAllItems(searchQuery: string): ContextItem[] {
        const items: ContextItem[] = [];
        const query = searchQuery.toLowerCase();
        const imageExtensions = FILE_EXTENSIONS.IMAGE;
        const docExtensions = FILE_EXTENSIONS.DOCUMENT;

        this.app.vault.getFiles().forEach(file => {
            const ext = file.extension.toLowerCase();
            let type: "file" | "folder" | "image" = "file";
            let icon = "📄";

            if (ext === "md") {
                type = "file";
                icon = "📄";
            } else if (imageExtensions.includes(ext as any)) {
                type = "image";
                icon = "🖼️";
            } else if (docExtensions.includes(ext as any)) {
                type = "file";
                icon = ext === "pdf" ? "📕" :
                    ["xlsx", "xls", "csv"].includes(ext) ? "📊" :
                        ["docx", "doc", "txt"].includes(ext) ? "📝" :
                            ["epub", "mobi"].includes(ext) ? "📚" :
                                ext === "json" ? "📋" : "📄";
            } else {
                return;
            }

            if (searchQuery && !file.basename.toLowerCase().includes(query) &&
                !file.path.toLowerCase().includes(query)) {
                return;
            }

            items.push({
                type: type,
                name: file.basename,
                path: file.path,
                icon: icon
            });
        });

        const folders = this.app.vault.getAllLoadedFiles().filter((f: any) => f.children);
        folders.forEach((folder: any) => {
            if (searchQuery && !folder.name.toLowerCase().includes(query) &&
                !folder.path.toLowerCase().includes(query)) {
                return;
            }

            items.push({
                type: "folder",
                name: folder.name,
                path: folder.path,
                icon: "📁"
            });
        });

        return items.slice(0, 50);
    }

    /**
     * 渲染选择列表
     */
    render(): void {
        if (!this.suggestionEl) return;

        this.suggestionEl.innerHTML = "";

        const header = document.createElement("div");
        header.className = "markdown-next-ai-suggestions-header";
        header.textContent = `选择上下文 (${this.items.length}项)`;
        this.suggestionEl.appendChild(header);

        const list = document.createElement("div");
        list.className = "markdown-next-ai-suggestions-list";

        this.items.forEach((item, index) => {
            const itemEl = document.createElement("div");
            itemEl.className = "markdown-next-ai-suggestion-item";
            if (index === this.selectedIndex) {
                itemEl.classList.add("selected");
            }

            itemEl.innerHTML = `
                <span class="markdown-next-ai-suggestion-icon">${item.icon}</span>
                <div class="markdown-next-ai-suggestion-content">
                    <div class="markdown-next-ai-suggestion-name">${item.name}</div>
                    <div class="markdown-next-ai-suggestion-path">${item.path}</div>
                </div>
            `;

            itemEl.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.selectItem(index);
            };

            list.appendChild(itemEl);
        });

        this.suggestionEl.appendChild(list);
    }

    /**
     * 定位选择器
     */
    position(): void {
        if (!this.suggestionEl || !this.inputEl) return;

        const inputRect = this.inputEl.getBoundingClientRect();
        const selection = window.getSelection();

        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            this.suggestionEl.style.position = "fixed";
            this.suggestionEl.style.left = rect.left + "px";
            this.suggestionEl.style.top = (rect.bottom + 5) + "px";
        } else {
            this.suggestionEl.style.position = "fixed";
            this.suggestionEl.style.left = inputRect.left + "px";
            this.suggestionEl.style.top = (inputRect.bottom + 5) + "px";
        }

        this.suggestionEl.style.maxHeight = "300px";
        this.suggestionEl.style.overflowY = "auto";
        this.suggestionEl.style.zIndex = "10000";
    }

    /**
     * 绑定键盘事件
     */
    bindKeyboardEvents(): void {
        if (this.keydownHandler) {
            this.inputEl.removeEventListener("keydown", this.keydownHandler);
        }

        this.keydownHandler = (e: KeyboardEvent) => {
            if (!this.isOpen) return;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
                    this.render();
                    this.scrollToSelected();
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                    this.render();
                    this.scrollToSelected();
                    break;
                case "Enter":
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectItem(this.selectedIndex);
                    break;
                case "Escape":
                    e.preventDefault();
                    e.stopPropagation();
                    this.close();
                    break;
            }
        };

        this.inputEl.addEventListener("keydown", this.keydownHandler);
    }

    /**
     * 滚动到选中项
     */
    scrollToSelected(): void {
        if (!this.suggestionEl) return;
        const selected = this.suggestionEl.querySelector(".markdown-next-ai-suggestion-item.selected");
        if (selected) {
            selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    /**
     * 选择项目
     */
    selectItem(index: number): void {
        if (index < 0 || index >= this.items.length) return;

        const item = this.items[index];
        const tag = document.createElement("span");
        tag.className = "markdown-next-ai-inline-tag";
        tag.contentEditable = "false";
        tag.setAttribute("data-type", item.type);
        tag.setAttribute("data-path", item.path);
        tag.innerHTML = `<span class="markdown-next-ai-inline-tag-icon">${item.icon}</span><span class="markdown-next-ai-inline-tag-name">${item.name}</span>`;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const deleteLength = this.getCursorPosition() - this.atPosition;

        let position = 0;
        let found = false;

        const deleteText = (node: Node, start: number, length: number): void => {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const textLength = node.textContent!.length;
                if (position + textLength > start) {
                    const startOffset = start - position;
                    const endOffset = Math.min(startOffset + length, textLength);
                    const text = node.textContent!;
                    node.textContent = text.substring(0, startOffset) + text.substring(endOffset);
                    range.setStart(node, startOffset);
                    range.collapse(true);
                    found = true;
                } else {
                    position += textLength;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if ((node as HTMLElement).classList && (node as HTMLElement).classList.contains("markdown-next-ai-inline-tag")) {
                    const tagText = `@[${(node as HTMLElement).getAttribute("data-type")}:${(node as HTMLElement).getAttribute("data-path")}]`;
                    position += tagText.length;
                } else {
                    for (const child of Array.from(node.childNodes)) {
                        deleteText(child, start, length);
                        if (found) return;
                    }
                }
            }
        };

        deleteText(this.inputEl, this.atPosition, deleteLength);

        if (!found) {
            range.deleteContents();
        }

        range.insertNode(tag);

        const space = document.createTextNode(" ");
        range.setStartAfter(tag);
        range.insertNode(space);
        range.setStartAfter(space);
        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);

        this.inputEl.focus();
        this.updatePlaceholder();

        this.selectedTags.push(item);
        if (this.onSelect) {
            this.onSelect(item);
        }

        this.close();
    }

    /**
     * 更新搜索
     */
    updateSearch(query: string): void {
        this.searchQuery = query;
        this.items = this.getAllItems(query);
        this.selectedIndex = 0;

        if (this.items.length === 0) {
            this.close();
        } else {
            this.render();
        }
    }

    /**
     * 关闭选择器
     */
    close(): void {
        this.isOpen = false;
        if (this.suggestionEl && this.suggestionEl.parentNode) {
            this.suggestionEl.parentNode.removeChild(this.suggestionEl);
        }
        this.suggestionEl = null;

        if (this.keydownHandler) {
            this.inputEl.removeEventListener("keydown", this.keydownHandler);
            this.keydownHandler = null;
        }
    }
}
