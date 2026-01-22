# Markdown-Next-AI 重构总结

## 改动概述
将插件从自建嵌入检索系统改为直接使用 smart-connections 插件的内部接口，大幅简化代码并提升可靠性。

## 核心变更

### 1. 新增文件
- **`src/services/smart-connections-adapter.ts`**
  - 封装对 smart-connections 插件的调用
  - 提供 `lookup()` 方法进行语义检索
  - 提供 `findSimilar()` 方法查找相似文件
  - 自动检测并确保 smart-connections 插件已加载

### 2. 重写文件
- **`src/utils/lookup-pipeline.ts`**
  - 从 ~300 行简化到 ~80 行
  - 移除本地嵌入模型逻辑
  - 直接调用 smart-connections 的 lookup API
  - 保留类型定义以维持接口兼容性

- **`src/utils/hybrid-search.ts`**
  - 从 ~200 行简化到 ~60 行
  - 作为 lookup-pipeline 的简单包装
  - 移除复杂的混合检索逻辑

### 3. 精简类型定义
- **`src/types.ts`**
  - 移除 `EmbedAdapterType` 类型
  - 移除 `EmbedModelConfig` 接口
  - 从 `PluginSettings` 中删除 `embedModel` 和 `scIndexPath` 字段
  - 保留 `knowledgeTopK` 和 `knowledgeMinScore` 用于控制检索参数

### 4. 更新调用
- **`src/main.ts`**
  - 移除 `hybridSearch` 调用中的 `settings` 参数
  - 改为传递简化的选项对象

- **`src/ui/at-trigger-popup.ts`**
  - 同样移除 `settings` 参数
  - 使用新的简化接口

## 依赖关系

### 必需依赖
- **smart-connections 插件**：必须已安装并启用，版本 >= 3.0.80

### 可选保留
以下文件虽已不使用但暂时保留（可稍后删除）：
- `src/services/embedding-service.ts`
- `src/services/embedding-adapter.ts`
- `src/services/adapters/*`（所有嵌入适配器）

## 使用方式

### 检索文件示例
```typescript
import { SmartConnectionsAdapter } from './services/smart-connections-adapter';

const adapter = new SmartConnectionsAdapter(app);

// 检索与查询相关的文件
const results = await adapter.lookup("PKM strategies", {
    limit: 10,
    skipBlocks: true  // 只返回文件，不包含块
});

// 格式化结果
results.forEach(r => {
    console.log(`${r.item.path} (score: ${r.score.toFixed(2)})`);
});
```

### 查找相似文件
```typescript
// 查找与当前文件相似的其他文件
const similar = await adapter.findSimilar("path/to/file.md", 5);
```

### 检查可用性
```typescript
const info = adapter.getPluginInfo();
if (!info.available) {
    console.warn('smart-connections plugin not available');
}
```

## 优势

### 代码简化
- **删除代码量**：约 400+ 行
- **新增代码量**：约 200 行
- **净减少**：约 200 行

### 功能提升
1. **无需维护嵌入模型**：不再需要管理 transformers.js 或其他本地模型
2. **共享向量数据**：直接使用 smart-connections 已生成的向量
3. **更好的性能**：smart-connections 有优化的缓存和批处理
4. **自动更新**：向量更新由 smart-connections 管理

### 降低复杂度
- 无需配置嵌入模型类型
- 无需指定索引路径
- 无需处理模型加载和初始化

## 潜在风险

### 版本兼容性
- smart-connections 的内部 API 可能在未来版本变更
- 建议在 `smart-connections-adapter.ts` 中做好错误处理

### 依赖要求
- 用户必须安装 smart-connections 插件
- 如果 smart-connections 未安装或向量未生成，检索功能将不可用

## 后续清理（可选）

可安全删除的文件：
```
src/services/embedding-service.ts
src/services/embedding-adapter.ts
src/services/adapters/gemini-adapter.ts
src/services/adapters/ollama-adapter.ts
src/services/adapters/openai-adapter.ts
src/services/adapters/transformers-adapter.ts
```

可从 `src/defaults.ts` 移除的默认设置：
- `embedModel` 相关配置
- `scIndexPath` 相关配置

## 测试建议

1. 确保 smart-connections 已安装并生成向量
2. 测试知识库检索功能
3. 测试文件夹过滤
4. 测试结果数量限制
5. 测试在 smart-connections 未安装时的降级行为
