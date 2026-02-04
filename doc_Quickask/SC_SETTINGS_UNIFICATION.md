# SC 全局设置统一实现记录

## 实现时间
2026年1月4日

## 改动概述

已成功实现了 markdown-next-ai 从 Smart Connections 的全局设置中读取参数，避免硬编码和参数冗余。仅保留三个参数由 markdown-next-ai 控制：
- `enableKnowledgeSearch` - 是否启用知识库检索
- `knowledgeTopK` - 检索结果数量 
- `knowledgeMinScore` - 最低分数阈值

所有其他参数（如块级结果过滤）完全由 SC 的全局设置决定。

## 修改文件清单

### 1. src/services/smart-connections-adapter.ts
- ✅ 参数名改变：`skipBlocks` → `excludeBlocks`
- ✅ 参数逻辑：仅在 `excludeBlocks === true` 时添加 `skip_blocks: true`

### 2. src/utils/hybrid-search.ts
- ✅ 删除 `HybridSearchOptions` 中的 `includeBlocks` 选项
- ✅ 直接读取 SC 的 `smart_view_filter.exclude_blocks_from_source_connections`
- ✅ 自动构建 `excludeBlocks` 参数

### 3. src/ui/knowledge-results-floating-window.ts
- ✅ `runSearch()` 方法中读取 SC 设置
- ✅ `loadMore()` 方法中读取 SC 设置
- ✅ 改为传递 `excludeBlocks` 参数

### 4. src/ui/at-trigger-popup.ts
- ✅ `loadMoreKnowledgeResults()` 方法中读取 SC 设置
- ✅ 改为传递 `excludeBlocks` 参数

### 5. src/types.ts
- ✅ `PluginSettings` 中仅保留三个知识库检索参数
- ✅ 清理冗余的块级结果相关设置

### 6. src/defaults.ts
- ✅ 对应更新默认值

## 关键代码变化

### adapter.lookup() 的参数变化
```typescript
// 之前：skipBlocks: boolean
// 现在：excludeBlocks: boolean
async lookup(
    query: string,
    options: {
        limit?: number;
        excludeBlocks?: boolean;  // ✅ 新参数名
        includeFilter?: string;
        excludeFilter?: string;
    } = {}
)
```

### hybridSearch() 的改进
```typescript
// ✅ 直接从 SC 读取块级结果过滤
const scPlugin = (app as any).plugins?.plugins['smart-connections'];
const scSettings = scPlugin?.env?.settings;
const excludeBlocks = scSettings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;

const rawResults = await lookupPipeline(app, {
    query,
    filter: { limit, excludeBlocks, includeFilter }
} as any);
```

## 编译和部署

```bash
# 编译
npm run build

# 部署到 Obsidian
已复制: D:\Programs\ABCDE\.obsidian\plugins\Markdown-Next-AI-1.3.0\main.js
```

## 优势总结

1. **参数统一**：不再维护冗余设置，用户在 SC 中配置块级结果过滤即可
2. **逻辑清晰**：excludeBlocks 与 exclude_blocks_from_source_connections 同向
3. **易于维护**：markdown-next-ai 只关心三个核心参数
4. **自动同步**：用户修改 SC 设置后自动对 markdown-next-ai 生效
5. **充分复用**：使用 SC 的原生 render_component 处理渲染

## 后续可考虑的优化

- [ ] 在知识库搜索 UI 中显示 SC 的块级结果过滤状态
- [ ] 允许用户在 markdown-next-ai 设置中快速跳转到 SC 的设置
- [ ] 添加调试日志，显示从 SC 读取的设置值
- [ ] 缓存 SC 的设置，避免每次搜索都重新读取
