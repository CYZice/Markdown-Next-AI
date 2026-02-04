import { App, debounce } from 'obsidian';
import { useCallback, useRef, useState } from 'react';
import { FILE_EXTENSIONS } from '../../../constants';
import { ContextItem } from '../../../types';

export const useContextSearch = (app: App) => {
    const [items, setItems] = useState<ContextItem[]>([]);

    // 使用 useRef 保存防抖函数，确保在组件生命周期内唯一
    const searchDebounced = useRef(
        debounce((query: string, app: App, callback: (items: ContextItem[]) => void) => {
            const q = (query || "").toLowerCase().trim();
            const imageExtensions = FILE_EXTENSIONS.IMAGE;
            const docExtensions = FILE_EXTENSIONS.DOCUMENT;

            const activeFile = app.workspace.getActiveFile();

            // 简化的模糊搜索评分
            const scoreFuzzy = (q: string, text: string): number => {
                if (!q) return 0.5;
                const t = text.toLowerCase();
                if (q === t) return 1;
                if (t.includes(q)) return 0.8;

                let i = 0;
                let matches = 0;
                for (const ch of q) {
                    const pos = t.indexOf(ch, i);
                    if (pos === -1) return 0;
                    i = pos + 1;
                    matches++;
                }
                return matches / t.length * 0.5; // 简单的子序列匹配
            };

            const candidates: { item: ContextItem; score: number }[] = [];

            app.vault.getFiles().forEach(file => {
                const ext = file.extension.toLowerCase();
                let type: "file" | "folder" | "image" = "file";
                let icon = "📄";

                if (ext === "md") {
                    type = "file";
                    icon = "📄";
                } else if (imageExtensions.includes(ext as any)) {
                    type = "image";
                    icon = "🖼️";
                } else if (docExtensions.includes(ext as any)) {
                    type = "file";
                    icon = ext === "pdf" ? "📕" : "📄";
                } else {
                    return; // 忽略其他文件
                }

                const nameScore = scoreFuzzy(q, file.name);
                const pathScore = scoreFuzzy(q, file.path);
                const score = Math.max(nameScore, pathScore);

                if (score > 0) {
                    // 提升最近访问文件的权重
                    let boost = 1;
                    if (activeFile && file.path === activeFile.path) boost = 0.5;

                    candidates.push({
                        item: {
                            name: file.name,
                            path: file.path,
                            type,
                            icon,
                            extension: ext
                        },
                        score: score * boost
                    });
                }
            });

            // 排序并截取前20个
            const result = candidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 20)
                .map(c => c.item);

            callback(result);
        }, 300, true)
    ).current;

    const search = useCallback((query: string) => {
        searchDebounced(query, app, setItems);
    }, [app, searchDebounced]);

    return {
        items,
        search
    };
};
