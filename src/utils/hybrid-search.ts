/**
 * Hybrid Search - 混合检索模块
 * 简化版：直接使用 smart-connections 插件
 */

import { App, TFile } from "obsidian";
import { SmartConnectionsAdapter } from "../services/smart-connections-adapter";
import {
    getAllFolders,
    lookupPipeline,
    type LookupResult
} from "./lookup-pipeline";

// ============= 类型定义 =============

export interface SearchResult {
    source: string;
    title: string;
    snippet: string;
    score: number;
}

/** 检索选项 */
export interface HybridSearchOptions {
    /** 结果数量限制 */
    results_limit?: number;
    /** 最低分数阈值 */
    min_score?: number;
    /** 文件夹过滤 */
    folders?: string[];
}

// ============= 主函数 =============

/**
 * 混合检索主函数（使用 smart-connections）
 */
export async function hybridSearch(
    app: App,
    query: string,
    options?: HybridSearchOptions
): Promise<SearchResult[]> {
    const limit = options?.results_limit ?? 10;

    const adapter = new SmartConnectionsAdapter(app);
    const excludeBlocks = await adapter.shouldExcludeBlocksFromSourceConnections();

    const includeFilter = options?.folders && options.folders.length > 0 ? options.folders[0] : undefined;

    const rawResults = await lookupPipeline(app, {
        query,
        filter: { limit, excludeBlocks, includeFilter }
    } as any);

    // 标准化为 SearchResult，并生成简要摘要
    const normalized: SearchResult[] = [];
    for (const r of rawResults) {
        const path = (r as any)?.item?.path || (r as any)?.path || "";
        const title = (r as any)?.item?.name || (path.split('/').pop()?.replace(/\.md$/, '') || path);
        const score = (r as any)?.score ?? 0;

        let snippet = "";
        try {
            const file = app.vault.getAbstractFileByPath(path);
            if (file && file instanceof TFile) {
                const content = await app.vault.read(file);
                snippet = makeSnippet(content);
            }
        } catch (_) {
            // 读取失败时保持空摘要
        }

        normalized.push({ source: path, title, snippet, score });
    }

    // 客户端分数过滤
    const minScore = options?.min_score ?? 0;
    const filtered = normalized.filter(r => r.score >= minScore);

    // 客户端文件夹再次过滤（确保与 UI 一致）
    if (includeFilter) {
        return filtered.filter(r => r.source === includeFilter || r.source.startsWith(includeFilter + "/"));
    }
    return filtered;
}

/**
 * 将检索结果转为上下文文本
 */
export function resultsToContext(results: SearchResult[]): string {
    if (!results?.length) return "";

    return results
        .map(r => {
            const path = r.source || '';
            const title = r.title || (path.split('/').pop()?.replace(/\.md$/, '') || path);
            const score = r.score || 0;
            return `=== 参考: ${title} (${path}) [相似度: ${(score * 100).toFixed(1)}%] ===`;
        })
        .join("\n\n");
}

/**
 * 从文件内容生成简要摘要
 */
function makeSnippet(content: string): string {
    if (!content) return "";
    const cleaned = content.replace(/\r/g, "").trim();
    // 取首段（直到空行），限制长度
    const firstParagraph = cleaned.split(/\n\s*\n/)[0] || cleaned.split(/\n/)[0] || cleaned;
    const snippet = firstParagraph.replace(/\n/g, " ").slice(0, 240);
    return snippet;
}

/**
 * 获取所有可用文件夹（用于 UI 过滤选择）
 */
export { getAllFolders };

// 导出类型
export type { LookupResult };

