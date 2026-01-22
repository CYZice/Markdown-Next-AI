## 🔑 Markdown-Next-AI 嵌入系统架构

本文档详细说明了 Markdown-Next-AI 中完全模仿 Smart Connections 的 Transformers.js 使用策略的实现。

---

## 📋 目录

1. [架构概览](#架构概览)
2. [核心组件](#核心组件)
3. [适配器系统](#适配器系统)
4. [运行时加载](#运行时加载)
5. [缓存机制](#缓存机制)
6. [配置说明](#配置说明)
7. [使用示例](#使用示例)

---

## 🏗️ 架构概览

### 关键设计原则

```
┌─────────────────────────────────────────────┐
│      EmbeddingService (单例)                 │
│   统一的嵌入服务接口                          │
└──────────────┬──────────────────────────────┘
               │
               ├──> 适配器选择
               │
    ┌──────────┼──────────┬────────────┐
    │          │          │            │
    ▼          ▼          ▼            ▼
Transformers  Ollama    OpenAI      Gemini
(本地/CDN)   (本地)    (云端)       (云端)
```

### 核心特性

✅ **不打包 Transformers.js**
- 运行时从 CDN 动态加载
- 插件体积维持在 ~1MB

✅ **模块化适配器系统**
- 统一的 `IEmbeddingAdapter` 接口
- 支持 4 种不同的嵌入后端
- 易于扩展新适配器

✅ **智能缓存策略**
- IndexedDB 持久化模型缓存
- 首次使用时从 HuggingFace 下载
- 后续使用直接从缓存加载

✅ **配置驱动**
- 在 `types.ts` 中定义配置类型
- `defaults.ts` 提供预设配置
- 用户可以灵活切换适配器

---

## 🔧 核心组件

### 1. EmbeddingService (嵌入服务)
**文件**: `src/services/embedding-service.ts`

统一入口，管理适配器生命周期：

```typescript
// 获取单个嵌入
const embedding = await EmbeddingService.getInstance()
    .getEmbedding(text, settings);

// 批量获取
const embeddings = await EmbeddingService.getInstance()
    .getEmbeddings(texts, settings);
```

### 2. EmbeddingAdapterFactory (工厂类)
**文件**: `src/services/embedding-adapter.ts`

负责创建、缓存和管理适配器：

```typescript
// 根据类型获取适配器
const adapter = await EmbeddingAdapterFactory.getAdapter(
    'transformers',
    settings
);

// 支持的适配器类型
type EmbedAdapterType = 'transformers' | 'ollama' | 'openai' | 'gemini';
```

### 3. ModelCacheManager (缓存管理)
**文件**: `src/services/model-cache.ts`

使用 IndexedDB 持久化存储：

```typescript
// 获取缓存
const cached = await ModelCacheManager.getInstance()
    .get('model-key');

// 设置缓存
await ModelCacheManager.getInstance()
    .set('model-key', data);

// 清空所有缓存
await ModelCacheManager.getInstance().clear();
```

### 4. ExternalModuleLoader (外部加载器)
**文件**: `src/services/external-loader.ts`

从 CDN 动态加载库，不打包：

```typescript
// 从 HuggingFace CDN 加载
const transformers = await ExternalModuleLoader
    .loadTransformers();

// 支持多个 CDN 源（自动降级）
// 1. HuggingFace CDN (首选)
// 2. unpkg CDN (备选)
// 3. Script 标签加载 (最后)
```

---

## 🎯 适配器系统

### IEmbeddingAdapter 接口
**定义**: `src/services/embedding-adapter.ts`

所有适配器必须实现：

```typescript
export interface IEmbeddingAdapter {
    readonly name: string;
    getEmbedding(text: string, settings: PluginSettings): Promise<number[] | null>;
    getEmbeddings(texts: string[], settings: PluginSettings): Promise<number[][] | null>;
    unload?(): Promise<void>;
    getModelInfo?(): any;
}
```

### 四种适配器实现

#### 1️⃣ Transformers 适配器 (推荐)
**文件**: `src/services/adapters/transformers-adapter.ts`

- **优点**: 本地运行，无 API 密钥需求，完全离线
- **缺点**: 首次加载较慢（需下载模型）
- **支持的模型**:
  - `TaylorAI/bge-micro-v2` (默认，最轻)
  - `Xenova/all-MiniLM-L6-v2` (更好的质量)
  
**加载流程**:
```
插件启动
  ↓
运行时需要嵌入时
  ↓
ExternalModuleLoader.loadTransformers()
  ↓
从 CDN 加载 transformers.js
  ↓
加载指定的模型
  ↓
缓存到 IndexedDB
  ↓
后续请求直接使用缓存
```

#### 2️⃣ Ollama 适配器
**文件**: `src/services/adapters/ollama-adapter.ts`

- **优点**: 本地运行，支持多种开源模型
- **缺点**: 需要用户运行 Ollama 服务
- **支持的模型**: 
  - `nomic-embed-text` (推荐)
  - 其他 Ollama 支持的模型

**使用前提**:
```bash
# 用户需要运行 Ollama 服务
ollama serve

# 在另一个终端下载模型
ollama pull nomic-embed-text
```

#### 3️⃣ OpenAI 适配器
**文件**: `src/services/adapters/openai-adapter.ts`

- **优点**: 高质量嵌入，维度自可配置
- **缺点**: 需要 API 密钥，有成本
- **支持的模型**:
  - `text-embedding-3-small` (成本低，快速)
  - `text-embedding-3-large` (质量最高)

**需要配置**:
```typescript
embedModel: {
    adapter: 'openai',
    modelKey: 'text-embedding-3-small',
    apiKey: 'sk-...'
}
```

#### 4️⃣ Gemini 适配器
**文件**: `src/services/adapters/gemini-adapter.ts`

- **优点**: Google 出品，质量好
- **缺点**: 需要 API 密钥
- **支持的模型**:
  - `text-embedding-004`

**需要配置**:
```typescript
embedModel: {
    adapter: 'gemini',
    modelKey: 'text-embedding-004',
    apiKey: 'AIzaSy...'
}
```

---

## ⚡ 运行时加载机制

### 为什么不打包 Transformers.js

```
传统方式 (打包):
┌──────────────────┐
│  插件代码   ~200KB  │
├──────────────────┤
│ transformers.js  │  <-- ~500KB-2MB!
│   + 依赖          │
└──────────────────┘
     总计: 1-2MB+ ❌

推荐方式 (外部加载):
┌──────────────────┐
│  插件代码   ~200KB  │   ✅ 最小化
├──────────────────┤
│  运行时加载器     │   ✅ 轻量
│  (指向 CDN)      │
└──────────────────┘
     总计: ~200KB
     按需从 CDN 加载 transformers.js
```

### 动态导入实现

```typescript
// src/services/external-loader.ts

// ✅ 这样会在运行时加载，不会被 esbuild 打包
const transformers = await import(
    'https://cdn-allow-origin.huggingface.co/transformers.js@3/dist/transformers.min.js'
);

// ❌ 这样会被打包进去
import { pipeline } from '@xenova/transformers';
```

### CDN 源优先级

1. **HuggingFace 官方 CDN** (首选)
   ```
   https://cdn-allow-origin.huggingface.co/transformers.js@3/dist/transformers.min.js
   ```

2. **unpkg CDN** (备选)
   ```
   https://unpkg.com/@xenova/transformers@3/dist/transformers.min.js
   ```

3. **Script 标签** (最后)
   ```html
   <script src="https://cdn-allow-origin.huggingface.co/transformers.js@3/dist/transformers.min.js"></script>
   ```

---

## 💾 缓存机制

### IndexedDB 缓存策略

```typescript
// 首次使用 - 下载模型
const embedder = await pipeline('feature-extraction', 'TaylorAI/bge-micro-v2');
// transformers.js 自动缓存到 IndexedDB

// 后续使用 - 直接从缓存加载
const embedder = await pipeline('feature-extraction', 'TaylorAI/bge-micro-v2');
// 速度快 ⚡
```

### 缓存配置

```typescript
// transformers.js 自动配置
env.cacheDir = 'transformers-cache';

// 用户可以清空缓存
await ModelCacheManager.getInstance().clear();
```

### 缓存文件位置

- 浏览器 IndexedDB
- 数据库名: `MardownNextAI-ModelCache`
- 存储名: `models`

---

## ⚙️ 配置说明

### 配置类型 (types.ts)

```typescript
/**
 * 嵌入模型配置接口
 * 支持多种嵌入后端的配置
 */
export interface EmbedModelConfig {
    /** 适配器类型：transformers | ollama | openai | gemini */
    adapter: EmbedAdapterType;
    
    /** 模型密钥（HuggingFace 模型、Ollama 模型名等）*/
    modelKey: string;
    
    /** 基础 URL（对于 ollama、openai 等 API 端点）*/
    baseUrl?: string;
    
    /** API 密钥（对于 openai、gemini 等）*/
    apiKey?: string;
    
    /** 遗留配置（向后兼容）*/
    legacyTransformers?: boolean;
}
```

### 默认配置 (defaults.ts)

```typescript
// 6 种预设配置可选
const DEFAULT_EMBED_CONFIGS = {
    'transformers-micro': {     // 最轻，推荐
        adapter: 'transformers',
        modelKey: 'TaylorAI/bge-micro-v2'
    },
    'transformers-small': {     // 更好的质量
        adapter: 'transformers',
        modelKey: 'Xenova/all-MiniLM-L6-v2'
    },
    'ollama-nomic': {           // 本地 Ollama
        adapter: 'ollama',
        modelKey: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434'
    },
    'openai-small': {           // OpenAI 经济版
        adapter: 'openai',
        modelKey: 'text-embedding-3-small'
    },
    'openai-large': {           // OpenAI 高质量
        adapter: 'openai',
        modelKey: 'text-embedding-3-large'
    },
    'gemini': {                 // Google Gemini
        adapter: 'gemini',
        modelKey: 'text-embedding-004'
    }
};
```

---

## 📚 使用示例

### 1. 使用默认配置（Transformers.js）

```typescript
import { EmbeddingService } from '@services/embedding-service';
import { DEFAULT_SETTINGS } from '@defaults';

// 获取嵌入
const embedding = await EmbeddingService.getInstance()
    .getEmbedding('你好世界', DEFAULT_SETTINGS);

// 输出: number[] (向量)
console.log(embedding);  // [0.123, 0.456, ...]
```

### 2. 切换到 OpenAI 适配器

```typescript
const settings = {
    ...DEFAULT_SETTINGS,
    embedModel: {
        adapter: 'openai',
        modelKey: 'text-embedding-3-small',
        apiKey: 'sk-...'
    }
};

const embedding = await EmbeddingService.getInstance()
    .getEmbedding('你好', settings);
```

### 3. 批量获取嵌入

```typescript
const texts = ['文本1', '文本2', '文本3'];
const embeddings = await EmbeddingService.getInstance()
    .getEmbeddings(texts, settings);

// 输出: number[][] (向量数组)
console.log(embeddings);  // [[0.1, 0.2, ...], [0.3, 0.4, ...], ...]
```

### 4. 切换到 Ollama（本地）

```typescript
// 前提: 用户已运行 ollama serve

const settings = {
    ...DEFAULT_SETTINGS,
    embedModel: {
        adapter: 'ollama',
        modelKey: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434'
    }
};

const embedding = await EmbeddingService.getInstance()
    .getEmbedding('文本', settings);
```

### 5. 获取适配器信息

```typescript
const adapterInfo = EmbeddingService.getInstance()
    .getAdapterInfo();

console.log(adapterInfo);
// {
//     type: 'transformers',
//     info: {
//         adapter: 'transformers',
//         modelKey: 'TaylorAI/bge-micro-v2',
//         isLoading: false,
//         hasEmbedder: true
//     }
// }
```

### 6. 清理资源

```typescript
// 卸载当前适配器
await EmbeddingService.getInstance().unload();

// 清空所有缓存
await EmbeddingService.cleanup();
```

---

## 🔄 完整流程示例

```typescript
// 1. 插件加载
const plugin = new MarkdownNextAI();

// 2. 用户启用知识搜索
const settings = {
    ...DEFAULT_SETTINGS,
    enableKnowledgeSearch: true,
    embedModel: DEFAULT_EMBED_CONFIGS['transformers-micro']
};

// 3. 首次调用嵌入服务
const embedding = await EmbeddingService.getInstance()
    .getEmbedding('查询文本', settings);

// 流程：
// - ExternalModuleLoader.loadTransformers() 从 CDN 下载 transformers.js
// - TransformersEmbeddingAdapter 加载模型 (IndexedDB 缓存)
// - 返回嵌入向量

// 4. 后续调用 (快速)
const embedding2 = await EmbeddingService.getInstance()
    .getEmbedding('另一个文本', settings);

// 流程：
// - 模型已在内存中
// - 直接生成嵌入向量 (毫秒级)

// 5. 插件卸载
await EmbeddingService.cleanup();
// - 释放内存
// - 关闭数据库连接
```

---

## 📊 性能对比

### 插件大小

| 方式 | 大小 | 是否包含 transformers.js |
|------|------|-------------------------|
| ❌ 打包 | 1-2MB+ | ✓ 是 |
| ✅ 外部加载 | ~200KB | ✗ 否 |
| **节省** | **80-90%** | - |

### 加载时间

| 场景 | 时间 | 说明 |
|------|------|------|
| 首次加载 transformers.js | 2-5s | 从 CDN 下载 ~500KB |
| 首次加载模型 | 3-10s | 从 HuggingFace 下载 ~50-100MB |
| 缓存命中 | <100ms | 从 IndexedDB 加载 |

### 内存使用

| 模型 | 内存 | 备注 |
|------|------|------|
| TaylorAI/bge-micro-v2 | ~50-100MB | 量化版本 |
| Xenova/all-MiniLM-L6-v2 | ~100-150MB | 较好的质量 |

---

## 🎓 最佳实践

### ✅ 推荐做法

1. **默认使用 Transformers** (本地，最轻)
2. **提供切换选项** (允许用户选择后端)
3. **缓存首次下载** (IndexedDB 加速)
4. **优雅降级** (CDN 不可用时提示)

### ❌ 避免做法

1. 不要打包 transformers.js
2. 不要在启动时加载模型
3. 不要忽视网络错误
4. 不要泄露 API 密钥

---

## 🚀 扩展新适配器

添加新的嵌入服务很简单：

### 1. 创建适配器类

```typescript
// src/services/adapters/my-adapter.ts
import type { IEmbeddingAdapter, PluginSettings } from '..';

export class MyEmbeddingAdapter implements IEmbeddingAdapter {
    readonly name = 'my-service';
    
    async getEmbedding(text: string, settings: PluginSettings): Promise<number[] | null> {
        // 实现你的逻辑
    }
    
    async getEmbeddings(texts: string[], settings: PluginSettings): Promise<number[][] | null> {
        // 批量实现
    }
}
```

### 2. 在工厂类中注册

```typescript
// src/services/embedding-adapter.ts
case 'my-service':
    try {
        const { MyEmbeddingAdapter } = await import('./adapters/my-adapter');
        adapter = new MyEmbeddingAdapter();
    } catch (error) {
        console.error('[EmbeddingFactory] Failed to load adapter:', error);
    }
    break;
```

### 3. 更新类型定义

```typescript
// src/types.ts
export type EmbedAdapterType = 'transformers' | 'ollama' | 'openai' | 'gemini' | 'my-service';
```

---

## 📖 相关文件结构

```
src/
├── services/
│   ├── embedding-service.ts          ← 统一入口
│   ├── embedding-adapter.ts          ← 工厂 & 接口
│   ├── model-cache.ts                ← IndexedDB 缓存
│   ├── external-loader.ts            ← CDN 加载器
│   └── adapters/
│       ├── transformers-adapter.ts   ← Transformers.js
│       ├── ollama-adapter.ts         ← Ollama API
│       ├── openai-adapter.ts         ← OpenAI API
│       └── gemini-adapter.ts         ← Gemini API
├── types.ts                          ← 类型定义
├── defaults.ts                       ← 默认配置
└── constants.ts
```

---

## 🔗 相关链接

- [Transformers.js 文档](https://xenova.github.io/transformers.js/)
- [HuggingFace 模型库](https://huggingface.co/models)
- [Ollama 官网](https://ollama.ai/)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [Google Gemini API](https://ai.google.dev/)
- [Smart Connections 项目](https://github.com/brianpetro/obsidian-smart-connections)

---

## ❓ 常见问题

### Q: 为什么首次加载很慢？
A: 需要从 HuggingFace 下载 50-100MB 的模型文件。可以提前在控制台显示进度提示。

### Q: 能否离线使用？
A: 使用 Transformers 或 Ollama 适配器可以完全离线。OpenAI/Gemini 需要网络。

### Q: 如何清空模型缓存？
A: 调用 `ModelCacheManager.getInstance().clear()`

### Q: 支持自定义模型吗？
A: 可以，在配置中指定任何 HuggingFace 上的模型 ID。

### Q: 多个用户同时使用会怎样？
A: 适配器是单例，缓存是共享的。IndexedDB 会自动处理并发访问。

---

**最后更新**: 2026-01-02
**维护者**: Markdown-Next-AI
