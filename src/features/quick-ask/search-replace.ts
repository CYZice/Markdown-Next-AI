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

export interface ParseDiagnostics {
    cleanedContent: string;
    blocks: SearchReplaceBlock[];
    errors: string[];
    warnings: string[];
}

const stripOuterCodeFences = (text: string): string => {
    const trimmed = (text || "").trim();
    if (!trimmed.startsWith("```")) return text;
    const lines = splitLines(trimmed);
    if (lines.length < 2) return text;
    if (!lines[0].startsWith("```")) return text;
    const lastFenceIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (lines[i].trim() === "```") return i;
        }
        return -1;
    })();
    if (lastFenceIndex <= 0) return text;
    const inner = lines.slice(1, lastFenceIndex).join("\n");
    return inner.trim();
};

export function parseSearchReplaceBlocksWithDiagnostics(content: string): ParseDiagnostics {
    const cleanedContent = stripOuterCodeFences(content || "");
    const blocks: SearchReplaceBlock[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = splitLines(cleanedContent);
    let i = 0;
    let outsideNonEmpty = 0;

    const recordOutsideLine = (lineText: string) => {
        if (!lineText.trim()) return;
        outsideNonEmpty += 1;
        if (warnings.length < 3) warnings.push(`存在块外文本：${lineText.trim().slice(0, 80)}`);
    };

    while (i < lines.length) {
        const line = lines[i].trim();

        if (line === "<<<<<<< CONTINUE") {
            const startLine = i + 1;
            i += 1;
            while (i < lines.length && lines[i].trim() !== "=======") i += 1;
            if (i >= lines.length) {
                errors.push(`CONTINUE 块缺少分隔符 =======（第 ${startLine} 行附近）`);
                break;
            }
            i += 1;
            const contentLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== ">>>>>>> CONTINUE") {
                contentLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) {
                errors.push(`CONTINUE 块缺少结束标记 >>>>>>> CONTINUE（第 ${startLine} 行附近）`);
                break;
            }
            blocks.push({ type: "continue", search: "", replace: contentLines.join("\n") });
            i += 1;
            continue;
        }

        if (line === "<<<<<<< SEARCH") {
            const startLine = i + 1;
            i += 1;
            const searchLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== "=======") {
                searchLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) {
                errors.push(`SEARCH 块缺少分隔符 =======（第 ${startLine} 行附近）`);
                break;
            }
            i += 1;
            const replaceLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== ">>>>>>> REPLACE") {
                replaceLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) {
                errors.push(`REPLACE 块缺少结束标记 >>>>>>> REPLACE（第 ${startLine} 行附近）`);
                break;
            }
            const search = searchLines.join("\n");
            if (!search.trim()) {
                warnings.push(`SEARCH 块搜索内容为空（第 ${startLine} 行附近）`);
            }
            blocks.push({ type: "replace", search, replace: replaceLines.join("\n") });
            i += 1;
            continue;
        }

        if (line === "<<<<<<< INSERT AFTER") {
            const startLine = i + 1;
            i += 1;
            const searchLines: string[] = [];
            while (i < lines.length && lines[i].trim() !== "=======") {
                searchLines.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) {
                errors.push(`INSERT AFTER 块缺少分隔符 =======（第 ${startLine} 行附近）`);
                break;
            }
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
            if (i >= lines.length) {
                errors.push(`INSERT 块缺少结束标记 >>>>>>> INSERT（第 ${startLine} 行附近）`);
                break;
            }
            const search = searchLines.join("\n");
            if (!search.trim()) {
                warnings.push(`INSERT AFTER 块定位内容为空（第 ${startLine} 行附近）`);
            }
            blocks.push({ type: "insert", search, replace: replaceLines.join("\n") });
            i += 1;
            continue;
        }

        recordOutsideLine(lines[i]);
        i += 1;
    }

    if (blocks.length === 0 && cleanedContent.trim()) {
        errors.push("未找到任何编辑块（需要 <<<<<<< SEARCH / CONTINUE / INSERT AFTER）");
    }
    if (outsideNonEmpty > 0 && warnings.length === 0) {
        warnings.push("存在块外文本");
    }

    return { cleanedContent, blocks, errors, warnings };
}

export function parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
    return parseSearchReplaceBlocksWithDiagnostics(content).blocks;
}

const getLineInfos = (content: string) => {
    const lines = content.split("\n");
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }
    return { lines, lineStarts };
};

const findLineRange = (content: string, search: string): { start: number; end: number } | null => {
    const { lines: contentLines, lineStarts } = getLineInfos(content);
    const searchLines = search.split("\n");
    if (searchLines.length === 0) return null;
    const normalize = (s: string) => s.trim();
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

const findLineRangeFlexible = (content: string, search: string): { start: number; end: number } | null => {
    const { lines: contentLines, lineStarts } = getLineInfos(content);
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const searchLines = search
        .split("\n")
        .map((line) => normalize(line))
        .filter((line) => line.length > 0);
    if (searchLines.length === 0) return null;
    const contentNormLines = contentLines.map((line) => normalize(line));
    for (let i = 0; i < contentNormLines.length; i += 1) {
        if (contentNormLines[i] !== searchLines[0]) continue;
        let searchIndex = 0;
        let contentIndex = i;
        let lastMatchIndex = i;
        while (searchIndex < searchLines.length && contentIndex < contentNormLines.length) {
            if (contentNormLines[contentIndex].length === 0) {
                contentIndex += 1;
                continue;
            }
            if (contentNormLines[contentIndex] === searchLines[searchIndex]) {
                lastMatchIndex = contentIndex;
                searchIndex += 1;
                contentIndex += 1;
                continue;
            }
            break;
        }
        if (searchIndex === searchLines.length) {
            const start = lineStarts[i];
            const end = lineStarts[lastMatchIndex] + contentLines[lastMatchIndex].length;
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
        let range = findLineRange(content, search);
        if (!range) {
            range = findLineRangeFlexible(content, search);
        }
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
