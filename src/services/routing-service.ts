import { requestUrl } from "obsidian";
import type { AIService } from "./ai-service";

export type RouteMode = "edit" | "chat" | "insert";

export interface LLMBasedRouteInput {
    prompt: string;
    selectionText?: string;
    cursorBefore?: string;
    cursorAfter?: string;
    useCursor?: boolean;
    additionalContext?: string;
    contextContent?: string;
    cursorPosition?: { line: number; ch: number } | null;
    locale?: string;
}

export interface LLMBasedRouteDecision {
    mode: RouteMode;
    confidence: number;
    reason: string;
    raw?: string;
    appliedFallback?: boolean;
}

export interface RouteByLLMOptions {
    aiService: AIService;
    minConfidenceForAuto?: number; // 默认 0.6
    fallbackMode?: RouteMode; // 默认 "chat"
}

const DEFAULT_MIN_CONFIDENCE = 0.6;
const DEFAULT_FALLBACK_MODE: RouteMode = "chat";

function safeLength(text?: string): number {
    return (text || "").length;
}

function buildSystemPrompt(): string {
    return [
        "你是一个\"生成模式路由分类器\"。",
        "任务：根据用户指令与提供的材料，判定最合适的生成模式（edit|chat|insert）。",
        "输出要求：仅输出严格的JSON，包含字段：mode（枚举）、confidence（0~1）、reason（一句话解释）。",
        "不要输出任何非JSON内容。",
        "判定提示：有选区+改写类需求→edit；插入或续写类需求→insert；问答或创作→chat；无明显信号→chat。"
    ].join("\n");
}

function buildUserPrompt(input: LLMBasedRouteInput): string {
    const hasSelection = Boolean(input.selectionText && input.selectionText.trim());
    const hasCursorContext = Boolean(
        input.useCursor && (((input.cursorBefore || "").trim()) || ((input.cursorAfter || "").trim()))
    );
    const hasReferences = Boolean((input.additionalContext || "").trim() || (input.contextContent || "").trim());

    const selectionLength = safeLength(input.selectionText);
    const beforeLength = safeLength(input.cursorBefore);
    const afterLength = safeLength(input.cursorAfter);
    const referencesCount = hasReferences ? 1 : 0; // 路由阶段不读取正文，仅用存在性信号

    return [
        `用户指令：${input.prompt}`,
        `选中文本：${hasSelection ? "有" : "无"} length=${selectionLength}`,
        "光标上下文（如允许）：",
        `  - hasCursorContext=${hasCursorContext} beforeLen=${beforeLength} afterLen=${afterLength}`,
        `参考文档：hasReferences=${hasReferences} count=${referencesCount}`,
        "路由状态（由服务自动计算）：",
        `  - cursorPosition=${input.cursorPosition ? `${input.cursorPosition.line}:${input.cursorPosition.ch}` : "null"}`,
        "请仅输出JSON：{\"mode\":\"chat\",\"confidence\":0.72,\"reason\":\"...\"}"
    ].join("\n");
}

function extractJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch (_) {
        // 尝试提取第一个大括号包裹的 JSON 片段
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    }
    return null;
}

function normalizeDecision(raw: any): LLMBasedRouteDecision | null {
    if (!raw || typeof raw !== "object") return null;
    const mode = raw.mode as RouteMode;
    const confidence = Number(raw.confidence);
    const reason = String(raw.reason || "");

    if (!mode || !["edit", "chat", "insert"].includes(mode)) return null;
    if (Number.isNaN(confidence)) return null;

    return {
        mode,
        confidence,
        reason: reason || "",
        raw: JSON.stringify(raw)
    };
}

function applyConfidenceFallback(
    decision: LLMBasedRouteDecision,
    minConfidence: number,
    fallbackMode: RouteMode
): LLMBasedRouteDecision {
    if (decision.confidence >= minConfidence) return decision;

    return {
        ...decision,
        mode: fallbackMode,
        appliedFallback: true,
        reason: `${decision.reason || "低置信度"} -> fallback ${fallbackMode}`
    };
}

export async function routeByLLM(
    input: LLMBasedRouteInput,
    options: RouteByLLMOptions
): Promise<LLMBasedRouteDecision> {
    const aiService = options.aiService;
    const minConfidence = options.minConfidenceForAuto ?? DEFAULT_MIN_CONFIDENCE;
    const fallbackMode = options.fallbackMode ?? DEFAULT_FALLBACK_MODE;

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input);

    const config = aiService.getCurrentModelConfig();
    const apiUrl = aiService.buildApiUrl("/chat/completions");

    const requestBody: Record<string, unknown> = {
        model: config.model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 200
    };

    let content = "";
    try {
        const response = await requestUrl({
            url: apiUrl,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody),
            throw: false
        });

        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }

        const data = response.json;
        const choice = data?.choices?.[0];
        content = choice?.message?.content?.trim() || choice?.text?.trim() || "";
        if (!content) {
            throw new Error("空响应或缺少内容");
        }

        const parsed = normalizeDecision(extractJson(content));
        if (!parsed) {
            throw new Error("无法解析路由JSON");
        }

        return applyConfidenceFallback(parsed, minConfidence, fallbackMode);
    } catch (err: any) {
        return {
            mode: fallbackMode,
            confidence: 0,
            reason: `routing failed: ${err?.message || err}`,
            raw: content,
            appliedFallback: true
        };
    }
}
