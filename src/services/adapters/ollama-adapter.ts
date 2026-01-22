/**
 * Ollama Embedding Adapter
 * 支持本地 Ollama 服务的适配器
 * 
 * 用于连接本地运行的 Ollama 服务获取嵌入向量
 * Ollama 支持 mistral、neural-chat、nomic-embed-text 等多种模型
 */

import type { PluginSettings } from '../../types';
import type { IEmbeddingAdapter } from '../embedding-adapter';

/**
 * Ollama 嵌入适配器
 * 用于本地 Ollama 服务
 */
export class OllamaEmbeddingAdapter implements IEmbeddingAdapter {
    readonly name = 'ollama';

    private baseUrl: string = 'http://localhost:11434';
    private model: string = 'nomic-embed-text';

    /**
     * 验证 Ollama 服务是否可用
     */
    private async isOllamaAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch (error) {
            console.error('[OllamaAdapter] Ollama service not available:', error);
            return false;
        }
    }

    /**
     * 获取单个嵌入
     */
    async getEmbedding(
        text: string,
        settings: PluginSettings
    ): Promise<number[] | null> {
        try {
            // 获取配置
            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            // 验证服务可用性
            if (!await this.isOllamaAvailable()) {
                console.error('[OllamaAdapter] Ollama service is not running');
                return null;
            }

            console.log(`[OllamaAdapter] Getting embedding for text using model: ${model}`);

            // 调用 Ollama API
            const response = await fetch(`${baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    prompt: text
                }),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                console.error(`[OllamaAdapter] Failed to get embedding: ${response.statusText}`);
                return null;
            }

            const data = await response.json();

            if (!data.embedding || !Array.isArray(data.embedding)) {
                console.error('[OllamaAdapter] Invalid embedding response');
                return null;
            }

            console.log(
                `[OllamaAdapter] Generated embedding, dimension: ${data.embedding.length}`
            );

            return data.embedding;
        } catch (error) {
            console.error('[OllamaAdapter] Failed to generate embedding:', error);
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
            // 获取配置
            const baseUrl = settings.embedModel?.baseUrl || this.baseUrl;
            const model = settings.embedModel?.modelKey || this.model;

            // 验证服务可用性
            if (!await this.isOllamaAvailable()) {
                console.error('[OllamaAdapter] Ollama service is not running');
                return null;
            }

            console.log(
                `[OllamaAdapter] Getting embeddings for ${texts.length} texts using model: ${model}`
            );

            const embeddings: number[][] = [];

            // 批量获取嵌入（可以并行请求，但要注意速率限制）
            for (const text of texts) {
                try {
                    const response = await fetch(`${baseUrl}/api/embeddings`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model,
                            prompt: text
                        }),
                        signal: AbortSignal.timeout(30000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.embedding && Array.isArray(data.embedding)) {
                            embeddings.push(data.embedding);
                        }
                    } else {
                        console.warn(`[OllamaAdapter] Failed to embed text: ${response.statusText}`);
                        embeddings.push([]);
                    }
                } catch (error) {
                    console.warn('[OllamaAdapter] Error embedding single text:', error);
                    embeddings.push([]);
                }
            }

            console.log(`[OllamaAdapter] Generated ${embeddings.length} embeddings`);
            return embeddings;
        } catch (error) {
            console.error('[OllamaAdapter] Failed to generate embeddings:', error);
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
            description: 'Local Ollama service for embeddings'
        };
    }
}
