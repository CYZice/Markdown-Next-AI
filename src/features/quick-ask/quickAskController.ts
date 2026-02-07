import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, Extension } from "@codemirror/state";
import { Editor, MarkdownView, Plugin } from "obsidian";
import { AtTriggerPopup } from "../../ui/at-trigger-popup";
import { PluginSettings } from "../../types";

export interface QuickAskDeps {
    plugin: Plugin;
    getSettings: () => PluginSettings;
    getActiveMarkdownView: () => MarkdownView | null;
}

export const quickAskWidgetEffect = StateEffect.define<{ show: boolean; context?: any } | null>();

export class QuickAskController {
    private deps: QuickAskDeps;
    private popup: AtTriggerPopup | null = null;

    constructor(deps: QuickAskDeps) {
        this.deps = deps;
    }

    createTriggerExtension(): Extension {
        const controller = this;
        
        const quickAskPlugin = ViewPlugin.fromClass(
            class {
                view: EditorView;

                constructor(view: EditorView) {
                    this.view = view;
                }

                update(update: ViewUpdate) {
                    if (update.docChanged) {
                        // Update popup position if it's open
                        // controller.updatePopupPosition(this.view);
                    }
                }

                destroy() {
                    // controller.close();
                }
            }
        );

        const inputHandler = EditorView.domEventHandlers({
            beforeinput: (event, view) => {
                const settings = this.deps.getSettings();
                const data = (event as InputEvent).data;
                
                // Check if trigger character is typed (e.g., @)
                // This is a simplified check, needs robust logic matching requirements
                if (data === "@" || data === "/") { // TODO: use settings
                    const selection = view.state.selection.main;
                    if (selection.empty) {
                        // Check if at beginning of line or empty line
                        const line = view.state.doc.lineAt(selection.head);
                        const textBefore = line.text.slice(0, selection.head - line.from);
                        
                        if (textBefore.trim() === "") {
                            event.preventDefault();
                            this.show(view, data);
                            return true;
                        }
                    }
                }
                return false;
            }
        });

        return [
            quickAskPlugin,
            inputHandler
        ];
    }

    show(view: EditorView, triggerChar: string) {
        // Calculate context
        // Dispatch effect to show UI
        console.log("QuickAsk triggered", triggerChar);
        // Implementation pending: Show AtTriggerPopup
    }
}
