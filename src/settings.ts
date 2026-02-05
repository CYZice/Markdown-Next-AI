import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { MODEL_CATEGORIES } from "./constants";
import type { AIService } from "./services/ai-service";
import type { GlobalRuleManager } from "./services/rule-manager";
import type { CommonPrompt, GlobalRule, ModelCategory, PluginSettings } from "./types";

interface PluginInterface {
    app: App;
    settings: PluginSettings;
    aiService: AIService;
    ruleManager: GlobalRuleManager;
    saveSettings(): Promise<void>;
    updateEventListeners(): void;
    migrateKeysToKeychain(): Promise<void>;
}

/**
 * 设置页面
 */
export class MarkdownNextAISettingTab extends PluginSettingTab {
    private plugin: PluginInterface;
    private activeTab: 'models' | 'editor' | 'completion' | 'chat' | 'others' = 'models';
    private showAdvancedCompletion = false;

    constructor(app: App, plugin: PluginInterface) {
        super(app, plugin as any);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        const title = containerEl.createEl("h2", { text: "MarkdownNext AI 设置" });
        const tabsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 8px;" } });
        const nav = tabsContainer.createEl("div", { attr: { style: "display: flex; gap: 8px; align-items: center; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; position: sticky; top: 0; background: var(--background-primary);" } });
        const mkBtn = (id: 'models' | 'editor' | 'completion' | 'chat' | 'others', label: string) => {
            const btn = nav.createEl("button", {
                text: label,
                attr: { style: `padding: 6px 12px; border: none; background: ${this.activeTab === id ? 'var(--background-secondary)' : 'var(--background-primary)'}; color: var(--text-normal); border-radius: 6px; cursor: pointer;` }
            });
            btn.onclick = () => {
                this.activeTab = id;
                this.display();
            };
            return btn;
        };
        mkBtn('models', '模型');
        mkBtn('editor', '编辑器');
        mkBtn('completion', '补全');
        mkBtn('chat', '对话');
        mkBtn('others', '其他');
        const content = tabsContainer.createEl("div", { attr: { style: "margin-top: 12px;" } });
        if (this.activeTab === 'models') {
            this.renderModelsTab(content);
        } else if (this.activeTab === 'editor') {
            this.renderEditorTab(content);
        } else if (this.activeTab === 'completion') {
            this.renderCompletionTab(content);
        } else if (this.activeTab === 'chat') {
            this.renderChatTab(content);
        } else {
            this.renderOthersTab(content);
        }
    }

    private renderModelsTab(containerEl: HTMLElement) {
        containerEl.createEl("h3", { text: "供应商、API设置" });

        // Add Keychain setting
        const secretStorage = (this.app as any).secretStorage || (this.app as any).keychain || (window as any).secretStorage || (this.app as any).vault?.secretStorage;
        const hasSecretStorage = secretStorage && (typeof secretStorage.save === "function" || typeof secretStorage.setSecret === "function");

        new Setting(containerEl)
            .setName("使用 Obsidian Keychain 安全存储")
            .setDesc(hasSecretStorage
                ? `开启后，新配置的 API Key 将存储在系统钥匙串中 (推荐)`
                : `当前 Obsidian 版本不支持 Keychain (未检测到 secretStorage API)`)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.useKeychain ?? true)
                    .setDisabled(!hasSecretStorage)
                    .onChange(async (value) => {
                        this.plugin.settings.useKeychain = value;
                        await this.plugin.saveSettings();
                        if (value) {
                            await this.plugin.migrateKeysToKeychain();
                            this.display();
                        }
                    });
            });

        containerEl.createEl("p", { text: "APIKey：需在供应商API密钥中设置APIKey", attr: { style: "color: var(--text-muted); margin-bottom: 5px;" } });
        containerEl.createEl("p", { text: "Base URL：选填第三方URL，使用openai兼容格式", attr: { style: "color: var(--text-muted); margin-bottom: 15px;" } });
        const providerTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const thead = providerTable.createEl("thead").createEl("tr");
        thead.createEl("th", { text: "ID" });
        thead.createEl("th", { text: "Type" });
        thead.createEl("th", { text: "API Key" });
        thead.createEl("th", { text: "Get API keys" });
        thead.createEl("th", { text: "Actions" });
        const tbody = providerTable.createEl("tbody");
        Object.keys(this.plugin.settings.providers).forEach(providerId => {
            const provider = this.plugin.settings.providers[providerId];
            const row = tbody.createEl("tr");
            row.createEl("td", { text: providerId });
            row.createEl("td", { text: provider.type || "openai" });
            const apiKeyCell = row.createEl("td", { cls: "markdown-next-ai-api-key-cell" });
            if (provider.apiKey && provider.apiKey.trim()) {
                apiKeyCell.createEl("span", { text: "••••••••", attr: { style: "color: var(--text-muted); margin-right: 8px;" } });
            }
            const settingsBtn = apiKeyCell.createEl("button", { cls: "markdown-next-ai-settings-btn", attr: { title: "设置API Key" } });
            settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>';
            settingsBtn.onclick = () => this.showApiKeyModal(providerId);
            const linkCell = row.createEl("td", { attr: { style: "text-align: left;" } });
            const links: Record<string, string> = { openai: "https://platform.openai.com/api-keys", anthropic: "https://console.anthropic.com/", gemini: "https://aistudio.google.com/app/apikey", ollama: "https://ollama.com/" };
            const link = links[providerId] || (this.plugin.settings.apiKeyLinks && this.plugin.settings.apiKeyLinks[providerId]);
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
                        Object.keys(this.plugin.settings.models).forEach(modelId => {
                            if (this.plugin.settings.models[modelId].provider === providerId) {
                                delete this.plugin.settings.models[modelId];
                            }
                        });
                        delete this.plugin.settings.providers[providerId];
                        await this.plugin.saveSettings();
                        this.display();
                    }
                };
            }
        });
        containerEl.createEl("div", { attr: { style: "margin-top: 15px; margin-bottom: 20px;" } })
            .createEl("button", { text: "+ 添加供应商", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;" } }).onclick = () => this.showAddProviderModal();
        const modelHeader = containerEl.createEl("div", { attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-top: 30px; margin-bottom: 15px;" } });
        modelHeader.createEl("h3", { text: "模型设置", attr: { style: "margin: 0;" } });
        modelHeader.createEl("button", { text: "+ 添加模型", attr: { style: "background: var(--interactive-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;" } }).onclick = () => this.showAddModelModal();
        const modelTable = containerEl.createEl("table", { cls: "markdown-next-ai-config-table" });
        const mThead = modelTable.createEl("thead").createEl("tr");
        mThead.createEl("th", { text: "ID" });
        mThead.createEl("th", { text: "Provider" });
        mThead.createEl("th", { text: "Model" });
        mThead.createEl("th", { text: "Enable" });
        mThead.createEl("th", { text: "Actions" });
        const mTbody = modelTable.createEl("tbody");
        const allModels = Object.values(this.plugin.settings.models);
        if (allModels.length > 0) {
            allModels.forEach(model => {
                const row = mTbody.createEl("tr");
                row.createEl("td", { text: model.id });
                row.createEl("td", { text: model.provider });
                row.createEl("td", { text: model.name });
                const enableCell = row.createEl("td", { cls: "markdown-next-ai-enable-cell" });
                const checkbox = enableCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
                checkbox.checked = model.enabled;
                checkbox.onchange = async () => {
                    this.plugin.settings.models[model.id].enabled = checkbox.checked;
                    await this.plugin.saveSettings();
                    if (!checkbox.checked && this.plugin.settings.currentModel === model.id) {
                        const firstEnabled = Object.keys(this.plugin.settings.models).find(id => this.plugin.settings.models[id].enabled);
                        if (firstEnabled) {
                            this.plugin.settings.currentModel = firstEnabled;
                            await this.plugin.saveSettings();
                            this.display();
                        }
                    }
                };
                const mActionsCell = row.createEl("td", { cls: "markdown-next-ai-actions-cell" });
                const editBtn = mActionsCell.createEl("button", { text: "编辑" });
                editBtn.onclick = () => this.showEditModelModal(model.id);
                const deleteBtn = mActionsCell.createEl("button", { text: "删除" });
                deleteBtn.onclick = async () => {
                    if (confirm(`确定要删除模型 "${model.name}" ？`)) {
                        if (this.plugin.settings.currentModel === model.id) {
                            const otherEnabled = Object.keys(this.plugin.settings.models).find(id => id !== model.id && this.plugin.settings.models[id].enabled);
                            this.plugin.settings.currentModel = otherEnabled || "";
                        }
                        delete this.plugin.settings.models[model.id];
                        await this.plugin.saveSettings();
                        this.display();
                    }
                };
            });
        } else {
            const emptyRow = mTbody.createEl("tr");
            emptyRow.createEl("td", { text: "暂无模型，点击上方按钮添加", attr: { colspan: "5", style: "text-align: center; color: var(--text-muted); font-style: italic; padding: 20px;" } });
        }
        new Setting(containerEl)
            .setName("当前模型")
            .setDesc("选择当前使用的AI模型")
            .addDropdown(dropdown => {
                const enabledModels = Object.keys(this.plugin.settings.models).filter(id => this.plugin.settings.models[id].enabled);
                enabledModels.forEach(id => {
                    const model = this.plugin.settings.models[id];
                    dropdown.addOption(id, `${model.name} (${model.provider})`);
                });
                if (!enabledModels.includes(this.plugin.settings.currentModel) && enabledModels.length > 0) {
                    this.plugin.settings.currentModel = enabledModels[0];
                    this.plugin.saveSettings();
                }
                dropdown.setValue(this.plugin.settings.currentModel || "")
                    .onChange(async (value) => {
                        this.plugin.settings.currentModel = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderEditorTab(containerEl: HTMLElement) {
        containerEl.createEl("h3", { text: "功能设置" });
        new Setting(containerEl)
            .setName("启用右键菜单")
            .setDesc("在选中文本时显示AI处理选项")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRightClick)
                .onChange(async (value) => {
                    this.plugin.settings.enableRightClick = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateEventListeners();
                }));
        new Setting(containerEl)
            .setName("启用@或&符号触发")
            .setDesc("输入@或&符号时呼出续写对话框")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAtTrigger)
                .onChange(async (value) => {
                    this.plugin.settings.enableAtTrigger = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateEventListeners();
                }));
    }

    private renderCompletionTab(containerEl: HTMLElement) {
        if (!this.plugin.settings.tabCompletion) {
            this.plugin.settings.tabCompletion = { enabled: true, modelId: "", systemPrompt: "You are a text completion engine. Your task is to complete the text at the cursor position marked by <mask/>. Output ONLY the completion text, no explanation, no markdown code blocks unless the completion itself is code.", maxSuggestionLength: 100, contextRange: 2000, idleTriggerEnabled: true, autoTriggerDelayMs: 500, triggerDelayMs: 2000, autoTriggerCooldownMs: 0, triggers: [] };
        }
        const tabConfig = this.plugin.settings.tabCompletion;
        containerEl.createEl("h3", { text: "Tab 补全设置" });
        new Setting(containerEl)
            .setName("启用 Tab 补全")
            .setDesc("启用编辑器中的 Tab 自动补全功能")
            .addToggle(toggle => toggle
                .setValue(tabConfig.enabled)
                .onChange(async (value) => {
                    tabConfig.enabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        if (!tabConfig.enabled) return;
        new Setting(containerEl)
            .setName("补全模型")
            .setDesc("用于生成补全建议的模型")
            .addDropdown(dropdown => {
                const enabledModels = Object.keys(this.plugin.settings.models).filter(id => this.plugin.settings.models[id].enabled);
                enabledModels.forEach(id => {
                    const model = this.plugin.settings.models[id];
                    dropdown.addOption(id, `${model.name} (${model.provider})`);
                });
                if ((!tabConfig.modelId || !this.plugin.settings.models[tabConfig.modelId]?.enabled) && enabledModels.length > 0) {
                    tabConfig.modelId = enabledModels[0];
                }
                dropdown.setValue(tabConfig.modelId || "")
                    .onChange(async (value) => {
                        tabConfig.modelId = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName("最大建议长度")
            .setDesc("生成的补全建议的最大字符数")
            .addText(text => text
                .setValue(String(tabConfig.maxSuggestionLength))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val > 0) {
                        tabConfig.maxSuggestionLength = val;
                        await this.plugin.saveSettings();
                    }
                }));
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
        if (!tabConfig.triggers) tabConfig.triggers = [];
        tabConfig.triggers.forEach((trigger, index) => {
            const row = tBody.createEl("tr");
            const enableCell = row.createEl("td");
            const enableToggle = enableCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
            enableToggle.checked = trigger.enabled;
            enableToggle.onchange = async () => {
                tabConfig.triggers[index].enabled = enableToggle.checked;
                await this.plugin.saveSettings();
            };
            const typeCell = row.createEl("td");
            const typeSelect = typeCell.createEl("select") as HTMLSelectElement;
            [{ v: 'string', l: '字符串' }, { v: 'regex', l: '正则' }].forEach(opt => {
                const o = typeSelect.createEl("option", { text: opt.l }) as HTMLOptionElement;
                o.value = opt.v;
            });
            typeSelect.value = trigger.type;
            typeSelect.onchange = async () => {
                tabConfig.triggers[index].type = typeSelect.value as any;
                await this.plugin.saveSettings();
            };
            const patternCell = row.createEl("td");
            const patternInput = patternCell.createEl("input", { type: "text", attr: { style: "width: 100%;" } }) as HTMLInputElement;
            patternInput.value = trigger.pattern;
            patternInput.onchange = async () => {
                tabConfig.triggers[index].pattern = patternInput.value;
                await this.plugin.saveSettings();
            };
            const descCell = row.createEl("td");
            const descInput = descCell.createEl("input", { type: "text", attr: { style: "width: 100%;" } }) as HTMLInputElement;
            descInput.value = trigger.description ?? "";
            descInput.onchange = async () => {
                tabConfig.triggers[index].description = descInput.value;
                await this.plugin.saveSettings();
            };
            const delCell = row.createEl("td");
            delCell.createEl("button", { text: "删除" }).onclick = async () => {
                if (confirm(`确定要删除此触发器 "${trigger.pattern}" ？`)) {
                    tabConfig.triggers.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                }
            };
        });
        new Setting(containerEl)
            .setName("触发延迟 (ms)")
            .setDesc("输入结束后等待多久再尝试触发")
            .addText(text => text
                .setValue(String(tabConfig.triggerDelayMs))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val >= 0) {
                        tabConfig.triggerDelayMs = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("启用空闲触发")
            .setDesc("光标停留一段时间后自动触发")
            .addToggle(toggle => toggle
                .setValue(tabConfig.idleTriggerEnabled)
                .onChange(async (value) => {
                    tabConfig.idleTriggerEnabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        if (tabConfig.idleTriggerEnabled) {
            new Setting(containerEl)
                .setName("自动触发延迟 (ms)")
                .setDesc("光标停止多久后触发自动补全")
                .addText(text => text
                    .setValue(String(tabConfig.autoTriggerDelayMs))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tabConfig.autoTriggerDelayMs = val;
                            await this.plugin.saveSettings();
                        }
                    }));
            new Setting(containerEl)
                .setName("自动触发冷却 (ms)")
                .setDesc("自动触发后冷却多久不再触发")
                .addText(text => text
                    .setValue(String(tabConfig.autoTriggerCooldownMs))
                    .onChange(async (value) => {
                        const val = parseInt(value);
                        if (!isNaN(val) && val >= 0) {
                            tabConfig.autoTriggerCooldownMs = val;
                            await this.plugin.saveSettings();
                        }
                    }));
        }
        const advToggle = containerEl.createEl("div", { attr: { style: "margin-top: 12px; cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;" } });
        const icon = advToggle.createEl("span", { text: "▶" });
        advToggle.createEl("span", { text: "高级设置" });
        const updateIcon = () => { icon.textContent = this.showAdvancedCompletion ? "▼" : "▶"; };
        updateIcon();
        advToggle.onclick = () => { this.showAdvancedCompletion = !this.showAdvancedCompletion; updateIcon(); this.display(); };
        if (!this.showAdvancedCompletion) return;
        new Setting(containerEl)
            .setName("系统提示词")
            .setDesc("用于补全任务的系统提示词")
            .addTextArea(text => text
                .setPlaceholder("System prompt...")
                .setValue(tabConfig.systemPrompt)
                .onChange(async (value) => {
                    tabConfig.systemPrompt = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName("基础模型特殊提示词")
            .setDesc("当模型不支持 system role 时，作为前导提示")
            .addTextArea(text => text
                .setPlaceholder("Base model special prompt...")
                .setValue(this.plugin.settings.baseModelSpecialPrompt ?? "")
                .onChange(async (value) => {
                    this.plugin.settings.baseModelSpecialPrompt = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName("上下文范围")
            .setDesc("发送给模型的上下文长度（字符数）")
            .addText(text => text
                .setValue(String(tabConfig.contextRange))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val > 0) {
                        tabConfig.contextRange = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("最小上下文长度")
            .setDesc("触发补全所需的最小前文长度（字符数）")
            .addText(text => text
                .setValue(String(tabConfig.minContextLength ?? 20))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val >= 0) {
                        tabConfig.minContextLength = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("温度 (Temperature)")
            .setDesc("采样温度，范围 0~2")
            .addText(text => text
                .setValue(String(tabConfig.temperature ?? 0.5))
                .onChange(async (value) => {
                    const val = parseFloat(value);
                    if (!isNaN(val) && val >= 0 && val <= 2) {
                        tabConfig.temperature = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("Top P")
            .setDesc("核采样阈值，范围 0~1")
            .addText(text => text
                .setValue(String(tabConfig.topP ?? 1))
                .onChange(async (value) => {
                    const val = parseFloat(value);
                    if (!isNaN(val) && val >= 0 && val <= 1) {
                        tabConfig.topP = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("请求超时 (ms)")
            .setDesc("Tab 补全的单次请求超时时间")
            .addText(text => text
                .setValue(String(tabConfig.requestTimeoutMs ?? 10000))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val >= 0) {
                        tabConfig.requestTimeoutMs = val;
                        await this.plugin.saveSettings();
                    }
                }));
        new Setting(containerEl)
            .setName("补全额外约束")
            .setDesc("为补全添加额外的行为约束")
            .addTextArea(text => text
                .setPlaceholder("例如：避免换段、保持当前语气等")
                .setValue(tabConfig.constraints ?? "")
                .onChange(async (value) => {
                    tabConfig.constraints = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName("最大重试次数")
            .setDesc("遇到可恢复错误时的重试次数")
            .addText(text => text
                .setValue(String(tabConfig.maxRetries ?? 1))
                .onChange(async (value) => {
                    const val = parseInt(value);
                    if (!isNaN(val) && val >= 0) {
                        tabConfig.maxRetries = val;
                        await this.plugin.saveSettings();
                    }
                }));
    }
    private renderChatTab(containerEl: HTMLElement) {
        containerEl.createEl("h3", { text: "全局规则设置" });
        containerEl.createEl("p", { text: "全局规则会自动应用到所有AI请求中，每次对话都需要遵循全局规则", attr: { style: "color: var(--text-muted); margin-bottom: 15px;" } });
        new Setting(containerEl)
            .setName("启用全局规则")
            .setDesc("开启后，全局规则将自动应用到所有AI请求中")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableGlobalRules)
                .onChange(async (value) => {
                    this.plugin.settings.enableGlobalRules = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName("管理全局规则")
            .setDesc("添加、编辑和管理全局规则")
            .addButton(button => button
                .setButtonText("打开规则管理器")
                .onClick(() => this.showRuleManager()));
        containerEl.createEl("h3", { text: "常用提示词管理" });
        containerEl.createEl("p", { text: "管理常用提示词，可在输入框中使用#符号快速调用", attr: { style: "color: var(--text-muted); margin-bottom: 15px;" } });
        new Setting(containerEl)
            .setName("添加新提示词")
            .setDesc("创建一个新的常用提示词")
            .addButton(button => button
                .setButtonText("添加提示词")
                .onClick(() => this.showPromptModal()));
        if (this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts.length > 0) {
            const promptsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 15px;" } });
            this.plugin.settings.commonPrompts.forEach((prompt, index) => {
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

    private renderOthersTab(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("测试API连接")
            .setDesc("测试当前API配置是否正常")
            .addButton(button => button
                .setButtonText("测试连接")
                .onClick(async () => {
                    button.setButtonText("测试中...");
                    try {
                        const result = await this.plugin.aiService.testConnection();
                        if (result.success) {
                            new Notice("✅ API连接成功");
                        } else {
                            new Notice("❌ API连接失败: " + result.message);
                        }
                    } catch (error: any) {
                        new Notice("❌ 测试失败: " + error.message);
                    } finally {
                        button.setButtonText("测试连接");
                    }
                }));
        new Setting(containerEl)
            .setName("请求超时时间")
            .setDesc("API请求超时时间（毫秒）")
            .addText(text => text
                .setPlaceholder("30000")
                .setValue(String(this.plugin.settings.timeout))
                .onChange(async (value) => {
                    const timeout = parseInt(value) || 30000;
                    this.plugin.settings.timeout = timeout;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName("最大Token数")
            .setDesc("AI生成文本的最大长度限制")
            .addText(text => text
                .setPlaceholder("5000")
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const tokens = parseInt(value) || 5000;
                    if (tokens > 0) {
                        this.plugin.settings.maxTokens = tokens;
                        await this.plugin.saveSettings();
                    } else {
                        new Notice("Token数必须为正整数");
                    }
                }));
    }

    showPromptModal(index: number | null = null): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(index !== null ? "编辑提示词" : "添加新提示词");

        const { contentEl } = modal;
        const isEdit = index !== null;
        const prompt = isEdit && this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts[index]
            ? this.plugin.settings.commonPrompts[index]
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

            const duplicateIndex = this.plugin.settings.commonPrompts.findIndex((p, i) => p.name === name && i !== index);
            if (duplicateIndex !== -1) {
                new Notice("提示词名称已存在，请使用其他名称");
                return;
            }

            if (!this.plugin.settings.commonPrompts) {
                this.plugin.settings.commonPrompts = [];
            }

            const newPrompt: CommonPrompt = {
                id: isEdit && prompt ? prompt.id : Date.now().toString(),
                name: name,
                content: content
            };

            if (isEdit && index !== null) {
                this.plugin.settings.commonPrompts[index] = newPrompt;
                new Notice("提示词已更新");
            } else {
                this.plugin.settings.commonPrompts.push(newPrompt);
                new Notice("提示词已添加");
            }

            await this.plugin.saveSettings();
            modal.close();
            this.display();
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

    async deletePrompt(index: number): Promise<void> {
        if (this.plugin.settings.commonPrompts && this.plugin.settings.commonPrompts[index]) {
            const prompt = this.plugin.settings.commonPrompts[index];

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
                this.plugin.settings.commonPrompts.splice(index, 1);
                await this.plugin.saveSettings();
                new Notice("提示词已删除");
                confirmModal.close();
                this.display();
            };

            confirmModal.open();
        }
    }

    showApiKeyModal(providerId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`设置 ${providerId.toUpperCase()} 配置`);

        const { contentEl } = modal;
        const provider = this.plugin.settings.providers[providerId];

        let tempApiKey = provider?.apiKey || "";
        let tempBaseUrl = provider?.baseUrl || "";

        let secretStorage = (this.app as any).secretStorage;

        if (!secretStorage) {
            // Try to find it in other locations
            if ((this.app as any).keychain) {
                secretStorage = (this.app as any).keychain;
            } else if ((window as any).secretStorage) {
                secretStorage = (window as any).secretStorage;
            } else if ((this.app as any).vault?.secretStorage) {
                secretStorage = (this.app as any).vault.secretStorage;
            }
        }

        const hasSecretStorage = secretStorage && (typeof secretStorage.save === "function" || typeof secretStorage.setSecret === "function");

        let useKeychain = tempApiKey.startsWith("secret:");
        if (!tempApiKey && (this.plugin.settings.useKeychain ?? true) && hasSecretStorage) {
            useKeychain = true;
        }

        let apiKeyTextComp: TextComponent;

        // Check for other providers with secret keys
        const otherProvidersWithSecrets = Object.entries(this.plugin.settings.providers)
            .filter(([id, p]: [string, any]) => id !== providerId && p.apiKey && p.apiKey.startsWith("secret:"))
            .map(([id, p]: [string, any]) => ({ id, name: p.name || id, secretRef: p.apiKey }));

        if (otherProvidersWithSecrets.length > 0) {
            new Setting(contentEl)
                .setName("复用已有 Key")
                .setDesc("选择复用其他供应商已配置的 Keychain 密钥")
                .addDropdown(dropdown => {
                    dropdown.addOption("", "不复用 (默认)");
                    otherProvidersWithSecrets.forEach(p => {
                        dropdown.addOption(p.secretRef, `${p.name} (${p.id})`);
                    });

                    // Pre-select if current key matches
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
                text.inputEl.type = "password";

                // Initial state check for reused key
                const isReusing = tempApiKey.startsWith("secret:") && otherProvidersWithSecrets.some(p => p.secretRef === tempApiKey);
                if (isReusing) {
                    text.setPlaceholder(`已复用 ${otherProvidersWithSecrets.find(p => p.secretRef === tempApiKey)?.name} 的 Key`);
                    text.setDisabled(true);
                } else {
                    text.setPlaceholder(useKeychain ? "已存储在 Keychain 中" : "请输入 API Key");
                }

                text.setValue(useKeychain ? "" : tempApiKey)
                    .onChange(value => {
                        tempApiKey = value;
                    });
            });

        // Keychain toggle moved to global settings

        new Setting(contentEl)
            .setName("Base URL")
            .setDesc("可选：设置自定义 Base URL")
            .addText(text => text
                .setPlaceholder("https://api.example.com/v1")
                .setValue(tempBaseUrl)
                .onChange(value => {
                    tempBaseUrl = value;
                }));

        const buttonContainer = contentEl.createEl("div", {
            attr: {
                style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;"
            }
        });

        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: "保存",
            cls: "mod-cta"
        });

        saveBtn.onclick = async () => {
            if (!this.plugin.settings.providers[providerId]) {
                this.plugin.settings.providers[providerId] = { apiKey: "", baseUrl: "", enabled: true };
            }

            if (tempApiKey.startsWith("secret:")) {
                if (useKeychain) {
                    this.plugin.settings.providers[providerId].apiKey = tempApiKey;
                } else {
                    new Notice("请重新输入 API Key 以切换回普通存储");
                    return;
                }
            } else {
                if (tempApiKey) {
                    // Use global setting for new/modified plain text keys
                    const shouldSaveToKeychain = (this.plugin.settings.useKeychain ?? true) && hasSecretStorage;

                    if (shouldSaveToKeychain) {
                        const secretId = `markdown-next-ai-api-key-${providerId}`;
                        const keyToSave = tempApiKey.trim();
                        try {
                            if (typeof secretStorage.save === "function") {
                                await secretStorage.save(secretId, keyToSave);
                            } else {
                                await secretStorage.setSecret(secretId, keyToSave);
                            }
                            this.plugin.settings.providers[providerId].apiKey = `secret:${secretId}`;
                        } catch (e) {
                            new Notice("Keychain 保存失败，已使用普通存储");
                            console.error("Keychain save failed:", e);
                            this.plugin.settings.providers[providerId].apiKey = tempApiKey;
                        }
                    } else {
                        this.plugin.settings.providers[providerId].apiKey = tempApiKey;
                    }
                } else {
                    this.plugin.settings.providers[providerId].apiKey = "";
                }
            }

            this.plugin.settings.providers[providerId].baseUrl = tempBaseUrl;
            this.plugin.settings.providers[providerId].enabled = true;

            await this.plugin.saveSettings();
            new Notice(`${providerId} 配置已保存`);
            modal.close();
            this.display();
        };

        modal.open();
    }

    showAddProviderModal(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加供应商");

        const { contentEl } = modal;

        contentEl.createEl("label", { text: "供应商ID:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const idInput = contentEl.createEl("input", { type: "text", placeholder: "例如: custom-provider", attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", placeholder: "例如: 自定义供应商", attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLSelectElement;
        ["openai", "anthropic", "gemini", "ollama"].forEach(type => {
            typeSelect.createEl("option", { value: type, text: type.toUpperCase() });
        });

        contentEl.createEl("label", { text: "默认Base URL:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const baseUrlInput = contentEl.createEl("input", { type: "text", placeholder: "例如: https://api.example.com/v1", attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "添加", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const type = typeSelect.value;
            const baseUrl = baseUrlInput.value.trim();

            if (!id || !name) {
                new Notice("请填写必填字段");
                return;
            }

            if (this.plugin.settings.providers[id]) {
                new Notice("供应商ID已存在");
                return;
            }

            this.plugin.settings.providers[id] = {
                name: name,
                type: type,
                enabled: true,
                apiKey: "",
                baseUrl: baseUrl
            };

            await this.plugin.saveSettings();
            new Notice("供应商已添加");
            modal.close();
            this.display();
        };

        modal.open();
        idInput.focus();
    }

    showEditProviderModal(providerId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑供应商");

        const { contentEl } = modal;
        const provider = this.plugin.settings.providers[providerId];

        contentEl.createEl("label", { text: "供应商ID:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        contentEl.createEl("input", { type: "text", value: providerId, attr: { style: "width: 100%; margin-bottom: 15px;", disabled: "disabled" } });

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", value: provider.name || providerId, attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLSelectElement;
        ["openai", "anthropic", "gemini", "ollama"].forEach(type => {
            const option = typeSelect.createEl("option", { value: type, text: type.toUpperCase() });
            if (type === provider.type) option.selected = true;
        });

        contentEl.createEl("label", { text: "默认Base URL:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const baseUrlInput = contentEl.createEl("input", { type: "text", value: provider.baseUrl || "", attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "保存", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const type = typeSelect.value;
            const baseUrl = baseUrlInput.value.trim();

            if (!name) {
                new Notice("请填写显示名称");
                return;
            }

            this.plugin.settings.providers[providerId] = {
                ...provider,
                name: name,
                type: type,
                baseUrl: baseUrl
            };

            await this.plugin.saveSettings();
            new Notice("供应商已更新");
            modal.close();
            this.display();
        };

        modal.open();
        nameInput.focus();
    }

    showAddModelModal(category: ModelCategory = MODEL_CATEGORIES.MULTIMODAL): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("添加新模型");

        const { contentEl } = modal;

        contentEl.createEl("label", {
            text: "模型 ID (API参数):",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const idInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "例如: gpt-4-turbo",
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        }) as HTMLInputElement;

        contentEl.createEl("label", {
            text: "显示名称:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const nameInput = contentEl.createEl("input", {
            type: "text",
            placeholder: "例如: 我的自定义模型",
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        }) as HTMLInputElement;

        contentEl.createEl("label", {
            text: "供应商:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const providerSelect = contentEl.createEl("select", {
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        }) as HTMLSelectElement;
        Object.keys(this.plugin.settings.providers).forEach(providerId => {
            providerSelect.createEl("option", {
                value: providerId,
                text: providerId.toUpperCase()
            });
        });

        contentEl.createEl("label", {
            text: "模型类型:",
            attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" }
        });
        const categorySelect = contentEl.createEl("select", {
            attr: { style: "width: 100%; margin-bottom: 15px;" }
        }) as HTMLSelectElement;
        categorySelect.createEl("option", {
            value: MODEL_CATEGORIES.MULTIMODAL,
            text: "多模态模型 (支持图片)"
        }).selected = true;
        categorySelect.createEl("option", {
            value: MODEL_CATEGORIES.TEXT,
            text: "文本模型"
        });

        const buttonContainer = contentEl.createEl("div", {
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" }
        });

        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();

        const saveBtn = buttonContainer.createEl("button", {
            text: "添加",
            cls: "mod-cta"
        });

        saveBtn.onclick = async () => {
            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const provider = providerSelect.value;
            const cat = categorySelect.value as ModelCategory;

            if (!id || !name) {
                new Notice("请填写所有必填字段");
                return;
            }

            if (this.plugin.settings.models[id]) {
                new Notice("模型 ID 已存在，请使用其他 ID");
                return;
            }

            this.plugin.settings.models[id] = {
                id: id,
                name: name,
                provider: provider,
                model: id,
                actualModel: id,
                enabled: true,
                category: cat
            };

            await this.plugin.saveSettings();
            new Notice("模型已添加");
            modal.close();
            this.display();
        };

        modal.open();
        idInput.focus();
    }

    showEditModelModal(modelId: string): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑模型");

        const { contentEl } = modal;
        const model = this.plugin.settings.models[modelId];

        contentEl.createEl("label", { text: "模型 ID (API参数):", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        contentEl.createEl("input", { type: "text", value: modelId, attr: { style: "width: 100%; margin-bottom: 15px;", disabled: "disabled" } });

        contentEl.createEl("label", { text: "显示名称:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const nameInput = contentEl.createEl("input", { type: "text", value: model.name, attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLInputElement;

        contentEl.createEl("label", { text: "供应商:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const providerSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLSelectElement;
        Object.keys(this.plugin.settings.providers).forEach(pId => {
            const option = providerSelect.createEl("option", { value: pId, text: pId.toUpperCase() });
            if (pId === model.provider) option.selected = true;
        });

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "保存", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const provider = providerSelect.value;

            if (!name) {
                new Notice("请填写必填字段");
                return;
            }

            this.plugin.settings.models[modelId] = {
                ...model,
                name: name,
                provider: provider,
                model: modelId,
                actualModel: modelId
            };

            await this.plugin.saveSettings();
            new Notice("模型已更新");
            modal.close();
            this.display();
        };

        modal.open();
        nameInput.focus();
    }

    renderRuleList(container: HTMLElement, modal: Modal): void {
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

    showRuleManager(): void {
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

    showRuleEditor(parentModal: Modal, rule: GlobalRule | null = null): void {
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

    showTemplateSelector(parentModal: Modal): void {
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

    async deleteRule(rule: GlobalRule, parentModal: Modal): Promise<void> {
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

    exportRules(): void {
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

    importRules(parentModal: Modal): void {
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

    showAddTriggerModal(): void {
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

            if (!this.plugin.settings.tabCompletion.triggers) {
                this.plugin.settings.tabCompletion.triggers = [];
            }

            this.plugin.settings.tabCompletion.triggers.push({
                type: typeSelect.value as 'regex' | 'string',
                pattern: pattern,
                enabled: true
            });

            await this.plugin.saveSettings();
            new Notice("触发器已添加");
            modal.close();
            this.display();
        };

        modal.open();
        patternInput.focus();
    }

    showEditTriggerModal(index: number): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText("编辑触发器");

        const { contentEl } = modal;
        const trigger = this.plugin.settings.tabCompletion.triggers[index];

        contentEl.createEl("label", { text: "类型:", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const typeSelect = contentEl.createEl("select", { attr: { style: "width: 100%; margin-bottom: 15px;" } }) as HTMLSelectElement;
        const optRegex = typeSelect.createEl("option", { value: "regex", text: "正则表达式 (Regex)" });
        const optString = typeSelect.createEl("option", { value: "string", text: "精确字符串 (String)" });
        if (trigger.type === 'regex') optRegex.selected = true;
        else optString.selected = true;

        contentEl.createEl("label", { text: "模式 (Pattern):", attr: { style: "display: block; margin-bottom: 5px; font-weight: bold;" } });
        const patternInput = contentEl.createEl("input", {
            type: "text",
            value: trigger.pattern,
            attr: { style: "width: 100%; margin-bottom: 15px; font-family: var(--font-monospace);" }
        }) as HTMLInputElement;

        const buttonContainer = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;" } });
        const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => modal.close();
        const saveBtn = buttonContainer.createEl("button", { text: "保存", cls: "mod-cta" });

        saveBtn.onclick = async () => {
            const pattern = patternInput.value;

            if (!pattern) {
                new Notice("请输入模式内容");
                return;
            }

            this.plugin.settings.tabCompletion.triggers[index] = {
                ...trigger,
                type: typeSelect.value as 'regex' | 'string',
                pattern: pattern
            };

            await this.plugin.saveSettings();
            new Notice("触发器已更新");
            modal.close();
            this.display();
        };

        modal.open();
        patternInput.focus();
    }
}

