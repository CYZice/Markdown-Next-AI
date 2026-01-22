/**
 * Lookup Pipeline - 直接使用 Smart Connections 的 lookup
 * 完全对齐 Smart Lookup 的行为，不做任何转换或过滤
 */

import type { App } from "obsidian";
import { SmartConnectionsAdapter } from "../services/smart-connections-adapter";

// ============= 类型定义 =============

/** 原始 SC 检索结果（不做任何转换） */
export type LookupResult = any;

/** 检索参数 */
export interface LookupParams {
    /** 查询文本 */
    query: string;
    /** 过滤器（传递给 SC） */
    filter?: any;
}

// ============= 主检索函数 =============

/**
 * Lookup Pipeline 主入口
 * 直接调用 Smart Connections 的 lookup
 * 完全复用 Smart Lookup 的逻辑，不做任何修改
 */
export async function lookupPipeline(
    app: App,
    params: LookupParams
): Promise<LookupResult[]> {
    const adapter = new SmartConnectionsAdapter(app);

    // 检查 smart-connections 是否可用
    if (!await adapter.ensureLoaded()) {
        console.error('[LookupPipeline] smart-connections plugin not available');
        return [];
    }

    const query = params.query?.trim();
    if (!query) {
        console.warn('[LookupPipeline] Empty query');
        return [];
    }

    try {
        // 直接调用 SC 的 lookup（完全复用 Smart Lookup）
        const results = await adapter.lookup(query, params.filter);

        console.log(`[LookupPipeline] Got ${results.length} results for: "${query}"`);
        return results;
    } catch (e) {
        console.error('[LookupPipeline] Lookup failed:', e);
        return [];
    }
}

/**
 * 将检索结果转为上下文文本
 * 提取选中结果的内容
 */
export function resultsToContext(results: LookupResult[]): string {
    if (!results.length) return "";

    return results
        .map(r => {
            // 适配 SC 结果格式
            const path = r.item?.path || r.path || '';
            const title = r.item?.name || path.split('/').pop()?.replace(/\.md$/, '') || path;
            const score = r.score || 0;
            return `=== 参考: ${title} (${path}) [相似度: ${(score * 100).toFixed(1)}%] ===`;
        })
        .join("\n\n");
}

/**
 * 获取所有文件夹列表（用于 UI 选择）
 */
export function getAllFolders(app: App): string[] {
    const folders: string[] = [];
    const files = app.vault.getAllLoadedFiles();
    for (const f of files) {
        if ((f as any).children) {
            folders.push(f.path);
        }
    }
    return folders.sort();
}
