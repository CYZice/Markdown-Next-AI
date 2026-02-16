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

export class EditorTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;
    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();
        const s = this.settings.settings;
        containerEl.createEl("h3", { text: "功能设置" });
        new Setting(containerEl)
            .setName("启用右键菜单")
            .setDesc("在选中文本时显示AI处理选项")
            .addToggle(toggle => toggle
                .setValue(s.enableRightClick)
                .onChange(async (value) => {
                    s.enableRightClick = value;
                    await this.settings.save();
                    if (this.plugin && typeof this.plugin.updateEventListeners === "function") {
                        this.plugin.updateEventListeners();
                    }
                }));

        new Setting(containerEl)
            .setName("直改模式需确认")
            .setDesc("开启后，Direct 模式在写入前显示 Diff 确认")
            .addToggle(toggle => toggle
                .setValue(s.confirmBeforeDirectApply)
                .onChange(async (value) => {
                    s.confirmBeforeDirectApply = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("启用文本触发器系统")
            .setDesc("开启后，下方的“对话弹层文本规则”生效；关闭则全部禁用")
            .addToggle(toggle => toggle
                .setValue(s.enableAtTrigger)
                .onChange(async (value) => {
                    s.enableAtTrigger = value;
                    await this.settings.save();
                    if (this.plugin && typeof this.plugin.updateEventListeners === "function") {
                        this.plugin.updateEventListeners();
                    }
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        if (!s.enableAtTrigger) return;

        containerEl.createEl("h3", { text: "对话弹层文本规则" });
        containerEl.createEl("div", { text: "提示：默认包含 @ 与 & 两条规则；可自由增删。列表为空或全部禁用时等同于关闭。", attr: { style: "margin: 6px 0 10px; color: var(--text-muted);" } });
        const toolbar = containerEl.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center;margin-bottom:8px;" } });
        const typeSelect = toolbar.createEl("select") as HTMLSelectElement;
        ["string", "regex"].forEach(t => typeSelect.createEl("option", { value: t, text: t }));
        const addBtn = toolbar.createEl("button", { text: "+ 添加规则", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" } });
        addBtn.onclick = async () => {
            const s = this.settings.settings;
            if (!Array.isArray(s.dialogTextTriggers)) s.dialogTextTriggers = [];
            const t = typeSelect.value as any;
            const pattern = t === "regex" ? "\\n$" : "@";
            s.dialogTextTriggers.push({ id: String(Date.now()), type: t, pattern, enabled: true });
            await this.settings.save();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };

        const table = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const thead = table.createEl("thead").createEl("tr");
        thead.createEl("th", { text: "启用" });
        thead.createEl("th", { text: "类型" });
        thead.createEl("th", { text: "模式" });
        thead.createEl("th", { text: "操作" });
        const tbody = table.createEl("tbody");
        const list = this.settings.settings.dialogTextTriggers || [];
        list.forEach((tr, idx) => {
            const row = tbody.createEl("tr");
            const enableCell = row.createEl("td");
            const enable = enableCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            enable.checked = !!tr.enabled;
            enable.onchange = async () => {
                const s = this.settings.settings;
                if (!s.dialogTextTriggers) s.dialogTextTriggers = [];
                s.dialogTextTriggers[idx].enabled = enable.checked;
                await this.settings.save();
            };
            const typeCell = row.createEl("td");
            const typeSel = typeCell.createEl("select") as HTMLSelectElement;
            ["string", "regex"].forEach(t => {
                const opt = typeSel.createEl("option", { value: t, text: t });
                if (t === tr.type) opt.selected = true;
            });
            typeSel.onchange = async () => {
                const s = this.settings.settings;
                if (!s.dialogTextTriggers) s.dialogTextTriggers = [];
                s.dialogTextTriggers[idx].type = typeSel.value as any;
                await this.settings.save();
                if (this.lastContainerEl) this.render(this.lastContainerEl);
            };
            const patCell = row.createEl("td");
            const patInput = patCell.createEl("input", { type: "text", attr: { style: "width: 100%" } }) as HTMLInputElement;
            patInput.value = tr.pattern;
            patInput.onchange = async () => {
                const s = this.settings.settings;
                if (!s.dialogTextTriggers) s.dialogTextTriggers = [];
                s.dialogTextTriggers[idx].pattern = patInput.value;
                await this.settings.save();
            };
            const actCell = row.createEl("td");
            const delBtn = actCell.createEl("button", { text: "删除", attr: { style: "color: var(--text-error);" } });
            delBtn.onclick = async () => {
                const s = this.settings.settings;
                if (!s.dialogTextTriggers) s.dialogTextTriggers = [];
                s.dialogTextTriggers.splice(idx, 1);
                await this.settings.save();
                if (this.lastContainerEl) this.render(this.lastContainerEl);
            };
        });
    }
}

export class PreviewTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;
    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();
        const s = this.settings.settings;
        ensureApplyViewSettings(s);
        const applyView = s.applyView;
        const toggleKey = (list: string[], key: string, value: boolean) => {
            const idx = list.indexOf(key);
            if (value && idx === -1) list.push(key);
            if (!value && idx > -1) list.splice(idx, 1);
        };

        containerEl.createEl("h3", { text: "预览视窗" });
        containerEl.createEl("div", { text: "设置 Diff 预览的展示方式与交互行为", attr: { style: "margin: 6px 0 10px; color: var(--text-muted);" } });

        containerEl.createEl("h4", { text: "展示" });
        new Setting(containerEl)
            .setName("展示模式")
            .setDesc("结果 / 留痕 / 混合")
            .addDropdown(dropdown => dropdown
                .addOption("result", "结果导向")
                .addOption("audit", "留痕审计")
                .addOption("hybrid", "混合模式")
                .setValue(applyView.diff.decidedBlockViewMode ?? "result")
                .onChange(async (value) => {
                    applyView.diff.decidedBlockViewMode = value as any;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("显示标签")
            .setDesc("显示 Accept / Reject / Keep & Insert")
            .addToggle(toggle => toggle
                .setValue(!!applyView.diff.showDecisionBadge)
                .onChange(async (value) => {
                    applyView.diff.showDecisionBadge = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("透明度")
            .setDesc("已决策 Diff 透明度 0~1")
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
            .setName("折叠已决策")
            .setDesc("审计/混合模式可折叠 Diff")
            .addToggle(toggle => toggle
                .setValue(!!applyView.diff.collapseDecidedBlocks)
                .onChange(async (value) => {
                    applyView.diff.collapseDecidedBlocks = value;
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        containerEl.createEl("h4", { text: "顶栏" });
        new Setting(containerEl)
            .setName("溢出策略")
            .setDesc("自动 / 全部进菜单 / 全部留顶栏")
            .addDropdown(dropdown => dropdown
                .addOption("auto", "自动")
                .addOption("alwaysMenu", "全部进菜单")
                .addOption("alwaysToolbar", "全部留顶栏")
                .setValue(applyView.header.overflowPolicy ?? "auto")
                .onChange(async (value) => {
                    applyView.header.overflowPolicy = value as any;
                    await this.settings.save();
                }));

        const headerButtons = [
            { key: "prevNext", label: "导航" },
            { key: "bulkAcceptReject", label: "批量" },
            { key: "keepInsert", label: "保留插入" },
            { key: "progress", label: "进度" },
            { key: "moreMenu", label: "更多" }
        ];
        const menuButtons = [
            { key: "prevNext", label: "导航" },
            { key: "bulkAcceptReject", label: "批量" },
            { key: "keepInsert", label: "保留插入" }
        ];

        containerEl.createEl("div", { text: "按钮显示", attr: { style: "margin: 6px 0 6px; color: var(--text-muted);" } });
        headerButtons.forEach(btn => {
            new Setting(containerEl)
                .setName(btn.label)
                .addToggle(toggle => toggle
                    .setValue(applyView.header.visibleButtons.includes(btn.key))
                    .onChange(async (value) => {
                        toggleKey(applyView.header.visibleButtons, btn.key, value);
                        await this.settings.save();
                        if (this.lastContainerEl) this.render(this.lastContainerEl);
                    }));
        });

        containerEl.createEl("div", { text: "收进更多菜单", attr: { style: "margin: 6px 0 6px; color: var(--text-muted);" } });
        menuButtons.forEach(btn => {
            new Setting(containerEl)
                .setName(btn.label)
                .addToggle(toggle => toggle
                    .setValue(applyView.header.moreMenuItems.includes(btn.key))
                    .onChange(async (value) => {
                        toggleKey(applyView.header.moreMenuItems, btn.key, value);
                        await this.settings.save();
                        if (this.lastContainerEl) this.render(this.lastContainerEl);
                    }));
        });

        containerEl.createEl("h4", { text: "按钮条" });
        new Setting(containerEl)
            .setName("位置")
            .setDesc("Cancel / Apply 位置")
            .addDropdown(dropdown => dropdown
                .addOption("top", "顶部")
                .addOption("bottom", "底部")
                .setValue(applyView.layout.applyBarPosition ?? "top")
                .onChange(async (value) => {
                    applyView.layout.applyBarPosition = value as any;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("悬浮")
            .setDesc("按钮条贴边固定")
            .addToggle(toggle => toggle
                .setValue(!!applyView.layout.applyBarSticky)
                .onChange(async (value) => {
                    applyView.layout.applyBarSticky = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("对齐")
            .setDesc("居中 / 靠右")
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
            .setName("自动跳转")
            .setDesc("决策后跳到下一处未决策")
            .addToggle(toggle => toggle
                .setValue(!!applyView.behavior.autoAdvanceAfterDecision)
                .onChange(async (value) => {
                    applyView.behavior.autoAdvanceAfterDecision = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("跳转延迟")
            .setDesc("毫秒")
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
            .setName("必须全决策")
            .setDesc("未决策时禁用 Apply")
            .addToggle(toggle => toggle
                .setValue(!!applyView.behavior.requireAllDecidedBeforeApply)
                .onChange(async (value) => {
                    applyView.behavior.requireAllDecidedBeforeApply = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("未决策默认")
            .setDesc("Apply 时的默认选择")
            .addDropdown(dropdown => dropdown
                .addOption("incoming", "接受生成")
                .addOption("current", "保留原文")
                .setValue(applyView.behavior.pendingDefaultDecisionOnApply ?? "incoming")
                .onChange(async (value) => {
                    applyView.behavior.pendingDefaultDecisionOnApply = value as any;
                    await this.settings.save();
                }));
    }
}
