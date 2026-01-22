# 知识库检索到AI回答完整流程

## 概览

用户通过弹窗界面输入检索条件，调用 Smart Connections 插件进行语义检索，筛选结果后选择参考文件，最终将内容注入到 AI 上下文中。

---

## 详细流程

### 1. 用户输入检索条目（UI层）

**文件**: [src/ui/at-trigger-popup.ts](src/ui/at-trigger-popup.ts#L705)

**触发点**: 用户在弹窗的"知识库搜索"标签页中点击"搜索"按钮

```typescript
// 行 705: runKnowledgeSearch()
async runKnowledgeSearch(): Promise<void> {
    const queryText = this.knowledgeQueryInput?.value?.trim() || "";
    if (!queryText) {
        new Notice("请输入搜索关键词");
        return;
    }

    this.knowledgeQueryEl.addClass("markdown-next-ai-loading");
    try {
        const limit = this.plugin.settings.knowledgeTopK || 10;
        const selectedFolders = Array.from(this.selectedKnowledgeFolders || []);
        
        const options: HybridSearchOptions = {
            results_limit: limit,
            filters: { folders: selectedFolders.length > 0 ? selectedFolders : undefined }
        };

        // 🔹 关键调用：调用混合检索
        const results = await hybridSearch(this.app, queryText, options);
        
        this.knowledgeResults = results;
        this.currentKnowledgeOffset = results.length;
        this.renderKnowledgeResults();
    } catch (err) {
        console.error("Knowledge search failed:", err);
        new Notice("知识库搜索失败: " + err.message);
    } finally {
        this.knowledgeQueryEl.removeClass("markdown-next-ai-loading");
    }
}
```

**参数说明**:
- `queryText`: 用户输入的搜索关键词
- `results_limit`: 最多返回的结果数（来自设置 knowledgeTopK）
- `filters.folders`: 用户选择的文件夹过滤条件

---

### 2. 调用混合检索（包装层）

**文件**: [src/utils/hybrid-search.ts](src/utils/hybrid-search.ts#L18)

```typescript
// 行 18: hybridSearch()
export async function hybridSearch(
    app: App,
    query: string,
    options?: HybridSearchOptions
): Promise<SearchResult[]> {
    // 🔹 直接转发到 lookupPipeline
    return await lookupPipeline(app, {
        query,
        limit: options?.results_limit || 10,
        minScore: options?.min_score,
        filter: options?.filters
    });
}
```

**作用**: 简单的包装层，将参数格式转换后传递给 `lookupPipeline`

---

### 3. 检索流水线（核心逻辑）

**文件**: [src/utils/lookup-pipeline.ts](src/utils/lookup-pipeline.ts#L18)

```typescript
// 行 18: lookupPipeline()
export async function lookupPipeline(
    app: App,
    rawParams: LookupParams
): Promise<LookupResult[]> {
    const { query, limit = 10, minScore, filter } = rawParams;

    // 🔹 步骤1: 创建 Smart Connections 适配器
    const adapter = new SmartConnectionsAdapter(app);

    // 🔹 步骤2: 准备检索选项
    const options: SmartConnectionsLookupOptions = {
        limit,
        minScore,
        skipBlocks: true,
        folders: filter?.folders
    };

    // 🔹 步骤3: 调用 SC 的 lookup 方法
    const scResults = await adapter.lookup(query, options);

    // 🔹 步骤4: 转换结果格式
    return scResults.map(r => ({
        source: r.path,
        title: r.name || r.path,
        snippet: r.score.toFixed(3),
        score: r.score
    }));
}
```

**关键步骤**:
1. 创建 `SmartConnectionsAdapter` 实例
2. 准备检索参数（limit、minScore、folders过滤）
3. 调用 SC 插件的 `lookup` 方法
4. 将 SC 返回的结果格式转换为标准 `LookupResult` 格式

---

### 4. 调用 Smart Connections 的 lookup API（适配器层）

**文件**: [src/services/smart-connections-adapter.ts](src/services/smart-connections-adapter.ts#L45)

```typescript
// 行 45: SmartConnectionsAdapter.lookup()
async lookup(
    query: string,
    options?: SmartConnectionsLookupOptions
): Promise<SmartConnectionsResult[]> {
    const plugin = this.getSmartConnectionsPlugin();
    
    if (!plugin?.env?.smart_sources?.lookup) {
        throw new Error("Smart Connections 环境未正确加载");
    }

    // 🔹 构建 SC 原生查询参数
    const params: any = {
        hypotheticals: [query],  // SC 使用 hypotheticals 参数接收查询文本
        filter: {
            limit: options?.limit || 10
        },
        skip_blocks: options?.skipBlocks ?? true
    };

    // 🔹 添加文件夹过滤
    if (options?.folders && options.folders.length > 0) {
        params.filter.include = options.folders.map(f => `${f}/`);
    }

    // 🔹 关键调用：调用 SC 内部 API
    const results = await plugin.env.smart_sources.lookup(params);

    // 🔹 返回结果（已经是数组格式）
    return results || [];
}
```

**SC API 参数**:
- `hypotheticals`: 查询文本（数组格式）
- `filter.limit`: 返回结果数量
- `filter.include`: 包含的文件夹路径
- `skip_blocks`: 是否跳过块级检索（只返回文件级结果）

**返回格式**:
```typescript
[
    {
        path: "Documents/note.md",
        name: "note",
        score: 0.856
    },
    ...
]
```

---

### 5. Smart Connections 内部检索流程

**文件**: `obsidian-smart-connections-3.0.80/main.js` (编译产物)

#### 5.1 lookup 方法入口

```javascript
// smart_sources 集合的 lookup 方法
async lookup(filter) {
    const hypotheticals = filter.hypotheticals;
    const query_embed = await this.embed_model.embed(hypotheticals.join("\n"));
    
    // 调用 nearest 方法查找最相似的结果
    return await this.nearest(query_embed, filter);
}
```

#### 5.2 向量检索算法

```javascript
// nearest 方法：查找最相似的结果
async nearest(vec, filter = {}) {
    const { limit = 10 } = filter;
    const results_acc = new this.collection.results_acc_class();
    
    // 遍历所有已索引的源文件
    for (const key in this.items) {
        const item = this.items[key];
        if (!item.vec) continue;
        
        // 应用文件夹过滤
        if (filter.include && !filter.include.some(p => key.startsWith(p))) {
            continue;
        }
        
        // 🔹 核心算法：计算余弦相似度
        const sim = this.cos_sim(vec, item.vec);
        
        // 🔹 使用 Top-K 累加器管理结果
        results_acc.add({
            item: item,
            sim: sim,
            key: key
        });
    }
    
    // 返回 Top-K 结果（按相似度降序排列）
    return results_acc.get_top_k(limit).map(r => ({
        path: r.key,
        name: r.item.name,
        score: r.sim
    }));
}
```

#### 5.3 余弦相似度计算

```javascript
// cos_sim: 计算两个向量的余弦相似度
cos_sim(vec1, vec2) {
    let dot_product = 0;
    let norm_a = 0;
    let norm_b = 0;
    
    for (let i = 0; i < vec1.length; i++) {
        dot_product += vec1[i] * vec2[i];
        norm_a += vec1[i] * vec1[i];
        norm_b += vec2[i] * vec2[i];
    }
    
    return dot_product / (Math.sqrt(norm_a) * Math.sqrt(norm_b));
}
```

**算法说明**:
- **向量嵌入**: 使用 Transformers.js 加载 `TaylorAI/bge-micro-v2` 模型（384维）
- **相似度计算**: 余弦相似度公式 `cos(θ) = (A·B) / (||A|| × ||B||)`
- **结果排序**: 使用 Top-K 累加器（堆数据结构）维护最相似的 K 个结果
- **索引存储**: 向量索引保存在 `.smart-env/smart_sources.json`

---

### 6. 返回检索结果并渲染（UI层）

**文件**: [src/ui/at-trigger-popup.ts](src/ui/at-trigger-popup.ts#L830)

```typescript
// 行 830: renderKnowledgeResults()
renderKnowledgeResults(): void {
    const container = this.knowledgeResultsEl;
    if (!container) return;

    container.empty();
    if (!this.knowledgeResults || this.knowledgeResults.length === 0) {
        container.createEl("div", { text: "暂无结果", cls: "markdown-next-ai-empty" });
        return;
    }

    // 🔹 遍历检索结果，创建复选框列表
    this.knowledgeResults.forEach((result) => {
        const itemEl = container.createEl("label", { cls: "markdown-next-ai-knowledge-item" });
        
        // 创建复选框
        const checkbox = itemEl.createEl("input", { type: "checkbox" });
        const src = result.source;
        
        // 🔹 关键事件：监听复选框变化，更新选中状态
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                (this as any).selectedKnowledge.add(src);
            } else {
                (this as any).selectedKnowledge.delete(src);
            }
        });

        // 显示标题和路径
        const textEl = itemEl.createEl("span", { cls: "markdown-next-ai-knowledge-text" });
        textEl.createEl("div", { 
            text: result.title, 
            cls: "markdown-next-ai-knowledge-title" 
        });
        textEl.createEl("div", { 
            text: result.source, 
            cls: "markdown-next-ai-knowledge-path" 
        });
    });
}
```

**渲染效果**:
```
☐ 笔记标题
  Documents/note.md

☐ 另一个笔记
  Books/book.md
```

**selectedKnowledge**: `Set<string>` 类型，存储用户选中的文件路径

---

### 7. 用户选择参考文件

**操作**: 用户勾选感兴趣的文件复选框

**状态更新**:
```typescript
// 每次勾选/取消勾选都会更新 selectedKnowledge Set
selectedKnowledge = new Set<string>(); // 初始为空

// 用户勾选 "Documents/note.md"
selectedKnowledge.add("Documents/note.md");

// 用户勾选 "Books/book.md"
selectedKnowledge.add("Books/book.md");

// 最终 selectedKnowledge = Set { "Documents/note.md", "Books/book.md" }
```

---

### 8. 提取选中文件内容并提交给AI（核心转换）

**文件**: [src/ui/at-trigger-popup.ts](src/ui/at-trigger-popup.ts#L114)

```typescript
// 行 114: submit() - 用户点击"发送"按钮
async submit(): Promise<void> {
    const prompt = this.contextSelector?.getTextContent().trim() || "";
    await this.processInlineImages();
    const images = this.imageHandler.getImages();
    const modelId = this.modelSelectEl?.value || "";
    let contextContent = await this.getContextContent();
    
    // 🔹 关键步骤：合并知识库参考内容
    // 步骤1: 从检索结果中筛选出用户选中的文件
    const selectedKb = (this.knowledgeResults || []).filter(r => 
        (this as any).selectedKnowledge?.has?.(r.source)
    );
    
    // 步骤2: 将结果转换为上下文文本
    const kbCtx = resultsToContext(selectedKb);
    
    // 步骤3: 合并到现有上下文
    if (kbCtx) {
        contextContent = contextContent ? `${contextContent}\n\n${kbCtx}` : kbCtx;
    }

    if (!prompt && images.length === 0 && !contextContent) {
        new Notice("请输入续写要求或上传图片");
        return;
    }

    // 🔹 提交给 AI 服务
    this.onSubmit(prompt, images, modelId, contextContent, this.selectedText);
    this.close();
}
```

**resultsToContext 函数**:

**文件**: [src/utils/lookup-pipeline.ts](src/utils/lookup-pipeline.ts#L89)

```typescript
// 行 89: 将检索结果转换为上下文文本
export function resultsToContext(results: LookupResult[]): string {
    if (!results.length) return "";
    
    return results
        .map(r => `=== 参考: ${r.title} (${r.source}) ${r.snippet} ===`)
        .join("\n\n");
}
```

**转换示例**:
```typescript
// 输入：selectedKb
[
    { 
        title: "笔记标题", 
        source: "Documents/note.md", 
        snippet: "0.856" 
    },
    { 
        title: "另一个笔记", 
        source: "Books/book.md", 
        snippet: "0.743" 
    }
]

// 输出：kbCtx
`=== 参考: 笔记标题 (Documents/note.md) 0.856 ===

=== 参考: 另一个笔记 (Books/book.md) 0.743 ===`
```

**注意**: 当前实现只是将**文件路径和相似度分数**作为参考信息，**并未实际读取文件内容**。如果需要读取完整内容，可以修改 `resultsToContext` 函数：

```typescript
export async function resultsToContext(
    app: App, 
    results: LookupResult[]
): Promise<string> {
    if (!results.length) return "";
    
    const contexts = await Promise.all(
        results.map(async r => {
            const file = app.vault.getAbstractFileByPath(r.source);
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
                return `=== 参考: ${r.title} ===\n${content}`;
            }
            return `=== 参考: ${r.title} (${r.source}) ===`;
        })
    );
    
    return contexts.join("\n\n---\n\n");
}
```

---

### 9. AI 服务处理请求

**文件**: [src/ui/at-trigger-popup.ts](src/ui/at-trigger-popup.ts#L114) 

**回调函数**: `onSubmit` 在创建弹窗时由外部传入

**实际调用位置**: [src/main.ts](src/main.ts) 中的各个命令处理函数

**示例**（续写命令）:

```typescript
// main.ts: 处理 @ 触发的续写命令
this.addCommand({
    id: "continue-writing-at",
    name: "续写（@触发）",
    editorCallback: (editor: Editor, view: MarkdownView) => {
        const popup = new AtTriggerPopup(
            this.app,
            this,
            editor,
            (prompt, images, modelId, contextContent, selectedText) => {
                // 🔹 onSubmit 回调：实际发送到 AI
                this.aiService.continueWriting(
                    editor,
                    prompt,
                    images,
                    modelId,
                    contextContent  // ← 包含知识库参考的上下文
                );
            },
            "" // 续写模式没有预选文本
        );
        popup.open();
    }
});
```

**AI 服务最终接收到的上下文**:
```markdown
[用户选择的文件参考...]

=== 参考: 笔记标题 (Documents/note.md) 0.856 ===

=== 参考: 另一个笔记 (Books/book.md) 0.743 ===

[用户的续写要求...]
```

---

## 完整流程图

```
用户输入查询 "如何使用 Obsidian"
         ↓
runKnowledgeSearch() [at-trigger-popup.ts:705]
         ↓
hybridSearch(app, query, options) [hybrid-search.ts:18]
         ↓
lookupPipeline(app, params) [lookup-pipeline.ts:18]
         ↓
SmartConnectionsAdapter.lookup(query, options) [smart-connections-adapter.ts:45]
         ↓
plugin.env.smart_sources.lookup(params) [SC 内部 API]
         ↓
  ┌─────────────────────────────────────┐
  │ Smart Connections 内部处理流程       │
  │                                      │
  │ 1. embed_model.embed(query)         │
  │    → 使用 TaylorAI/bge-micro-v2     │
  │    → 生成 384 维向量                 │
  │                                      │
  │ 2. nearest(query_vec, filter)       │
  │    → 遍历 .smart-env/索引            │
  │    → 计算余弦相似度                  │
  │    → 应用文件夹过滤                  │
  │                                      │
  │ 3. results_acc.get_top_k(limit)     │
  │    → 返回 Top-10 最相似结果          │
  └─────────────────────────────────────┘
         ↓
返回结果: [{ path, name, score }, ...]
         ↓
renderKnowledgeResults() [at-trigger-popup.ts:830]
         ↓
展示复选框列表，用户勾选 2 个文件
         ↓
checkbox.change → selectedKnowledge.add(path)
         ↓
用户点击"发送"按钮
         ↓
submit() [at-trigger-popup.ts:114]
         ↓
resultsToContext(selectedKb) [lookup-pipeline.ts:89]
         ↓
合并到 contextContent
         ↓
onSubmit(prompt, images, modelId, contextContent, selectedText)
         ↓
aiService.continueWriting(..., contextContent) [main.ts]
         ↓
发送到 AI 提供商（OpenAI/Anthropic/...）
         ↓
AI 返回回答（基于知识库参考）
```

---

## 关键数据结构

### LookupResult (lookup-pipeline.ts)
```typescript
interface LookupResult {
    source: string;   // 文件路径，如 "Documents/note.md"
    title: string;    // 文件标题
    snippet: string;  // 相似度分数（格式化为字符串）
    score: number;    // 相似度分数（原始数值）
}
```

### SearchResult (hybrid-search.ts)
```typescript
type SearchResult = LookupResult; // 当前版本完全相同
```

### SmartConnectionsResult (smart-connections-adapter.ts)
```typescript
interface SmartConnectionsResult {
    path: string;     // SC 返回的文件路径
    name: string;     // 文件名称
    score: number;    // 相似度分数
}
```

### selectedKnowledge (at-trigger-popup.ts)
```typescript
// 用户选中的文件路径集合
selectedKnowledge: Set<string> = new Set();

// 示例：
// Set { "Documents/note.md", "Books/book.md" }
```

---

## 配置项

### 插件设置 (defaults.ts)
```typescript
interface PluginSettings {
    enableKnowledgeSearch: boolean;  // 是否启用知识库检索（需验证 SC 插件）
    knowledgeTopK: number;           // 最多返回结果数（默认 10）
    knowledgeMinScore: number;       // 最低相似度阈值（默认 0.5）
}
```

### Smart Connections 依赖验证 (settings.ts)
```typescript
// 用户启用知识库检索时自动验证
if (value) {
    const scPlugin = app.plugins?.plugins?.['smart-connections'];
    
    // 检查1: 插件是否已安装
    if (!scPlugin) {
        new Notice('❌ 未检测到 Smart Connections 插件');
        return false;
    }
    
    // 检查2: 版本是否 >= 3.0.80
    const version = scPlugin.manifest?.version;
    if (!isVersionValid(version, '3.0.80')) {
        new Notice('❌ Smart Connections 版本过低，需要 >= 3.0.80');
        return false;
    }
    
    // 检查3: env 环境是否已加载
    if (!scPlugin.env?.smart_sources?.lookup) {
        new Notice('❌ Smart Connections 未正确初始化');
        return false;
    }
}
```

---

## 优化建议

### 当前限制
目前 `resultsToContext` 只返回**文件路径和相似度**，未读取实际内容，AI 可能无法充分利用参考信息。

### 改进方案
修改 [src/utils/lookup-pipeline.ts](src/utils/lookup-pipeline.ts#L89):

```typescript
export async function resultsToContext(
    app: App,
    results: LookupResult[]
): Promise<string> {
    if (!results.length) return "";
    
    const contexts = await Promise.all(
        results.map(async (r) => {
            const file = app.vault.getAbstractFileByPath(r.source);
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
                // 可选：限制长度避免上下文过长
                const truncated = content.length > 2000 
                    ? content.slice(0, 2000) + "..." 
                    : content;
                return `=== 参考: ${r.title} (相似度: ${r.snippet}) ===\n${truncated}`;
            }
            return `=== 参考: ${r.title} (${r.source}) ===\n[无法读取文件内容]`;
        })
    );
    
    return contexts.join("\n\n---\n\n");
}
```

**注意**:
1. 需要在调用点传入 `app` 参数
2. 建议限制单个文件内容长度（如 2000 字符）
3. 需要导入 `TFile` 类型：`import { TFile } from "obsidian";`

### 调用点修改
[src/ui/at-trigger-popup.ts](src/ui/at-trigger-popup.ts#L122):

```typescript
// 原来：
const kbCtx = resultsToContext(selectedKb);

// 改为：
const kbCtx = await resultsToContext(this.app, selectedKb);
```

---

## 总结

整个流程展示了一个典型的**语义检索增强生成（RAG）**架构：

1. **向量化**: Smart Connections 使用 Transformers.js 将文档和查询转换为向量
2. **检索**: 通过余弦相似度查找最相关的文档
3. **筛选**: 用户从结果中选择真正需要的参考
4. **增强**: 将参考信息注入到 AI 上下文中
5. **生成**: AI 基于参考内容生成更准确的回答

**核心优势**:
- 复用成熟的 Smart Connections 检索能力
- 减少代码维护成本（~200 行）
- 用户可以手动筛选参考，避免无关信息干扰

**依赖风险**:
- Smart Connections 内部 API 可能在未来版本变化
- 需要通过版本检查和错误处理降低风险
