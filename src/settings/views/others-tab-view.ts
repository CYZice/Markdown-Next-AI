import { Notice, Setting } from "obsidian";
import { AbstractTabView } from "./abstract-tab-view";

export class OthersTabView extends AbstractTabView {
    render(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "其他设置" });
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
                .setValue(String(this.settings.settings.timeout))
                .onChange(async (value) => {
                    const timeout = parseInt(value) || 30000;
                    this.settings.settings.timeout = timeout;
                    await this.settings.save();
                }));

        new Setting(containerEl)
            .setName("最大Token数")
            .setDesc("AI生成文本的最大长度限制")
            .addText(text => text
                .setPlaceholder("5000")
                .setValue(String(this.settings.settings.maxTokens))
                .onChange(async (value) => {
                    const tokens = parseInt(value) || 5000;
                    if (tokens > 0) {
                        this.settings.settings.maxTokens = tokens;
                        await this.settings.save();
                    } else {
                        new Notice("Token数必须为正整数");
                    }
                }));
    }
}
