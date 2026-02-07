import { App, PluginSettingTab } from "obsidian";
import MarkdownNextAIPlugin from "../main";
import { SettingsManager } from "./settings-manager";
import { ChatTabView } from "./views/chat-tab-view";
import { CompletionTabView } from "./views/completion-tab-view";
import { EditorTabView } from "./views/editor-tab-view";
import { ModelsTabView } from "./views/models-tab-view";
import { OthersTabView } from "./views/others-tab-view";

export type TabId = "models" | "editor" | "completion" | "chat" | "others";

export class MarkdownNextAISettingTab extends PluginSettingTab {
    private plugin: MarkdownNextAIPlugin;
    private settingsManager: SettingsManager;
    private activeTab: TabId = "models";

    constructor(app: App, plugin: MarkdownNextAIPlugin) {
        super(app, plugin as any);
        this.plugin = plugin;
        this.settingsManager = new SettingsManager(plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        const title = containerEl.createEl("h2", { text: "MarkdownNext AI 设置 (重构中)" });

        const tabsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 8px;" } });
        const nav = tabsContainer.createEl("div", { attr: { style: "display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--background-modifier-border);padding-bottom:8px;position:sticky;top:0;background:var(--background-primary);" } });

        const mkBtn = (id: TabId, label: string) => {
            const btn = nav.createEl("button", {
                text: label,
                attr: { style: `padding:6px 12px;border:none;background:${this.activeTab === id ? 'var(--background-secondary)' : 'var(--background-primary)'};color:var(--text-normal);border-radius:6px;cursor:pointer;` }
            });
            btn.onclick = () => { this.activeTab = id; this.display(); };
            return btn;
        };
        mkBtn("models", "模型");
        mkBtn("editor", "编辑器");
        mkBtn("completion", "补全");
        mkBtn("chat", "对话");
        mkBtn("others", "其他");

        const content = tabsContainer.createEl("div", { attr: { style: "margin-top: 12px;" } });

        switch (this.activeTab) {
            case "models":
                new ModelsTabView(this.app, this.settingsManager, this.plugin).render(content);
                break;
            case "editor":
                new EditorTabView(this.app, this.settingsManager, this.plugin).render(content);
                break;
            case "completion":
                new CompletionTabView(this.app, this.settingsManager, this.plugin).render(content);
                break;
            case "chat":
                new ChatTabView(this.app, this.settingsManager, this.plugin).render(content);
                break;
            case "others":
                new OthersTabView(this.app, this.settingsManager, this.plugin).render(content);
                break;
        }
    }
}
