import { Modal, Notice, Setting } from "obsidian";
import type { CommonPrompt, GlobalRule } from "../../types";
import { AbstractTabView } from "./abstract-tab-view";

export class ChatTabView extends AbstractTabView {
    render(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "全局规则设置" });
        new Setting(containerEl)
            .setName("启用全局规则")
            .setDesc("开启后，全局规则将自动应用到所有AI请求中")
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.enableGlobalRules)
                .onChange(async (value) => {
                    this.settings.settings.enableGlobalRules = value;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("规则数量")
            .setDesc("当前全局规则条目数")
            .addButton(b => b.setButtonText(String(this.settings.settings.globalRules?.length ?? 0)).setDisabled(true));

        new Setting(containerEl)
            .setName("管理全局规则")
            .setDesc("添加、编辑和管理全局规则")
            .addButton(button => button
                .setButtonText("打开规则管理器")
                .onClick(() => this.showRuleManager()));

        containerEl.createEl("h3", { text: "常用提示词管理" });
        new Setting(containerEl)
            .setName("添加新提示词")
            .setDesc("创建一个新的常用提示词")
            .addButton(button => button
                .setButtonText("添加提示词")
                .onClick(() => this.showPromptModal()));

        if (this.settings.settings.commonPrompts && this.settings.settings.commonPrompts.length > 0) {
            const promptsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 15px;" } });
            this.settings.settings.commonPrompts.forEach((prompt, index) => {
                const promptEl = promptsContainer.createEl("div", { attr: { style: "display: flex; align-items: center; justify-content: space-between; padding: 10px; margin-bottom: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-secondary);" } });
                const infoEl = promptEl.createEl("div", { attr: { style: "flex: 1;" } });
                infoEl.createEl("div", { text: prompt.name || "未命名提示词", attr: { style: "font-weight: bold; margin-bottom: 4px;" } });
                infoEl.createEl("div", { text: prompt.content && prompt.content.length > 100 ? prompt.content.substring(0, 100) + "..." : (prompt.content || ""), attr: { style: "color: var(--text-muted); font-size: 0.7em;" } });
                const actionsEl = promptEl.createEl("div", { attr: { style: "display: flex; gap: 8px;" } });
                actionsEl.createEl("button", { text: "编辑", attr: { style: "padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); border-radius: 4px; cursor: pointer;" } }).onclick = () => this.showPromptModal(index);
                actionsEl.createEl("button", { text: "删除", attr: { style: "padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--text-error); background: var(--background-primary); color: var(--text-error); border-radius: 4px; cursor: pointer;" } }).onclick = () => this.deletePrompt(index);
            });
        } else {
            containerEl.createEl("p", { text: "暂无常用提示词，点击上方按钮添加", attr: { style: "color: var(--text-muted); font-style: italic; margin-top: 15px;" } });
        }
    }

    private showPromptModal(index: number | null = null): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(index !== null ? "编辑提示词" : "添加新提示词");

        const { contentEl } = modal;
        const isEdit = index !== null;
        const prompt = isEdit && this.settings.settings.commonPrompts && this.settings.settings.commonPrompts[index!]
            ? this.settings.settings.commonPrompts[index!]
            : null;

        contentEl.createEl("label", {
            text: "提示词名称:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const nameInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "请输入提示词名称",
            attr: { style: "width: 100%; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        }) as HTMLInputElement;
        if (isEdit && prompt) nameInput.value = prompt.name;

        contentEl.createEl("label", {
            text: "提示词内容:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const contentInput = contentEl.createEl("textarea", {
            placeholder: "请输入提示词内容",
            attr: { style: "width: 100%; height: 120px; padding: 8px; margin-bottom: 15px; border: 1px solid var(--background-modifier-border); border-radius: 4px; resize: vertical; font-family: var(--font-text);" }
        }) as HTMLTextAreaElement;
        if (isEdit && prompt) contentInput.value = prompt.content;

        const buttonContainer = contentEl.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" }
        });

        buttonContainer.createEl("button", {
            text: "取消",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: isEdit ? "更新" : "添加",
            cls: "mod-cta",
            attr: { style: "padding: 6px 12px;" }
        });

        const saveHandler = async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();

            if (!name) {
                new Notice("请输入提示词名称");
                return;
            }
            if (!content) {
                new Notice("请输入提示词内容");
                return;
            }

            const duplicateIndex = this.settings.settings.commonPrompts.findIndex((p, i) => p.name === name && i !== index);
            if (duplicateIndex !== -1) {
                new Notice("提示词名称已存在，请使用其他名称");
                return;
            }

            if (!this.settings.settings.commonPrompts) {
                this.settings.settings.commonPrompts = [];
            }

            const newPrompt: CommonPrompt = {
                id: isEdit && prompt ? prompt.id : Date.now().toString(),
                name: name,
                content: content
            };

            if (isEdit && index !== null) {
                this.settings.settings.commonPrompts[index] = newPrompt;
                new Notice("提示词已更新");
            } else {
                this.settings.settings.commonPrompts.push(newPrompt);
                new Notice("提示词已添加");
            }

            await this.settings.save();
            modal.close();
        };

        saveBtn.onclick = saveHandler;

        const keydownHandler = (e: KeyboardEvent) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveHandler();
            }
        };
        nameInput.addEventListener("keydown", keydownHandler);
        contentInput.addEventListener("keydown", keydownHandler);

        modal.open();
        nameInput.focus();
    }

    private async deletePrompt(index: number): Promise<void> {
        if (this.settings.settings.commonPrompts && this.settings.settings.commonPrompts[index]) {
            const prompt = this.settings.settings.commonPrompts[index];

            const confirmModal = new Modal(this.app);
            confirmModal.titleEl.setText("确认删除");
            const { contentEl } = confirmModal;

            contentEl.createEl("p", {
                text: `确定要删除提示词 "${prompt.name || "未命名提示词"}" 吗？此操作无法撤销。`,
                attr: { style: "margin-bottom: 20px;" }
            });

            const btnContainer = contentEl.createEl("div", {
                attr: { style: "display: flex; justify-content: flex-end; gap: 10px;" }
            });

            btnContainer.createEl("button", {
                text: "取消",
                attr: { style: "padding: 6px 12px;" }
            }).onclick = () => confirmModal.close();

            btnContainer.createEl("button", {
                text: "删除",
                cls: "mod-warning",
                attr: { style: "padding: 6px 12px;" }
            }).onclick = async () => {
                this.settings.settings.commonPrompts.splice(index, 1);
                await this.settings.save();
                new Notice("提示词已删除");
                confirmModal.close();
            };

            confirmModal.open();
        }
    }

    private renderRuleList(container: HTMLElement, modal: Modal): void {
        container.empty();
        const rules = this.plugin.ruleManager.getRules();

        if (rules.length === 0) {
            container.createEl("div", {
                text: '暂无规则，点击"新建规则"或"从模板创建"开始添加',
                attr: { style: "text-align: center; color: var(--text-muted); padding: 40px;" }
            });
            return;
        }

        const groupedRules: Record<string, GlobalRule[]> = {};
        rules.forEach(rule => {
            const category = rule.category || "custom";
            if (!groupedRules[category]) {
                groupedRules[category] = [];
            }
            groupedRules[category].push(rule);
        });

        const categoryNames: Record<string, string> = {
            writing: "写作风格",
            format: "格式要求",
            language: "语言设置",
            custom: "自定义规则"
        };

        Object.entries(groupedRules).forEach(([category, categoryRules]) => {
            container.createEl("h4", {
                text: categoryNames[category] || category,
                attr: { style: "margin: 20px 0 10px 0; color: var(--text-accent);" }
            });

            categoryRules.forEach(rule => {
                const ruleEl = container.createEl("div", {
                    attr: { style: "border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 15px; margin-bottom: 10px; background: var(--background-secondary);" }
                });

                const headerEl = ruleEl.createEl("div", {
                    attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }
                });

                const infoEl = headerEl.createEl("div", { attr: { style: "flex: 1;" } });
                infoEl.createEl("h5", {
                    text: rule.name,
                    attr: { style: "margin: 0 0 5px 0; font-weight: 600;" }
                });
                if (rule.description) {
                    infoEl.createEl("p", {
                        text: rule.description,
                        attr: { style: "margin: 0; color: var(--text-muted); font-size: 0.9em;" }
                    });
                }

                const actionsEl = headerEl.createEl("div", {
                    attr: { style: "display: flex; gap: 8px; align-items: center;" }
                });

                const enableCheckbox = actionsEl.createEl("input", {
                    type: "checkbox",
                    attr: { style: "margin-right: 5px;" }
                }) as HTMLInputElement;
                enableCheckbox.checked = rule.enabled !== false;
                enableCheckbox.onchange = async () => {
                    try {
                        await this.plugin.ruleManager.toggleRule(rule.id);
                        new Notice(enableCheckbox.checked ? "规则已启用" : "规则已禁用");
                    } catch (e: any) {
                        new Notice("操作失败: " + e.message);
                    }
                };

                actionsEl.createEl("button", {
                    text: "编辑",
                    attr: { style: "padding: 4px 8px; font-size: 0.8em;" }
                }).onclick = () => {
                    this.showRuleEditor(modal, rule);
                };

                actionsEl.createEl("button", {
                    text: "删除",
                    cls: "mod-warning",
                    attr: { style: "padding: 4px 8px; font-size: 0.8em;" }
                }).onclick = () => this.deleteRule(rule, modal);

                if (rule.content) {
                    ruleEl.createEl("div", {
                        attr: { style: "background: var(--background-primary); padding: 10px; border-radius: 4px; font-family: var(--font-monospace); font-size: 0.85em; color: var(--text-muted); max-height: 100px; overflow-y: auto;" }
                    }).textContent = rule.content.length > 200 ? rule.content.substring(0, 200) + "..." : rule.content;
                }
            });
        });
    }

    private showRuleManager(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("全局规则管理器");
        modal.modalEl.addClass("flowtext-rule-manager-modal");

        const { contentEl } = modal;
        contentEl.empty();

        const container = contentEl.createEl("div", {
            attr: { style: "min-height: 500px; display: flex; flex-direction: column;" }
        });

        const header = container.createEl("div", {
            attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);" }
        });

        const leftActions = header.createEl("div", { attr: { style: "display: flex; gap: 10px;" } });
        leftActions.createEl("button", {
            text: "新建规则",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => this.showRuleEditor(modal);

        leftActions.createEl("button", {
            text: "从提示词创建",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => this.showTemplateSelector(modal);

        const rightActions = header.createEl("div", { attr: { style: "display: flex; gap: 10px;" } });
        rightActions.createEl("button", {
            text: "导入规则",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => this.importRules(modal);

        rightActions.createEl("button", {
            text: "导出规则",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => this.exportRules();

        const listContainer = container.createEl("div", {
            attr: { style: "flex: 1; overflow-y: auto;" }
        });

        this.renderRuleList(listContainer, modal);
        modal.open();
    }

    private showRuleEditor(parentModal: Modal, rule: GlobalRule | null = null): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(rule ? "编辑规则" : "新建规则");
        modal.modalEl.addClass("flowtext-rule-editor-modal");

        const { contentEl } = modal;
        contentEl.empty();

        const container = contentEl.createEl("div", {
            attr: { style: "display: flex; flex-direction: column; gap: 15px; min-width: 500px;" }
        });

        container.createEl("label", { text: "规则名称", attr: { style: "font-weight: 600;" } });
        const nameInput = container.createEl("input", {
            type: "text",
            placeholder: "请输入规则名称",
            attr: { style: "padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        }) as HTMLInputElement;
        if (rule) nameInput.value = rule.name;

        container.createEl("label", { text: "规则描述", attr: { style: "font-weight: 600;" } });
        const descInput = container.createEl("input", {
            type: "text",
            placeholder: "请输入规则描述（可选）",
            attr: { style: "padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        }) as HTMLInputElement;
        if (rule && rule.description) descInput.value = rule.description;

        container.createEl("label", { text: "规则分类", attr: { style: "font-weight: 600;" } });
        const categorySelect = container.createEl("select", {
            attr: { style: "padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        }) as HTMLSelectElement;

        const categories = [
            { value: "writing", text: "写作风格" },
            { value: "format", text: "格式要求" },
            { value: "language", text: "语言设置" },
            { value: "custom", text: "自定义规则" }
        ];

        const currentCategory = rule ? rule.category : "custom";
        categories.forEach(cat => {
            const option = categorySelect.createEl("option", { value: cat.value, text: cat.text });
            if (cat.value === currentCategory) option.selected = true;
        });

        container.createEl("label", { text: "优先级 (数字越大优先级越高，最大10)", attr: { style: "font-weight: 600;" } });
        const priorityInput = container.createEl("input", {
            type: "number",
            attr: { style: "padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px;" }
        }) as HTMLInputElement;
        priorityInput.min = "0";
        priorityInput.max = "10";
        priorityInput.value = String(rule && rule.priority !== undefined ? rule.priority : 0);

        container.createEl("label", { text: "规则内容", attr: { style: "font-weight: 600;" } });
        const contentInput = container.createEl("textarea", {
            placeholder: "请输入规则内容，这些内容将作为系统提示词的一部分",
            attr: { style: "padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; min-height: 150px; font-family: var(--font-monospace); resize: vertical;" }
        }) as HTMLTextAreaElement;
        if (rule) contentInput.value = rule.content;

        const enableContainer = container.createEl("div", {
            attr: { style: "display: flex; align-items: center; gap: 8px;" }
        });
        const enableCheckbox = enableContainer.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        enableCheckbox.checked = !rule || rule.enabled !== false;
        enableContainer.createEl("label", { text: "启用此规则", attr: { style: "font-weight: 600;" } });

        const buttonContainer = container.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;" }
        });

        buttonContainer.createEl("button", {
            text: "取消",
            attr: { style: "padding: 8px 16px;" }
        }).onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: rule ? "更新" : "创建",
            cls: "mod-cta",
            attr: { style: "padding: 8px 16px;" }
        });

        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();

            if (!name) {
                new Notice("请输入规则名称");
                nameInput.focus();
                return;
            }

            if (!content) {
                new Notice("请输入规则内容");
                contentInput.focus();
                return;
            }

            const priority = parseInt(priorityInput.value) || 0;
            if (priority > 10) {
                new Notice("优先级不能超过10");
                priorityInput.focus();
                return;
            }

            try {
                const ruleData = {
                    name: name,
                    description: descInput.value.trim(),
                    category: categorySelect.value,
                    priority: priority,
                    content: content,
                    enabled: enableCheckbox.checked
                };

                if (rule) {
                    await this.plugin.ruleManager.updateRule(rule.id, ruleData);
                    new Notice("规则已更新");
                } else {
                    await this.plugin.ruleManager.addRule(ruleData);
                    new Notice("规则已创建");
                }

                modal.close();
                this.renderRuleList(parentModal.contentEl.querySelector('[style*="flex: 1"]') as HTMLElement, parentModal);
            } catch (e: any) {
                new Notice("操作失败: " + e.message);
            }
        };

        modal.open();
        nameInput.focus();
    }

    private showTemplateSelector(parentModal: Modal): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("从模板创建规则");
        const { contentEl } = modal;
        contentEl.empty();

        const templates = this.plugin.ruleManager.getTemplates();

        if (templates.length === 0) {
            contentEl.createEl("p", {
                text: "暂无可用模板",
                attr: { style: "text-align: center; color: var(--text-muted); padding: 40px;" }
            });
        } else {
            const groupedTemplates: Record<string, GlobalRule[]> = {};
            templates.forEach(t => {
                const category = t.category || "custom";
                if (!groupedTemplates[category]) {
                    groupedTemplates[category] = [];
                }
                groupedTemplates[category].push(t);
            });

            const categoryNames: Record<string, string> = {
                writing: "写作风格",
                format: "格式要求",
                language: "语言设置",
                custom: "自定义模板"
            };

            Object.entries(groupedTemplates).forEach(([category, categoryTemplates]) => {
                contentEl.createEl("h4", {
                    text: categoryNames[category] || category,
                    attr: { style: "margin: 20px 0 10px 0; color: var(--text-accent);" }
                });

                categoryTemplates.forEach(template => {
                    const templateEl = contentEl.createEl("div", {
                        attr: { style: "border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 15px; margin-bottom: 10px; cursor: pointer; transition: background-color 0.2s;" }
                    });

                    templateEl.addEventListener("mouseenter", () => {
                        templateEl.style.backgroundColor = "var(--background-modifier-hover)";
                    });
                    templateEl.addEventListener("mouseleave", () => {
                        templateEl.style.backgroundColor = "";
                    });

                    templateEl.createEl("h5", {
                        text: template.name,
                        attr: { style: "margin: 0 0 8px 0; font-weight: 600;" }
                    });

                    if (template.description) {
                        templateEl.createEl("p", {
                            text: template.description,
                            attr: { style: "margin: 0 0 10px 0; color: var(--text-muted); font-size: 0.9em;" }
                        });
                    }

                    if (template.content) {
                        templateEl.createEl("div", {
                            attr: { style: "background: var(--background-primary); padding: 8px; border-radius: 4px; font-family: var(--font-monospace); font-size: 0.8em; color: var(--text-muted);" }
                        }).textContent = template.content.length > 100 ? template.content.substring(0, 100) + "..." : template.content;
                    }

                    templateEl.onclick = async () => {
                        try {
                            await this.plugin.ruleManager.createFromTemplate(template.id);
                            new Notice("已从模板创建规则: " + template.name);
                            modal.close();
                            this.renderRuleList(parentModal.contentEl.querySelector('[style*="flex: 1"]') as HTMLElement, parentModal);
                        } catch (e: any) {
                            new Notice("创建失败: " + e.message);
                        }
                    };
                });
            });
        }

        modal.open();
    }

    private async deleteRule(rule: GlobalRule, parentModal: Modal): Promise<void> {
        const confirmModal = new Modal(this.app);
        confirmModal.titleEl.setText("确认删除");
        const { contentEl } = confirmModal;

        contentEl.createEl("p", {
            text: `确定要删除规则 "${rule.name}" 吗？此操作无法撤销。`,
            attr: { style: "margin-bottom: 20px;" }
        });

        const btnContainer = contentEl.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px;" }
        });

        btnContainer.createEl("button", {
            text: "取消",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = () => confirmModal.close();

        btnContainer.createEl("button", {
            text: "删除",
            cls: "mod-warning",
            attr: { style: "padding: 6px 12px;" }
        }).onclick = async () => {
            try {
                await this.plugin.ruleManager.deleteRule(rule.id);
                new Notice("规则已删除");
                confirmModal.close();
                this.renderRuleList(parentModal.contentEl.querySelector('[style*="flex: 1"]') as HTMLElement, parentModal);
            } catch (e: any) {
                new Notice("删除失败: " + e.message);
            }
        };

        confirmModal.open();
    }

    private exportRules(): void {
        try {
            const data = this.plugin.ruleManager.exportRules();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `flowtext-rules-${new Date().toISOString().split("T")[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            new Notice("规则已导出");
        } catch (e: any) {
            new Notice("导出失败: " + e.message);
        }
    }

    private importRules(parentModal: Modal): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const count = await this.plugin.ruleManager.importRules(data);
                    new Notice(`成功导入 ${count} 条规则`);
                    this.renderRuleList(parentModal.contentEl.querySelector('[style*="flex: 1"]') as HTMLElement, parentModal);
                } catch (e: any) {
                    new Notice("导入失败: " + e.message);
                }
            }
        };
        input.click();
    }
}
