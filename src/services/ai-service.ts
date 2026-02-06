import { App, Notice, requestUrl } from "obsidian";
import { MODEL_CATEGORIES, SYSTEM_PROMPTS } from "../constants";
import { DEFAULT_SETTINGS } from "../defaults";
import type { APIModelConfig, ChatMessage, ImageData, PluginSettings, TextContext } from "../types";

/**
 * AI 服务类
 * 负责与 AI API 进行通信
 */
export class AIService {
    private settings: PluginSettings;
    private app: App;
    private requestQueue: unknown[] = [];
    private isProcessing: boolean = false;

    constructor(settings: PluginSettings, app: App) {
        this.settings = settings;
        this.app = app;
    }

    /**
     * 更新设置
     */
    updateSettings(settings: PluginSettings): void {
        this.settings = settings;
    }

    /**
     * 解析配置（处理 Keychain）
     */
    async resolveConfig(config: APIModelConfig): Promise<APIModelConfig> {
        if (config.apiKey && config.apiKey.startsWith("secret:")) {
            const secretId = config.apiKey.substring(7);

            let secretStorage = (this.app as any).secretStorage;
            if (!secretStorage) {
                if ((this.app as any).keychain) {
                    secretStorage = (this.app as any).keychain;
                } else if ((window as any).secretStorage) {
                    secretStorage = (window as any).secretStorage;
                } else if ((this.app as any).vault?.secretStorage) {
                    secretStorage = (this.app as any).vault.secretStorage;
                }
            }

            if (secretStorage && (typeof secretStorage.get === "function" || typeof secretStorage.getSecret === "function")) {
                try {
                    const key = typeof secretStorage.get === "function"
                        ? await secretStorage.get(secretId)
                        : await secretStorage.getSecret(secretId);
                    if (key) {
                        config.apiKey = key;
                    }
                } catch (e) {
                    console.error(`Failed to load key ${secretId} from secret storage`, e);
                }
            }
        }
        return config;
    }

    /**
     * 获取当前模型配置
     */
    async getCurrentModelConfig(): Promise<APIModelConfig> {
        let config: APIModelConfig;

        // 如果有全局配置，优先使用
        if (this.settings.apiKey && this.settings.baseUrl && this.settings.model) {
            config = {
                apiKey: this.settings.apiKey,
                baseUrl: this.settings.baseUrl,
                model: this.settings.model
            };
        } else {
            const currentModelId = this.settings.currentModel;
            if (!currentModelId) {
                throw new Error("未选择当前模型");
            }

            const modelConfig = this.settings.models[currentModelId];
            if (!modelConfig || !modelConfig.enabled) {
                throw new Error(`模型 ${currentModelId} 未启用或不存在`);
            }

            const providerConfig = this.settings.providers[modelConfig.provider];
            if (!providerConfig || !providerConfig.enabled) {
                throw new Error(`供应商 ${modelConfig.provider} 未启用或不存在`);
            }

            config = {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: modelConfig.actualModel || modelConfig.model || modelConfig.id
            };
        }

        return this.resolveConfig(config);
    }

    /**
     * 检查是否为视觉模型
     */
    isVisionModel(model?: string): boolean {
        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];

        if (!modelConfig) return false;

        let category = modelConfig.category;
        if (!category && modelConfig.type) {
            category = modelConfig.type === "image" ? MODEL_CATEGORIES.IMAGE : MODEL_CATEGORIES.TEXT;
        }

        return category === MODEL_CATEGORIES.VISION;
    }

    /**
     * 检查是否为思考模型
     */
    isThinkingModel(model: string | null = null): boolean {
        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];

        if (!modelConfig) return false;

        let category = modelConfig.category;
        if (!category && modelConfig.type) {
            category = modelConfig.type === "image" ? MODEL_CATEGORIES.IMAGE : MODEL_CATEGORIES.TEXT;
        }

        return category === MODEL_CATEGORIES.THINKING;
    }

    /**
     * 规范化 Base URL
     */
    normalizeBaseUrl(url: string): string {
        if (!url) return "";
        return url.replace(/\/$/, "");
    }

    /**
     * 构建 API URL
     */
    async buildApiUrl(endpoint: string, config?: APIModelConfig): Promise<string> {
        if (!config) {
            config = await this.getCurrentModelConfig();
        }
        const baseUrl = this.normalizeBaseUrl(config.baseUrl);
        const isOpenAI = baseUrl.includes("api.openai.com");

        if (baseUrl.endsWith("/v1")) {
            return `${baseUrl}${endpoint}`;
        } else if (!isOpenAI && (baseUrl.includes("/chat/completions") || baseUrl.includes("/images/generations"))) {
            const cleanBase = baseUrl.split("/chat/completions")[0].split("/images/generations")[0];
            return `${cleanBase}${endpoint}`;
        } else {
            return `${baseUrl}/v1${endpoint}`;
        }
    }

    /**
     * 获取最大 Token 数
     */
    getMaxTokens(mode: string): number {
        return this.settings.maxTokens || DEFAULT_SETTINGS.maxTokens;
    }

    /**
     * 发送请求
     */
    async sendRequest(
        mode: string,
        context: TextContext,
        prompt: string = "",
        images: ImageData[] = [],
        chatHistory: ChatMessage[] = [],
        onStream: ((data: { content: string; thinking: string; fullContent: string; isComplete: boolean }) => void) | null = null,
        signal?: AbortSignal
    ): Promise<{ content: string; thinking?: string; usage: Record<string, unknown>; imageData?: unknown }> {
        const config = await this.getCurrentModelConfig();

        if (!config.apiKey) {
            throw new Error("请先配置API Key");
        }

        const currentModelId = this.settings.currentModel;
        const modelConfig = this.settings.models[currentModelId];
        let category = modelConfig?.category;

        if (!category && modelConfig) {
            if (modelConfig.type === "image") {
                category = MODEL_CATEGORIES.IMAGE;
            } else {
                category = MODEL_CATEGORIES.TEXT;
            }
            modelConfig.category = category;
        }

        // 图片生成模型
        if (category === MODEL_CATEGORIES.IMAGE) {
            if (mode === "continue" && context.selectedText && context.selectedText.trim()) {
                throw new Error("不支持图片生成模型，请选择文本生成模型进行文本修改。");
            }
            return this.handleImageGeneration(prompt, config, context.cursorPosition);
        }

        // 思考模型
        const isThinking = category === MODEL_CATEGORIES.THINKING || this.isThinkingModel(config.model);
        const isStreaming = onStream && typeof onStream === "function";
        const isMultimodal = category === MODEL_CATEGORIES.MULTIMODAL;
        const isVision = category === MODEL_CATEGORIES.VISION || this.isVisionModel(config.model);

        // 检查图片支持
        if (images && images.length > 0 && !(isMultimodal || isVision)) {
            new Notice(`当前模型 ${config.model} 不支持图片和附件，请切换到多模态模型或视觉模型`);
            images = [];
        }

        // 构建系统提示词
        let systemPrompt = SYSTEM_PROMPTS[mode] || "";

        // 添加全局规则
        if (this.settings.enableGlobalRules && this.settings.globalRules && this.settings.globalRules.length > 0) {
            const enabledRules = this.settings.globalRules
                .filter((rule: any) => rule.enabled !== false)
                .sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

            if (enabledRules.length > 0) {
                const rulesText = enabledRules.map((rule: any) => rule.content).join("\n");
                systemPrompt += "\n\n全局规则（请严格遵循以下规则）：\n" + rulesText;
            }
        }

        // 构建用户提示词
        const hasSelection = Boolean(context.selectedText && context.selectedText.trim());
        const hasPrompt = Boolean(prompt && prompt.trim());
        const beforeText = context.beforeText || "";
        const afterText = context.afterText || "";
        const selectedText = context.selectedText || "";

        let userPrompt = "";
        switch (mode) {
            case "edit":
                if (hasSelection) {
                    userPrompt = `待修改内容：${selectedText}\n\n上下文（前）：${beforeText}\n\n上下文（后）：${afterText}`;
                    if (hasPrompt) {
                        userPrompt += `\n\n修改要求：${prompt}`;
                    }
                } else {
                    userPrompt = hasPrompt
                        ? `用户指令：${prompt}\n\n上下文（前）：${beforeText}\n\n上下文（后）：${afterText}`
                        : `上下文（前）：${beforeText}\n\n上下文（后）：${afterText}\n\n请基于上下文完成修改或回答。`;
                }
                break;
            case "chat":
            default:
                // 统一 Chat 模式：处理问答、续写、解释等所有非修该类需求
                userPrompt = hasPrompt
                    ? `用户问题或指令：${prompt}`
                    : "请根据下述信息进行回答。";

                // 只有在确实有上下文时才添加
                if (hasSelection || beforeText.trim() || afterText.trim()) {
                    userPrompt += `\n\n可参考的上下文：`;
                    if (beforeText.trim()) userPrompt += `\n- 光标前：${beforeText}`;
                    if (hasSelection) userPrompt += `\n- 选中文本：${selectedText}`;
                    if (afterText.trim()) userPrompt += `\n- 光标后：${afterText}`;
                }
                break;
        }

        // 添加额外上下文
        if (context.additionalContext && context.additionalContext.trim()) {
            userPrompt += `\n\n【重要提示：以下是参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.additionalContext}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
        }

        if (context.contextContent && context.contextContent.trim()) {
            userPrompt += `\n\n【重要提示：以下是参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.contextContent}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
        }

        // 构建API请求URL
        const apiUrl = await this.buildApiUrl("/chat/completions", config);

        // 构建消息数组
        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt }
        ];

        // 添加聊天历史
        if (chatHistory && chatHistory.length > 0) {
            chatHistory.forEach(msg => {
                if (msg.role === "user" || msg.role === "assistant") {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            });
        }

        // 添加图片
        if (images && images.length > 0) {
            userPrompt += `\n\n附加图片：共${images.length}张图片`;

            const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
                { type: "text", text: userPrompt }
            ];

            images.forEach((img) => {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: img.base64 || img.url
                    }
                });
            });

            messages.push({
                role: "user",
                content: content
            });
        } else {
            messages.push({
                role: "user",
                content: userPrompt
            });
        }

        // 构建请求体
        const requestBody: Record<string, unknown> = {
            model: config.model,
            messages: messages,
            temperature: 0.7,
            max_tokens: this.getMaxTokens(mode)
        };

        if (isStreaming) {
            requestBody.stream = true;
        }

        try {
            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.apiKey}`
            };

            if (isStreaming) {
                return await this.handleStreamRequest(apiUrl, headers, requestBody, onStream, signal);
            }

            const response = await requestUrl({
                url: apiUrl,
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody),
                throw: false
            });

            if (response.status !== 200) {
                const errorText = response.text;

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                throw new Error(`API请求失败: ${response.status} ${errorText}`);
            }

            const data = response.json;

            if (!data.choices || data.choices.length === 0) {
                throw new Error("API返回数据格式错误：缺少choices数组");
            }

            const choice = data.choices[0];
            if (!choice.message) {
                throw new Error("API返回数据格式错误：缺少message对象");
            }

            let content = "";
            if (choice.message.content) {
                content = choice.message.content.trim();
            } else if (choice.text) {
                content = choice.text.trim();
            } else if (choice.message.text) {
                content = choice.message.text.trim();
            } else {
                throw new Error("API返回数据格式错误：找不到内容字段");
            }

            const usage = data.usage || {};

            return {
                content: content,
                usage: usage
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * 发送流式补全请求 (Tab Completion)
     */
    async streamCompletion(
        messages: ChatMessage[],
        modelId: string | undefined,
        options: {
            temperature?: number;
            max_tokens?: number;
            top_p?: number;
            signal?: AbortSignal;
        } = {},
        onUpdate: (content: string) => void
    ): Promise<void> {
        let config: APIModelConfig;

        if (modelId) {
            const modelConfig = this.settings.models[modelId];
            if (!modelConfig || !modelConfig.enabled) {
                // 如果找不到指定模型，尝试使用当前模型作为回退，或者抛出错误
                // 这里为了稳健性，如果找不到则尝试使用默认逻辑，或者直接报错
                // 考虑到Tab补全通常需要快速响应，配置错误应该直接报错
                throw new Error(`Tab补全模型 ${modelId} 未启用或不存在`);
            }

            const providerConfig = this.settings.providers[modelConfig.provider];
            if (!providerConfig || !providerConfig.enabled) {
                throw new Error(`供应商 ${modelConfig.provider} 未启用或不存在`);
            }

            config = {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: modelConfig.actualModel || modelConfig.model || modelConfig.id
            };
            config = await this.resolveConfig(config);
        } else {
            config = await this.getCurrentModelConfig();
        }

        // 构建API请求URL (假设都是 chat/completions 兼容接口)
        // 注意：这里简单处理，如果后续需要支持非OpenAI格式的补全接口，需要扩展
        // 使用 buildApiUrl 逻辑可能更稳健
        const apiUrl = await this.buildApiUrl("/chat/completions", config);

        const requestBody: Record<string, unknown> = {
            model: config.model,
            messages: messages,
            stream: true,
            max_tokens: options.max_tokens || 50,
            temperature: options.temperature ?? 0.2
        };
        if (typeof options.top_p === 'number') {
            (requestBody as any).top_p = options.top_p;
        }

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        };

        await this.handleStreamRequest(
            apiUrl,
            headers,
            requestBody,
            (() => {
                let prevLen = 0;
                return (data) => {
                    const current = data.content || "";
                    const delta = current.slice(prevLen);
                    prevLen = current.length;
                    if (delta.length > 0) {
                        onUpdate(delta);
                    }
                };
            })(),
            options.signal
        );
    }

    async generateCompletion(
        messages: ChatMessage[],
        modelId: string | undefined,
        options: {
            temperature?: number;
            max_tokens?: number;
            top_p?: number;
            signal?: AbortSignal;
        } = {}
    ): Promise<string> {
        let config: APIModelConfig;
        if (modelId) {
            const modelConfig = this.settings.models[modelId];
            if (!modelConfig || !modelConfig.enabled) {
                throw new Error(`Tab补全模型 ${modelId} 未启用或不存在`);
            }
            const providerConfig = this.settings.providers[modelConfig.provider];
            if (!providerConfig || !providerConfig.enabled) {
                throw new Error(`供应商 ${modelConfig.provider} 未启用或不存在`);
            }
            config = {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: modelConfig.actualModel || modelConfig.model || modelConfig.id
            };
            config = await this.resolveConfig(config);
        } else {
            config = await this.getCurrentModelConfig();
        }
        const baseUrl = this.normalizeBaseUrl(config.baseUrl);
        const apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        const requestBody: Record<string, unknown> = {
            model: config.model,
            messages: messages,
            stream: false,
            max_tokens: options.max_tokens || 50,
            temperature: options.temperature ?? 0.2
        };
        if (typeof options.top_p === 'number') {
            (requestBody as any).top_p = options.top_p;
        }
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        };
        const response = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: options.signal
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        const suggestion =
            data?.choices?.[0]?.message?.content ??
            data?.choices?.[0]?.text ??
            data?.choices?.[0]?.message?.text ??
            "";
        return String(suggestion || "");
    }

    /**
     * 处理流式请求
     */
    async handleStreamRequest(
        apiUrl: string,
        headers: Record<string, string>,
        requestBody: Record<string, unknown>,
        onStream: (data: { content: string; thinking: string; fullContent: string; isComplete: boolean }) => void,
        signal?: AbortSignal
    ): Promise<{ content: string; thinking: string; usage: Record<string, unknown> }> {
        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: signal
            });

            if (!response.ok) {
                const errorText = await response.text();

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                throw new Error(`API请求失败: ${response.status} ${errorText}`);
            }

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();

            let buffer = "";
            let thinking = "";
            let streamedContent = "";
            let fullContent = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6);

                            if (data === "[DONE]") {
                                break;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta;

                                if (delta?.reasoning_content) {
                                    const reasoningChunk = delta.reasoning_content;
                                    thinking += reasoningChunk;
                                    fullContent += reasoningChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }

                                if (delta?.content) {
                                    const contentChunk = delta.content;
                                    streamedContent += contentChunk;
                                    fullContent += contentChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }

                                if (delta?.text) {
                                    const textChunk = delta.text;
                                    streamedContent += textChunk;
                                    fullContent += textChunk;
                                    onStream({
                                        content: streamedContent,
                                        thinking: thinking,
                                        fullContent: fullContent,
                                        isComplete: false
                                    });
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }

                onStream({
                    content: streamedContent,
                    thinking: thinking,
                    fullContent: fullContent,
                    isComplete: true
                });

                return {
                    content: streamedContent.trim(),
                    thinking: thinking.trim(),
                    usage: {}
                };
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * 处理图片生成
     */
    async handleImageGeneration(
        prompt: string,
        config: APIModelConfig,
        cursorPosition: { line: number; ch: number } | null = null
    ): Promise<{ content: string; imageData: unknown; usage: Record<string, unknown> }> {
        if (!prompt || !prompt.trim()) {
            throw new Error("请输入图片描述");
        }

        const apiUrl = await this.buildApiUrl("/images/generations", config);
        const model = config.model;

        const requestBody: Record<string, unknown> = {
            model: model,
            prompt: prompt.trim(),
            response_format: "b64_json",
            n: 1,
            size: (this.settings as any).imageGenerationSize || "1024x1024"
        };

        if (model.includes("dall-e") && model === "dall-e-3") {
            requestBody.quality = "standard";
            requestBody.style = "vivid";
        }

        try {
            const response = await requestUrl({
                url: apiUrl,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
                },
                body: JSON.stringify(requestBody),
                throw: false
            });

            if (response.status !== 200) {
                const errorText = response.text;

                if (response.status === 429) {
                    if (errorText.includes("quota") || errorText.includes("insufficient_quota")) {
                        throw new Error("API配额已用完，请检查您的账户余额和计费详情。");
                    } else {
                        throw new Error("API请求频率过高，请稍后再试。");
                    }
                }

                if (response.status === 401) {
                    throw new Error("API密钥无效，请检查配置。");
                }

                throw new Error(`图片生成API请求失败: ${response.status} ${errorText}`);
            }

            const data = response.json;

            if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
                throw new Error("图片生成API返回数据格式错误");
            }

            const imageData = data.data[0];
            let base64Data: string | null = null;

            if (imageData.b64_json) {
                base64Data = imageData.b64_json;
            } else {
                throw new Error("图片生成API返回数据中缺少图片内容");
            }

            try {
                const fileName = `image_${Date.now()}.png`;
                const savePath = (this.settings as any).imageSavePath || "Extras/附件";
                const fullPath = savePath + "/" + fileName;

                try {
                    const folder = this.app.vault.getAbstractFileByPath(savePath);
                    if (!folder) {
                        await this.app.vault.createFolder(savePath);
                    }
                } catch (e) {
                    try {
                        await (this.app.vault.adapter as any).mkdir(savePath);
                    } catch (err: any) {
                        throw new Error(`无法创建目录 ${savePath}: ${err.message}`);
                    }
                }

                const binaryString = atob(base64Data || "");
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                await this.app.vault.createBinary(fullPath, bytes.buffer);

                const imageSize = (this.settings as any).imageSize || 300;

                let insertAtNewLine = true;
                if (cursorPosition && cursorPosition.ch > 0) {
                    insertAtNewLine = false;
                }

                let markdown: string;
                if (insertAtNewLine) {
                    markdown = `![Generated Image|${imageSize}](${fullPath})`;
                } else {
                    markdown = `<span class="image-mask-rounded-R" style="width: 200px; height: 200px;"><img src="${fullPath}" alt="" style="width: 100%; height: 100%; object-fit: cover;"></span>`;
                }

                return {
                    content: markdown,
                    imageData: {
                        filePath: fullPath,
                        format: "png",
                        prompt: prompt
                    },
                    usage: data.usage || {}
                };
            } catch (error: any) {
                throw new Error("图片保存失败: " + error.message);
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * 获取可用的图片模型
     */
    getAvailableImageModels(): string[] {
        const imageModels: string[] = [];
        for (const [key, model] of Object.entries(this.settings.models)) {
            if ((model as any).type === "image" && model.enabled) {
                imageModels.push(model.name || key);
            }
        }
        return imageModels;
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<{ success: boolean; message?: string }> {
        try {
            const config = await this.getCurrentModelConfig();
            const url = await this.buildApiUrl("/chat/completions", config);

            const response = await requestUrl({
                url: url,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 5
                })
            });

            if (response.status === 200) {
                return { success: true };
            } else {
                return { success: false, message: `HTTP ${response.status}: ${response.text}` };
            }
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }
}
