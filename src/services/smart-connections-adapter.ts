/**
 * Smart Connections Adapter
 * 封装对 smart-connections 插件的调用
 */

import type { App } from 'obsidian';

export interface SmartConnectionsResult {
    item: {
        path: string;
        key: string;
        [key: string]: any;
    };
    score: number;
    hypothetical_i?: number;
}

export interface SmartConnectionsLookupParams {
    hypotheticals: string[];
    filter?: {
        limit?: number;
        exclude_filter?: string;
        include_filter?: string;
    };
    skip_blocks?: boolean;
}

/**
 * Smart Connections 适配器
 * 提供对 smart-connections 插件的访问接口
 */
export class SmartConnectionsAdapter {
    private app: App;
    private scPlugin: any = null;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 获取 smart-connections 插件实例
     */
    private getPlugin(): any {
        if (this.scPlugin) {
            return this.scPlugin;
        }

        const plugins = (this.app as any).plugins?.plugins;
        if (!plugins || !plugins['smart-connections']) {
            console.warn('[SmartConnectionsAdapter] smart-connections plugin not found');
            return null;
        }

        this.scPlugin = plugins['smart-connections'];
        return this.scPlugin;
    }

    /**
     * 检查插件是否可用
     */
    isAvailable(): boolean {
        const plugin = this.getPlugin();
        return !!(plugin?.env?.smart_sources?.lookup);
    }

    /**
     * 确保插件已加载
     */
    async ensureLoaded(): Promise<boolean> {
        const plugin = this.getPlugin();
        if (!plugin) {
            return false;
        }

        // 如果插件未加载，尝试加载
        if (!plugin.loaded) {
            try {
                await (this.app as any).plugins?.loadPlugin('smart-connections');
            } catch (e) {
                console.error('[SmartConnectionsAdapter] Failed to load plugin:', e);
                return false;
            }
        }

        // 等待环境初始化
        if (!plugin.env) {
            console.warn('[SmartConnectionsAdapter] Plugin env not ready');
            return false;
        }

        return this.isAvailable();
    }

    /**
     * 执行语义检索（核心方法）
     * @param query 查询文本
     * @param options 检索选项
     * @returns 检索结果数组
     */
    async lookup(
        query: string,
        options: {
            limit?: number;
            excludeBlocks?: boolean;
            includeFilter?: string;
            excludeFilter?: string;
        } = {}
    ): Promise<SmartConnectionsResult[]> {
        if (!await this.ensureLoaded()) {
            console.error('[SmartConnectionsAdapter] Plugin not available');
            return [];
        }

        const plugin = this.getPlugin();
        const params: SmartConnectionsLookupParams = {
            hypotheticals: [query],
            filter: {
                limit: options.limit || 10,
            },
        };
        // 只在 excludeBlocks 为 true 时添加 skip_blocks
        if (options.excludeBlocks) {
            (params as any).skip_blocks = true;
        }

        if (options.includeFilter) {
            params.filter!.include_filter = options.includeFilter;
        }
        if (options.excludeFilter) {
            params.filter!.exclude_filter = options.excludeFilter;
        }

        try {
            const results = await plugin.env.smart_sources.lookup(params);

            if (!Array.isArray(results)) {
                console.warn('[SmartConnectionsAdapter] Invalid results:', results);
                return [];
            }

            console.log(`[SmartConnectionsAdapter] Found ${results.length} results for query: "${query}"`);
            return results;
        } catch (e) {
            console.error('[SmartConnectionsAdapter] Lookup failed:', e);
            return [];
        }
    }

    /**
     * 获取文件的相似文件（基于向量）
     * @param filePath 文件路径
     * @param limit 结果数量
     */
    async findSimilar(filePath: string, limit: number = 10): Promise<SmartConnectionsResult[]> {
        if (!await this.ensureLoaded()) {
            return [];
        }

        const plugin = this.getPlugin();
        const source = plugin.env.smart_sources.get(filePath);

        if (!source || !source.vec) {
            console.warn('[SmartConnectionsAdapter] Source not embedded:', filePath);
            return [];
        }

        try {
            const results = await source.find_connections({
                exclude_keys: [filePath],
                filter: { limit }
            });
            return results || [];
        } catch (e) {
            console.error('[SmartConnectionsAdapter] Find similar failed:', e);
            return [];
        }
    }

    /**
     * 获取插件信息
     */
    getPluginInfo(): { available: boolean; version?: string } {
        const plugin = this.getPlugin();
        if (!plugin) {
            return { available: false };
        }

        return {
            available: this.isAvailable(),
            version: plugin.manifest?.version
        };
    }

    /**
     * 获取 smart-connections 的 env（用于渲染组件）
     */
    getEnv(): any {
        const plugin = this.getPlugin();
        return plugin?.env;
    }

    /**
     * 读取 smart-connections 的 settings
     */
    async getSettings(): Promise<any | null> {
        if (!await this.ensureLoaded()) return null;
        const plugin = this.getPlugin();
        return plugin?.env?.settings ?? null;
    }

    /**
     * 是否需要排除块级结果（来自 smart_view_filter）
     */
    async shouldExcludeBlocksFromSourceConnections(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;
    }

    /**
     * 渲染 SC 的结果列表组件，返回 DocumentFragment
     */
    async renderConnectionsResults(results: SmartConnectionsResult[], opts: any = {}): Promise<DocumentFragment | null> {
        if (!await this.ensureLoaded()) return null;
        const env = this.getEnv();
        if (!env?.render_component) return null;
        try {
            const frag = await env.render_component('connections_results', results, opts);
            return frag as DocumentFragment;
        } catch (e) {
            console.error('[SmartConnectionsAdapter] render_connections_results failed:', e);
            return null;
        }
    }
}

/**
 * 将 SC 结果转换为易用格式
 */
export function formatSmartConnectionsResults(
    results: SmartConnectionsResult[]
): Array<{ path: string; title: string; score: number }> {
    return results.map(r => ({
        path: r.item.path,
        title: r.item.path.split('/').pop()?.replace(/\.md$/, '') || r.item.path,
        score: r.score
    }));
}
