# Smart Lookup 与 Markdown-Next-AI 检索对比

## 核心差异分析

### 1. 参数构建方式

#### Smart Lookup (SC官方)
**文件**: `obsidian-smart-connections-3.0.80/src/components/lookup.js`

```javascript
export const get_lookup_params = (query, settings, filter) => {
  const skip_blocks = settings.smart_view_filter?.exclude_blocks_from_source_connections;
  return {
    hypotheticals: [query],
    filter,
    ...(skip_blocks ? { skip_blocks: true } : {}),  // ⚠️ 条件性添加
  };
};
```

**关键特性**:
- ✅ 使用 `smart_view_filter?.exclude_blocks_from_source_connections` 设置
- ✅ **只在为 true 时才添加** `skip_blocks: true`（不添加时默认包含块）
- ✅ 接收 `settings` 对象，读取用户全局设置
- ✅ 支持外部 `filter` 覆盖

#### Markdown-Next-AI (当前实现)
**文件**: `src/services/smart-connections-adapter.ts`

```typescript
async lookup(query: string, options: {...}) {
    const params: SmartConnectionsLookupParams = {
        hypotheticals: [query],
        filter: {
            limit: options.limit || 10,
        },
        skip_blocks: options.skipBlocks ?? true,  // ⚠️ 默认总是 true
    };
    // ...
}
```

**问题**:
- ❌ 硬编码 `skip_blocks: true`（默认跳过所有块）
- ❌ 没有读取 SC 的全局设置 `smart_view_filter`
- ❌ 没有考虑用户在 SC 中的块级结果偏好

---

### 2. 关键参数对比

| 参数 | Smart Lookup | Markdown-Next-AI | 影响 |
|-----|----------|---------|------|
| `hypotheticals` | `[query]` | `[query]` | ✅ 相同 |
| `skip_blocks` | 条件性添加* | 默认 `true` | ❌ **不同** |
| `filter.limit` | 由外部传入 | 硬编码 10-20 | ⚠️ 可能不同 |
| `filter` 结构 | 完整传递 | 简化版本 | ⚠️ 可能缺少选项 |
| **settings** | ✅ 使用全局设置 | ❌ 不使用 | ❌ **关键差异** |

*Smart Lookup 中，如果 `exclude_blocks_from_source_connections` 为 `false`（允许块），则不添加 `skip_blocks`，这样默认行为是包含块级结果。

---

### 3. 调用流程对比

#### Smart Lookup 流程
```
用户输入查询
    ↓
render_lookup(query, results_container)
    ↓
get_lookup_params(query, collection.env.settings, opts.filter)
    ↓ 构建参数时读取：
    ├─ smart_view_filter.exclude_blocks_from_source_connections （用户在 SC 设置中的选择）
    ├─ 条件添加 skip_blocks（只在用户选择排除块时）
    └─ opts.filter （传入的自定义过滤）
    ↓
collection.lookup(params)  ← SC 内部 lookup
    ↓
渲染结果
```

#### Markdown-Next-AI 流程
```
用户输入查询
    ↓
runKnowledgeSearch()
    ↓
hybridSearch(app, queryText, options)
    ↓
lookupPipeline(app, rawParams)
    ↓
adapter.lookup(query, {
    limit: ...,
    skipBlocks: true,  ← 硬编码
    includeFilter: ...
})
    ↓
plugin.env.smart_sources.lookup(params)
    ↓
renderKnowledgeResults()
```

---

## 检索结果不同的原因

### 原因 1: `skip_blocks` 参数差异（最重要）

```javascript
// Smart Lookup - 尊重用户设置
if (exclude_blocks_from_source_connections === true) {
    params.skip_blocks = true;  // 排除块
} else {
    // 不添加 skip_blocks，默认包含块
}

// Markdown-Next-AI - 强制排除所有块
skip_blocks: true  // 总是排除块！
```

**结果**:
- Smart Lookup: 可能返回 **文件 + 块** 的混合结果
- Markdown-Next-AI: 只返回 **文件级结果**（块被过滤掉）

### 原因 2: 未读取 Smart Connections 全局设置

SC 中的这些设置会影响检索：

```javascript
smart_view_filter: {
    exclude_blocks_from_source_connections: false,  // 用户可能允许块
    render_markdown: true,
    show_full_path: false,
}
```

**Markdown-Next-AI 完全忽略了这些设置！**

### 原因 3: filter 结构可能不同

Smart Lookup 中的 `filter` 参数可能包含更多信息：
```javascript
{
    limit: 10,
    include_filter?: "folder1,folder2",
    exclude_filter?: "Templates,Archive",
    // ... 其他 SC 内部参数
}
```

而我们的实现使用的是：
```typescript
{
    limit: 10,
    include_filter?: "folder1,folder2"
}
```

---

## 解决方案

### 方案 1: 读取 Smart Connections 全局设置（推荐）

修改 `smart-connections-adapter.ts`:

```typescript
async lookup(query: string, options: {...}) {
    const plugin = this.getPlugin();
    
    // ✅ 读取 SC 的全局设置
    const scSettings = plugin.env.settings;
    const exclude_blocks = scSettings?.smart_view_filter?.exclude_blocks_from_source_connections ?? false;
    
    const params: SmartConnectionsLookupParams = {
        hypotheticals: [query],
        filter: {
            limit: options.limit || 10,
        },
        // ✅ 只在用户设置为 true 时才添加 skip_blocks
        ...(exclude_blocks ? { skip_blocks: true } : {}),
    };
    
    if (options.includeFilter) {
        params.filter!.include_filter = options.includeFilter;
    }
    if (options.excludeFilter) {
        params.filter!.exclude_filter = options.excludeFilter;
    }
    
    try {
        const results = await plugin.env.smart_sources.lookup(params);
        return results || [];
    } catch (e) {
        console.error('[SmartConnectionsAdapter] Lookup failed:', e);
        return [];
    }
}
```

### 方案 2: 向用户暴露块级结果选项

修改 `at-trigger-popup.ts`:

```typescript
async runKnowledgeSearch(): Promise<void> {
    const queryText = this.knowledgeQueryInput?.value?.trim() || "";
    if (!queryText) {
        new Notice("请输入搜索关键词");
        return;
    }

    const options: HybridSearchOptions = {
        results_limit: this.plugin.settings.knowledgeTopK || 10,
        // ✅ 新增选项：允许用户选择是否包含块级结果
        includeBlocks: this.plugin.settings.knowledgeIncludeBlocks ?? false,
        folders: Array.from(this.selectedKnowledgeFolders || [])
    };

    const results = await hybridSearch(this.app, queryText, options);
    // ...
}
```

修改 `settings.ts` 添加设置：

```typescript
enableKnowledgeSearch: boolean;
knowledgeTopK: number;
knowledgeMinScore: number;
knowledgeIncludeBlocks: boolean;  // ✅ 新增
```

### 方案 3: 完全同步 Smart Lookup 的参数构建

提取 SC 的 `get_lookup_params` 逻辑到我们的适配器中。

---

## 调试建议

要诊断具体差异，添加以下日志：

```typescript
// 在 lookup-pipeline.ts 中
console.log('[LookupPipeline] Query params:', {
    query,
    skipBlocks: !rawParams.includeBlocks,
    limit: rawParams.results_limit,
    folders: rawParams.folders
});

// 在 smart-connections-adapter.ts 中  
console.log('[SmartConnectionsAdapter] Full params:', params);

// 查看 SC 设置
const plugin = this.getPlugin();
console.log('[SmartConnectionsAdapter] SC settings:', {
    exclude_blocks: plugin.env.settings?.smart_view_filter?.exclude_blocks_from_source_connections,
    all_settings: plugin.env.settings
});
```

---

## 总结

**最根本的差异**: 
- **Smart Lookup** 根据 **用户的全局偏好** 动态构建参数
- **Markdown-Next-AI** **硬编码参数**，不尊重用户在 SC 中的设置

**立即修复**: 改为读取 SC 的 `smart_view_filter.exclude_blocks_from_source_connections` 设置，只在必要时添加 `skip_blocks: true`。
