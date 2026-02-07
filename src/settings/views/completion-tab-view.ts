import { Modal, Notice, Setting } from "obsidian";
import type { TabCompletionOptions, TabCompletionTrigger } from "../../types";
import { AbstractTabView } from "./abstract-tab-view";

export class CompletionTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;
    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();
        containerEl.createEl("h3", { text: "Tab 补全设置" });
        const s = this.settings.settings;
        const tc: TabCompletionOptions = s.tabCompletion ?? (s.tabCompletion = {
            enabled: false,
            modelId: s.currentModel ?? "",
            systemPrompt:
                'Your job is to predict the most logical text that should be written at the location of the <mask/>. Your answer can be either code, a single word, or multiple sentences. Your answer must be in the same language as the text that is already there.' +
                '\n\nAdditional constraints:\n{{tab_completion_constraints}}' +
                '\n\nOutput only the text that should appear at the <mask/>. Do not include explanations, labels, or formatting.',
            maxSuggestionLength: 2000,
            contextRange: 4000,
            minContextLength: 20,
            idleTriggerEnabled: false,
            autoTriggerDelayMs: 3000,
            triggerDelayMs: 3000,
            autoTriggerCooldownMs: 15000,
            requestTimeoutMs: 12000,
            maxRetries: 1,
            lengthPreset: "medium",
            constraints: "",
            temperature: 0.5,
            topP: 1,
            triggers: [
                { id: 'sentence-end-comma', type: 'string', pattern: ', ', enabled: true },
                { id: 'sentence-end-chinese-comma', type: 'string', pattern: '，', enabled: true },
                { id: 'sentence-end-colon', type: 'string', pattern: ': ', enabled: true },
                { id: 'sentence-end-chinese-colon', type: 'string', pattern: '：', enabled: true },
                { id: 'newline', type: 'regex', pattern: '\\n$', enabled: true },
                { id: 'list-item', type: 'regex', pattern: '(?:^|\\n)[-*+]\\s$', enabled: true }
            ]
        } as any);

        new Setting(containerEl)
            .setName("启用 Tab 补全")
            .setDesc("启用编辑器中的 Tab 自动补全功能")
            .addToggle(toggle => toggle
                .setValue(!!tc.enabled)
                .onChange(async (value) => {
                    tc.enabled = value;
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        if (!tc.enabled) return;

        const triggerHeader = containerEl.createEl("div", { attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-top: 12px; margin-bottom: 8px;" } });
        triggerHeader.createEl("div", { text: "触发器配置", attr: { style: "font-weight: 600;" } });
        triggerHeader.createEl("div", { attr: { style: "display: flex; gap: 8px; align-items: center;" } })
            .createEl("button", { text: "+ 添加触发器", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" } })
            .onclick = () => this.showAddTriggerModal();

        const triggerDesc = containerEl.createEl("div", { attr: { style: "color: var(--text-muted); margin-bottom: 8px;" } });
        triggerDesc.setText("配置触发补全的规则，匹配光标前文本时触发补全");
        const triggerTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const tHeadRow = triggerTable.createEl("thead").createEl("tr");
        tHeadRow.createEl("th", { text: "启用" });
        tHeadRow.createEl("th", { text: "类型" });
        tHeadRow.createEl("th", { text: "模式" });
        tHeadRow.createEl("th", { text: "描述" });
        tHeadRow.createEl("th", { text: "删除" });
        const tBody = triggerTable.createEl("tbody");
        if (!tc.triggers) tc.triggers = [];
        tc.triggers.forEach((trigger: TabCompletionTrigger, index: number) => {
            const row = tBody.createEl("tr");
            const enableCell = row.createEl("td");
            const enableToggle = enableCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            enableToggle.checked = trigger.enabled;
            enableToggle.onchange = async () => {
                tc.triggers[index].enabled = enableToggle.checked;
                await this.settings.save();
            };
            const typeCell = row.createEl("td");
            const typeSelect = typeCell.createEl("select") as HTMLSelectElement;
            [{ v: 'string', l: '字符串' }, { v: 'regex', l: '正则' }].forEach(opt => {
                const o = typeSelect.createEl("option", { text: opt.l }) as HTMLOptionElement;
                o.value = opt.v as any;
                if (trigger.type === opt.v) o.selected = true;
            });
            typeSelect.onchange = async () => {
                tc.triggers[index].type = typeSelect.value as any;
                await this.settings.save();
            };
            const patternCell = row.createEl("td");
            const patternInput = patternCell.createEl("input", { type: "text", attr: { style: "width: 100%;" } }) as HTMLInputElement;
            patternInput.value = trigger.pattern;
            patternInput.onchange = async () => {
                tc.triggers[index].pattern = patternInput.value;
                await this.settings.save();
            };
            const descCell = row.createEl("td");
            const descInput = descCell.createEl("input", { type: "text", attr: { style: "width: 100%;" } }) as HTMLInputElement;
            descInput.value = trigger.description ?? "";
            descInput.onchange = async () => {
                tc.triggers[index].description = descInput.value;
                await this.settings.save();
            };
            const delCell = row.createEl("td");
            delCell.createEl("button", { text: "删除" }).onclick = async () => {
                if (confirm(`确定要删除此触发器 "${trigger.pattern}" ？`)) {
                    tc.triggers.splice(index, 1);
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }
            };
        });

        containerEl.createEl("h3", { text: "Tab 补全快捷键" });
        const kbTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const kbHead = kbTable.createEl("thead").createEl("tr");
        kbHead.createEl("th", { text: "功能" });
        kbHead.createEl("th", { text: "按键" });
        kbHead.createEl("th", { text: "录制" });
        const kbBody = kbTable.createEl("tbody");
        const kbRows: Array<{ label: string; keyPath: keyof typeof tc; defaultVal: string }> = [
            { label: "接受建议", keyPath: "acceptKey", defaultVal: "Tab" },
            { label: "拒绝建议", keyPath: "rejectKey", defaultVal: "Shift-Tab" },
            { label: "取消建议", keyPath: "cancelKey", defaultVal: "Escape" },
            { label: "手动触发", keyPath: "triggerKey", defaultVal: "Alt-/" },
        ];
        kbRows.forEach(row => {
            const tr = kbBody.createEl("tr");
            tr.createEl("td", { text: row.label });
            const keyCell = tr.createEl("td");
            const input = keyCell.createEl("input", { type: "text", attr: { style: "width: 70%;" } }) as HTMLInputElement;
            input.value = (tc[row.keyPath] as any) || row.defaultVal;
            input.onchange = async () => {
                (tc as any)[row.keyPath] = input.value;
                await this.settings.save();
            };
            const recCell = tr.createEl("td");
            const recBtn = recCell.createEl("button", { text: "录制按键" });
            recBtn.onclick = () => {
                const modal = new Modal(this.app);
                modal.titleEl.setText("录制按键");
                modal.contentEl.createEl("div", { text: "按下目标按键组合", attr: { style: "padding: 12px; text-align: center;" } });
                modal.contentEl.setAttribute("tabindex", "0");
                let recorded = false;
                let activeMods = { ctrl: false, shift: false, alt: false, meta: false };
                let modsSnapshot = { ctrl: false, shift: false, alt: false, meta: false };
                const isModifier = (k: string) => k === "Shift" || k === "Control" || k === "Alt" || k === "Meta" || k === "AltGraph";
                const normalizeKey = (k: string) => {
                    const x = k.length === 1 ? k.toUpperCase() : k;
                    return x === "AltGraph" ? "Alt" : x;
                };
                const patternFrom = (mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }, key?: string) => {
                    const parts: string[] = [];
                    if (mods.ctrl) parts.push("Ctrl");
                    if (mods.shift) parts.push("Shift");
                    if (mods.alt) parts.push("Alt");
                    if (mods.meta) parts.push("Meta");
                    if (key && !isModifier(key)) parts.push(key);
                    return parts.join("-");
                };
                const finalize = (pattern: string) => {
                    if (recorded) return;
                    const val = pattern.replace(/\+/g, "-");
                    input.value = val;
                    (tc as any)[row.keyPath] = val;
                    this.settings.save().then(() => {
                        recorded = true;
                        modal.close();
                    });
                };
                const keydownHandler = (e: KeyboardEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const k = normalizeKey(e.key);
                    activeMods.ctrl = e.ctrlKey || k === "Control";
                    activeMods.shift = e.shiftKey || k === "Shift";
                    activeMods.alt = e.altKey || k === "Alt";
                    activeMods.meta = e.metaKey || k === "Meta";
                    if (isModifier(k)) {
                        modsSnapshot = { ...activeMods };
                        return;
                    }
                    finalize(patternFrom(activeMods, k));
                };
                const keyupHandler = (e: KeyboardEvent) => {
                    if (recorded) return;
                    const k = normalizeKey(e.key);
                    if (k === "Control") activeMods.ctrl = false;
                    if (k === "Shift") activeMods.shift = false;
                    if (k === "Alt") activeMods.alt = false;
                    if (k === "Meta") activeMods.meta = false;
                    if (!activeMods.ctrl && !activeMods.shift && !activeMods.alt && !activeMods.meta && isModifier(k)) {
                        finalize(patternFrom(modsSnapshot));
                    }
                };
                modal.contentEl.addEventListener("keydown", keydownHandler);
                modal.contentEl.addEventListener("keyup", keyupHandler);
                modal.open();
                setTimeout(() => modal.contentEl.focus(), 10);
            };
        });
    }

    private showAddTriggerModal(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加触发器");

        const { contentEl } = modal;

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLSelectElement;
        typeSelect.createEl("option", { value: "regex", text: "正则表达式 (Regex)" }).selected = true;
        typeSelect.createEl("option", { value: "string", text: "精确字符串 (String)" });

        contentEl.createEl("label", { text: "模式 (Pattern):", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        contentEl.createEl("p", { text: "例如: \\.$ 匹配行尾的点，\\n$ 匹配换行符", attr: { style: "color: var(--text-muted); font-size: 0.8em; margin-top: -5px; margin-bottom: 5px;" } });

        const patternInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "输入匹配模式...",
            attr: { style: "width: 100%; margin-bottom: 15px; font-family: var(--font-monospace);" }
        }) as HTMLInputElement;

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "添加", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const pattern = patternInput.value;

            if (!pattern) {
                new Notice("请输入模式内容");
                return;
            }

            const s = this.settings.settings;
            const tab: TabCompletionOptions = (s.tabCompletion = s.tabCompletion ?? ({ enabled: false, modelId: s.currentModel, systemPrompt: "", maxSuggestionLength: 2000, contextRange: 4000, idleTriggerEnabled: false, autoTriggerDelayMs: 3000, triggerDelayMs: 3000, autoTriggerCooldownMs: 15000, triggers: [] } as any));
            if (!tab.triggers) tab.triggers = [];

            tab.triggers.push({
                type: typeSelect.value as 'regex' | 'string',
                pattern: pattern,
                enabled: true
            });

            await this.settings.save();
            new Notice("触发器已添加");
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };

        modal.open();
        patternInput.focus();
    }
}
