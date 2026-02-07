import { App, MarkdownRenderer, MarkdownView, Notice, setIcon } from "obsidian";
import MarkdownNextAIPlugin from "../../../main";

export class ChatStreamRenderer {
    private app: App;
    private plugin: MarkdownNextAIPlugin;
    private container: HTMLElement;

    // Streaming state
    private currentStreamingRowEl: HTMLElement | null = null;
    private currentStreamingMessageEl: HTMLElement | null = null;
    private currentStreamingThinkingEl: HTMLElement | null = null;
    private currentStreamingThinkingDetailsEl: HTMLDetailsElement | null = null;
    private currentStreamingThinkingUserToggled: boolean = false;
    private suppressThinkingToggleMark: boolean = false;

    constructor(app: App, plugin: MarkdownNextAIPlugin, container: HTMLElement) {
        this.app = app;
        this.plugin = plugin;
        this.container = container;
    }

    public setContainer(container: HTMLElement) {
        this.container = container;
    }

    public async renderChatMessage(role: "user" | "assistant", content: string): Promise<void> {
        if (!this.container) return;

        const rowEl = this.container.createDiv({ cls: `markdown-next-ai-chat-row ${role}` });
        const messageEl = rowEl.createDiv({ cls: `markdown-next-ai-chat-message ${role}` });

        const contentEl = messageEl.createDiv({ cls: "message-content" });

        if (role === "assistant") {
            await MarkdownRenderer.render(this.app, content, contentEl, "", this.plugin);
            this.createMessageActions(rowEl, content);
        } else {
            contentEl.innerText = content;
        }

        this.scrollToBottom();
    }

    private createMessageActions(container: HTMLElement, content: string): void {
        const existingActions = container.querySelector(".message-actions");
        if (existingActions) existingActions.remove();

        const actionsEl = container.createDiv({ cls: "message-actions" });

        const copyBtn = actionsEl.createEl("button", { cls: "clickable-icon" });
        copyBtn.title = "复制";
        setIcon(copyBtn, "copy");
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(content);
            new Notice("已复制");
        };

        const insertBtn = actionsEl.createEl("button", { cls: "clickable-icon" });
        insertBtn.title = "插入";
        setIcon(insertBtn, "corner-down-left");
        insertBtn.onclick = () => {
            const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
            if (editor) {
                editor.replaceSelection(content);
                new Notice("已插入");
            }
        };
    }

    public createStreamingAssistantMessage(): void {
        if (!this.container) return;

        this.currentStreamingRowEl = this.container.createDiv({ cls: "markdown-next-ai-chat-row assistant" });
        this.currentStreamingMessageEl = this.currentStreamingRowEl.createDiv({
            cls: "markdown-next-ai-chat-message assistant streaming"
        });

        // Thinking section (collapsible; hidden by default)
        this.currentStreamingThinkingUserToggled = false;
        const thinkingDetails = this.currentStreamingMessageEl.createEl("details", {
            cls: "markdown-next-ai-thinking-section markdown-next-ai-chat-thinking"
        }) as HTMLDetailsElement;
        thinkingDetails.open = false;
        thinkingDetails.style.display = "none";

        const summaryEl = thinkingDetails.createEl("summary", { cls: "markdown-next-ai-chat-thinking-summary" });
        summaryEl.setText("思考过程");

        const thinkingContent = thinkingDetails.createDiv({ cls: "markdown-next-ai-thinking-content" });
        thinkingContent.setText("");

        thinkingDetails.addEventListener("toggle", () => {
            if (this.suppressThinkingToggleMark) return;
            this.currentStreamingThinkingUserToggled = true;
        });

        this.currentStreamingThinkingEl = thinkingContent;
        this.currentStreamingThinkingDetailsEl = thinkingDetails;

        const contentEl = this.currentStreamingMessageEl.createDiv({ cls: "message-content" });
        const loadingEl = contentEl.createSpan({ cls: "markdown-next-ai-chat-loading" });
        loadingEl.setText("思考中");

        this.scrollToBottom();
    }

    public updateStreamingThinking(thinking: string): void {
        if (!this.currentStreamingMessageEl || !this.currentStreamingThinkingEl) return;
        const detailsEl = (this.currentStreamingThinkingDetailsEl ||
            (this.currentStreamingMessageEl.querySelector(".markdown-next-ai-chat-thinking") as HTMLDetailsElement | null));
        if (!detailsEl) return;

        const trimmed = (thinking || "").trim();
        if (!trimmed) {
            detailsEl.style.display = "none";
            return;
        }

        detailsEl.style.display = "block";
        this.currentStreamingThinkingEl.setText(trimmed);

        // Auto-expand while generating unless user manually toggled.
        if (this.currentStreamingMessageEl.hasClass("streaming") && !this.currentStreamingThinkingUserToggled && !detailsEl.open) {
            this.suppressThinkingToggleMark = true;
            detailsEl.open = true;
            this.suppressThinkingToggleMark = false;
        }
        this.scrollToBottom();
    }

    public updateStreamingMessage(content: string): void {
        if (!this.currentStreamingMessageEl) return;
        const contentEl = this.currentStreamingMessageEl.querySelector(".message-content") as HTMLElement;
        if (contentEl) {
            contentEl.innerText = content;
        }
        this.scrollToBottom();
    }

    public async finalizeStreamingMessage(content: string): Promise<void> {
        if (!this.currentStreamingMessageEl) return;

        // Auto-collapse thinking after completion unless user manually toggled.
        const detailsEl = (this.currentStreamingThinkingDetailsEl ||
            (this.currentStreamingMessageEl.querySelector(".markdown-next-ai-chat-thinking") as HTMLDetailsElement | null));
        if (detailsEl && !this.currentStreamingThinkingUserToggled && detailsEl.open) {
            this.suppressThinkingToggleMark = true;
            detailsEl.open = false;
            this.suppressThinkingToggleMark = false;
        }

        const contentEl = this.currentStreamingMessageEl.querySelector(".message-content") as HTMLElement;
        if (contentEl) {
            contentEl.empty();
            if (content && content.trim()) {
                await MarkdownRenderer.render(this.app, content, contentEl, "", this.plugin);
            } else {
                contentEl.setText("(No content)");
            }
        }
        if (this.currentStreamingRowEl) {
            this.createMessageActions(this.currentStreamingRowEl, content);
        }
        this.currentStreamingMessageEl.removeClass("streaming");

        this.currentStreamingMessageEl = null;
        this.currentStreamingRowEl = null;
        this.currentStreamingThinkingEl = null;
        this.currentStreamingThinkingDetailsEl = null;
        this.currentStreamingThinkingUserToggled = false;

        this.scrollToBottom();
    }

    private scrollToBottom() {
        if (this.container) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    public clear() {
        if (this.container) {
            this.container.empty();
        }
    }
}
