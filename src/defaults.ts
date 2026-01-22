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
        }
    },
    currentModel: "gemini-3-flash-preview",
    timeout: 30000,
    enableRightClick: true,
    enableAtTrigger: true,
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
    // 知识库检索设置（依赖 Smart Connections 插件）
    enableKnowledgeSearch: false,
    knowledgeTopK: 5,
    knowledgeMinScore: 0.2,
    conversationHistory: [],
    conversationHistoryLimit: 50,
    enableGlobalDialog: false,
    useFloatingPreview: false,
    lastInsertAction: "insert",
    // LLM 路由默认配置
    enableAutoRoutingByLLM: true,
    minConfidenceForAuto: 0.6,
    fallbackMode: "chat"
};
