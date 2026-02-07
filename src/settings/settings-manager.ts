import MarkdownNextAIPlugin from "../main";
import type { PluginSettings } from "../types";

/**
 * Centralized settings manager to separate data and UI.
 */
export class SettingsManager {
    private plugin: MarkdownNextAIPlugin;

    constructor(plugin: MarkdownNextAIPlugin) {
        this.plugin = plugin;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    async save(): Promise<void> {
        await this.plugin.saveSettings();
    }

    /**
     * Delegate to plugin's existing migration for now.
     * Later can be moved fully into this manager.
     */
    async migrateKeysToKeychain(): Promise<void> {
        if (typeof (this.plugin as any).migrateKeysToKeychain === "function") {
            await (this.plugin as any).migrateKeysToKeychain();
        }
    }
}
