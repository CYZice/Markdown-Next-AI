/**
 * Embedding Adapter Interface
 * 定义嵌入适配器的标准接口
 * 模仿 Smart Connections 的 smart-embed-model 架构
 */

import type { PluginSettings } from '../types';

/**
 * 嵌入适配器的基础接口
 */
export interface IEmbeddingAdapter {
    /**
     * 适配器名称
     */
    readonly name: string;

    /**
     * 获取单个文本的嵌入向量
     */
    getEmbedding(text: string, settings: PluginSettings): Promise<number[] | null>;

    /**
     * 批量获取嵌入向量
     */
    getEmbeddings(texts: string[], settings: PluginSettings): Promise<number[][] | null>;

    /**
     * 卸载模型（可选）
     */
    unload?(): Promise<void>;

    /**
     * 获取模型信息
     */
    getModelInfo?(): any;
}

/**
 * 嵌入适配器工厂类
 * 管理多种嵌入后端的创建和缓存
 */
export class EmbeddingAdapterFactory {
    private static adapters: Map<string, IEmbeddingAdapter> = new Map();

    /**
     * 创建或获取适配器实例
     * 使用单例模式缓存适配器
     */
    static async getAdapter(
        adapterType: string,
        settings: PluginSettings
    ): Promise<IEmbeddingAdapter | null> {
        const cacheKey = adapterType;

        // 检查缓存
        if (this.adapters.has(cacheKey)) {
            return this.adapters.get(cacheKey) || null;
        }

        // 创建新适配器
        let adapter: IEmbeddingAdapter | null = null;

        switch (adapterType) {
            case 'transformers':
                try {
                    // 动态导入 - 避免 TypeScript 错误
                    const adaptersModule = await import('./adapters');
                    const TransformersEmbeddingAdapter = (adaptersModule as any).TransformersEmbeddingAdapter;
                    adapter = TransformersEmbeddingAdapter.getInstance();
                } catch (error) {
                    console.error('[EmbeddingFactory] Failed to load transformers adapter:', error);
                    return null;
                }
                break;

            case 'openai':
                try {
                    const adaptersModule = await import('./adapters');
                    const OpenAIEmbeddingAdapter = (adaptersModule as any).OpenAIEmbeddingAdapter;
                    adapter = new OpenAIEmbeddingAdapter();
                } catch (error) {
                    console.error('[EmbeddingFactory] Failed to load OpenAI adapter:', error);
                    return null;
                }
                break;

            case 'ollama':
                try {
                    const adaptersModule = await import('./adapters');
                    const OllamaEmbeddingAdapter = (adaptersModule as any).OllamaEmbeddingAdapter;
                    adapter = new OllamaEmbeddingAdapter();
                } catch (error) {
                    console.error('[EmbeddingFactory] Failed to load Ollama adapter:', error);
                    return null;
                }
                break;

            case 'gemini':
                try {
                    const adaptersModule = await import('./adapters');
                    const GeminiEmbeddingAdapter = (adaptersModule as any).GeminiEmbeddingAdapter;
                    adapter = new GeminiEmbeddingAdapter();
                } catch (error) {
                    console.error('[EmbeddingFactory] Failed to load Gemini adapter:', error);
                    return null;
                }
                break;

            default:
                console.warn(`[EmbeddingFactory] Unknown adapter type: ${adapterType}`);
                return null;
        }

        if (adapter) {
            this.adapters.set(cacheKey, adapter);
        }

        return adapter;
    }

    /**
     * 卸载适配器
     */
    static async unloadAdapter(adapterType: string): Promise<void> {
        const adapter = this.adapters.get(adapterType);
        if (adapter && adapter.unload) {
            await adapter.unload();
            this.adapters.delete(adapterType);
        }
    }

    /**
     * 卸载所有适配器
     */
    static async unloadAll(): Promise<void> {
        for (const [key, adapter] of this.adapters) {
            if (adapter.unload) {
                try {
                    await adapter.unload();
                } catch (error) {
                    console.error(`[EmbeddingFactory] Error unloading adapter ${key}:`, error);
                }
            }
        }
        this.adapters.clear();
    }
}
