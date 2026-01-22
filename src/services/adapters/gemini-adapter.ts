/**
 * Gemini Embedding Adapter
 * 支持 Google Gemini API 的嵌入服务
 * 
 * 用于使用 Google 的 text-embedding-004 模型
 * 提供高质量的语义嵌入
 */

import type { PluginSettings } from '../../types';
import type { IEmbeddingAdapter } from '../embedding-adapter';

/**
 * Google Gemini 嵌入适配器
 */
export class GeminiEmbeddingAdapter implements IEmbeddingAdapter {
    readonly name = 'gemini';

    private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models';
    private model: string = 'text-embedding-004';

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
                settings.providers?.['gemini']?.apiKey;

            if (!apiKey) {
                console.error('[GeminiAdapter] Gemini API key not configured');
                return null;
            }

            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            console.log(`[GeminiAdapter] Getting embedding using model: ${model}`);

            const response = await fetch(
                `${baseUrl}/${model}:embedContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: {
                            parts: [
                                {
                                    text
                                }
                            ]
                        }
                    }),
                    signal: AbortSignal.timeout(30000)
                }
            );

            if (!response.ok) {
                const error = await response.text();
                console.error(`[GeminiAdapter] Gemini API error: ${response.status} ${error}`);
                return null;
            }

            const data = await response.json();

            if (!data.embedding || !data.embedding.values) {
                console.error('[GeminiAdapter] Invalid embedding response');
                return null;
            }

            const embedding = data.embedding.values;
            console.log(
                `[GeminiAdapter] Generated embedding, dimension: ${embedding.length}`
            );

            return embedding;
        } catch (error) {
            console.error('[GeminiAdapter] Failed to generate embedding:', error);
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
                settings.providers?.['gemini']?.apiKey;

            if (!apiKey) {
                console.error('[GeminiAdapter] Gemini API key not configured');
                return null;
            }

            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            console.log(
                `[GeminiAdapter] Getting embeddings for ${texts.length} texts using model: ${model}`
            );

            const embeddings: number[][] = [];

            // 批量获取嵌入（注意 Gemini API 的批量限制）
            for (const text of texts) {
                try {
                    const response = await fetch(
                        `${baseUrl}/${model}:embedContent?key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                content: {
                                    parts: [
                                        {
                                            text
                                        }
                                    ]
                                }
                            }),
                            signal: AbortSignal.timeout(30000)
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.embedding && data.embedding.values) {
                            embeddings.push(data.embedding.values);
                        }
                    } else {
                        console.warn(`[GeminiAdapter] Failed to embed text: ${response.statusText}`);
                        embeddings.push([]);
                    }
                } catch (error) {
                    console.warn('[GeminiAdapter] Error embedding single text:', error);
                    embeddings.push([]);
                }
            }

            console.log(`[GeminiAdapter] Generated ${embeddings.length} embeddings`);
            return embeddings;
        } catch (error) {
            console.error('[GeminiAdapter] Failed to generate embeddings:', error);
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
            description: 'Google Gemini embedding service',
            models: [
                'text-embedding-004'
            ]
        };
    }
}
