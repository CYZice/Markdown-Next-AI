import { Extension, Text } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { Editor, MarkdownView } from 'obsidian';
import { ChatMessage, TabCompletionOptions } from '../../types';
import type { InlineSuggestionGhostPayload } from '../../ui/inline-suggestion/inline-suggestion';

type TabCompletionSuggestion = {
    editor: Editor;
    view: EditorView;
    text: string;
    cursorOffset: number;
};

type ActiveInlineSuggestion = {
    source: 'tab' | 'continuation';
    editor: Editor;
    view: EditorView;
    fromOffset: number;
    text: string;
} | null;

type TabCompletionDeps = {
    getSettings: () => any;
    getEditorView: (editor: Editor) => EditorView | null;
    getActiveMarkdownView: () => MarkdownView | null;
    getActiveConversationOverrides: () => any | undefined;
    resolveContinuationParams: (overrides?: any) => {
        temperature?: number;
        topP?: number;
        stream: boolean;
        useVaultSearch: boolean;
    };
    getActiveFileTitle: () => string;
    setInlineSuggestionGhost: (view: EditorView, payload: InlineSuggestionGhostPayload) => void;
    clearInlineSuggestion: () => void;
    setActiveInlineSuggestion: (suggestion: ActiveInlineSuggestion) => void;
    addAbortController: (controller: AbortController) => void;
    removeAbortController: (controller: AbortController) => void;
    isContinuationInProgress: () => boolean;
    ai: {
        streamCompletion: (
            messages: ChatMessage[],
            modelId: string,
            options: { temperature?: number; max_tokens?: number; top_p?: number; signal?: AbortSignal },
            onChunk: (chunk: string) => void
        ) => Promise<void>;
        generateCompletion: (
            messages: ChatMessage[],
            modelId: string,
            options: { temperature?: number; max_tokens?: number; top_p?: number; signal?: AbortSignal }
        ) => Promise<string>;
    };
};

const DEFAULT_TAB_COMPLETION_OPTIONS: TabCompletionOptions = {
    enabled: true,
    modelId: "",
    systemPrompt:
        'Your job is to predict the most logical text that should be written at the location of the <mask/>. Your answer can be either code, a single word, or multiple sentences. Your answer must be in the same language as the text that is already there.' +
        '\n\nAdditional constraints:\n{{tab_completion_constraints}}' +
        '\n\nOutput only the text that should appear at the <mask/>. Do not include explanations, labels, or formatting.',
    maxSuggestionLength: 100,
    contextRange: 2000,
    idleTriggerEnabled: true,
    autoTriggerDelayMs: 500,
    triggerDelayMs: 2000,
    autoTriggerCooldownMs: 0,
    triggers: []
};

const MASK_TAG = '<mask/>';

const extractAfterContext = (window: string): string => {
    if (!window) return '';
    return window;
};

const extractBeforeContext = (window: string): string => {
    if (!window) return '';
    const lp = window.lastIndexOf('\n\n');
    const p1 = window.lastIndexOf('.');
    const p2 = window.lastIndexOf('!');
    const p3 = window.lastIndexOf('?');
    const p4 = window.lastIndexOf(';');
    const p5 = window.lastIndexOf(':');
    const maxPunct = Math.max(p1, p2, p3, p4, p5);
    const cut1 = lp !== -1 ? lp + 2 : -1;
    const cut2 = maxPunct !== -1 ? maxPunct + 1 : -1;
    const cut = Math.max(cut1, cut2);
    if (cut > 0 && cut < window.length) return window.slice(cut);
    return window;
};

const extractMaskedContext = (
    doc: Text,
    cursorOffset: number,
    maxBeforeChars: number,
    maxAfterChars: number,
): { before: string; after: string } => {
    const beforeStart = Math.max(0, cursorOffset - maxBeforeChars);
    const beforeWindow = doc.sliceString(beforeStart, cursorOffset);
    const before = extractBeforeContext(beforeWindow);

    if (maxAfterChars <= 0) {
        return { before, after: '' };
    }

    const afterEnd = Math.min(doc.length, cursorOffset + maxAfterChars);
    const afterWindow = doc.sliceString(cursorOffset, afterEnd);
    const after = extractAfterContext(afterWindow);

    return { before, after };
};

export class TabCompletionController {
    private tabCompletionTimer: ReturnType<typeof setTimeout> | null = null;
    private tabCompletionAbortController: AbortController | null = null;
    private tabCompletionSuggestion: TabCompletionSuggestion | null = null;
    private tabCompletionPending: {
        editor: Editor;
        cursorOffset: number;
    } | null = null;
    private lastAutoTriggerAt = 0;

    constructor(private readonly deps: TabCompletionDeps) { }

    createExtension(): Extension {
        return [
            this.createTriggerExtension()
        ];
    }

    createTriggerExtension(): Extension {
        return EditorView.updateListener.of((update: ViewUpdate) => {
            if (!update.docChanged) return;
            const activeMarkdownView = this.deps.getActiveMarkdownView();
            const editor = activeMarkdownView?.editor;
            if (!editor) return;
            const activeView = this.deps.getEditorView(editor);
            if (activeView && activeView !== update.view) return;
            this.handleEditorChange(editor);
        });
    }

    private getTabCompletionOptions(): TabCompletionOptions {
        const settings = this.deps.getSettings()?.tabCompletion ?? {};
        return {
            ...DEFAULT_TAB_COMPLETION_OPTIONS,
            ...settings
        };
    }

    private shouldTrigger(view: EditorView, cursorOffset: number): boolean {
        const options = this.getTabCompletionOptions();
        const triggers = options.triggers.filter(t => t.enabled);

        if (triggers.length === 0) return false;

        const doc = view.state.doc;
        const windowSize = Math.min(options.contextRange, 2000);
        const beforeWindow = doc.sliceString(
            Math.max(0, cursorOffset - windowSize),
            cursorOffset
        );
        const beforeWindowTrimmed = beforeWindow.replace(/\s+$/, '');

        for (const trigger of triggers) {
            if (!trigger.pattern || trigger.pattern.trim().length === 0) {
                continue;
            }
            if (trigger.type === 'string') {
                if (
                    beforeWindow.endsWith(trigger.pattern) ||
                    beforeWindowTrimmed.endsWith(trigger.pattern)
                ) {
                    return true;
                }
                continue;
            }
            try {
                const regex = new RegExp(trigger.pattern);
                if (regex.test(beforeWindow) || regex.test(beforeWindowTrimmed)) {
                    return true;
                }
            } catch {
                // Ignore invalid regex
            }
        }
        return false;
    }

    clearTimer() {
        if (this.tabCompletionTimer) {
            clearTimeout(this.tabCompletionTimer);
            this.tabCompletionTimer = null;
        }
        this.tabCompletionPending = null;
    }

    cancelRequest() {
        if (!this.tabCompletionAbortController) return;
        try {
            this.tabCompletionAbortController.abort();
        } catch { }
        this.deps.removeAbortController(this.tabCompletionAbortController);
        this.tabCompletionAbortController = null;
    }

    clearSuggestion() {
        if (this.tabCompletionSuggestion) {
            const { view } = this.tabCompletionSuggestion;
            if (view) {
                this.deps.setInlineSuggestionGhost(view, null);
            }
            this.tabCompletionSuggestion = null;
        }
    }

    handleEditorChange(editor: Editor) {
        this.clearTimer();
        this.cancelRequest();

        this.deps.clearInlineSuggestion();

        const settings = this.deps.getSettings()?.tabCompletion;
        if (!settings || !settings.enabled) return;

        const view = this.deps.getEditorView(editor);
        if (!view) return;

        if (this.deps.isContinuationInProgress()) {
            this.deps.clearInlineSuggestion();
            return;
        }

        const selection = editor.getSelection();
        if (selection && selection.length > 0) return;

        const cursorOffset = view.state.selection.main.head;
        const options = this.getTabCompletionOptions();

        const shouldTrigger = this.shouldTrigger(view, cursorOffset);
        if (!shouldTrigger && !options.idleTriggerEnabled) return;

        const isAutoTrigger = !shouldTrigger && options.idleTriggerEnabled;
        const delay = Math.max(
            0,
            isAutoTrigger ? options.autoTriggerDelayMs : options.triggerDelayMs
        );

        // Log removed

        if (isAutoTrigger) {
            const cooldownMs = Math.max(0, options.autoTriggerCooldownMs);
            if (cooldownMs > 0 && Date.now() - this.lastAutoTriggerAt < cooldownMs) {
                return;
            }
        }

        this.tabCompletionPending = { editor, cursorOffset };

        this.tabCompletionTimer = setTimeout(() => {
            if (!this.tabCompletionPending) return;
            if (this.tabCompletionPending.editor !== editor) return;

            // Check if cursor moved
            if (view.state.selection.main.head !== cursorOffset) return;

            if (editor.getSelection()?.length) return;
            if (this.deps.isContinuationInProgress()) return;

            if (isAutoTrigger) {
                this.lastAutoTriggerAt = Date.now();
            }

            void this.run(editor, cursorOffset);
        }, delay);
    }

    async run(editor: Editor, scheduledCursorOffset: number) {
        try {
            const settings = this.deps.getSettings()?.tabCompletion;
            if (!settings?.enabled) return;

            const view = this.deps.getEditorView(editor);
            if (!view) return;

            if (view.state.selection.main.head !== scheduledCursorOffset) return;
            if (editor.getSelection()?.length) return;

            const options = this.getTabCompletionOptions();
            const doc = view.state.doc;

            const maxBeforeChars = Math.round((options.contextRange * 4) / 5);
            const maxAfterChars = Math.max(0, options.contextRange - maxBeforeChars);
            const { before, after } = extractMaskedContext(
                doc,
                scheduledCursorOffset,
                maxBeforeChars,
                maxAfterChars
            );

            const hasBefore = Boolean(before && before.trim().length > 0);
            const hasAfter = Boolean(after && after.trim().length > 0);
            if (!hasBefore && !hasAfter) return;

            const beforeWindow = doc.sliceString(
                Math.max(0, scheduledCursorOffset - options.contextRange),
                scheduledCursorOffset
            );
            const beforeWindowLength = beforeWindow.trim().length;
            const minCtx = typeof options.minContextLength === 'number' ? options.minContextLength : 0;
            if (minCtx > 0 && beforeWindowLength < minCtx) return;

            const modelId = options.modelId || this.deps.getSettings()?.currentModel;
            if (!modelId) return;

            const TAB_COMPLETION_CONSTRAINTS_PLACEHOLDER = '{{tab_completion_constraints}}';
            const TAB_COMPLETION_CONSTRAINTS_BLOCK = `\n\nAdditional constraints:\n${TAB_COMPLETION_CONSTRAINTS_PLACEHOLDER}`;
            const applyTabCompletionConstraints = (prompt: string, constraints: string): string => {
                const trimmed = constraints.trim();
                if (!trimmed) {
                    return prompt
                        .replace(TAB_COMPLETION_CONSTRAINTS_BLOCK, '')
                        .replace(TAB_COMPLETION_CONSTRAINTS_PLACEHOLDER, '')
                        .replace(/\n{3,}/g, '\n\n');
                }
                if (!prompt.includes(TAB_COMPLETION_CONSTRAINTS_PLACEHOLDER)) {
                    return `${prompt}\n\nAdditional constraints:\n${trimmed}`;
                }
                return prompt.replace(TAB_COMPLETION_CONSTRAINTS_PLACEHOLDER, trimmed);
            };
            const systemPromptBase = options.systemPrompt;
            const preset = options.lengthPreset ?? 'short';
            const presetConstraint =
                preset === 'long'
                    ? 'Prefer a longer continuation (multiple sentences or paragraphs, roughly 300-800 characters) when appropriate.'
                    : preset === 'medium'
                        ? 'Keep the completion medium length (about 2-5 sentences, roughly 120-300 characters).'
                        : 'Keep the completion short (about 1-2 sentences, roughly 40-120 characters). Avoid starting a new section.';
            const trimmedCustom = (options.constraints ?? '').trim();
            const combinedConstraints = [presetConstraint, trimmedCustom].filter(Boolean).join('\n');
            const systemPrompt = applyTabCompletionConstraints(systemPromptBase, combinedConstraints);
            const contextWithMask = `${before}${MASK_TAG}${after}`;
            const fileTitle = this.deps.getActiveFileTitle() ?? '';
            const titleSection = fileTitle ? `File title: ${fileTitle}\n\n` : '';

            const baseModelSpecialPrompt = (this.deps.getSettings()?.baseModelSpecialPrompt ?? '').trim();
            const isBaseModel = baseModelSpecialPrompt.length > 0;
            const basePromptSection = isBaseModel ? `${baseModelSpecialPrompt}\n\n` : '';
            const userContent = isBaseModel
                ? `${basePromptSection}${systemPrompt}\n\n${titleSection}${contextWithMask}`
                : `${basePromptSection}${titleSection}${contextWithMask}`;
            const messages: ChatMessage[] = [
                ...(isBaseModel ? [] : [{ role: 'system', content: systemPrompt }]),
                { role: 'user', content: userContent }
            ];

            // Log removed

            this.cancelRequest();
            this.deps.clearInlineSuggestion();
            this.tabCompletionPending = null;

            const controller = new AbortController();
            this.tabCompletionAbortController = controller;
            this.deps.addAbortController(controller);

            const overrides = this.deps.getActiveConversationOverrides?.() ?? undefined;
            const { temperature: overrideTemp, topP: overrideTopP } = this.deps.resolveContinuationParams(overrides);

            const updateSuggestion = (suggestionText: string) => {
                // Check if still valid
                if (view.state.selection.main.head !== scheduledCursorOffset) return;
                if (editor.getSelection()?.length) return;

                // Normalize newlines and trim trailing whitespace incrementally
                let cleaned = suggestionText.replace(/\r\n/g, '\n').replace(/\s+$/, '');
                if (!cleaned.trim()) return;
                if (/^[\s\n\t]+$/.test(cleaned)) return;
                cleaned = cleaned.replace(/^[\s\n\t]+/, '');

                if (cleaned.length > options.maxSuggestionLength) {
                    cleaned = cleaned.slice(0, options.maxSuggestionLength);
                }

                this.deps.setInlineSuggestionGhost(view, {
                    from: scheduledCursorOffset,
                    text: cleaned
                });

                this.tabCompletionSuggestion = {
                    editor,
                    view,
                    text: cleaned,
                    cursorOffset: scheduledCursorOffset
                };
                this.deps.setActiveInlineSuggestion({
                    source: 'tab',
                    editor,
                    view,
                    fromOffset: scheduledCursorOffset,
                    text: cleaned
                });
            };

            let rawText = '';
            const attempts = Math.max(0, options.maxRetries ?? 0) + 1;
            for (let attempt = 0; attempt < attempts; attempt++) {
                const controller = new AbortController();
                this.tabCompletionAbortController = controller;
                this.deps.addAbortController(controller);
                let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
                const reqTimeout = typeof options.requestTimeoutMs === 'number' ? Math.max(0, options.requestTimeoutMs) : 0;
                if (reqTimeout > 0) {
                    timeoutHandle = setTimeout(() => {
                        try {
                            controller.abort();
                        } catch { }
                    }, reqTimeout);
                }
                try {
                    await this.deps.ai.streamCompletion(
                        messages,
                        modelId,
                        {
                            temperature: typeof options.temperature === 'number' ? options.temperature : (typeof overrideTemp === 'number' ? overrideTemp : 0.2),
                            max_tokens: Math.max(16, Math.min(2000, Math.ceil(options.maxSuggestionLength / 3))),
                            top_p: typeof options.topP === 'number' ? options.topP : (typeof overrideTopP === 'number' ? overrideTopP : undefined),
                            signal: controller.signal
                        },
                        (chunk) => {
                            rawText += chunk;
                            updateSuggestion(rawText);
                        }
                    );
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    break;
                } catch (err: any) {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    const aborted = controller.signal.aborted || err?.name === 'AbortError';
                    if (aborted && attempt < attempts - 1) {
                        this.deps.removeAbortController(controller);
                        this.tabCompletionAbortController = null;
                        continue;
                    }
                    const msg = String(err?.message ?? '');
                    const shouldFallback = /protocol error|unexpected EOF|incomplete envelope/i.test(msg);
                    if (shouldFallback) {
                        const suggestion = await this.deps.ai.generateCompletion(
                            messages,
                            modelId,
                            {
                                temperature: typeof options.temperature === 'number' ? options.temperature : (typeof overrideTemp === 'number' ? overrideTemp : 0.2),
                                max_tokens: Math.max(16, Math.min(2000, Math.ceil(options.maxSuggestionLength / 3))),
                                top_p: typeof options.topP === 'number' ? options.topP : (typeof overrideTopP === 'number' ? overrideTopP : undefined),
                                signal: controller.signal
                            }
                        );
                        try {
                            console.log("[MN-AI TabCompletion]", {
                                event: "fallbackCompletion",
                                suggestionLength: String(suggestion).length
                            });
                        } catch { }
                        if (view.state.selection.main.head !== scheduledCursorOffset) return;
                        if (editor.getSelection()?.length) return;
                        updateSuggestion(suggestion);
                        return;
                    }
                    throw err;
                } finally {
                    if (this.tabCompletionAbortController === controller) {
                        this.deps.removeAbortController(controller);
                        this.tabCompletionAbortController = null;
                    }
                }
            }

        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Tab completion failed:', error);
        } finally {
            if (this.tabCompletionAbortController) {
                this.deps.removeAbortController(this.tabCompletionAbortController);
                this.tabCompletionAbortController = null;
            }
        }
    }

    manualTrigger(editor: Editor) {
        const view = this.deps.getEditorView(editor);
        if (!view) return;
        const offset = view.state.selection.main.head;
        void this.run(editor, offset);
    }

    tryAcceptFromView(view: EditorView): boolean {
        const suggestion = this.tabCompletionSuggestion;
        if (!suggestion) return false;
        if (suggestion.view !== view) return false;

        if (view.state.selection.main.head !== suggestion.cursorOffset) {
            this.deps.clearInlineSuggestion();
            return false;
        }

        const editor = suggestion.editor;
        if (editor.getSelection()?.length) {
            this.deps.clearInlineSuggestion();
            return false;
        }

        const cursor = editor.getCursor();
        const escapeMarkdownSpecialChars = (
            text: string,
            options?: { escapeAngleBrackets?: boolean; escapeBackslashes?: boolean; preserveCodeBlocks?: boolean },
        ): string => {
            const { escapeAngleBrackets = true, escapeBackslashes = false, preserveCodeBlocks = true } = options ?? {};
            if (!text) return text;
            const escapeText = (t: string): string => {
                let result = t;
                if (escapeBackslashes) {
                    result = result.replace(/\\/g, '\\\\');
                }
                if (escapeAngleBrackets) {
                    result = result.replace(/<(\w+)>/g, '\\<$1\\>');
                    result = result.replace(/(\s|^)<(\w+)/g, '$1\\<$2');
                    result = result.replace(/(\w+)>(\s|$)/g, '$1\\>$2');
                }
                return result;
            };
            if (preserveCodeBlocks) {
                const codeBlockRegex = /(`{1,3})[\s\S]*?\1/g;
                const codeBlocks: string[] = [];
                let index = 0;
                const textWithPlaceholders = text.replace(codeBlockRegex, (match) => {
                    const placeholder = `__CODE_BLOCK_${index}__`;
                    codeBlocks[index] = match;
                    index++;
                    return placeholder;
                });
                let escaped = escapeText(textWithPlaceholders);
                codeBlocks.forEach((block, i) => {
                    escaped = escaped.replace(`__CODE_BLOCK_${i}__`, block);
                });
                return escaped;
            }
            return escapeText(text);
        };
        const suggestionText = escapeMarkdownSpecialChars(suggestion.text, {
            escapeAngleBrackets: true,
            preserveCodeBlocks: true
        });

        this.deps.clearInlineSuggestion();
        editor.replaceRange(suggestionText, cursor, cursor);

        // Log removed

        const parts = suggestionText.split('\n');
        const endCursor =
            parts.length === 1
                ? { line: cursor.line, ch: cursor.ch + parts[0].length }
                : {
                    line: cursor.line + parts.length - 1,
                    ch: parts[parts.length - 1].length,
                };
        editor.setCursor(endCursor);

        return true;
    }
}
