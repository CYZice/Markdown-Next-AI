import { TFile } from "obsidian";

/**
 * Interface for providing additional context to the AI model.
 */
export interface AIContextProvider {
    /** Unique identifier for the provider */
    id: string;
    /** Display name for the provider */
    name: string;
    /**
     * Get additional context for the AI model based on the current file.
     * @param file The current active file
     * @returns A promise that resolves to the context string, or undefined if no context to add.
     */
    getContext(file: TFile): Promise<string | undefined>;
}

/**
 * Public API for Markdown-Next-AI plugin.
 */
export interface MarkdownNextAIAPI {
    /**
     * Register a context provider.
     * @param provider The provider to register
     */
    registerContextProvider(provider: AIContextProvider): void;

    /**
     * Unregister a context provider.
     * @param id The ID of the provider to unregister
     */
    unregisterContextProvider(id: string): void;
}