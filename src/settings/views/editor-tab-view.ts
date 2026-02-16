import { Setting } from "obsidian";
import { AbstractTabView } from "./abstract-tab-view";

export class EditorTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;
    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();
        containerEl.createEl("h3", { text: "功能设置" });
        new Setting(containerEl)
            .setName("启用右键菜单")
            .setDesc("在选中文本时显示AI处理选项")
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.enableRightClick)
                .onChange(async (value) => {
                    this.settings.settings.enableRightClick = value;
                    await this.settings.save();
                    if (this.plugin && typeof this.plugin.updateEventListeners === "function") {
                        this.plugin.updateEventListeners();
                    }
                }));

        new Setting(containerEl)
            .setName("直改模式需确认")
            .setDesc("开启后，Direct 模式在写入前显示 Diff 确认")
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.confirmBeforeDirectApply)
                .onChange(async (value) => {
                    this.settings.settings.confirmBeforeDirectApply = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("启用文本触发器系统")
            .setDesc("开启后，下方的“对话弹层文本规则”生效；关闭则全部禁用")
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.enableAtTrigger)
                .onChange(async (value) => {
                    this.settings.settings.enableAtTrigger = value;
                    await this.settings.save();
                    if (this.plugin && typeof this.plugin.updateEventListeners === "function") {
                        this.plugin.updateEventListeners();
                    }
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        if (!this.settings.settings.enableAtTrigger) return;

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
