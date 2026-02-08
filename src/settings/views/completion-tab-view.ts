import { Modal, Notice, Setting } from "obsidian";
import type { TabCompletionOptions, TabCompletionTrigger } from "../../types";
import { AbstractTabView } from "./abstract-tab-view";

export class CompletionTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;
    private showAdvancedCompletion = false;
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

        new Setting(containerEl)
            .setName("触发延迟 (ms)")
            .setDesc("输入结束后等待多久再尝试触发")
            .addText(text => text
                .setValue(String(tc.triggerDelayMs ?? 3000))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val >= 0) {
                        tc.triggerDelayMs = val;
                        await this.settings.save();
                    }
                }));

        new Setting(containerEl)
            .setName("启用空闲触发")
            .setDesc("光标停留一段时间后自动触发")
            .addToggle(toggle => toggle
                .setValue(!!tc.idleTriggerEnabled)
                .onChange(async (value) => {
                    tc.idleTriggerEnabled = value;
                    await this.settings.save();
                    if (this.lastContainerEl) this.render(this.lastContainerEl);
                }));

        if (tc.idleTriggerEnabled) {
            new Setting(containerEl)
                .setName("自动触发延迟 (ms)")
                .setDesc("光标停止多久后触发自动补全")
                .addText(text => text
                    .setValue(String(tc.autoTriggerDelayMs ?? 3000))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tc.autoTriggerDelayMs = val;
                            await this.settings.save();
                        }
                    }));
            new Setting(containerEl)
                .setName("自动触发冷却 (ms)")
                .setDesc("自动触发后冷却多久不再触发")
                .addText(text => text
                    .setValue(String(tc.autoTriggerCooldownMs ?? 15000))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tc.autoTriggerCooldownMs = val;
                            await this.settings.save();
                        }
                    }));
        }

        const advToggle = containerEl.createEl("div", { attr: { style: "margin-top: 12px; cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;" } });
        const icon = advToggle.createEl("span", { text: this.showAdvancedCompletion ? "▼" : "▶" });
        advToggle.createEl("span", { text: "高级设置" });
        advToggle.onclick = () => {
            this.showAdvancedCompletion = !this.showAdvancedCompletion;
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };

        if (this.showAdvancedCompletion) {
            new Setting(containerEl)
                .setName("系统提示词")
                .setDesc("用于补全任务的系统提示词")
                .addTextArea(text => text
                    .setPlaceholder("System prompt...")
                    .setValue(tc.systemPrompt ?? "")
                    .onChange(async (value) => {
                        tc.systemPrompt = value;
                        await this.settings.save();
                    }));

            new Setting(containerEl)
                .setName("基础模型特殊提示词")
                .setDesc("当模型不支持 system role 时，作为前导提示")
                .addTextArea(text => text
                    .setPlaceholder("Base model special prompt...")
                    .setValue(s.baseModelSpecialPrompt ?? "")
                    .onChange(async (value) => {
                        s.baseModelSpecialPrompt = value;
                        await this.settings.save();
                    }));

            new Setting(containerEl)
                .setName("上下文范围")
                .setDesc("发送给模型的上下文长度（字符数）")
                .addText(text => text
                    .setValue(String(tc.contextRange ?? 4000))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val > 0) {
                            tc.contextRange = val;
                            await this.settings.save();
                        }
                    }));

            new Setting(containerEl)
                .setName("最小上下文长度")
                .setDesc("触发补全所需的最小前文长度（字符数）")
                .addText(text => text
                    .setValue(String(tc.minContextLength ?? 20))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tc.minContextLength = val;
                            await this.settings.save();
                        }
                    }));

            new Setting(containerEl)
                .setName("温度 (Temperature)")
                .setDesc("采样温度，范围 0~2")
                .addText(text => text
                    .setValue(String(tc.temperature ?? 0.5))
                    .onChange(async (value) => {
                        const val = parseFloat(value);
                        if (!isNaN(val) && val >= 0 && val <= 2) {
                            tc.temperature = val;
                            await this.settings.save();
                        }
                    }));

            new Setting(containerEl)
                .setName("Top P")
                .setDesc("核采样阈值，范围 0~1")
                .addText(text => text
                    .setValue(String(tc.topP ?? 1))
                    .onChange(async (value) => {
                        const val = parseFloat(value);
                        if (!isNaN(val) && val >= 0 && val <= 1) {
                            tc.topP = val;
                            await this.settings.save();
                        }
                    }));

            new Setting(containerEl)
                .setName("请求超时 (ms)")
                .setDesc("Tab 补全的单次请求超时时间")
                .addText(text => text
                    .setValue(String(tc.requestTimeoutMs ?? 10000))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tc.requestTimeoutMs = val;
                            await this.settings.save();
                        }
                    }));

            new Setting(containerEl)
                .setName("补全额外约束")
                .setDesc("为补全添加额外的行为约束")
                .addTextArea(text => text
                    .setPlaceholder("例如：避免换段、保持当前语气等")
                    .setValue(tc.constraints ?? "")
                    .onChange(async (value) => {
                        tc.constraints = value;
                        await this.settings.save();
                    }));

            new Setting(containerEl)
                .setName("最大重试次数")
                .setDesc("遇到可恢复错误时的重试次数")
                .addText(text => text
                    .setValue(String(tc.maxRetries ?? 1))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tc.maxRetries = val;
                            await this.settings.save();
                        }
                    }));
        }

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

                const container = modal.contentEl.createDiv();
                container.style.textAlign = "center";
                container.style.padding = "20px";

                const display = container.createEl("div", {
                    text: "请按下按键组合...",
                    attr: { style: "font-size: 24px; font-weight: bold; margin-bottom: 20px; min-height: 40px; padding: 10px; border: 1px dashed var(--background-modifier-border); border-radius: 6px; background: var(--background-primary);" }
                });

                let currentPattern = "";
                let recorded = false;

                const btnContainer = container.createDiv({ attr: { style: "display: flex; justify-content: center; gap: 10px;" } });

                const confirmBtn = btnContainer.createEl("button", { text: "确认", cls: "mod-cta" });
                confirmBtn.disabled = true;
                confirmBtn.onclick = () => {
                    if (currentPattern) {
                        const val = currentPattern.replace(/\+/g, "-");
                        input.value = val;
                        (tc as any)[row.keyPath] = val;
                        this.settings.save();
                        recorded = true;
                        modal.close();
                    } else {
                        new Notice("请先输入按键组合");
                    }
                };

                const clearBtn = btnContainer.createEl("button", { text: "清除" });
                clearBtn.onclick = () => {
                    currentPattern = "";
                    display.setText("请按下按键组合...");
                    confirmBtn.disabled = true;
                    // Keep focus on container to continue capturing keys
                    container.focus();
                };

                const cancelBtn = btnContainer.createEl("button", { text: "取消" });
                cancelBtn.onclick = () => modal.close();

                // Focusable container for key events
                container.setAttribute("tabindex", "0");

                const isModifier = (k: string) => k === "Shift" || k === "Control" || k === "Alt" || k === "Meta" || k === "AltGraph";
                const normalizeKey = (k: string) => {
                    const x = k.length === 1 ? k.toUpperCase() : k;
                    return x === "AltGraph" ? "Alt" : x;
                };

                const updateDisplay = (e: KeyboardEvent) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const k = normalizeKey(e.key);
                    const mods = {
                        ctrl: e.ctrlKey || k === "Control",
                        shift: e.shiftKey || k === "Shift",
                        alt: e.altKey || k === "Alt",
                        meta: e.metaKey || k === "Meta"
                    };

                    const parts: string[] = [];
                    if (mods.ctrl) parts.push("Ctrl");
                    if (mods.shift) parts.push("Shift");
                    if (mods.alt) parts.push("Alt");
                    if (mods.meta) parts.push("Meta");

                    if (!isModifier(k)) {
                        parts.push(k);
                    }

                    const pattern = parts.join("-");
                    if (pattern) {
                        currentPattern = pattern;
                        display.setText(pattern);
                        confirmBtn.disabled = false;
                    }
                };

                container.addEventListener("keydown", updateDisplay);

                modal.open();
                setTimeout(() => container.focus(), 50);
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
