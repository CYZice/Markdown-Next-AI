import { MODEL_CATEGORIES } from "./constants";
import type { PluginSettings } from "./types";

/**
 * 默认插件设置
 */
export const DEFAULT_SETTINGS: PluginSettings = {
    providers: {
        openai: {
            apiKey: "",
            baseUrl: "https://api.openai.com/v1",
            enabled: true
        },
        deepseek: {
            apiKey: "",
            baseUrl: "https://api.deepseek.com/v1",
            enabled: true
        }
    },
    models: {
        "gemini-3-pro-preview": {
            id: "gemini-3-pro-preview",
            name: "Gemini 3 Pro Preview",
            provider: "openai",
            model: "gemini-3-pro-preview",
            enabled: true,
            category: MODEL_CATEGORIES.MULTIMODAL
        },
        "gemini-3-flash-preview": {
            id: "gemini-3-flash-preview",
            name: "Gemini 3 Flash Preview",
            provider: "openai",
            model: "gemini-3-flash-preview",
            enabled: true,
            category: MODEL_CATEGORIES.MULTIMODAL
        },
        "gpt-5": {
            id: "gpt-5",
            name: "GPT-5",
            provider: "openai",
            model: "gpt-5",
            enabled: true,
            category: MODEL_CATEGORIES.MULTIMODAL
        },
        "deepseek-chat": {
            id: "deepseek-chat",
            name: "DeepSeek Chat",
            provider: "deepseek",
            model: "deepseek-chat",
            enabled: true,
            category: MODEL_CATEGORIES.TEXT
        }
    },
    currentModel: "gemini-3-flash-preview",
    timeout: 30000,
    enableRightClick: true,
    enableAtTrigger: true,
    dialogTextTriggers: [
        { id: 'dialog-at', type: 'string', pattern: '@', enabled: true },
        { id: 'dialog-amp', type: 'string', pattern: '&', enabled: true }
    ],
    dialogOpenKey: "Alt-Q",
    maxTokens: 5000,
    maxContextLines: 20,
    maxContextChars: 3000,
    globalRules: [],
    ruleTemplates: [],
    enableGlobalRules: true,
    commonPrompts: [
        { id: "expand", name: "扩展内容", content: "请扩展这段内容，增加更多细节和例子" },
        { id: "summarize", name: "总结概括", content: "请总结这段内容的要点" },
        { id: "improve", name: "改进文本", content: "请改进这段文本的表达和逻辑" },
        { id: "translate", name: "翻译", content: "请将这段内容翻译成英文" },
        { id: "continue", name: "继续写作", content: "请根据上下文继续写作，保持风格一致" }
    ],
    // conversationHistory removed
    lastInsertAction: "insert",
    // 已移除：LLM 路由默认配置
    baseModelSpecialPrompt: "",
    tabCompletion: {
        enabled: false,
        modelId: "deepseek-chat",
        systemPrompt:
            'Your job is to predict the most logical text that should be written at the location of the <mask/>. Your answer can be either code, a single word, or multiple sentences. Your answer must be in the same language as the text that is already there.' +
            '\n\nAdditional constraints:\n{{tab_completion_constraints}}' +
            '\n\nOutput only the text that should appear at the <mask/>. Do not include explanations, labels, or formatting.',
        maxSuggestionLength: 2000,
        contextRange: 4000,
        minContextLength: 20,
        idleTriggerEnabled: false,
        autoTriggerDelayMs: 3000,
        triggerDelayMs: 3000,
        autoTriggerCooldownMs: 15000,
        requestTimeoutMs: 12000,
        maxRetries: 1,
        lengthPreset: "medium",
        constraints: "",
        temperature: 0.5,
        topP: 1,
        acceptKey: "Tab",
        rejectKey: "Shift-Tab",
        cancelKey: "Escape",
        triggerKey: "Alt-/",
        triggers: [
            { id: 'sentence-end-comma', type: 'string', pattern: ', ', enabled: true },
            { id: 'sentence-end-chinese-comma', type: 'string', pattern: '，', enabled: true },
            { id: 'sentence-end-colon', type: 'string', pattern: ': ', enabled: true },
            { id: 'sentence-end-chinese-colon', type: 'string', pattern: '：', enabled: true },
            { id: 'newline', type: 'regex', pattern: '\\n$', enabled: true },
            { id: 'list-item', type: 'regex', pattern: '(?:^|\\n)[-*+]\\s$', enabled: true }
        ]
    },
    useKeychain: true
};
