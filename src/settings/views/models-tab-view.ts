import { Modal, Notice, Setting, SuggestModal } from "obsidian";
import { MODEL_CATEGORIES } from "../../constants";
import type { ModelCategory, ModelConfig, PluginSettings, ProviderConfig } from "../../types";
import { AbstractTabView } from "./abstract-tab-view";

class ModelSuggestModal extends SuggestModal<{ id: string; name: string }> {
    private models: { id: string; name: string }[];
    private onChoose: (item: { id: string; name: string }) => void;

    constructor(app: any, models: { id: string; name: string }[], onChoose: (item: { id: string; name: string }) => void) {
        super(app);
        this.models = models;
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): { id: string; name: string }[] {
        const lowerQuery = query.toLowerCase();
        return this.models.filter(m =>
            m.name.toLowerCase().includes(lowerQuery) ||
            m.id.toLowerCase().includes(lowerQuery)
        );
    }

    renderSuggestion(item: { id: string; name: string }, el: HTMLElement) {
        // Only show ID as it is the primary identifier for the field
        // If name is significantly different, maybe append it, but user requested "keep only one"
        el.createEl("div", { text: item.id });
    }

    onChooseSuggestion(item: { id: string; name: string }, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(item);
    }
}

class ModelInputSuggest {
    private inputEl: HTMLInputElement;
    private popup: HTMLElement | null = null;
    private items: { id: string; name: string }[] = [];
    private onSelect: (item: { id: string; name: string }) => void;

    constructor(inputEl: HTMLInputElement, items: { id: string; name: string }[], onSelect: (item: { id: string; name: string }) => void) {
        this.inputEl = inputEl;
        this.items = items;
        this.onSelect = onSelect;

        this.inputEl.addEventListener("input", this.onInput.bind(this));
        this.inputEl.addEventListener("focus", this.onInput.bind(this));
        this.inputEl.addEventListener("blur", () => setTimeout(() => this.close(), 200));
    }

    private onInput() {
        const value = this.inputEl.value.toLowerCase();
        const matches = this.items.filter(i =>
            i.id.toLowerCase().includes(value) ||
            i.name.toLowerCase().includes(value)
        );

        this.close();
        if (matches.length > 0) {
            this.showSuggestions(matches);
        }
    }

    private showSuggestions(matches: { id: string; name: string }[]) {
        const rect = this.inputEl.getBoundingClientRect();
        this.popup = document.body.createEl("div");

        // Use standard Obsidian menu styles
        this.popup.className = "menu";
        Object.assign(this.popup.style, {
            position: "fixed",
            top: `${rect.bottom + 5}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            maxHeight: "300px",
            overflowY: "auto",
            zIndex: "var(--layer-menu)",
            display: "block" // Force show
        });

        matches.forEach(item => {
            const el = this.popup!.createEl("div", { cls: "menu-item" });
            el.createEl("div", { cls: "menu-item-title", text: item.id });

            el.addEventListener("mousedown", (e) => {
                e.preventDefault(); // Prevent blur
                e.stopPropagation();
                this.onSelect(item);
                this.close();
            });

            el.addEventListener("mouseenter", () => {
                el.addClass("selected");
            });
            el.addEventListener("mouseleave", () => {
                el.removeClass("selected");
            });
        });
    }

    close() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
    }
}

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
        modal.titleEl.setText("添加供应商 (Add Provider)");
        const { contentEl } = modal;

        let id = "";
        let name = "";
        let type = "openai";

        new Setting(contentEl)
            .setName("供应商 ID (Provider ID)")
            .setDesc("唯一标识符 (Unique Identifier)")
            .addText(text => text
                .setPlaceholder("e.g. openai")
                .onChange(v => id = v.trim()));

        new Setting(contentEl)
            .setName("显示名称 (Display Name)")
            .setDesc("可选：友好的显示名称")
            .addText(text => text
                .setPlaceholder("e.g. OpenAI Official")
                .onChange(v => name = v.trim()));

        new Setting(contentEl)
            .setName("类型 (Type)")
            .setDesc("API 协议类型")
            .addDropdown(dropdown => {
                PROVIDER_TYPES.forEach(t =>
                    dropdown.addOption(t.id, t.name)
                );
                dropdown.setValue(type)
                    .onChange(v => type = v);
            });

        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:10px;margin-top:20px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "添加", cls: "mod-cta" });

        save.onclick = async () => {
            if (!id) { new Notice("请填写ID"); return; }
            if (this.settings.settings.providers[id]) { new Notice("供应商ID已存在"); return; }

            this.settings.settings.providers[id] = {
                apiKey: "",
                baseUrl: "",
                enabled: true,
                name: name || id,
                type
            } as ProviderConfig;

            await this.settings.save();
            modal.close();
            this.plugin.updateEventListeners?.();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }

    private showEditProviderModal(providerId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑供应商 (Edit Provider)");
        const { contentEl } = modal;

        const p = this.settings.settings.providers[providerId];
        let name = p?.name || providerId;
        let type = p?.type || "openai";

        new Setting(contentEl)
            .setName("显示名称 (Display Name)")
            .setDesc("友好的显示名称")
            .addText(text => text
                .setPlaceholder("e.g. OpenAI Official")
                .setValue(name)
                .onChange(v => name = v.trim()));

        new Setting(contentEl)
            .setName("类型 (Type)")
            .setDesc("API 协议类型")
            .addDropdown(dropdown => {
                PROVIDER_TYPES.forEach(t =>
                    dropdown.addOption(t.id, t.name)
                );
                dropdown.setValue(type)
                    .onChange(v => type = v);
            });

        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:10px;margin-top:20px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "保存", cls: "mod-cta" });

        save.onclick = async () => {
            if (!name) { new Notice("名称不能为空"); return; }

            this.settings.settings.providers[providerId] = {
                ...(this.settings.settings.providers[providerId] || { apiKey: "", baseUrl: "", enabled: true }),
                name,
                type
            } as ProviderConfig;

            await this.settings.save();
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }

    private async fetchModels(providerId: string): Promise<{ id: string; name: string }[] | null> {
        const provider = this.settings.settings.providers[providerId];
        if (!provider) {
            new Notice("Provider not found");
            return null;
        }

        const type = provider.type || "openai";
        let url = "";
        let headers: Record<string, string> = {};

        // Resolve API Key using shared logic from AIService
        // This ensures consistency with testConnection and other API calls
        const tempConfig: APIModelConfig = {
            apiKey: provider.apiKey || "",
            baseUrl: provider.baseUrl || "",
            model: "fetch-models-temp"
        };

        let apiKey = "";
        try {
            const resolvedConfig = await this.plugin.aiService.resolveConfig(tempConfig);
            apiKey = resolvedConfig.apiKey;
        } catch (e) {
            console.error("Failed to resolve config for fetchModels:", e);
            new Notice("Failed to resolve API Key");
            return null;
        }

        // 1. Determine URL and Headers based on provider type
        if (type === "ollama") {
            // Ollama: GET /api/tags
            let baseUrl = provider.baseUrl || "http://localhost:11434";
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
            url = `${baseUrl}/api/tags`;
        } else if (type === "anthropic") {
            // Anthropic: GET https://api.anthropic.com/v1/models
            url = "https://api.anthropic.com/v1/models";
            if (apiKey) headers["x-api-key"] = apiKey;
            headers["anthropic-version"] = "2023-06-01";
        } else if (type === "gemini") {
            // Gemini: GET https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
            url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        } else {
            // OpenAI Compatible (default): GET /v1/models
            let baseUrl = provider.baseUrl || "https://api.openai.com/v1";
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
            if (!baseUrl.endsWith("/v1")) baseUrl += "/v1";
            url = `${baseUrl}/models`;
            if (apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`;
            }
        }

        try {
            new Notice(`Fetching models from ${url}...`);
            const req: RequestUrlParam = {
                url,
                method: "GET",
                headers,
                throw: false
            };

            const resp = await requestUrl(req);

            if (resp.status >= 400) {
                new Notice(`Error fetching models: ${resp.status} ${resp.text.slice(0, 100)}`);
                console.error("Fetch models error:", resp);
                return null;
            }

            const data = resp.json;
            const models: { id: string; name: string }[] = [];

            // 2. Parse Response
            if (type === "ollama") {
                // { models: [ { name: "llama3:latest", ... } ] }
                if (data.models && Array.isArray(data.models)) {
                    data.models.forEach((m: any) => {
                        models.push({ id: m.name, name: m.name });
                    });
                }
            } else if (type === "gemini") {
                // { models: [ { name: "models/gemini-pro", displayName: "Gemini Pro", ... } ] }
                if (data.models && Array.isArray(data.models)) {
                    data.models.forEach((m: any) => {
                        let id = m.name;
                        if (id.startsWith("models/")) id = id.replace("models/", "");
                        models.push({ id, name: m.displayName || id });
                    });
                }
            } else {
                // OpenAI / Anthropic format: { data: [ { id: "gpt-4", ... } ] }
                const list = data.data || data.models || [];
                if (Array.isArray(list)) {
                    list.forEach((m: any) => {
                        models.push({ id: m.id, name: m.id });
                    });
                }
            }

            if (models.length === 0) {
                new Notice("No models found in response.");
                return null;
            }

            new Notice(`Successfully fetched ${models.length} models.`);
            return models;

        } catch (e) {
            new Notice(`Request failed: ${e.message}`);
            console.error(e);
            return null;
        }
    }

    private showAddModelModal(category: ModelCategory = MODEL_CATEGORIES.MULTIMODAL): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加模型 (Add Model)");
        const { contentEl } = modal;

        let providerId = Object.keys(this.settings.settings.providers)[0] || "";
        let apiModelId = "";
        let displayName = "";
        let internalId = "";
        let fetchedModels: { id: string; name: string }[] | null = null;

        let apiModelIdInput: any;
        let displayNameInput: any;
        let internalIdInput: any;

        const renderContent = () => {
            contentEl.empty();

            const providerConfig = this.settings.settings.providers[providerId];
            const providerBaseUrl = providerConfig?.baseUrl || "(默认/Default)";

            new Setting(contentEl)
                .setName("供应商 (Provider)")
                .setDesc(`选择调用该模型使用的服务商账户。当前 Base URL: ${providerBaseUrl}`)
                .addDropdown(dropdown => {
                    Object.keys(this.settings.settings.providers).forEach(pId => {
                        const p = this.settings.settings.providers[pId];
                        dropdown.addOption(pId, `${p.name || pId} (${p.type || "openai"})`);
                    });
                    dropdown.setValue(providerId);
                    dropdown.onChange((value) => {
                        providerId = value;
                        fetchedModels = null;
                        renderContent();
                    });
                });

            const providerType = this.settings.settings.providers[providerId]?.type || "openai";

            // Prepare presets for auto-completion
            // Since MODEL_PRESETS is removed, we only rely on fetchedModels
            const presets = fetchedModels || [];

            contentEl.createEl("hr", { attr: { style: "margin: 20px 0; border-color: var(--background-modifier-border);" } });

            new Setting(contentEl)
                .setName("模型 API ID (Model ID)")
                .setDesc("点击 Fetch 获取模型列表")
                .addText(text => {
                    apiModelIdInput = text;
                    text.setPlaceholder("e.g. gpt-4o")
                        .setValue(apiModelId)
                        .onChange(v => {
                            apiModelId = v.trim();
                            // If user manually types, we still try to autofill if it matches known presets
                            // But mainly we rely on selection
                            if (!displayName && apiModelId) {
                                displayName = apiModelId;
                                if (displayNameInput) displayNameInput.setValue(displayName);
                            }

                            if (!internalId && apiModelId) {
                                internalId = `${providerId}-${apiModelId}`.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
                                if (internalIdInput) internalIdInput.setValue(internalId);
                            }
                        });

                    // Attach inline suggester
                    new ModelInputSuggest(text.inputEl, presets, (item) => {
                        apiModelId = item.id;
                        displayName = item.name;
                        if (apiModelIdInput) apiModelIdInput.setValue(apiModelId);
                        if (displayNameInput) displayNameInput.setValue(displayName);

                        if (!internalId) {
                            internalId = `${providerId}-${apiModelId}`.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
                            if (internalIdInput) internalIdInput.setValue(internalId);
                        }
                    });
                })
                .addButton(btn => btn
                    .setButtonText("获取 / Fetch")
                    .setIcon("refresh-ccw")
                    .setTooltip("从 API 获取可用模型列表")
                    .onClick(async () => {
                        const models = await this.fetchModels(providerId);
                        if (models) {
                            fetchedModels = models;
                            renderContent();
                            // Automatically open suggest modal after fetch
                            new ModelSuggestModal(this.app, models, (item) => {
                                apiModelId = item.id;
                                displayName = item.name;
                                if (apiModelIdInput) apiModelIdInput.setValue(apiModelId);
                                if (displayNameInput) displayNameInput.setValue(displayName);

                                if (!internalId) {
                                    internalId = `${providerId}-${apiModelId}`.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
                                    if (internalIdInput) internalIdInput.setValue(internalId);
                                }
                            }).open();
                        }
                    }));

            new Setting(contentEl)
                .setName("显示名称 (Display Name)")
                .setDesc("在插件菜单中显示的友好名称")
                .addText(text => {
                    displayNameInput = text;
                    text.setPlaceholder("e.g. GPT-4o Official")
                        .setValue(displayName)
                        .onChange(v => displayName = v.trim());
                });

            const advancedDetails = contentEl.createEl("details");
            advancedDetails.createEl("summary", { text: "高级设置 (Advanced: Internal ID)", attr: { style: "color: var(--text-muted); cursor: pointer; margin-bottom: 10px;" } });

            new Setting(advancedDetails)
                .setName("插件内部 ID")
                .setDesc("插件配置中使用的唯一键值，通常无需修改")
                .addText(text => {
                    internalIdInput = text;
                    text.setValue(internalId)
                        .onChange(v => internalId = v.trim());
                });

            const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:10px;margin-top:20px;justify-content:flex-end;" } });
            btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
            const save = btns.createEl("button", { text: "添加模型", cls: "mod-cta" });
            save.onclick = async () => {
                if (!apiModelId || !displayName || !internalId) {
                    new Notice("请填写完整信息 (API ID, Name)");
                    return;
                }
                if (this.settings.settings.models[internalId]) {
                    new Notice("该内部 ID 已存在，请在高级设置中修改 ID");
                    return;
                }
                const cfg: ModelConfig = {
                    id: internalId,
                    name: displayName,
                    provider: providerId,
                    model: apiModelId,
                    enabled: true,
                    category
                };
                this.settings.settings.models[internalId] = cfg;
                await this.settings.save();
                modal.close();
                if (this.lastContainerEl) this.render(this.lastContainerEl);
                new Notice(`已添加模型: ${displayName}`);
            };
        };

        renderContent();
        modal.open();
    }

    private showEditModelModal(modelId: string): void {
        const modal = new Modal(this.app);
        const m = this.settings.settings.models[modelId];
        modal.titleEl.setText(`编辑模型: ${m.name}`);
        const { contentEl } = modal;

        let providerId = m.provider;
        let apiModelId = m.model || "";
        let displayName = m.name;

        new Setting(contentEl)
            .setName("供应商 (Provider)")
            .setDesc("更改该模型所属的服务商")
            .addDropdown(dropdown => {
                Object.keys(this.settings.settings.providers).forEach(pId => {
                    dropdown.addOption(pId, pId);
                });
                dropdown.setValue(providerId);
                dropdown.onChange(v => providerId = v);
            });

        new Setting(contentEl)
            .setName("模型 API ID")
            .setDesc("发送给 API 的实际模型参数 (例如: gpt-4o)")
            .addText(text => text
                .setValue(apiModelId)
                .onChange(v => apiModelId = v.trim()));

        new Setting(contentEl)
            .setName("显示名称")
            .setDesc("菜单中显示的名称")
            .addText(text => text
                .setValue(displayName)
                .onChange(v => displayName = v.trim()));

        const btns = contentEl.createEl("div", { attr: { style: "display:flex;gap:10px;margin-top:20px;justify-content:flex-end;" } });
        btns.createEl("button", { text: "取消" }).onclick = () => modal.close();
        const save = btns.createEl("button", { text: "保存更改", cls: "mod-cta" });
        save.onclick = async () => {
            if (!displayName || !apiModelId) { new Notice("信息不能为空"); return; }
            this.settings.settings.models[modelId] = {
                ...m,
                provider: providerId,
                model: apiModelId,
                name: displayName
            };
            await this.settings.save();
            modal.close();
            if (this.lastContainerEl) this.render(this.lastContainerEl);
        };
        modal.open();
    }
}
