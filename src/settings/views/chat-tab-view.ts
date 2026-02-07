import { Modal, Notice, Setting } from "obsidian";
import type { CommonPrompt } from "../../types";
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
            .setName("管理全局规则")
            .setDesc("添加、编辑和管理全局规则")
            .addButton(button => button
                .setButtonText("打开规则管理器")
                .onClick(() => {
                    // Delegate to OthersTabView style manager
                    const others = (this as any);
                    if (typeof others.showRuleManager === 'function') others.showRuleManager();
                }));

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
}
