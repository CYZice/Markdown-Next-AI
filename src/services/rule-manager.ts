import type { GlobalRule, PluginSettings } from "../types";

interface PluginInterface {
    settings: PluginSettings;
    saveSettings(): Promise<void>;
}

export class GlobalRuleManager {
    private plugin: PluginInterface;

    constructor(plugin: PluginInterface) {
        this.plugin = plugin;
    }

    getRules(): GlobalRule[] {
        return this.plugin.settings.globalRules || [];
    }

    getActiveRules(): GlobalRule[] {
        return this.getRules().filter(rule => rule.enabled !== false);
    }

    async addRule(rule: Partial<GlobalRule>): Promise<GlobalRule> {
        const newRule: GlobalRule = {
            id: this.generateRuleId(),
            name: rule.name || "新规则",
            content: rule.content || "",
            description: rule.description || "",
            category: rule.category || "custom",
            priority: rule.priority || 0,
            enabled: rule.enabled !== false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        if (!this.plugin.settings.globalRules) {
            this.plugin.settings.globalRules = [];
        }

        this.plugin.settings.globalRules.push(newRule);
        await this.plugin.saveSettings();
        return newRule;
    }

    async updateRule(id: string, updates: Partial<GlobalRule>): Promise<GlobalRule[]> {
        const rules = this.getRules();
        const index = rules.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error("规则不存在");
        }

        rules[index] = {
            ...rules[index],
            ...updates,
            updatedAt: Date.now()
        };

        await this.plugin.saveSettings();
        return rules;
    }

    async deleteRule(id: string): Promise<void> {
        const rules = this.getRules();
        const index = rules.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error("规则不存在");
        }

        rules.splice(index, 1);
        await this.plugin.saveSettings();
    }

    async toggleRule(id: string): Promise<GlobalRule> {
        const rule = this.getRules().find(r => r.id === id);
        if (rule) {
            rule.enabled = !rule.enabled;
            rule.updatedAt = Date.now();
            await this.plugin.saveSettings();
            return rule;
        }
        throw new Error("规则不存在");
    }

    async createFromTemplate(templateId: string): Promise<GlobalRule> {
        const template = (this.plugin.settings.ruleTemplates || []).find(t => t.id === templateId);
        if (template) {
            return this.addRule({
                name: template.name,
                content: template.content,
                description: template.description,
                category: template.category
            });
        }
        throw new Error("模板不存在");
    }

    getTemplates(): GlobalRule[] {
        return this.plugin.settings.ruleTemplates || [];
    }

    getTemplatesByCategory(category: string): GlobalRule[] {
        return this.getTemplates().filter(t => t.category === category);
    }

    private generateRuleId(): string {
        return "rule_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    }

    exportRules(): any {
        return {
            version: "1.0",
            exportedAt: Date.now(),
            rules: this.getRules()
        };
    }

    async importRules(data: any): Promise<number> {
        if (!data || !data.rules || !Array.isArray(data.rules)) {
            throw new Error("导入数据格式错误");
        }

        let count = 0;
        for (const rule of data.rules) {
            try {
                await this.addRule(rule);
                count++;
            } catch (e) {
                console.error("导入规则失败", e);
            }
        }
        return count;
    }
}
