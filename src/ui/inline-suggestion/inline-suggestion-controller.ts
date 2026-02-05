import { Compartment, Prec, StateEffect } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { Editor } from 'obsidian';
import type { TabCompletionController } from '../../features/tab-completion/tab-completion-controller';
import {
    InlineSuggestionGhostPayload,
    inlineSuggestionGhostEffect,
    inlineSuggestionGhostField,
    thinkingIndicatorEffect,
    thinkingIndicatorField,
} from './inline-suggestion';

type ActiveInlineSuggestion = {
    source: 'tab' | 'continuation';
    editor: Editor;
    view: EditorView;
    fromOffset: number;
    text: string;
} | null;

type ContinuationInlineSuggestion = {
    editor: Editor;
    view: EditorView;
    text: string;
    fromOffset: number;
    startPos: ReturnType<Editor['getCursor']>;
} | null;

type InlineSuggestionControllerDeps = {
    getEditorView: (editor: Editor) => EditorView | null;
    getTabCompletionController: () => TabCompletionController;
};

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

export class InlineSuggestionController {
    private readonly getEditorView: (editor: Editor) => EditorView | null;
    private readonly getTabCompletionController: () => TabCompletionController;

    private readonly extensionViews = new Set<EditorView>();
    private readonly compartment = new Compartment();
    private readonly extension = [
        inlineSuggestionGhostField,
        thinkingIndicatorField,
        Prec.high(
            keymap.of([
                {
                    key: 'Tab',
                    run: (v) => this.tryAcceptInlineSuggestionFromView(v),
                },
                {
                    key: 'Shift-Tab',
                    run: (v) => this.tryRejectInlineSuggestionFromView(v),
                },
                {
                    key: 'Escape',
                    run: (v) => this.tryRejectInlineSuggestionFromView(v),
                },
            ]),
        ),
    ];

    private activeInlineSuggestion: ActiveInlineSuggestion = null;
    private continuationInlineSuggestion: ContinuationInlineSuggestion = null;

    constructor(deps: InlineSuggestionControllerDeps) {
        this.getEditorView = deps.getEditorView;
        this.getTabCompletionController = deps.getTabCompletionController;
    }

    ensureInlineSuggestionExtension(view: EditorView) {
        if (this.extensionViews.has(view)) return;
        view.dispatch({
            effects: StateEffect.appendConfig.of([this.compartment.of(this.extension)]),
        });
        this.extensionViews.add(view);
    }

    removeInlineSuggestionExtension(view: EditorView) {
        if (!this.extensionViews.has(view)) return;
        view.dispatch({
            effects: this.compartment.reconfigure([]),
        });
        this.extensionViews.delete(view);
    }

    destroy() {
        for (const view of this.extensionViews) {
            this.removeInlineSuggestionExtension(view);
        }
        this.extensionViews.clear();
        this.activeInlineSuggestion = null;
        this.continuationInlineSuggestion = null;
    }

    setInlineSuggestionGhost(view: EditorView, payload: InlineSuggestionGhostPayload) {
        this.ensureInlineSuggestionExtension(view);
        view.dispatch({ effects: inlineSuggestionGhostEffect.of(payload) });
    }

    showThinkingIndicator(view: EditorView, from: number, label: string, snippet?: string) {
        this.ensureInlineSuggestionExtension(view);
        view.dispatch({
            effects: thinkingIndicatorEffect.of({ from, label, snippet }),
        });
    }

    hideThinkingIndicator(view: EditorView) {
        this.ensureInlineSuggestionExtension(view);
        view.dispatch({ effects: thinkingIndicatorEffect.of(null) });
    }

    setActiveInlineSuggestion(suggestion: ActiveInlineSuggestion) {
        this.activeInlineSuggestion = suggestion;
    }

    setContinuationSuggestion(params: {
        editor: Editor;
        view: EditorView;
        text: string;
        fromOffset: number;
        startPos: ReturnType<Editor['getCursor']>;
    }) {
        this.activeInlineSuggestion = {
            source: 'continuation',
            editor: params.editor,
            view: params.view,
            fromOffset: params.fromOffset,
            text: params.text,
        };
        this.continuationInlineSuggestion = {
            editor: params.editor,
            view: params.view,
            text: params.text,
            fromOffset: params.fromOffset,
            startPos: params.startPos,
        };
    }

    clearInlineSuggestion() {
        this.getTabCompletionController().clearSuggestion();
        if (this.continuationInlineSuggestion) {
            const { view } = this.continuationInlineSuggestion;
            if (view) {
                this.setInlineSuggestionGhost(view, null);
            }
            this.continuationInlineSuggestion = null;
        }
        this.activeInlineSuggestion = null;
    }

    tryAcceptInlineSuggestionFromView(view: EditorView): boolean {
        const suggestion = this.activeInlineSuggestion;
        if (!suggestion) return false;
        if (suggestion.view !== view) return false;

        if (suggestion.source === 'tab') {
            return this.getTabCompletionController().tryAcceptFromView(view);
        }
        if (suggestion.source === 'continuation') {
            return this.tryAcceptContinuationFromView(view);
        }
        return false;
    }

    tryRejectInlineSuggestionFromView(view: EditorView): boolean {
        const suggestion = this.activeInlineSuggestion;
        if (!suggestion) return false;
        if (suggestion.view !== view) return false;
        this.clearInlineSuggestion();
        return true;
    }

    private tryAcceptContinuationFromView(view: EditorView): boolean {
        const suggestion = this.continuationInlineSuggestion;
        if (!suggestion) return false;
        if (suggestion.view !== view) {
            this.clearInlineSuggestion();
            return false;
        }
        const active = this.activeInlineSuggestion;
        if (!active || active.source !== 'continuation') return false;
        const { editor, text, startPos } = suggestion;
        if (!text || text.length === 0) {
            this.clearInlineSuggestion();
            return false;
        }
        if (this.getEditorView(editor) !== view) {
            this.clearInlineSuggestion();
            return false;
        }
        if (editor.getSelection()?.length) {
            this.clearInlineSuggestion();
            return false;
        }
        const insertionText = escapeMarkdownSpecialChars(text, {
            escapeAngleBrackets: true,
            preserveCodeBlocks: true,
        });
        this.clearInlineSuggestion();
        editor.replaceRange(insertionText, startPos, startPos);
        const parts = insertionText.split('\n');
        const endCursor =
            parts.length === 1
                ? { line: startPos.line, ch: startPos.ch + parts[0].length }
                : { line: startPos.line + parts.length - 1, ch: parts[parts.length - 1].length };
        editor.setCursor(endCursor);
        return true;
    }
}
