import { Notice } from "obsidian";

/**
 * Centralized error handler for the plugin.
 * Handles logging to console and displaying notifications to the user.
 */
export class ErrorHandler {
    /**
     * Logs the error to console and displays a notification to the user.
     * Use this for errors that the user needs to be aware of.
     * 
     * @param error The error object or message
     * @param context Context description (e.g. "AI Generation Failed")
     */
    static notify(error: unknown, context: string) {
        const message = error instanceof Error ? error.message : String(error);
        const fullMessage = `${context}: ${message}`;
        
        // Log to console with full error object for debugging
        console.error(`[Markdown-Next-AI] ${fullMessage}`, error);
        
        // Show notification to user
        new Notice(fullMessage);
    }

    /**
     * Logs the error to console only.
     * Use this for internal errors that don't require user attention.
     * 
     * @param error The error object or message
     * @param context Context description
     */
    static log(error: unknown, context: string) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Markdown-Next-AI] ${context}: ${message}`, error);
    }
}
