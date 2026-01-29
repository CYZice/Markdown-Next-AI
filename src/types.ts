import { MODEL_CATEGORIES } from "./constants";

/**
 * 模型类别类型
 */
export type ModelCategory = typeof MODEL_CATEGORIES[keyof typeof MODEL_CATEGORIES];

/**
 * 供应商配置接口
 */
export interface ProviderConfig {
    apiKey: string;
    baseUrl: string;
    enabled: boolean;
    name?: string;
    type?: string;
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
    id: string;
    name: string;
    provider: string;
    model: string;
    enabled: boolean;
    category: ModelCategory;
    actualModel?: string;
    type?: string;
}

/**
 * 常用提示词接口
 */
export interface CommonPrompt {
    id: string;
    name: string;
    content: string;
}

/**
 * 全局规则接口
 */
export interface GlobalRule {
    id: string;
    name: string;
    content: string;
    description?: string;
    category?: string;
    priority?: number;
    enabled: boolean;
    createdAt?: number;
    updatedAt?: number;
}

/**
 * 插件设置接口
 */
export interface PluginSettings {
    providers: Record<string, ProviderConfig>;
    models: Record<string, ModelConfig>;
    currentModel: string;
    timeout: number;
    enableRightClick: boolean;
    enableAtTrigger: boolean;
    maxTokens: number;
    maxContextLines: number;
    maxContextChars: number;
    globalRules: GlobalRule[];
    ruleTemplates?: GlobalRule[];
    enableGlobalRules: boolean;
    commonPrompts: CommonPrompt[];
    imageGenerationSize?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    apiKeyLinks?: Record<string, string>;

    conversationHistory?: ConversationEntry[];
    conversationHistoryLimit?: number;
    enableGlobalDialog?: boolean;
    useFloatingPreview?: boolean;
    lastInsertAction?: string;
    // LLM 路由设置
    enableAutoRoutingByLLM?: boolean;
    minConfidenceForAuto?: number;
    fallbackMode?: "edit" | "chat" | "insert";
}

export interface ConversationEntry {
    id: string;
    prompt: string;
    response: string;
    modelId: string;
    timestamp: number;
    contextSnippet?: string;
    selectedText?: string;
}

/**
 * 图片数据接口
 */
export interface ImageData {
    id: string | number;
    name: string;
    url: string;
    base64: string;
    type: string;
    size: number;
    fromInline?: boolean;
}

/**
 * 上下文项接口
 */
export interface ContextItem {
    name: string;
    path: string;
    type: "file" | "folder" | "image";
    icon: string;
    extension?: string;
}

/**
 * 文本上下文接口
 */
export interface TextContext {
    selectedText: string;
    beforeText: string;
    afterText: string;
    cursorPosition: { line: number; ch: number };
    filePath?: string;
    lineNumber?: number;
    additionalContext?: string;
    contextContent?: string;
}

/**
 * 光标位置接口
 */
export interface CursorPosition {
    left: number;
    top: number;
    height?: number;
}

/**
 * 选中的上下文接口
 */
export interface SelectedContext {
    files: Array<{ name: string; path: string; extension?: string }>;
    folders: Array<{ name: string; path: string }>;
}

/**
 * 事件监听器接口
 */
export interface EventListenerInfo {
    element: HTMLElement | Document;
    event: string;
    handler: EventListener;
}

/**
 * API模型配置接口
 */
export interface APIModelConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * 可用模型信息接口
 */
export interface AvailableModel {
    id: string;
    name: string;
    provider: string;
}
