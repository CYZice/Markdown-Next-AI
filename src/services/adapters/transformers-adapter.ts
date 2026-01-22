/**
 * Transformers.js Embedding Adapter
 * 主要的本地嵌入模型适配器
 * 模仿 Smart Connections 的 transformers 实现
 * 
 * 关键特性：
 * 1. 运行时动态加载（不打包进插件）
 * 2. IndexedDB 模型缓存机制
 * 3. 自动选择最佳 CDN 源
 */

import type { PluginSettings } from '../../types';
import type { IEmbeddingAdapter } from '../embedding-adapter';
import { ExternalModuleLoader } from '../external-loader';
import { ModelCacheManager } from '../model-cache';

/**
 * Transformers.js 适配器
 * 运行时动态加载 @xenova/transformers
 */
export class TransformersEmbeddingAdapter implements IEmbeddingAdapter {
    readonly name = 'transformers';

    private static instance: TransformersEmbeddingAdapter | null = null;
    private embedder: any = null;
    private currentModelKey: string | null = null;
    private isLoading: boolean = false;
    private loadingPromise: Promise<void> | null = null;
    private transformersLib: any = null;
    private cacheManager: ModelCacheManager;

    private constructor() {
        this.cacheManager = ModelCacheManager.getInstance();
    }

    /**
     * 获取单例实例
     */
    static getInstance(): TransformersEmbeddingAdapter {
        if (!TransformersEmbeddingAdapter.instance) {
            TransformersEmbeddingAdapter.instance = new TransformersEmbeddingAdapter();
        }
        return TransformersEmbeddingAdapter.instance;
    }

    /**
     * 动态加载 Transformers.js 库
     * 从 CDN 加载，不打包进插件
     */
    private async loadTransformersLib(): Promise<any> {
        if (this.transformersLib) {
            return this.transformersLib;
        }

        try {
            console.log('[TransformersAdapter] Loading transformers.js from CDN...');

            // 使用外部加载器从 CDN 加载，避免打包
            this.transformersLib = await ExternalModuleLoader.loadTransformers();

            // 配置环境
            const { env } = this.transformersLib;
            if (env) {
                env.allowLocalModels = false;
                env.allowRemoteModels = true;
                // 配置缓存位置为 IndexedDB
                env.cacheDir = 'transformers-cache';
                console.log('[TransformersAdapter] Environment configured with IndexedDB caching');
            }

            return this.transformersLib;
        } catch (error) {
            console.error('[TransformersAdapter] Failed to load transformers library:', error);
            throw new Error(
                'Failed to load Transformers.js from CDN. Please check your internet connection.'
            );
        }
    }

    /**
     * 加载嵌入模型
     * 支持 IndexedDB 缓存
     */
    private async loadModel(modelKey: string): Promise<void> {
        // 如果已加载相同模型，直接返回
        if (this.embedder && this.currentModelKey === modelKey) {
            return;
        }

        // 如果正在加载同一个模型，等待
        if (this.isLoading && this.currentModelKey === modelKey && this.loadingPromise) {
            await this.loadingPromise;
            return;
        }

        // 开始新的加载
        this.isLoading = true;
        this.currentModelKey = modelKey;

        this.loadingPromise = (async () => {
            try {
                console.log(`[TransformersAdapter] Loading model: ${modelKey}...`);

                // 确保库已加载
                const lib = await this.loadTransformersLib();
                const { pipeline } = lib;

                // 加载模型（transformers.js 会自动使用 IndexedDB 缓存）
                this.embedder = await pipeline('feature-extraction', modelKey, {
                    quantized: true,        // 使用量化模型节省内存和带宽
                    device: 'gpu'          // 如果支持 GPU，使用 GPU
                });

                console.log(
                    `[TransformersAdapter] Model loaded successfully: ${modelKey}`
                );
            } catch (error) {
                console.error(
                    `[TransformersAdapter] Failed to load model ${modelKey}:`,
                    error
                );
                this.embedder = null;
                this.currentModelKey = null;
                throw error;
            } finally {
                this.isLoading = false;
                this.loadingPromise = null;
            }
        })();

        await this.loadingPromise;
    }

    /**
     * 获取单个嵌入
     */
    async getEmbedding(
        text: string,
        settings: PluginSettings
    ): Promise<number[] | null> {
        try {
            const modelKey =
                settings.embedModel?.modelKey || 'TaylorAI/bge-micro-v2';

            // 确保模型已加载
            await this.loadModel(modelKey);

            if (!this.embedder) {
                console.error('[TransformersAdapter] Embedder not initialized');
                return null;
            }

            // 生成嵌入
            const output = await this.embedder(text, {
                pooling: 'mean',      // 平均池化
                normalize: true       // 归一化到单位向量
            });

            // 转换为数组
            const embedding = Array.from(output.data as Float32Array | number[]) as number[];

            if (embedding.length === 0) {
                console.warn('[TransformersAdapter] Empty embedding generated');
                return null;
            }

            console.log(
                `[TransformersAdapter] Generated embedding, dimension: ${embedding.length}`
            );

            return embedding;
        } catch (error) {
            console.error('[TransformersAdapter] Failed to generate embedding:', error);
            return null;
        }
    }

    /**
     * 批量获取嵌入
     */
    async getEmbeddings(
        texts: string[],
        settings: PluginSettings
    ): Promise<number[][] | null> {
        try {
            const modelKey =
                settings.embedModel?.modelKey || 'TaylorAI/bge-micro-v2';

            // 确保模型已加载
            await this.loadModel(modelKey);

            if (!this.embedder) {
                console.error('[TransformersAdapter] Embedder not initialized');
                return null;
            }

            console.log(
                `[TransformersAdapter] Generating embeddings for ${texts.length} texts...`
            );

            // 批量生成
            const embeddings: number[][] = [];
            for (const text of texts) {
                const output = await this.embedder(text, {
                    pooling: 'mean',
                    normalize: true
                });
                embeddings.push(Array.from(output.data));
            }

            console.log(`[TransformersAdapter] Generated ${embeddings.length} embeddings`);

            return embeddings;
        } catch (error) {
            console.error('[TransformersAdapter] Failed to generate embeddings:', error);
            return null;
        }
    }

    /**
     * 卸载模型释放内存
     */
    async unload(): Promise<void> {
        if (this.embedder) {
            console.log(
                `[TransformersAdapter] Unloading model: ${this.currentModelKey}`
            );
            this.embedder = null;
            this.currentModelKey = null;
        }
        this.transformersLib = null;
    }

    /**
     * 获取模型信息
     */
    getModelInfo() {
        return {
            adapter: this.name,
            modelKey: this.currentModelKey,
            isLoading: this.isLoading,
            hasEmbedder: !!this.embedder
        };
    }
}
