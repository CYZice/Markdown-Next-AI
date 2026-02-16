import { Setting } from "obsidian";
import { AbstractTabView } from "./abstract-tab-view";

const ensureApplyViewSettings = (s: any) => {
    if (!s.applyView) {
        s.applyView = {
            diff: {
                decidedBlockViewMode: "result",
                showDecisionBadge: true,
                decidedBlockOpacity: 0.6,
                collapseDecidedBlocks: false
            },
            layout: {
                applyBarPosition: "top",
                applyBarSticky: false,
                applyBarAlignment: "center"
            },
            header: {
                visibleButtons: ["prevNext", "bulkAcceptReject", "keepInsert", "progress", "moreMenu"],
                overflowPolicy: "auto",
                moreMenuItems: []
            },
            behavior: {
                autoAdvanceAfterDecision: true,
                autoAdvanceDelayMs: 100,
                requireAllDecidedBeforeApply: false,
                pendingDefaultDecisionOnApply: "incoming"
            }
        };
    }
    if (!s.applyView.diff) {
        s.applyView.diff = {
            decidedBlockViewMode: "result",
            showDecisionBadge: true,
            decidedBlockOpacity: 0.6,
            collapseDecidedBlocks: false
        };
    }
    if (!s.applyView.layout) {
        s.applyView.layout = {
            applyBarPosition: "top",
            applyBarSticky: false,
            applyBarAlignment: "center"
        };
    }
    if (!s.applyView.header) {
        s.applyView.header = {
            visibleButtons: ["prevNext", "bulkAcceptReject", "keepInsert", "progress", "moreMenu"],
            overflowPolicy: "auto",
            moreMenuItems: []
        };
    }
    if (!Array.isArray(s.applyView.header.visibleButtons)) s.applyView.header.visibleButtons = ["prevNext", "bulkAcceptReject", "keepInsert", "progress", "moreMenu"];
    if (!Array.isArray(s.applyView.header.moreMenuItems)) s.applyView.header.moreMenuItems = [];
    if (!s.applyView.behavior) {
        s.applyView.behavior = {
            autoAdvanceAfterDecision: true,
            autoAdvanceDelayMs: 100,
            requireAllDecidedBeforeApply: false,
            pendingDefaultDecisionOnApply: "incoming"
        };
    }
};

export class PreviewTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;

    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();

        const s = this.settings.settings;
        ensureApplyViewSettings(s);
        const applyView = s.applyView!;

        const toggleKey = (list: string[], key: string, value: boolean) => {
            const idx = list.indexOf(key);
            if (value && idx === -1) list.push(key);
            if (!value && idx > -1) list.splice(idx, 1);
        };

        containerEl.createEl("h3", { text: "变更对比视窗" });
        containerEl.createEl("div", {
            text: "用于配置 AI 修改建议的呈现方式与交互体验",
            attr: { style: "margin: 6px 0 10px; color: var(--text-muted); font-size: 0.9em;" }
        });

        containerEl.createEl("h4", { text: "视觉呈现" });
        new Setting(containerEl)
            .setName("视图模式")
            .setDesc("决定已处理变更块的呈现方式")
            .addDropdown(dropdown => dropdown
                .addOption("result", "Fast Draft (Fast)")
                .addOption("audit", "Precise Review (Safe)")
                .addOption("hybrid", "Balanced Focus (Balanced)")
                .setValue(applyView.diff.decidedBlockViewMode ?? "result")
                .onChange(async (value) => {
                    applyView.diff.decidedBlockViewMode = value as any;
                    await this.settings.save();
                }));

        containerEl.createEl("div", {
            text: "Fast Draft：快速定稿；Precise Review：精准核对；Balanced Focus：混合专注。",
            attr: { style: "margin: -10px 0 14px 0; color: var(--text-muted); font-size: 0.85em; padding-left: 12px; border-left: 2px solid var(--interactive-accent);" }
        });

        new Setting(containerEl)
            .setName("显示状态标记")
            .setDesc("在变更块旁显示“已接受/已拒绝”等状态标记")
            .addToggle(toggle => toggle
                .setValue(!!applyView.diff.showDecisionBadge)
                .onChange(async (value) => {
                    applyView.diff.showDecisionBadge = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("已处理内容弱化")
            .setDesc("调整已处理变更块的不透明度（0.1~1.0）")
            .addText(text => text
                .setValue(String(applyView.diff.decidedBlockOpacity ?? 0.6))
                .onChange(async (value) => {
                    const num = Number(value);
                    if (!Number.isNaN(num)) {
                        applyView.diff.decidedBlockOpacity = Math.max(0, Math.min(1, num));
                        await this.settings.save();
                    }
                }));

        new Setting(containerEl)
            .setName("自动折叠已处理块")
            .setDesc("完成决策后，将对应变更块折叠为单行以减少滚动。建议在“全量修订”模式下开启")
            .addToggle(toggle => toggle
                .setValue(!!applyView.diff.collapseDecidedBlocks)
                .onChange(async (value) => {
                    applyView.diff.collapseDecidedBlocks = value;
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        containerEl.createEl("h4", { text: "顶栏" });
        new Setting(containerEl)
            .setName("按钮布局策略")
            .setDesc("当窗口宽度不足时，功能按钮的显示方式")
            .addDropdown(dropdown => dropdown
                .addOption("auto", "智能响应")
                .addOption("alwaysMenu", "极简模式")
                .addOption("alwaysToolbar", "完全展开")
                .setValue(applyView.header.overflowPolicy ?? "auto")
                .onChange(async (value) => {
                    applyView.header.overflowPolicy = value as any;
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        const headerButtons = [
            { key: "prevNext", label: "上一个/下一个", allowMoreMenu: true },
            { key: "bulkAcceptReject", label: "全部接受/拒绝", allowMoreMenu: true },
            { key: "keepInsert", label: "保留原内容并插入", allowMoreMenu: true },
            { key: "progress", label: "剩余进度", allowMoreMenu: false },
            { key: "moreMenu", label: "更多菜单", allowMoreMenu: false }
        ] as const;

        const overflowPolicy = applyView.header.overflowPolicy ?? "auto";
        const toolbarColDisabled = overflowPolicy === "alwaysMenu";
        const moreMenuColDisabled = overflowPolicy === "alwaysToolbar";

        containerEl.createEl("div", { text: "每个按钮仅可选择一种显示方式：在顶栏显示、收纳到“更多”菜单或隐藏", attr: { style: "margin: 6px 0 8px; color: var(--text-muted);" } });

        const btnTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const btnHead = btnTable.createEl("thead").createEl("tr");
        btnHead.createEl("th", { text: "按钮" });
        btnHead.createEl("th", { text: "显示" });
        btnHead.createEl("th", { text: "收进菜单" });
        const btnBody = btnTable.createEl("tbody");

        headerButtons.forEach(btn => {
            const row = btnBody.createEl("tr");
            row.createEl("td", { text: btn.label });

            const showCell = row.createEl("td");
            const showInput = showCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            const isVisible = applyView.header.visibleButtons.includes(btn.key);
            const isInMenu = applyView.header.moreMenuItems.includes(btn.key);
            showInput.checked = isVisible && !isInMenu;
            showInput.disabled = toolbarColDisabled;
            showInput.onchange = async () => {
                if (showInput.checked) {
                    toggleKey(applyView.header.visibleButtons, btn.key, true);
                    toggleKey(applyView.header.moreMenuItems, btn.key, false);
                } else {
                    toggleKey(applyView.header.visibleButtons, btn.key, false);
                    toggleKey(applyView.header.moreMenuItems, btn.key, false);
                }
                await this.settings.save();
                if (this.lastContainerEl) this.render(this.lastContainerEl);
            };

            const menuCell = row.createEl("td");
            const menuInput = menuCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            const isMenuSupported = btn.allowMoreMenu;
            menuInput.checked = isVisible && isInMenu;
            menuInput.disabled = moreMenuColDisabled || !isMenuSupported;
            menuInput.onchange = async () => {
                if (menuInput.checked) {
                    toggleKey(applyView.header.visibleButtons, btn.key, true);
                    toggleKey(applyView.header.moreMenuItems, btn.key, true);
                } else {
                    toggleKey(applyView.header.visibleButtons, btn.key, false);
                    toggleKey(applyView.header.moreMenuItems, btn.key, false);
                }
                await this.settings.save();
                if (this.lastContainerEl) this.render(this.lastContainerEl);
            };
        });

        containerEl.createEl("h4", { text: "操作栏" });
        new Setting(containerEl)
            .setName("确认条位置")
            .setDesc("设置“应用变更”和“取消”按钮栏的显示位置")
            .addDropdown(dropdown => dropdown
                .addOption("top", "顶部")
                .addOption("bottom", "底部")
                .setValue(applyView.layout.applyBarPosition ?? "top")
                .onChange(async (value) => {
                    applyView.layout.applyBarPosition = value as any;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("固定在边缘")
            .setDesc("滚动内容时，将操作栏固定在视窗顶部或底部")
            .addToggle(toggle => toggle
                .setValue(!!applyView.layout.applyBarSticky)
                .onChange(async (value) => {
                    applyView.layout.applyBarSticky = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("内容对齐")
            .setDesc("设置操作栏内按钮的对齐方式")
            .addDropdown(dropdown => dropdown
                .addOption("center", "居中")
                .addOption("right", "靠右")
                .setValue(applyView.layout.applyBarAlignment ?? "center")
                .onChange(async (value) => {
                    applyView.layout.applyBarAlignment = value as any;
                    await this.settings.save();
                }));

        containerEl.createEl("h4", { text: "行为" });
        new Setting(containerEl)
            .setName("决策后自动跳转")
            .setDesc("点击接受/拒绝后，自动定位到下一个待处理的变更块")
            .addToggle(toggle => toggle
                .setValue(!!applyView.behavior.autoAdvanceAfterDecision)
                .onChange(async (value) => {
                    applyView.behavior.autoAdvanceAfterDecision = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("跳转延迟")
            .setDesc("设置自动跳转的延迟（毫秒）")
            .addText(text => text
                .setValue(String(applyView.behavior.autoAdvanceDelayMs ?? 100))
                .onChange(async (value) => {
                    const num = Number(value);
                    if (!Number.isNaN(num) && num >= 0) {
                        applyView.behavior.autoAdvanceDelayMs = Math.floor(num);
                        await this.settings.save();
                    }
                }));

        new Setting(containerEl)
            .setName("强制完全决策")
            .setDesc("仅在所有变更块均完成决策后，才允许点击“应用变更”")
            .addToggle(toggle => toggle
                .setValue(!!applyView.behavior.requireAllDecidedBeforeApply)
                .onChange(async (value) => {
                    applyView.behavior.requireAllDecidedBeforeApply = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("待处理项默认行为")
            .setDesc("当存在未决策变更仍点击“应用变更”时，设置剩余内容的默认处理方式")
            .addDropdown(dropdown => dropdown
                .addOption("incoming", "默认全部接受")
                .addOption("current", "默认保留原文")
                .setValue(applyView.behavior.pendingDefaultDecisionOnApply ?? "incoming")
                .onChange(async (value) => {
                    applyView.behavior.pendingDefaultDecisionOnApply = value as any;
                    await this.settings.save();
                }));
    }
}
