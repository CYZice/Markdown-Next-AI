/**
 * OpenAI Embedding Adapter
 * 支持 OpenAI API 的嵌入服务
 * 
 * 用于使用 OpenAI text-embedding-3-small 或 text-embedding-3-large
 * 相比本地模型，OpenAI 的嵌入质量更高，但需要网络连接和 API 密钥
 */

import type { PluginSettings } from '../../types';
import type { IEmbeddingAdapter } from '../embedding-adapter';

/**
 * OpenAI 嵌入适配器
 */
export class OpenAIEmbeddingAdapter implements IEmbeddingAdapter {
    readonly name = 'openai';

    private baseUrl: string = 'https://api.openai.com/v1';
    private model: string = 'text-embedding-3-small';

    /**
     * 获取单个嵌入
     */
    async getEmbedding(
        text: string,
        settings: PluginSettings
    ): Promise<number[] | null> {
        try {
            // 获取 API 密钥
            const apiKey = settings.embedModel?.apiKey ||
                settings.providers?.['openai']?.apiKey;

            if (!apiKey) {
                console.error('[OpenAIAdapter] OpenAI API key not configured');
                return null;
            }

            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            console.log(`[OpenAIAdapter] Getting embedding using model: ${model}`);

            const response = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    input: text,
                    encoding_format: 'float'
                }),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`[OpenAIAdapter] OpenAI API error: ${response.status} ${error}`);
                return null;
            }

            const data = await response.json();

            if (!data.data || !data.data[0] || !data.data[0].embedding) {
                console.error('[OpenAIAdapter] Invalid embedding response');
                return null;
            }

            const embedding = data.data[0].embedding;
            console.log(
                `[OpenAIAdapter] Generated embedding, dimension: ${embedding.length}`
            );

            return embedding;
        } catch (error) {
            console.error('[OpenAIAdapter] Failed to generate embedding:', error);
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
            // 获取 API 密钥
            const apiKey = settings.embedModel?.apiKey ||
                settings.providers?.['openai']?.apiKey;

            if (!apiKey) {
                console.error('[OpenAIAdapter] OpenAI API key not configured');
                return null;
            }

            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            console.log(
                `[OpenAIAdapter] Getting embeddings for ${texts.length} texts using model: ${model}`
            );

            const response = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    input: texts,
                    encoding_format: 'float'
                }),
                signal: AbortSignal.timeout(60000)
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`[OpenAIAdapter] OpenAI API error: ${response.status} ${error}`);
                return null;
            }

            const data = await response.json();

            if (!data.data || !Array.isArray(data.data)) {
                console.error('[OpenAIAdapter] Invalid embeddings response');
                return null;
            }

            // 排序数据以确保顺序正确
            const embeddings = data.data
                .sort((a: any, b: any) => a.index - b.index)
                .map((item: any) => item.embedding);

            console.log(`[OpenAIAdapter] Generated ${embeddings.length} embeddings`);

            return embeddings;
        } catch (error) {
            console.error('[OpenAIAdapter] Failed to generate embeddings:', error);
            return null;
        }
    }

    /**
     * 获取模型信息
     */
    getModelInfo() {
        return {
            adapter: this.name,
            baseUrl: this.baseUrl,
            model: this.model,
            description: 'OpenAI embedding service',
            models: [
                'text-embedding-3-small',
                'text-embedding-3-large'
            ]
        };
    }
}
