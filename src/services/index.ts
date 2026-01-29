export { AIService } from "./ai-service";
export { ImageHandler } from "./image-handler";
export { routeByLLM, type LLMBasedRouteDecision, type LLMBasedRouteInput, type RouteByLLMOptions, type RouteMode } from "./routing-service";
export { GlobalRuleManager } from "./rule-manager";

// 保留嵌入服务（如果需要备用）
export { EmbeddingAdapterFactory, type IEmbeddingAdapter } from "./embedding-adapter";
export { EmbeddingService, getEmbedding, getEmbeddings } from "./embedding-service";

