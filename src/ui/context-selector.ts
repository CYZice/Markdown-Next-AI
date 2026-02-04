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
    private scrollHandler: ((e: Event) => void) | null = null;
    private wheelHandler: ((e: WheelEvent) => void) | null = null;
    private touchMoveHandler: ((e: TouchEvent) => void) | null = null;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

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

        if (this.scrollHandler) {
            document.removeEventListener("scroll", this.scrollHandler as EventListener, true);
        }
        this.scrollHandler = (e: Event) => {
            if (!this.isOpen) return;
            const target = e.target as HTMLElement | null;
            if (this.suggestionEl && target && (this.suggestionEl === target || this.suggestionEl.contains(target))) {
                return;
            }
            this.close();
        };
        document.addEventListener("scroll", this.scrollHandler as EventListener, true);

        if (this.wheelHandler) {
            document.removeEventListener("wheel", this.wheelHandler as EventListener, true);
        }
        this.wheelHandler = (e: WheelEvent) => {
            if (!this.isOpen) return;
            const target = e.target as HTMLElement | null;
            if (this.suggestionEl && target && (this.suggestionEl === target || this.suggestionEl.contains(target))) {
                return;
            }
            this.close();
        };
        document.addEventListener("wheel", this.wheelHandler as EventListener, true);

        if (this.touchMoveHandler) {
            document.removeEventListener("touchmove", this.touchMoveHandler as EventListener, true);
        }
        this.touchMoveHandler = (e: TouchEvent) => {
            if (!this.isOpen) return;
            const target = e.target as HTMLElement | null;
            if (this.suggestionEl && target && (this.suggestionEl === target || this.suggestionEl.contains(target))) {
                return;
            }
            this.close();
        };
        document.addEventListener("touchmove", this.touchMoveHandler as EventListener, true);

        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler as EventListener, true);
        }
        this.outsideClickHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (this.suggestionEl && this.suggestionEl.contains(target)) return;
            this.close();
        };
        document.addEventListener("click", this.outsideClickHandler as EventListener, true);
    }

    /**
     * 获取所有可选项
     */
    getAllItems(searchQuery: string): ContextItem[] {
        const query = (searchQuery || "").toLowerCase().trim();
        const imageExtensions = FILE_EXTENSIONS.IMAGE;
        const docExtensions = FILE_EXTENSIONS.DOCUMENT;

        const activeFile = this.app.workspace.getActiveFile();
        const activePath = activeFile?.path || null;

        const scoreFuzzy = (q: string, text: string): number => {
            if (!q) return 0.5;
            const t = text.toLowerCase();
            if (q === t) return 1;
            let i = 0;
            let lastPos = -1;
            let firstPos = -1;
            for (const ch of q) {
                const pos = t.indexOf(ch, i);
                if (pos === -1) return 0;
                if (firstPos === -1) firstPos = pos;
                lastPos = pos;
                i = pos + 1;
            }
            const span = Math.max(lastPos - firstPos + 1, q.length);
            const closeness = q.length / span;
            const coverage = q.length / Math.max(t.length, q.length);
            const includesBonus = t.includes(q) ? 1 : 0;
            const startBonus = firstPos === 0 ? 0.2 : Math.max(0, 0.1 - firstPos / 50);
            const base = 0.4 * closeness + 0.3 * coverage + 0.3 * includesBonus;
            return Math.min(1, base + startBonus);
        };

        const pathDistance = (a: string, b: string | null): number | null => {
            if (!b) return null;
            const split = (p: string) => p.split(/[\\/]/).filter(Boolean);
            const sa = split(a);
            const sb = split(b);
            let common = 0;
            const len = Math.min(sa.length, sb.length);
            for (let i = 0; i < len; i++) {
                if (sa[i] === sb[i]) common++;
                else break;
            }
            return sa.length + sb.length - 2 * common;
        };

        const scoreWithBoost = (opts: {
            type: "file" | "folder" | "image";
            pathScore: number;
            nameScore: number;
            opened?: boolean;
            distance?: number | null;
            daysSinceLastModified?: number;
        }): number => {
            const { type, pathScore, nameScore } = opts;
            const base = Math.max(pathScore, nameScore);
            let boost = 1;
            if (type === "file") {
                if (opts.opened) boost = Math.max(boost, 3);
                const days = opts.daysSinceLastModified ?? 9999;
                if (days < 30) {
                    const recentBoost = 1 + 2 / (days + 2);
                    boost = Math.max(boost, recentBoost);
                }
                const d = opts.distance ?? null;
                if (d !== null && d > 0 && d <= 5) {
                    const nearbyBoost = 1 + 0.5 / Math.max(d - 1, 1);
                    boost = Math.max(boost, nearbyBoost);
                }
            } else if (type === "folder") {
                const d = opts.distance ?? null;
                if (d !== null && d > 0 && d <= 5) {
                    const nearbyBoost = 1 + 0.5 / Math.max(d - 1, 1);
                    boost = Math.max(boost, nearbyBoost);
                }
            }
            return boost > 1 ? Math.log(boost * base + 1) / Math.log(boost + 1) : base;
        };

        const candidates: { item: ContextItem; score: number }[] = [];

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
            const name = file.basename;
            const path = file.path;
            const nameScore = scoreFuzzy(query, name);
            const pathScore = scoreFuzzy(query, path);
            if (query && Math.max(nameScore, pathScore) === 0) return;
            const opened = activePath ? activePath === path : false;
            const daysSinceLastModified = Math.floor((Date.now() - (file.stat?.mtime || Date.now())) / (24 * 3600 * 1000));
            const distance = pathDistance(path, activePath);
            const score = scoreWithBoost({
                type,
                pathScore,
                nameScore,
                opened,
                distance,
                daysSinceLastModified
            });
            candidates.push({
                item: { type, name, path, icon },
                score
            });
        });

        const folders = this.app.vault.getAllLoadedFiles().filter((f: any) => f.children);
        folders.forEach((folder: any) => {
            const name = folder.name;
            const path = folder.path;
            const nameScore = scoreFuzzy(query, name);
            const pathScore = scoreFuzzy(query, path);
            if (query && Math.max(nameScore, pathScore) === 0) return;
            const distance = pathDistance(path, activePath);
            const score = scoreWithBoost({
                type: "folder",
                pathScore,
                nameScore,
                distance
            });
            candidates.push({
                item: { type: "folder", name, path, icon: "📁" },
                score
            });
        });

        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, 20).map(c => c.item);
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

        if (this.scrollHandler) {
            document.removeEventListener("scroll", this.scrollHandler as EventListener, true);
            this.scrollHandler = null;
        }
        if (this.wheelHandler) {
            document.removeEventListener("wheel", this.wheelHandler as EventListener, true);
            this.wheelHandler = null;
        }
        if (this.touchMoveHandler) {
            document.removeEventListener("touchmove", this.touchMoveHandler as EventListener, true);
            this.touchMoveHandler = null;
        }
        if (this.outsideClickHandler) {
            document.removeEventListener("click", this.outsideClickHandler as EventListener, true);
            this.outsideClickHandler = null;
        }
    }
}
