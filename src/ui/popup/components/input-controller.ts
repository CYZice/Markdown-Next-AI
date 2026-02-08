import { App, TFile, TFolder } from "obsidian";
import MarkdownNextAIPlugin from "../../../main";
import { ImageHandler } from "../../../services/image-handler";
import type { ImageData } from "../../../types";
import { InputContextSelector } from "../../context-selector";
import { PromptSelectorPopup } from "../../prompt-selector";

export class InputController {
    private app: App;
    private plugin: MarkdownNextAIPlugin;
    private popupEl: HTMLElement;

    public inputEl: HTMLElement | HTMLTextAreaElement;
    private fileInputEl: HTMLInputElement;

    private contextSelector: InputContextSelector;
    private promptSelector: PromptSelectorPopup;
    private imageHandler: ImageHandler;

    // Callbacks
    public onSubmit: () => void = () => { };
    public onClose: () => void = () => { };
    public onImageSelected: (imageData: ImageData) => void = () => { };
    public onContextChange: () => void = () => { };

    constructor(
        app: App,
        plugin: MarkdownNextAIPlugin,
        popupEl: HTMLElement,
        inputEl: HTMLTextAreaElement,
        fileInputEl: HTMLInputElement
    ) {
        this.app = app;
        this.plugin = plugin;
        this.popupEl = popupEl;
        this.inputEl = inputEl;
        this.fileInputEl = fileInputEl;
        this.imageHandler = new ImageHandler();

        this.initializeSelectors();
        this.bindEvents();
    }

    public dispose() {
        // Clean up listeners if necessary
        // Most event listeners are on elements that will be removed, but global ones need care
        // InputContextSelector and PromptSelectorPopup might need disposal if they attach to document
        // Currently they attach to document but don't seem to have explicit dispose in their main classes?
        // Let's check if we can cleanup.
        // For now, minimal dispose.
    }

    private initializeSelectors() {
        this.contextSelector = new InputContextSelector(
            this.app,
            this.inputEl as HTMLTextAreaElement,
            () => {
                this.onContextChange();
            }
        );
        this.contextSelector.convertToContentEditable();
        this.inputEl = this.contextSelector.inputEl;

        this.promptSelector = new PromptSelectorPopup(
            this.app,
            this.plugin,
            (content) => this.handlePromptSelection(content)
        );
    }

    // Logic extracted from AtTriggerPopup
    private handlePromptSelection(content: string) {
        const cursorPos = this.contextSelector.getCursorPosition();
        const textBefore = this.contextSelector.getTextContent().substring(0, cursorPos);
        const hashIndex = textBefore.lastIndexOf("#");

        if (hashIndex !== -1) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const deleteLength = cursorPos - hashIndex;

                let position = 0;
                let found = false;

                const deleteText = (node: Node, start: number, length: number): void => {
                    if (found) return;

                    if (node.nodeType === Node.TEXT_NODE) {
                        const textLength = node.textContent!.length;
                        if (position + textLength > start) {
                            const startOffset = start - position;
                            const endOffset = Math.min(startOffset + length, textLength);
                            const text = node.textContent!;
                            node.textContent = text.substring(0, startOffset) + text.substring(endOffset);

                            // Insert new content
                            const textNode = document.createTextNode(content);
                            if (node.parentNode) {
                                node.parentNode.insertBefore(textNode, node.nextSibling);
                                range.setStartAfter(textNode);
                                range.collapse(true);
                            }

                            found = true;
                        } else {
                            position += textLength;
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        for (const child of Array.from(node.childNodes)) {
                            deleteText(child, start, length);
                            if (found) return;
                        }
                    }
                };

                deleteText(this.inputEl, hashIndex, deleteLength);

                selection.removeAllRanges();
                selection.addRange(range);
                this.inputEl.focus();
            }
        }
    }

    private bindEvents() {
        // File Input
        const fileChangeHandler = (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files) {
                this.imageHandler.handleFileSelect(target.files, (imageData) => {
                    this.onImageSelected(imageData);
                });
            }
            target.value = "";
        };
        this.fileInputEl.addEventListener("change", fileChangeHandler);

        // Paste
        const pasteHandler = (e: unknown) => {
            const clipEvent = e as ClipboardEvent;
            this.imageHandler.handlePaste(clipEvent, (imageData) => {
                this.onImageSelected(imageData);
            });
        };
        this.inputEl.addEventListener("paste", pasteHandler as EventListener);

        // Input Handler (Text change)
        const inputHandler = (e: Event) => {
            e.stopPropagation();
            this.adjustHeight();
            this.checkTriggers();
        };
        this.inputEl.addEventListener("input", inputHandler);

        // Keydown
        const keydownHandler = (e: KeyboardEvent) => {
            if (this.contextSelector && this.contextSelector.isOpen) return;

            if (e.key === "Enter") {
                if (!e.shiftKey) {
                    e.preventDefault();
                    this.onSubmit();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.onClose();
            }
        };
        this.inputEl.addEventListener("keydown", keydownHandler as EventListener);
    }

    public adjustHeight() {
        if (this.inputEl instanceof HTMLTextAreaElement && this.popupEl) {
            if (!this.popupEl.style.height) {
                this.inputEl.style.height = 'auto';
                const newHeight = this.inputEl.scrollHeight;
                this.inputEl.style.height = newHeight + 'px';
            } else {
                this.inputEl.style.height = '';
            }
        } else if (this.inputEl instanceof HTMLElement) {
            // For contenteditable, it usually auto-expands, but we might want to limit max-height
            // CSS handles lots of this, but here's a placeholder if needed.
        }
    }

    private checkTriggers() {
        const cursorPos = this.contextSelector.getCursorPosition();
        const textBefore = this.contextSelector.getTextContent().substring(0, cursorPos);

        // Check @
        const atIndex = textBefore.lastIndexOf("@");
        if (atIndex !== -1) {
            const query = textBefore.substring(atIndex + 1);
            if (!query.includes(" ") && !query.includes("\n")) {
                this.contextSelector.show(atIndex, query);
                return;
            } else {
                this.contextSelector.close();
            }
        } else {
            this.contextSelector.close();
        }

        // Check #
        const hashIndex = textBefore.lastIndexOf("#");
        if (hashIndex !== -1) {
            const query = textBefore.substring(hashIndex + 1);
            if (!query.includes(" ") && !query.includes("\n")) {
                this.promptSelector.open(this.inputEl as HTMLElement, query);
            } else {
                this.promptSelector.close();
            }
        } else {
            this.promptSelector.close();
        }
    }

    public getContextSelector(): InputContextSelector {
        return this.contextSelector;
    }

    public getTextContent(): string {
        return this.contextSelector.getTextContent();
    }

    /**
     * Retrieves the content of selected context files.
     * This mimics the behavior expected by the popup.
     */
    public async getSelectedContext(): Promise<string> {
        const items = this.contextSelector.selectedTags;
        if (!items || items.length === 0) return "";
        let contextContent = "";
        const getAllMarkdownFiles = (folder: TFolder, baseFolderName: string): { file: TFile; sourcePath: string; baseFolderName: string }[] => {
            const files: { file: TFile; sourcePath: string; baseFolderName: string }[] = [];
            if (folder && (folder as any).children) {
                for (const child of (folder as any).children) {
                    if ((child as TFile).extension === "md") {
                        files.push({
                            file: child as TFile,
                            sourcePath: (child as any).path,
                            baseFolderName: baseFolderName
                        });
                    } else if ((child as any).children) {
                        const subFiles = getAllMarkdownFiles(child as TFolder, baseFolderName);
                        files.push(...subFiles);
                    }
                }
            }
            return files;
        };
        for (const item of items) {
            if (item.type === "file") {
                const file = this.app.vault.getAbstractFileByPath(item.path);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    contextContent += `\n\n=== 文档: ${file.basename} ===\n${content}`;
                }
            } else if (item.type === "folder") {
                const folderObj = this.app.vault.getAbstractFileByPath(item.path);
                if (folderObj instanceof TFolder) {
                    const mdFiles = getAllMarkdownFiles(folderObj, folderObj.name);
                    for (const { file, sourcePath, baseFolderName } of mdFiles) {
                        const text = await this.app.vault.read(file);
                        contextContent += `\n\n=== 文档: ${file.basename} (来自文件夹: ${baseFolderName}, 路径: ${sourcePath}) ===\n${text}`;
                    }
                }
            }
        }
        return contextContent.trim();
    }

    public clear() {
        if (this.inputEl instanceof HTMLTextAreaElement) {
            this.inputEl.value = "";
        } else {
            this.inputEl.innerText = "";
        }
        this.contextSelector.clear();
    }
}
