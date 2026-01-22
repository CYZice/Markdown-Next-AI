import { App, Component, Notice } from "obsidian";
import { SmartConnectionsAdapter, type SmartConnectionsResult } from "../services/smart-connections-adapter";
import type { CursorPosition } from "../types";

/**
 * 知识检索结果独立浮窗
 * 在 AI 对话框下方独立展示，使用 SC 原生渲染组件
 */
export class KnowledgeResultsFloatingWindow {
    private app: App;
    private position: CursorPosition | null;
    private popupEl: HTMLElement | null = null;
    private isOpen: boolean = false;
    private isDragging: boolean = false;
    private component: Component | null = null;

    // 检索相关
    private currentQuery: string = "";
    private knowledgeResults: SmartConnectionsResult[] = [];
    private selectedKnowledge: Set<string> = new Set();
    private selectedFolder: string = "";

    // 回调函数
    private onSelectCallback: ((results: SmartConnectionsResult[]) => void) | null = null;
    private onCloseCallback: (() => void) | null = null;

    constructor(app: App, position: CursorPosition | null) {
        this.app = app;
        this.position = position;
    }

    /**
     * 打开浮窗
     */
    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        this.popupEl = document.createElement("div");
        this.popupEl.addClass("markdown-next-ai-knowledge-floating-window");

        this.popupEl.innerHTML = `
            <div class="knowledge-window-header">
                <div class="knowledge-window-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <span>知识库检索</span>
                </div>
                <button class="knowledge-window-close" title="关闭">✕</button>
            </div>
            <div class="knowledge-window-search">
                <input type="text" class="knowledge-search-input" placeholder="输入检索关键词..." />
                <select class="knowledge-folder-select">
                    <option value="">所有文件夹</option>
                </select>
                <button class="knowledge-search-btn">搜索</button>
            </div>
            <div class="knowledge-window-content">
                <div class="knowledge-results-list sc-list"></div>
            </div>
            <div class="knowledge-window-footer">
                <button class="knowledge-load-more-btn" style="display:none;">加载更多</button>
                <div class="knowledge-selection-info">
                    <span class="knowledge-selected-count">已选择: 0</span>
                    <button class="knowledge-confirm-btn" disabled>确认选择</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.popupEl);

        // 设置位置
        this.positionWindow();

        // 初始化组件
        this.component = new Component();

        // 绑定事件
        this.bindEvents();

        // 填充文件夹选项
        this.populateFolderOptions();

        // 启用拖动
        this.enableDragging();

        // 聚焦搜索框
        setTimeout(() => {
            const inputEl = this.popupEl!.querySelector(".knowledge-search-input") as HTMLInputElement;
            if (inputEl) inputEl.focus();
        }, 100);
    }

    /**
     * 定位浮窗
     */
    private positionWindow(): void {
        if (!this.popupEl) return;

        if (this.position) {
            this.popupEl.style.position = "fixed";
            this.popupEl.style.left = this.position.left + "px";
            this.popupEl.style.top = (this.position.top + (this.position.height || 20) + 10) + "px";
        } else {
            // 默认居中显示
            this.popupEl.style.position = "fixed";
            this.popupEl.style.left = "50%";
            this.popupEl.style.top = "50%";
            this.popupEl.style.transform = "translate(-50%, -50%)";
        }

        this.popupEl.style.zIndex = "10001"; // 比 AI 对话框高一层
    }

    /**
     * 绑定事件
     */
    private bindEvents(): void {
        if (!this.popupEl) return;

        const closeBtn = this.popupEl.querySelector(".knowledge-window-close") as HTMLButtonElement;
        const searchBtn = this.popupEl.querySelector(".knowledge-search-btn") as HTMLButtonElement;
        const inputEl = this.popupEl.querySelector(".knowledge-search-input") as HTMLInputElement;
        const folderSelect = this.popupEl.querySelector(".knowledge-folder-select") as HTMLSelectElement;
        const loadMoreBtn = this.popupEl.querySelector(".knowledge-load-more-btn") as HTMLButtonElement;
        const confirmBtn = this.popupEl.querySelector(".knowledge-confirm-btn") as HTMLButtonElement;

        closeBtn?.addEventListener("click", () => this.close());
        searchBtn?.addEventListener("click", () => this.runSearch());
        loadMoreBtn?.addEventListener("click", () => this.loadMore());
        confirmBtn?.addEventListener("click", () => this.confirmSelection());

        inputEl?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.runSearch();
            }
        });

        folderSelect?.addEventListener("change", () => {
            this.selectedFolder = folderSelect.value;
        });
    }

    /**
     * 填充文件夹选项
     */
    private populateFolderOptions(): void {
        if (!this.popupEl) return;
        const folderSelect = this.popupEl.querySelector(".knowledge-folder-select") as HTMLSelectElement;
        if (!folderSelect) return;

        const folders: string[] = [];
        const files = this.app.vault.getAllLoadedFiles();
        for (const f of files) {
            if ((f as any).children) {
                folders.push(f.path);
            }
        }
        folders.sort();

        folders.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder;
            option.textContent = folder;
            folderSelect.appendChild(option);
        });
    }

    /**
     * 执行检索
     */
    private async runSearch(): Promise<void> {
        if (!this.popupEl) return;

        const inputEl = this.popupEl.querySelector(".knowledge-search-input") as HTMLInputElement;
        const listEl = this.popupEl.querySelector(".knowledge-results-list") as HTMLElement;

        const query = inputEl?.value?.trim();
        if (!query) {
            new Notice("请输入检索关键词");
            return;
        }

        this.currentQuery = query;
        this.selectedKnowledge.clear();
        this.updateSelectionInfo();

        try {
            listEl.innerHTML = '<div class="knowledge-loading">正在检索中...</div>';

            const adapter = new SmartConnectionsAdapter(this.app);
            await adapter.ensureLoaded();

            const excludeBlocks = await adapter.shouldExcludeBlocksFromSourceConnections();

            const limit = 10;
            const includeFilter = this.selectedFolder || undefined;
            const results = await adapter.lookup(query, {
                limit,
                excludeBlocks,
                includeFilter
            });

            this.knowledgeResults = results;

            // 使用 SC 原生渲染组件
            const frag = await adapter.renderConnectionsResults(results, {});
            listEl.innerHTML = "";

            if (frag && frag.firstChild) {
                while (frag.firstChild) {
                    listEl.appendChild(frag.firstChild);
                }

                // SC 已经默认添加了 sc-collapsed 类，不需要再处理
                // 注入复选框
                this.injectSelectionCheckboxes(listEl);

                // 显示加载更多按钮
                const loadMoreBtn = this.popupEl.querySelector(".knowledge-load-more-btn") as HTMLButtonElement;
                if (loadMoreBtn && results.length === limit) {
                    loadMoreBtn.style.display = "block";
                }
            } else {
                listEl.innerHTML = '<div class="knowledge-empty">未找到相关结果</div>';
            }
        } catch (e) {
            console.error('[KnowledgeResultsFloatingWindow] Search failed:', e);
            listEl.innerHTML = '<div class="knowledge-error">检索失败，请重试</div>';
            new Notice("检索失败: " + String(e));
        }
    }

    /**
     * 注入复选框到每个结果项
     */
    private injectSelectionCheckboxes(listEl: HTMLElement): void {
        const results = Array.from(listEl.querySelectorAll('.sc-result')) as HTMLElement[];
        results.forEach((el) => {
            const path = el.getAttribute('data-path') || '';
            const header = el.querySelector('.header');
            if (!header) return;

            // 创建复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'markdown-next-ai-knowledge-select';
            checkbox.title = '选择此结果';
            checkbox.checked = this.selectedKnowledge.has(path);

            // 处理复选框变化
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    this.selectedKnowledge.add(path);
                } else {
                    this.selectedKnowledge.delete(path);
                }
                this.updateSelectionInfo();
            });

            // 拦截点击事件，防止冒泡
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            header.insertBefore(checkbox, header.firstChild);
        });
    }

    /**
     * 更新选择信息
     */
    private updateSelectionInfo(): void {
        if (!this.popupEl) return;

        const countEl = this.popupEl.querySelector(".knowledge-selected-count") as HTMLElement;
        const confirmBtn = this.popupEl.querySelector(".knowledge-confirm-btn") as HTMLButtonElement;

        const count = this.selectedKnowledge.size;
        if (countEl) {
            countEl.textContent = `已选择: ${count}`;
        }
        if (confirmBtn) {
            confirmBtn.disabled = count === 0;
        }
    }

    /**
     * 加载更多结果
     */
    private async loadMore(): Promise<void> {
        if (!this.popupEl) return;
        const listEl = this.popupEl.querySelector(".knowledge-results-list") as HTMLElement;
        if (!listEl) return;

        try {
            const currentLimit = this.knowledgeResults.length;
            const newLimit = currentLimit + 10;

            const adapter = new SmartConnectionsAdapter(this.app);
            await adapter.ensureLoaded();

            const excludeBlocks = await adapter.shouldExcludeBlocksFromSourceConnections();

            const includeFilter = this.selectedFolder || undefined;
            const results = await adapter.lookup(this.currentQuery, {
                limit: newLimit,
                excludeBlocks,
                includeFilter
            });

            this.knowledgeResults = results;

            // 重新渲染
            const frag = await adapter.renderConnectionsResults(results, {});
            listEl.innerHTML = "";
            if (frag) {
                while (frag.firstChild) {
                    listEl.appendChild(frag.firstChild);
                }
            }

            // SC 已经默认添加了 sc-collapsed 类，不需要再处理
            this.injectSelectionCheckboxes(listEl);

            // 如果没有更多结果，隐藏按钮
            const loadMoreBtn = this.popupEl.querySelector(".knowledge-load-more-btn") as HTMLButtonElement;
            if (loadMoreBtn && results.length === this.knowledgeResults.length) {
                loadMoreBtn.style.display = "none";
            }
        } catch (e) {
            console.error('[KnowledgeResultsFloatingWindow] Load more failed:', e);
            new Notice("加载更多失败");
        }
    }

    /**
     * 确认选择
     */
    private confirmSelection(): void {
        const selectedResults = this.knowledgeResults.filter(r =>
            this.selectedKnowledge.has(r.item?.path)
        );

        if (this.onSelectCallback) {
            this.onSelectCallback(selectedResults);
        }

        new Notice(`已选择 ${selectedResults.length} 个结果`);
        this.close();
    }

    /**
     * 启用拖动
     */
    private enableDragging(): void {
        if (!this.popupEl) return;
        const header = this.popupEl.querySelector(".knowledge-window-header") as HTMLElement;
        if (!header) return;

        let startX = 0;
        let startY = 0;
        let currentTranslateX = 0;
        let currentTranslateY = 0;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || !this.popupEl) return;
            if ((e.target as HTMLElement).closest(".knowledge-window-close")) return;

            this.isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const transform = this.popupEl.style.transform || "translate(0, 0)";
            const matches = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (matches) {
                currentTranslateX = parseFloat(matches[1]) || 0;
                currentTranslateY = parseFloat(matches[2]) || 0;
            }

            document.body.style.userSelect = "none";
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isDragging || !this.popupEl) return;
            e.preventDefault();

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            this.popupEl.style.transform = `translate(${currentTranslateX + deltaX}px, ${currentTranslateY + deltaY}px)`;
        };

        const onMouseUp = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.removeProperty("user-select");
        };

        header.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }

    /**
     * 设置选择回调
     */
    setOnSelect(callback: (results: SmartConnectionsResult[]) => void): void {
        this.onSelectCallback = callback;
    }

    /**
     * 设置关闭回调
     */
    setOnClose(callback: () => void): void {
        this.onCloseCallback = callback;
    }

    /**
     * 关闭浮窗
     */
    close(): void {
        if (!this.isOpen || !this.popupEl) return;
        this.isOpen = false;

        if (this.popupEl.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        this.popupEl = null;

        if (this.component) {
            this.component.unload();
            this.component = null;
        }

        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
    }

    /**
     * 检查是否打开
     */
    isWindowOpen(): boolean {
        return this.isOpen;
    }
}
