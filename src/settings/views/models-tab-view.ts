import { Modal, Notice, Setting } from "obsidian";
import { MODEL_CATEGORIES } from "../../constants";
import type { ModelCategory, ModelConfig, PluginSettings, ProviderConfig } from "../../types";
import { AbstractTabView } from "./abstract-tab-view";

export class ModelsTabView extends AbstractTabView {
    private lastContainerEl: HTMLElement | null = null;

    render(containerEl: HTMLElement): void {
        this.lastContainerEl = containerEl;
        containerEl.empty();
        const s: PluginSettings = this.settings.settings;
        containerEl.createEl("h3", { text: "供应商、API设置" });

        new Setting(containerEl)
            .setName("使用 Obsidian Keychain 安全存储")
            .setDesc("开启后，新配置的 API Key 将存储在系统钥匙串中 (推荐)")
            .addToggle(toggle => toggle
                .setValue(s.useKeychain ?? true)
                .onChange(async (value) => {
                    s.useKeychain = value;
                    await this.settings.save();
                    if (value) {
                        await this.settings.migrateKeysToKeychain();
                        if (this.lastContainerEl) this.render(this.lastContainerEl);
                    }
                }));

        // Providers table
        const providerHeader = containerEl.createEl("div", { attr: { style: "display:flex;justify-content:space-between;align-items:center;margin-top:10px;margin-bottom:8px;" } });
        providerHeader.createEl("h4", { text: "供应商" });
        providerHeader.createEl("button", { text: "+ 添加供应商", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" } }).onclick = () => this.showAddProviderModal();

        const providerTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const pHead = providerTable.createEl("thead").createEl("tr");
        pHead.createEl("th", { text: "ID" });
        pHead.createEl("th", { text: "Type" });
        pHead.createEl("th", { text: "API Key" });
        pHead.createEl("th", { text: "Get API keys" });
        pHead.createEl("th", { text: "Actions" });
        const pBody = providerTable.createEl("tbody");

        const links: Record<string, string> = { openai: "https://platform.openai.com/api-keys", anthropic: "https://console.anthropic.com/", gemini: "https://aistudio.google.com/app/apikey", ollama: "https://ollama.com/" };
        Object.keys(s.providers || {}).forEach(providerId => {
            const provider = s.providers[providerId];
            const row = pBody.createEl("tr");
            row.createEl("td", { text: providerId });
            row.createEl("td", { text: provider.type || "openai" });
            const apiKeyCell = row.createEl("td", { cls: "markdown-next-ai-api-key-cell" });
            if (provider.apiKey && provider.apiKey.trim()) {
                apiKeyCell.createEl("span", { text: "••••••••", attr: { style: "color: var(--text-muted); margin-right: 8px;" } });
            }
            const settingsBtn = apiKeyCell.createEl("button", { text: "设置", attr: { style: "padding:4px 8px;" } });
            settingsBtn.onclick = () => this.showApiKeyModal(providerId);
            const linkCell = row.createEl("td", { attr: { style: "text-align: left;" } });
            const link = links[providerId] || (s.apiKeyLinks && s.apiKeyLinks[providerId]);
            if (link) {
                linkCell.createEl("a", { text: "获取API Key", attr: { href: link, target: "_blank", style: "color: var(--text-accent); text-decoration: underline; font-size: 0.9em;" } });
            } else {
                linkCell.createEl("span", { text: "-", attr: { style: "color: var(--text-muted);" } });
            }
            const actionsCell = row.createEl("td", { cls: "markdown-next-ai-actions-cell" });
            if (["openai", "anthropic", "gemini", "deepseek", "ollama"].includes(providerId)) {
                actionsCell.createEl("span", { text: "-", attr: { style: "color: var(--text-muted);" } });
            } else {
                const editBtn = actionsCell.createEl("button", { text: "编辑" });
                editBtn.onclick = () => this.showEditProviderModal(providerId);
                const deleteBtn = actionsCell.createEl("button", { text: "删除" });
                deleteBtn.onclick = async () => {
                    if (confirm(`确定要删除供应商 "${providerId}" ？这将同时删除该供应商下的所有模型。`)) {
                        Object.keys(s.models).forEach(modelId => {
                            if (s.models[modelId].provider === providerId) {
                                delete s.models[modelId];
                            }
                        });
                        delete s.providers[providerId];
                        await this.settings.save();
                        if (this.lastContainerEl) this.render(this.lastContainerEl);
                    }
                };
            }
        });

        // Models table
        const modelHeader = containerEl.createEl("div", { attr: { style: "display:flex;justify-content:space-between;align-items:center;margin-top:20px;margin-bottom:8px;" } });
        modelHeader.createEl("h4", { text: "模型设置" });
        modelHeader.createEl("button", { text: "+ 添加模型", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" } }).onclick = () => this.showAddModelModal();

        const modelTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const mHead = modelTable.createEl("thead").createEl("tr");
        mHead.createEl("th", { text: "ID" });
        mHead.createEl("th", { text: "Provider" });
        mHead.createEl("th", { text: "Model" });
        mHead.createEl("th", { text: "Enable" });
        mHead.createEl("th", { text: "Actions" });
        const mBody = modelTable.createEl("tbody");

        const modelsList = Object.values(s.models || {});
        if (modelsList.length > 0) {
            modelsList.forEach(model => {
                const row = mBody.createEl("tr");
                row.createEl("td", { text: model.id });
                row.createEl("td", { text: model.provider });
                row.createEl("td", { text: model.name });
                const enableCell = row.createEl("td", { cls: "markdown-next-ai-enable-cell" });
                const checkbox = enableCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
                checkbox.checked = !!model.enabled;
                checkbox.onchange = async () => {
                    this.settings.settings.models[model.id].enabled = checkbox.checked;
                    await this.settings.save();
                    if (!checkbox.checked && this.settings.settings.currentModel === model.id) {
                        const firstEnabled = Object.keys(this.settings.settings.models).find(id => this.settings.settings.models[id].enabled);
                        if (firstEnabled) {
                            this.settings.settings.currentModel = firstEnabled;
                            await this.settings.save();
                            if (this.lastContainerEl) this.render(this.lastContainerEl);
                        }
                    }
                };
                const actionsCell = row.createEl("td", { cls: "markdown-next-ai-actions-cell" });
                const editBtn = actionsCell.createEl("button", { text: "编辑" });
                editBtn.onclick = () => this.showEditModelModal(model.id);
                const deleteBtn = actionsCell.createEl("button", { text: "删除" });
                deleteBtn.onclick = async () => {
                    if (confirm(`确定要删除模型 "${model.name}" ？`)) {
                        if (this.settings.settings.currentModel === model.id) {
                            const otherEnabled = Object.keys(this.settings.settings.models).find(id => id !== model.id && this.settings.settings.models[id].enabled);
                            this.settings.settings.currentModel = otherEnabled || "";
                        }
                        delete this.settings.settings.models[model.id];
                        await this.settings.save();
                        if (this.lastContainerEl) this.render(this.lastContainerEl);
                    }
                };
            });
        } else {
            const emptyRow = mBody.createEl("tr");
            emptyRow.createEl("td", { text: "暂无模型，点击上方按钮添加", attr: { colspan: "5", style: "text-align: center; color: var(--text-muted); font-style: italic; padding: 20px;" } });
        }

        new Setting(containerEl)
            .setName("当前模型")
            .setDesc("选择当前使用的AI模型")
            .addDropdown(dropdown => {
                const enabledModels = Object.keys(this.settings.settings.models).filter(id => this.settings.settings.models[id].enabled);
                enabledModels.forEach(id => {
                    const model = this.settings.settings.models[id];
                    dropdown.addOption(id, `${model.name} (${model.provider})`);
                });
                if (!enabledModels.includes(this.settings.settings.currentModel) && enabledModels.length > 0) {
                    this.settings.settings.currentModel = enabledModels[0];
                    this.settings.save();
                }
                dropdown.setValue(this.settings.settings.currentModel || "")
                    .onChange(async (value) => {
                        this.settings.settings.currentModel = value;
                        await this.settings.save();
                    });
            });
    }

    private showApiKeyModal(providerId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`设置 ${providerId.toUpperCase()} 配置`);
        const { contentEl } = modal;
        const provider = this.settings.settings.providers[providerId];

        let tempApiKey = provider?.apiKey || "";
        let tempBaseUrl = provider?.baseUrl || "";

        let secretStorage = (this.app as any).secretStorage || (this.app as any).keychain || (window as any).secretStorage || (this.app as any).vault?.secretStorage;
        const hasSecretStorage = secretStorage && (typeof secretStorage.save === "function" || typeof secretStorage.setSecret === "function");

        let useKeychain = tempApiKey.startsWith("secret:");
        if (!tempApiKey && (this.settings.settings.useKeychain ?? true) && hasSecretStorage) {
            useKeychain = true;
        }

        let apiKeyTextComp: any;

        const otherProvidersWithSecrets = Object.entries(this.settings.settings.providers)
            .filter(([id, p]: [string, any]) => id !== providerId && p.apiKey && p.apiKey.startsWith("secret:"))
            .map(([id, p]: [string, any]) => ({ id, name: p.name || id, secretRef: p.apiKey }));

        if (otherProvidersWithSecrets.length > 0) {
            new Setting(contentEl)
                .setName("复用已有 Key")
                .setDesc("选择复用其他供应商已配置的 Keychain 密钥")
                .addDropdown(dropdown => {
                    dropdown.addOption("", "不复用 (默认)");
                    otherProvidersWithSecrets.forEach(p => dropdown.addOption(p.secretRef, `${p.name} (${p.id})`));
                    if (tempApiKey && tempApiKey.startsWith("secret:") && otherProvidersWithSecrets.some(p => p.secretRef === tempApiKey)) {
                        dropdown.setValue(tempApiKey);
                    }
                    dropdown.onChange(value => {
                        if (value) {
                            tempApiKey = value;
                            useKeychain = true;
                            if (apiKeyTextComp) {
                                apiKeyTextComp.setValue("");
                                apiKeyTextComp.setPlaceholder(`已复用 ${otherProvidersWithSecrets.find(p => p.secretRef === value)?.name} 的 Key`);
                                apiKeyTextComp.setDisabled(true);
                            }
                        } else {
                            tempApiKey = "";
                            useKeychain = false;
                            if (apiKeyTextComp) {
                                apiKeyTextComp.setDisabled(false);
                                apiKeyTextComp.setPlaceholder("请输入 API Key");
                            }
                        }
                    });
                });
        }

        new Setting(contentEl)
            .setName("API Key")
            .setDesc("请输入 API Key")
            .addText(text => {
                apiKeyTextComp = text;
                (text.inputEl as HTMLInputElement).type = "password";
                const isReusing = tempApiKey.startsWith("secret:") && otherProvidersWithSecrets.some(p => p.secretRef === tempApiKey);
                if (isReusing) {
                    text.setPlaceholder(`已复用 ${otherProvidersWithSecrets.find(p => p.secretRef === tempApiKey)?.name} 的 Key`);
                    text.setDisabled(true);
                } else {
                    text.setPlaceholder(useKeychain ? "已存储在 Keychain 中" : "请输入 API Key");
                }
                text.setValue(useKeychain ? "" : tempApiKey).onChange(value => { tempApiKey = value; });
            });

        new Setting(contentEl)
            .setName("Base URL")
            .setDesc("可选：设置自定义 Base URL")
            .addText(text => text
                .setPlaceholder("https://api.example.com/v1")
                .setValue(tempBaseUrl)
                .onChange(value => { tempBaseUrl = value; }));

        const btns = contentEl.createEl("div", { attr: { style: "display:flex;justify-content:flex-end;gap:10px;margin-top:15px;" } });
        const cancelBtn = btns.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = btns.createEl("button", { text: "保存", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            if (!this.settings.settings.providers[providerId]) {
                this.settings.settings.providers[providerId] = { apiKey: "", baseUrl: "", enabled: true } as ProviderConfig;
            }
            if (tempApiKey.startsWith("secret:")) {
                if (useKeychain) {
                    this.settings.settings.providers[providerId].apiKey = tempApiKey;
                } else {
                    new Notice("请重新输入 API Key 以切换回普通存储");
                    return;
                }
            } else {
                if (tempApiKey) {
                    const shouldSaveToKeychain = (this.settings.settings.useKeychain ?? true) && hasSecretStorage;
                    if (shouldSaveToKeychain) {
                        const secretId = `markdown-next-ai-api-key-${providerId}`;
                        const keyToSave = tempApiKey.trim();
                        try {
                            if (typeof secretStorage.save === "function") {
                                await secretStorage.save(secretId, keyToSave);
                            } else {
                                await secretStorage.setSecret(secretId, keyToSave);
                            }
                            this.settings.settings.providers[providerId].apiKey = `secret:${secretId}`;
                        } catch (e) {
                            new Notice("Keychain 保存失败，已使用普通存储");
                            console.error("Keychain save failed:", e);
                            this.settings.settings.providers[providerId].apiKey = tempApiKey;
                        }
                    } else {
                        this.settings.settings.providers[providerId].apiKey = tempApiKey;
                    }
                } else {
                    this.settings.settings.providers[providerId].apiKey = "";
                }
            }

            this.settings.settings.providers[providerId].baseUrl = tempBaseUrl || "";
            await this.settings.save();
            new Notice("供应商配置已保存");
            modal.close();
            this.plugin.updateEventListeners?.();
        };

        modal.open();
    }

    private showAddProviderModal(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加供应商");
        const { contentEl } = modal;
        const idInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "供应商ID" } }) as HTMLInputElement;
        const nameInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "显示名称(可选)" } }) as HTMLInputElement;
        const typeInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "类型(openai/anthropic/gemini/ollama/...)" } }) as HTMLInputElement;
        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;margin-top:10px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "添加", cls: "mod-cta" });
        save.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const type = typeInput.value.trim() || "openai";
            if (!id || !name) { new Notice("请填写ID与名称"); return; }
            if (this.settings.settings.providers[id]) { new Notice("供应商ID已存在"); return; }
            this.settings.settings.providers[id] = { apiKey: "", baseUrl: "", enabled: true, name, type } as ProviderConfig;
            await this.settings.save();
            modal.close();
            this.plugin.updateEventListeners?.();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }

    private showEditProviderModal(providerId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑供应商");
        const p = this.settings.settings.providers[providerId];
        const { contentEl } = modal;
        const nameInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "显示名称" } }) as HTMLInputElement;
        nameInput.value = p?.name || providerId;
        const typeSelect = contentEl.createEl("select") as HTMLSelectElement;
        ["openai", "anthropic", "gemini", "ollama", "deepseek", "custom"].forEach(t => {
            const o = typeSelect.createEl("option", { value: t, text: t });
            if ((p?.type || "openai") === t) o.selected = true;
        });
        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;margin-top:10px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "保存", cls: "mod-cta" });
        save.onclick = async () => {
            if (!nameInput.value.trim()) { new Notice("名称不能为空"); return; }
            this.settings.settings.providers[providerId] = {
                ...(this.settings.settings.providers[providerId] || { apiKey: "", baseUrl: "", enabled: true }),
                name: nameInput.value.trim(),
                type: typeSelect.value
            } as ProviderConfig;
            await this.settings.save();
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }

    private showAddModelModal(category: ModelCategory = MODEL_CATEGORIES.MULTIMODAL): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加模型");
        const { contentEl } = modal;
        const idInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "模型ID" } }) as HTMLInputElement;
        const nameInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "模型名称" } }) as HTMLInputElement;
        const providerSelect = contentEl.createEl("select") as HTMLSelectElement;
        Object.keys(this.settings.settings.providers).forEach(pId => providerSelect.createEl("option", { value: pId, text: pId }));
        const modelInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "Provider原始模型名 (可选)" } }) as HTMLInputElement;
        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;margin-top:10px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "添加", cls: "mod-cta" });
        save.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const provider = providerSelect.value;
            const actualModel = modelInput.value.trim();
            if (!id || !name) { new Notice("请填写ID与名称"); return; }
            if (this.settings.settings.models[id]) { new Notice("模型ID已存在"); return; }
            const cfg: ModelConfig = { id, name, provider, model: actualModel || name, enabled: true, category };
            this.settings.settings.models[id] = cfg;
            await this.settings.save();
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }

    private showEditModelModal(modelId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑模型");
        const m = this.settings.settings.models[modelId];
        const { contentEl } = modal;
        const nameInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "模型名称" } }) as HTMLInputElement;
        nameInput.value = m?.name || modelId;
        const providerSelect = contentEl.createEl("select") as HTMLSelectElement;
        Object.keys(this.settings.settings.providers).forEach(pId => {
            const opt = providerSelect.createEl("option", { value: pId, text: pId });
            if (pId === m.provider) opt.selected = true;
        });
        const modelInput = contentEl.createEl("input", { type: "text", attr: { placeholder: "Provider原始模型名" } }) as HTMLInputElement;
        modelInput.value = m?.model || "";
        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;margin-top:10px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "保存", cls: "mod-cta" });
        save.onclick = async () => {
            const name = nameInput.value.trim();
            if (!name) { new Notice("名称不能为空"); return; }
            this.settings.settings.models[modelId] = {
                ...(this.settings.settings.models[modelId] || { id: modelId, enabled: true, category: MODEL_CATEGORIES.MULTIMODAL }),
                id: modelId,
                name,
                provider: providerSelect.value,
                model: modelInput.value.trim() || name
            } as ModelConfig;
            await this.settings.save();
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }
}
