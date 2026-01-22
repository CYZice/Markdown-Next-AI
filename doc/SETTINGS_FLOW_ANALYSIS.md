# Markdown-Next-AI 与 Smart Connections 设置流程分析

## 核心问题

**markdown-next-ai 是否应该全部从 SC 的设置中读取参数？它应该只负责控制是否检索、阈值和 topk？**

答案：**是的，应该这样做。**

---

## 1. SC 的设置参数如何定义和使用

### 1.1 SC 的全局设置结构

**文件**: `obsidian-smart-connections-3.0.80/src/smart_env.config.js` (行152-155)

```javascript
smart_view_filter: {
  render_markdown: true,
  show_full_path: false,
  exclude_blocks_from_source_connections: false,  // ✅ 关键参数
  exclude_frontmatter_blocks: true,
}
```

这些是 SC 插件内全局设置的默认值。

### 1.2 SC 的 lookup 参数构建

**文件**: `obsidian-smart-connections-3.0.80/src/components/lookup.js` (行8-14)

```javascript
export const get_lookup_params = (query, settings, filter) => {
  const skip_blocks = settings.smart_view_filter?.exclude_blocks_from_source_connections;
  return {
    hypotheticals: [query],
    filter,
    ...(skip_blocks ? { skip_blocks: true } : {}),  // ✅ 条件性添加
  };
};
```

**关键点**：
1. 读取 `settings.smart_view_filter.exclude_blocks_from_source_connections`
2. **只在为 `true` 时** 才添加 `skip_blocks: true`
3. 如果为 `false`，不添加 `skip_blocks`（默认包含块级结果）
4. 接收外部 `filter` 并传递给 SC 的 lookup

---

## 2. Markdown-Next-AI 当前的实现

### 2.1 插件自己的设置（PluginSettings）

**文件**: `src/types.ts` (行60-90)

```typescript
export interface PluginSettings {
    // ... 其他设置 ...
    
    // Knowledge search settings (使用 smart-connections)
    enableKnowledgeSearch?: boolean;      // ✅ 控制是否启用检索
    knowledgeTopK?: number;               // ✅ 结果数量限制
    knowledgeMinScore?: number;           // ✅ 最低分数阈值
    
    // ... 其他字段 ...
}
```

**默认值**: `src/defaults.ts` (行48-50)

```typescript
enableKnowledgeSearch: false,
knowledgeTopK: 5,
knowledgeMinScore: 0.2,
```

### 2.2 Adapter 层如何调用 SC

**文件**: `src/services/smart-connections-adapter.ts` (行95-130)

```typescript
async lookup(
    query: string,
    options: {
        limit?: number;
        skipBlocks?: boolean;           // ⚠️ 接收参数
        includeFilter?: string;
        excludeFilter?: string;
    } = {}
): Promise<SmartConnectionsResult[]> {
    const plugin = this.getPlugin();
    const params: SmartConnectionsLookupParams = {
        hypotheticals: [query],
        filter: {
            limit: options.limit || 10,
        },
    };
    
    // 仅当明确指定时才设置 skip_blocks
    if (typeof options.skipBlocks === 'boolean') {
        (params as any).skip_blocks = options.skipBlocks;
    }
    
    // 调用 SC
    const results = await plugin.env.smart_sources.lookup(params);
    return results || [];
}
```

**问题分析**：
- ✅ 已改进：不再硬编码 `skip_blocks: true`
- ❌ 但问题：`skipBlocks` 参数从哪里来？

### 2.3 检索管道如何传递参数

**文件**: `src/utils/hybrid-search.ts` (行39-51)

```typescript
export async function hybridSearch(
    app: App,
    query: string,
    options?: HybridSearchOptions
): Promise<SearchResult[]> {
    const limit = options?.results_limit ?? 10;
    const skipBlocks = options?.includeBlocks ? false : true;  // ⚠️ 反向逻辑
    const includeFilter = options?.folders && options.folders.length > 0 ? options.folders[0] : undefined;

    const rawResults = await lookupPipeline(app, {
        query,
        filter: { limit, skipBlocks, includeFilter }  // ❌ 传递 skipBlocks
    } as any);
```

**问题**：
- `includeBlocks` 选项来自调用方，但**没有考虑 SC 的全局设置**
- 默认行为：`skipBlocks = true`（排除块）

### 2.4 UI 层如何调用检索

**文件**: `src/ui/at-trigger-popup.ts` (行748-750)

```typescript
async runKnowledgeSearch(): Promise<void> {
    // 现在直接打开独立浮窗
    this.openKnowledgeSearchWindow();
}
```

在知识库搜索窗口中：

```typescript
const options: HybridSearchOptions = {
    results_limit: this.plugin.settings.knowledgeTopK || 10,
    // ❌ 没有传递 includeBlocks 选项
    folders: Array.from(this.selectedKnowledgeFolders || [])
};

const results = await hybridSearch(this.app, queryText, options);
```

---

## 3. 完整的参数流向图

```
SC 全局设置 (smart_env.config.js)
└─ smart_view_filter: {
    exclude_blocks_from_source_connections: false  ← 用户在 SC 设置中的选择
}

SC 的 get_lookup_params() 函数
└─ 读取 smart_view_filter.exclude_blocks_from_source_connections
└─ 条件性添加 skip_blocks: true（仅在为 true 时）
└─ 返回给 SC 的 lookup()

Markdown-Next-AI 的参数流向：
UI (at-trigger-popup.ts)
└─ runKnowledgeSearch()
    └─ openKnowledgeSearchWindow()
        └─ 调用 hybridSearch(app, query, options)
            └─ options.includeBlocks ← ❌ 来自 UI，不来自 SC 设置
                └─ 传给 lookupPipeline()
                    └─ 传给 SmartConnectionsAdapter.lookup()
                        └─ 设置 skip_blocks
                            └─ 调用 SC 的 lookup(params)
```

---

## 4. 当前实现的问题

### 问题 1：UI 不读取 SC 的全局设置

**现状**：
```typescript
// at-trigger-popup.ts
const options: HybridSearchOptions = {
    results_limit: this.plugin.settings.knowledgeTopK || 10,
    // ❌ 没有 includeBlocks，默认为 false → skipBlocks = true
    folders: Array.from(this.selectedKnowledgeFolders || [])
};
```

**应该**：
```typescript
const plugin = (this.app as any).plugins?.plugins['smart-connections'];
const scSettings = plugin?.env?.settings;
const excludeBlocks = scSettings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;

const options: HybridSearchOptions = {
    results_limit: this.plugin.settings.knowledgeTopK || 10,
    includeBlocks: !excludeBlocks,  // ✅ 从 SC 设置读取
    folders: Array.from(this.selectedKnowledgeFolders || [])
};
```

### 问题 2：hybridSearch 与 SC 的逻辑反向

**现状**（hybridSearch.ts）：
```typescript
const skipBlocks = options?.includeBlocks ? false : true;
```

**SC 的逻辑**：
```javascript
const skip_blocks = settings.smart_view_filter?.exclude_blocks_from_source_connections;
// 即：skipBlocks = excludeBlocks（同向）
```

**改进方案**：
```typescript
// 去掉反向逻辑，直接传递 excludeBlocks
const excludeBlocks = options?.excludeBlocks ?? false;
const rawResults = await lookupPipeline(app, {
    query,
    filter: { limit, excludeBlocks, includeFilter }
} as any);
```

### 问题 3：markdown-next-ai 的设置冗余

**现状**：
```typescript
// types.ts 中有
enableKnowledgeSearch?: boolean;
knowledgeTopK?: number;
knowledgeMinScore?: number;
```

**应该**：
- `enableKnowledgeSearch`: ✅ 保留（markdown-next-ai 独有）
- `knowledgeTopK`: ❌ **应该读取 SC 的设置**
- `knowledgeMinScore`: ❌ **应该读取 SC 的设置**

或者，这些参数应该允许被 SC 的设置覆盖。

---

## 5. 推荐的设置架构

### 设计原则

```
┌─────────────────────────────────────────────────────────┐
│ Smart Connections (母插件)                              │
│                                                          │
│ smart_view_filter: {                                    │
│   exclude_blocks_from_source_connections: false         │
│   render_markdown: true                                 │
│   show_full_path: false                                 │
│   ... 其他 SC 的设置                                    │
│ }                                                        │
└────────────────┬────────────────────────────────────────┘
                 │ 读取 ↓
┌────────────────────────────────────────────────────────┐
│ Markdown-Next-AI (子插件)                              │
│                                                         │
│ 仅控制三个参数:                                         │
│  - enableKnowledgeSearch: boolean                      │
│  - knowledgeTopK: number                               │
│  - knowledgeMinScore: number                           │
│                                                         │
│ 其他参数（如 skip_blocks）完全由 SC 的               │
│ smart_view_filter 决定                                 │
└─────────────────────────────────────────────────────────┘
```

### 具体实现

#### 1. 修改 HybridSearchOptions 的参数名

```typescript
export interface HybridSearchOptions {
    results_limit?: number;        // topk
    min_score?: number;            // 最低分数阈值
    folders?: string[];            // 文件夹过滤
    // ❌ 删除 includeBlocks，由 SC 决定
}
```

#### 2. 在 UI 中读取 SC 的设置

```typescript
async openKnowledgeSearchWindow(): Promise<void> {
    // ✅ 读取 SC 的全局设置
    const scPlugin = (this.app as any).plugins?.plugins['smart-connections'];
    const scSettings = scPlugin?.env?.settings;
    const excludeBlocks = scSettings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;
    
    const options: HybridSearchOptions = {
        results_limit: this.plugin.settings.knowledgeTopK || 10,
        min_score: this.plugin.settings.knowledgeMinScore ?? 0.2,
        folders: Array.from(this.selectedKnowledgeFolders || []),
        // excludeBlocks 不传递，在 lookupPipeline 中读取 SC 设置
    };
    
    const results = await hybridSearch(this.app, queryText, options);
    // ...
}
```

#### 3. 修改 hybridSearch 直接读取 SC 设置

```typescript
export async function hybridSearch(
    app: App,
    query: string,
    options?: HybridSearchOptions
): Promise<SearchResult[]> {
    const limit = options?.results_limit ?? 10;
    const minScore = options?.min_score ?? 0;
    
    // ✅ 直接从 SC 读取块级结果设置
    const scPlugin = (app as any).plugins?.plugins['smart-connections'];
    const scSettings = scPlugin?.env?.settings;
    const excludeBlocks = scSettings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;
    
    const includeFilter = options?.folders && options.folders.length > 0 
        ? options.folders[0] 
        : undefined;

    const rawResults = await lookupPipeline(app, {
        query,
        filter: { 
            limit, 
            excludeBlocks,      // ✅ 从 SC 读取
            includeFilter 
        }
    } as any);
    
    // ... 后续处理
}
```

#### 4. 修改 adapter 的参数名

```typescript
async lookup(
    query: string,
    options: {
        limit?: number;
        excludeBlocks?: boolean;      // ✅ 改成同向逻辑
        includeFilter?: string;
        excludeFilter?: string;
    } = {}
): Promise<SmartConnectionsResult[]> {
    const params: SmartConnectionsLookupParams = {
        hypotheticals: [query],
        filter: {
            limit: options.limit || 10,
        },
    };
    
    // ✅ 只在 excludeBlocks 为 true 时添加
    if (options.excludeBlocks) {
        (params as any).skip_blocks = true;
    }
    
    // ... 其他代码
}
```

#### 5. 删除 markdown-next-ai 中的冗余设置

```typescript
// types.ts - 仅保留
export interface PluginSettings {
    // ...
    enableKnowledgeSearch?: boolean;  // ✅ 保留：控制是否开启功能
    knowledgeTopK?: number;           // ✅ 保留：可覆盖 SC 的 limit
    knowledgeMinScore?: number;       // ✅ 保留：客户端过滤阈值
    // ❌ 删除 knowledgeIncludeBlocks 等参数，由 SC 决定
}
```

---

## 6. 总结表格

| 设置项 | 应该从哪里读取 | 当前实现 | 应该改成 |
|------|-------------|--------|--------|
| `exclude_blocks_from_source_connections` | SC 全局设置 | ❌ 不读取 | ✅ 在 hybridSearch 中读取 |
| `skip_blocks` 参数 | 由 `exclude_blocks` 决定 | ❌ 硬编码/条件不对 | ✅ 根据 SC 设置动态设置 |
| `limit` (topk) | markdown-next-ai 设置 | ✅ 从 knowledgeTopK 读取 | ✅ 保持不变 |
| `min_score` | markdown-next-ai 设置 | ✅ 从 knowledgeMinScore 读取 | ✅ 保持不变 |
| `render_markdown` | SC 全局设置 | ❌ 不考虑 | ⚠️ 可由 SC 的 render_component 处理 |
| `show_full_path` | SC 全局设置 | ❌ 不考虑 | ⚠️ 可由 SC 的 render_component 处理 |

---

## 7. 修改清单

1. ✅ **智能连接适配器（adapter）**
   - 改变参数命名：`skipBlocks` → `excludeBlocks`
   - 修正参数逻辑：只在 `excludeBlocks === true` 时添加 `skip_blocks: true`

2. ✅ **混合搜索函数（hybridSearch）**
   - 删除 `includeBlocks` 选项
   - 在函数中直接读取 SC 的 `smart_view_filter.exclude_blocks_from_source_connections`
   - 传递 `excludeBlocks` 给 lookupPipeline

3. ✅ **UI 层（at-trigger-popup）**
   - 不再传递 `includeBlocks` 选项
   - 让 hybridSearch 自己读取 SC 设置

4. ✅ **PluginSettings 类型**
   - 保留 `enableKnowledgeSearch`、`knowledgeTopK`、`knowledgeMinScore`
   - 删除任何关于块级结果的设置（由 SC 控制）

5. ✅ **默认值（defaults.ts）**
   - 对应更新 PluginSettings 的默认值
