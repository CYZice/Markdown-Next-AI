import { Editor } from "obsidian";
import { DEFAULT_SETTINGS } from "../defaults";
import type { PluginSettings, TextContext } from "../types";

/**
 * 文本上下文提取器
 * 用于从编辑器中提取光标周围的上下文
 */
export class TextContextExtractor {
    /**
     * 获取编辑器上下文
     */
    static getContext(editor: Editor, selectedText: string | null = null, settings: PluginSettings | null = null): TextContext {
        const cursor = editor.getCursor();
        const doc = editor.getDoc();
        const totalLines = doc.lineCount();

        let selected = "";
        let beforeText = "";
        let afterText = "";

        if (selectedText) {
            selected = selectedText;

            if (editor.getSelection()) {
                const fromPos = editor.getCursor("from");
                const toPos = editor.getCursor("to");

                for (let i = Math.max(0, fromPos.line - 2); i < fromPos.line; i++) {
                    beforeText += doc.getLine(i) + "\n";
                }
                beforeText += doc.getLine(fromPos.line).substring(0, fromPos.ch);

                afterText = doc.getLine(toPos.line).substring(toPos.ch);
                const maxLine = Math.min(totalLines, toPos.line + 3);
                for (let i = toPos.line + 1; i < maxLine; i++) {
                    afterText += "\n" + doc.getLine(i);
                }
            }
        } else {
            const maxLines = (settings && settings.maxContextLines) ? settings.maxContextLines : DEFAULT_SETTINGS.maxContextLines;
            const maxChars = (settings && settings.maxContextChars) ? settings.maxContextChars : DEFAULT_SETTINGS.maxContextChars;

            let contextText = "";
            for (let i = Math.max(0, cursor.line - maxLines); i < cursor.line; i++) {
                contextText += doc.getLine(i) + "\n";
            }
            contextText += doc.getLine(cursor.line).substring(0, cursor.ch);

            if (contextText.length > maxChars) {
                beforeText = "..." + contextText.substring(contextText.length - maxChars);
            } else {
                beforeText = contextText;
            }

            afterText = doc.getLine(cursor.line).substring(cursor.ch);
            const maxLine = Math.min(totalLines, cursor.line + 5);
            for (let i = cursor.line + 1; i < maxLine; i++) {
                afterText += "\n" + doc.getLine(i);
            }

            if (afterText.length > 1000) {
                afterText = afterText.substring(0, 1000) + "...";
            }
        }

        return {
            selectedText: selected.trim(),
            beforeText: beforeText.trim(),
            afterText: afterText.trim(),
            cursorPosition: cursor,
            filePath: doc.getValue(),
            lineNumber: cursor.line
        };
    }
}
