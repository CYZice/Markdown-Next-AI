export { AIService } from "./ai-service";
export { ImageHandler } from "./image-handler";
export { routeByLLM, type LLMBasedRouteDecision, type LLMBasedRouteInput, type RouteByLLMOptions, type RouteMode } from "./routing-service";
export { GlobalRuleManager } from "./rule-manager";

// Smart Connections 适配器
export { SmartConnectionsAdapter, formatSmartConnectionsResults } from "./smart-connections-adapter";
export type { SmartConnectionsLookupParams, SmartConnectionsResult } from "./smart-connections-adapter";

// 保留嵌入服务（如果需要备用）
export { EmbeddingAdapterFactory, type IEmbeddingAdapter } from "./embedding-adapter";
export { EmbeddingService, getEmbedding, getEmbeddings } from "./embedding-service";

