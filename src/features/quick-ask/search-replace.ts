export type EditBlockType = "continue" | "replace" | "insert";

export interface SearchReplaceBlock {
    type: EditBlockType;
    search: string;
    replace: string;
}

export interface ApplyResult {
    newContent: string;
    appliedCount: number;
    errors: string[];
}

const splitLines = (content: string) => content.split(/\r?\n/);

export function parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = [];
    const lines = splitLines(content);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line === "<<<<<<< CONTINUE") {
            i += 1;
            while (i < lines.length && lines[i].trim() !== "=======") i += 1;
            if (i >= lines.length) break;
            i += 1;
            const contentLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== ">>>>>>> CONTINUE") {
                contentLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) {
                blocks.push({ type: "continue", search: "", replace: contentLines.join("\n") });
            }
            i += 1;
            continue;
        }
        if (line === "<<<<<<< SEARCH") {
            i += 1;
            const searchLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== "=======") {
                searchLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) break;
            i += 1;
            const replaceLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== ">>>>>>> REPLACE") {
                replaceLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) {
                blocks.push({ type: "replace", search: searchLines.join("\n"), replace: replaceLines.join("\n") });
            }
            i += 1;
            continue;
        }
        if (line === "<<<<<<< INSERT AFTER") {
            i += 1;
            const searchLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== "=======") {
                searchLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) break;
            i += 1;
            const replaceLines: string[] = [];
            while (
                i < lines.length &&
                lines[i].trim() !== ">>>>>>> INSERT" &&
                lines[i].trim() !== ">>>>>>> INSERT AFTER"
            ) {
                replaceLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) {
                blocks.push({ type: "insert", search: searchLines.join("\n"), replace: replaceLines.join("\n") });
            }
            i += 1;
            continue;
        }
        i += 1;
    }
    return blocks;
}

const findLineRange = (content: string, search: string): { start: number; end: number } | null => {
    const contentLines = content.split("\n");
    const searchLines = search.split("\n");
    if (searchLines.length === 0) return null;
    const normalize = (s: string) => s.trim();
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of contentLines) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }
    for (let i = 0; i <= contentLines.length - searchLines.length; i += 1) {
        if (normalize(contentLines[i]) !== normalize(searchLines[0])) continue;
        let matched = true;
        for (let k = 1; k < searchLines.length; k += 1) {
            if (normalize(contentLines[i + k]) !== normalize(searchLines[k])) {
                matched = false;
                break;
            }
        }
        if (matched) {
            const start = lineStarts[i];
            const end = lineStarts[i + searchLines.length - 1] + contentLines[i + searchLines.length - 1].length;
            return { start, end };
        }
    }
    return null;
};

export function applySearchReplaceBlocks(originalContent: string, blocks: SearchReplaceBlock[]): ApplyResult {
    let content = originalContent;
    let appliedCount = 0;
    const errors: string[] = [];
    for (const block of blocks) {
        if (block.type === "continue") {
            if (block.replace.trim().length > 0) {
                const separator = content.endsWith("\n") || block.replace.startsWith("\n") ? "" : "\n";
                content = content + separator + block.replace;
                appliedCount += 1;
            }
            continue;
        }
        const search = block.search;
        if (!search) {
            errors.push("搜索块为空");
            continue;
        }
        const exactIndex = content.indexOf(search);
        if (exactIndex !== -1) {
            const insertPos = exactIndex + search.length;
            if (block.type === "replace") {
                content = content.slice(0, exactIndex) + block.replace + content.slice(insertPos);
            } else {
                content = content.slice(0, insertPos) + block.replace + content.slice(insertPos);
            }
            appliedCount += 1;
            continue;
        }
        const range = findLineRange(content, search);
        if (!range) {
            errors.push(`未找到匹配块: ${search.slice(0, 60)}`);
            continue;
        }
        if (block.type === "replace") {
            content = content.slice(0, range.start) + block.replace + content.slice(range.end);
        } else {
            content = content.slice(0, range.end) + block.replace + content.slice(range.end);
        }
        appliedCount += 1;
    }
    return { newContent: content, appliedCount, errors };
}
