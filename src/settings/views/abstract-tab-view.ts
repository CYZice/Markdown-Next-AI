import { App } from "obsidian";
import MarkdownNextAIPlugin from "../../main";
import { SettingsManager } from "../settings-manager";

export abstract class AbstractTabView {
    protected app: App;
    protected settings: SettingsManager;
    protected plugin: MarkdownNextAIPlugin;

    constructor(app: App, settings: SettingsManager, plugin: MarkdownNextAIPlugin) {
        this.app = app;
        this.settings = settings;
        this.plugin = plugin;
    }

    abstract render(containerEl: HTMLElement): void;
}
