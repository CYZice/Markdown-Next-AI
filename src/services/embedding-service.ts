/**
 * Embedding Service
 * 统一的嵌入服务接口
 * 管理多种嵌入适配器的使用
 */

import type { PluginSettings } from '../types';
import { EmbeddingAdapterFactory, type IEmbeddingAdapter } from './embedding-adapter';

/**
 * 嵌入服务
 * 提供统一的嵌入接口，自动选择合适的适配器
 */
export class EmbeddingService {
    private static instance: EmbeddingService | null = null;
    private currentAdapter: IEmbeddingAdapter | null = null;
    private currentAdapterType: string | null = null;

    private constructor() { }

    /**
     * 获取单例实例
     */
    static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    /**
     * 获取合适的适配器
     */
    private async getAdapter(settings: PluginSettings): Promise<IEmbeddingAdapter | null> {
        // 确定适配器类型
        const adapterType = settings.embedModel?.adapter || 'transformers';

        // 如果已有适配器且类型相同，直接返回
        if (
            this.currentAdapter &&
            this.currentAdapterType === adapterType
        ) {
            return this.currentAdapter;
        }

        // 否则获取新适配器
        console.log(`[EmbeddingService] Switching to adapter: ${adapterType}`);
        this.currentAdapter = await EmbeddingAdapterFactory.getAdapter(
            adapterType,
            settings
        );
        this.currentAdapterType = adapterType;

        if (!this.currentAdapter) {
            console.error(`[EmbeddingService] Failed to get adapter: ${adapterType}`);
        }

        return this.currentAdapter;
    }

    /**
     * 获取单个嵌入向量
     */
    async getEmbedding(
        text: string,
        settings: PluginSettings
    ): Promise<number[] | null> {
        try {
            const adapter = await this.getAdapter(settings);
            if (!adapter) {
                console.error('[EmbeddingService] No adapter available');
                return null;
            }

            return await adapter.getEmbedding(text, settings);
        } catch (error) {
            console.error('[EmbeddingService] Error getting embedding:', error);
            return null;
        }
    }

    /**
     * 批量获取嵌入向量
     */
    async getEmbeddings(
        texts: string[],
        settings: PluginSettings
    ): Promise<number[][] | null> {
        try {
            const adapter = await this.getAdapter(settings);
            if (!adapter) {
                console.error('[EmbeddingService] No adapter available');
                return null;
            }

            return await adapter.getEmbeddings(texts, settings);
        } catch (error) {
            console.error('[EmbeddingService] Error getting embeddings:', error);
            return null;
        }
    }

    /**
     * 获取当前适配器信息
     */
    getAdapterInfo() {
        if (!this.currentAdapter) {
            return null;
        }

        return {
            type: this.currentAdapterType,
            info: this.currentAdapter.getModelInfo?.() || {}
        };
    }

    /**
     * 卸载当前适配器
     */
    async unload(): Promise<void> {
        if (this.currentAdapter && this.currentAdapterType) {
            await EmbeddingAdapterFactory.unloadAdapter(this.currentAdapterType);
            this.currentAdapter = null;
            this.currentAdapterType = null;
        }
    }

    /**
     * 清理所有适配器
     */
    static async cleanup(): Promise<void> {
        await EmbeddingAdapterFactory.unloadAll();
        if (EmbeddingService.instance) {
            EmbeddingService.instance = null;
        }
    }
}

/**
 * 便捷函数：获取嵌入向量
 */
export async function getEmbedding(
    text: string,
    settings: PluginSettings
): Promise<number[] | null> {
    const service = EmbeddingService.getInstance();
    return await service.getEmbedding(text, settings);
}

/**
 * 便捷函数：批量获取嵌入向量
 */
export async function getEmbeddings(
    texts: string[],
    settings: PluginSettings
): Promise<number[][] | null> {
    const service = EmbeddingService.getInstance();
    return await service.getEmbeddings(texts, settings);
}
