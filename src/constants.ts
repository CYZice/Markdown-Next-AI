/**
 * 模型类别常量
 */
export const MODEL_CATEGORIES = {
    THINKING: "thinking",
    VISION: "vision",
    MULTIMODAL: "multimodal",
    TEXT: "text",
    IMAGE: "image"
} as const;

/**
 * 系统提示词
 */
export const SYSTEM_PROMPTS: Record<string, string> = {
    edit: "你是一个精确的文本编辑助手。仅修改用户选中的文本，保持原有风格、语气和结构，不要改动未选内容；如需优化逻辑与表达，简洁完成。",
    chat: "你是一个对话和问答助手。直接回答用户问题或协助生成内容；若提供参考文档，必须以文档为准，避免臆造。",
    insert: "你是一个续写/插入助手。根据光标上下文生成可直接插入的新内容，保持连贯与风格一致，不复述已有上下文。",
    // 向后兼容旧的 continue 模式
    continue: "你是一个专业的写作助手。请根据用户提供的上下文，从光标位置开始续写后续内容。重要：只生成新的内容，不要重复或重写已有的内容。"
};

/**
 * 支持的文件扩展名
 */
export const FILE_EXTENSIONS = {
    IMAGE: ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"],
    DOCUMENT: ["md", "txt", "docx", "doc", "pdf", "xlsx", "xls", "epub", "mobi", "csv", "json"]
} as const;

/**
 * 图片处理相关常量
 */
export const IMAGE_CONSTANTS = {
    MAX_FILE_SIZE: 10485760, // 10MB
    ALLOWED_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"]
} as const;
