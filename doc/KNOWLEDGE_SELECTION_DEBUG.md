# 知识库数据流调试工具

## 快速调试清单

使用以下代码片段在各个关键位置添加日志，快速诊断数据流问题。

---

## 1️⃣ 知识库浮窗 - 勾选和确认阶段

**文件**: `src/ui/knowledge-results-floating-window.ts`

### 调试点 1a：injectSelectionCheckboxes()
```typescript
private injectSelectionCheckboxes(listEl: HTMLElement): void {
    listEl.querySelectorAll(".search-result").forEach((element) => {
        const path = element.getAttribute("data-path");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.selectedKnowledge.has(path);
        
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                this.selectedKnowledge.add(path);
                console.log("✅ [KB] 已勾选:", path);  // 调试日志
                console.log("📊 [KB] 当前选中数量:", this.selectedKnowledge.size);  // 调试日志
            } else {
                this.selectedKnowledge.delete(path);
                console.log("❌ [KB] 已取消勾选:", path);  // 调试日志
            }
        });
        
        element.insertBefore(checkbox, element.firstChild);
    });
}
```

### 调试点 1b：confirmSelection()
```typescript
private confirmSelection(): void {
    const selectedResults = this.knowledgeResults.filter(r =>
        this.selectedKnowledge.has(r.item?.path)
    );

    console.log("📤 [KB] 确认选择，选中结果:", selectedResults);  // 调试日志
    console.log("📤 [KB] 选中结果数量:", selectedResults.length);  // 调试日志
    console.log("📤 [KB] 选中文件路径:", selectedResults.map(r => r.item?.path));  // 调试日志

    if (this.onSelectCallback) {
        this.onSelectCallback(selectedResults);
    }

    new Notice(`已选择 ${selectedResults.length} 个结果`);
    this.close();
}
```

---

## 2️⃣ AtTriggerPopup - 接收和转换阶段

**文件**: `src/ui/at-trigger-popup.ts`

### 调试点 2a：openKnowledgeSearchWindow() - 回调设置
```typescript
openKnowledgeSearchWindow(): void {
    this.knowledgeResultsWindow = new KnowledgeResultsFloatingWindow(this.app, position);

    this.knowledgeResultsWindow.setOnSelect((results: SmartConnectionsResult[]) => {
        console.log("📥 [Popup] 收到选择回调，结果数:", results.length);  // 调试日志
        console.log("📥 [Popup] 结果详情:", results.map(r => ({
            path: r.item?.path,
            score: r.score
        })));  // 调试日志
        
        this.knowledgeResults = results;
        this.selectedKnowledge = new Set(results.map(r => r.item?.path).filter(Boolean));

        console.log("💾 [Popup] 已保存到本地状态");  // 调试日志
        this.updateContextDisplay();
    });

    this.knowledgeResultsWindow.open();
}
```

### 调试点 2b：handleSubmit() - 转换和传递
```typescript
private async handleSubmit(): Promise<void> {
    let contextContent = await this.getContextContent();
    console.log("📝 [Popup] 初始上下文内容长度:", contextContent?.length || 0);  // 调试日志
    
    // 合并用户选择的知识库参考
    const selectedKb = (this.knowledgeResults || []).filter(r => 
        this.selectedKnowledge.has(r.item?.path)
    );
    
    console.log("🔍 [Popup] 过滤后的知识库结果数:", selectedKb.length);  // 调试日志
    console.log("🔍 [Popup] 知识库结果:", selectedKb.map(r => ({
        path: r.item?.path,
        score: r.score
    })));  // 调试日志
    
    const kbCtx = scResultsToContext(selectedKb as any);
    console.log("📄 [Popup] 转换后的知识库文本:\n", kbCtx);  // 调试日志
    
    if (kbCtx) {
        contextContent = contextContent 
            ? `${contextContent}\n\n${kbCtx}` 
            : kbCtx;
    }
    
    console.log("📋 [Popup] 最终上下文内容长度:", contextContent?.length || 0);  // 调试日志
    console.log("📋 [Popup] 最终上下文内容:\n", contextContent);  // 调试日志

    if (!prompt && images.length === 0 && !contextContent) {
        new Notice("请输入续写要求或上传图片");
        return;
    }

    console.log("✉️ [Popup] 调用 onSubmit，参数:");  // 调试日志
    console.log("  - prompt:", prompt);
    console.log("  - images:", images.length);
    console.log("  - modelId:", modelId);
    console.log("  - contextContent长度:", contextContent?.length);
    console.log("  - selectedText:", this.selectedText);
    
    this.onSubmit(prompt, images, modelId, contextContent, this.selectedText);
}
```

---

## 3️⃣ main.ts - 主程序处理阶段

**文件**: `src/main.ts`

### 调试点 3a：handleContinueWriting() - 接收和处理
```typescript
async handleContinueWriting(
    prompt: string = "",
    images: ImageData[] = [],
    modelId: string | null = null,
    context: string | null = null,
    selectedText: string = ""
): Promise<void> {
    console.log("📨 [Main] handleContinueWriting 接收参数:");  // 调试日志
    console.log("  - prompt:", prompt);
    console.log("  - context 长度:", context?.length || 0);
    console.log("  - context 内容:", context);
    
    // ... 其他代码 ...
    
    try {
        let injectedContext = context || "";
        console.log("🔄 [Main] 初始 injectedContext:", injectedContext.substring(0, 100) + "...");  // 调试日志
        
        if (this.settings.enableKnowledgeSearch && (!context || !context.trim())) {
            console.log("🤖 [Main] 启用自动知识库注入");  // 调试日志
            const query = prompt && prompt.trim() ? prompt : (selectedText || "");
            if (query) {
                const results = await hybridSearch(this.app, query, {
                    results_limit: this.settings.knowledgeTopK || 5
                });
                console.log("🤖 [Main] 自动搜索返回结果数:", results.length);  // 调试日志
                const ctx = resultsToContext(results);
                if (ctx) injectedContext = injectedContext ? `${injectedContext}\n\n${ctx}` : ctx;
            }
        }
        
        console.log("📤 [Main] 最终 injectedContext 长度:", injectedContext.length);  // 调试日志
        console.log("📤 [Main] 最终 injectedContext:\n", injectedContext);  // 调试日志
        
        const result = await this.aiService.sendRequest(
            "continue",
            {
                selectedText: selectedText,
                beforeText: editor.getValue().substring(0, editor.posToOffset(insertPos)),
                afterText: "",
                cursorPosition: cursor,
                additionalContext: injectedContext || undefined
            },
            prompt,
            images,
            [],
            (streamData) => { /* ... */ }
        );
        // ... rest of function ...
    } catch (error) {
        // ... error handling ...
    }
}
```

---

## 4️⃣ ai-service.ts - AI 服务处理阶段

**文件**: `src/services/ai-service.ts`

### 调试点 4a：sendRequest() - 上下文注入
```typescript
async sendRequest(
    mode: string,
    context: TextContext,
    prompt: string = "",
    images: ImageData[] = [],
    chatHistory: ChatMessage[] = [],
    onStream: ((data: { ... }) => void) | null = null
): Promise<{ ... }> {
    console.log("🚀 [AI] sendRequest 调用，mode:", mode);  // 调试日志
    console.log("🚀 [AI] context.additionalContext 长度:", context.additionalContext?.length || 0);  // 调试日志
    
    // ... 构建 userPrompt ...
    
    // 添加额外上下文
    if (context.additionalContext && context.additionalContext.trim()) {
        console.log("📎 [AI] 发现 additionalContext，长度:", context.additionalContext.length);  // 调试日志
        console.log("📎 [AI] additionalContext 内容:\n", context.additionalContext.substring(0, 200) + "...");  // 调试日志
        
        userPrompt += `\n\n【重要提示：以下是参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.additionalContext}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
    }

    if (context.contextContent && context.contextContent.trim()) {
        console.log("📎 [AI] 发现 contextContent，长度:", context.contextContent.length);  // 调试日志
        userPrompt += `\n\n【重要提示：以下是参考的文档内容，请务必基于这些内容进行回复，不得忽略】\n\n=== 必读参考文档 ===\n${context.contextContent}\n=== 参考文档结束 ===\n\n【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】`;
    }

    console.log("✏️ [AI] 最终 userPrompt 长度:", userPrompt.length);  // 调试日志
    console.log("✏️ [AI] 最终 userPrompt (前 300 字):\n", userPrompt.substring(0, 300) + "...");  // 调试日志
    
    const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt }
    ];

    // ... 添加聊天历史 ...
    
    messages.push({
        role: "user",
        content: userPrompt
    });

    console.log("📮 [AI] 构建的 messages 数组:");  // 调试日志
    console.log("  - 消息数:", messages.length);
    console.log("  - system 消息长度:", messages[0].content.length);
    console.log("  - user 消息长度:", messages[messages.length - 1].content.length);
    console.log("  - user 消息内容 (前 200 字):", messages[messages.length - 1].content.substring(0, 200) + "...");
    
    // ... rest of function ...
}
```

---

## 完整日志检查顺序

按以下顺序检查日志输出，快速定位问题：

1. **知识库浮窗**：
   ```
   ✅ [KB] 已勾选: Essays/第一篇笔记.md
   📊 [KB] 当前选中数量: 1
   📤 [KB] 确认选择，选中结果: [...]
   ```

2. **AtTriggerPopup**：
   ```
   📥 [Popup] 收到选择回调，结果数: 1
   🔍 [Popup] 过滤后的知识库结果数: 1
   📄 [Popup] 转换后的知识库文本: === 参考: 第一篇笔记 ...
   📋 [Popup] 最终上下文内容长度: 150
   ✉️ [Popup] 调用 onSubmit...
   ```

3. **main.ts**：
   ```
   📨 [Main] handleContinueWriting 接收参数: context 长度: 150
   📤 [Main] 最终 injectedContext 长度: 150
   ```

4. **ai-service.ts**：
   ```
   🚀 [AI] sendRequest 调用
   📎 [AI] 发现 additionalContext，长度: 150
   ✏️ [AI] 最终 userPrompt 长度: 500+
   📮 [AI] 构建的 messages 数组: user 消息长度: 500+
   ```

---

## 快速诊断流程图

```
知识库内容是否被传递?
  ↓
  ├─ 日志显示 "📤 [KB] 确认选择" ? 
  │   ├─ YES → 勾选工作正常，检查下一步
  │   └─ NO → 问题在 knowledge-results-floating-window.ts
  │
  ├─ 日志显示 "📥 [Popup] 收到选择回调" ?
  │   ├─ YES → 回调正常，检查下一步
  │   └─ NO → 问题在 at-trigger-popup.ts 的回调设置
  │
  ├─ 日志显示 "📄 [Popup] 转换后的知识库文本" ?
  │   ├─ YES → 转换正常，检查下一步
  │   └─ NO → 问题在 scResultsToContext() 或过滤逻辑
  │
  ├─ 日志显示 "📨 [Main] handleContinueWriting 接收参数: context" ?
  │   ├─ YES → 参数传递正常，检查下一步
  │   └─ NO → 问题在 at-trigger-popup.ts 的 onSubmit 调用
  │
  ├─ 日志显示 "📎 [AI] 发现 additionalContext" ?
  │   ├─ YES → AI 服务接收正常，检查下一步
  │   └─ NO → context 在 handleContinueWriting 中丢失
  │
  └─ 日志显示 "✏️ [AI] 最终 userPrompt" 包含知识库内容 ?
      ├─ YES → 数据流完整，问题可能在 AI 模型或 prompt 工程
      └─ NO → 问题在 ai-service.ts 的 userPrompt 构建
```

---

## 性能监控日志

### 添加到 handleSubmit()：
```typescript
const startTime = performance.now();
const selectedKb = (this.knowledgeResults || []).filter(r => 
    this.selectedKnowledge.has(r.item?.path)
);
const kbCtx = scResultsToContext(selectedKb as any);
const endTime = performance.now();
console.log(`⏱️ [Perf] 知识库处理耗时: ${endTime - startTime}ms`);
console.log(`📊 [Perf] 知识库项数: ${selectedKb.length}`);
console.log(`📊 [Perf] 结果文本大小: ${kbCtx.length} 字节`);
```

### 添加到 sendRequest()：
```typescript
const messageTime = performance.now();
const requestBody = { /* ... */ };
console.log(`📦 [Perf] 请求体大小: ${JSON.stringify(requestBody).length} 字节`);
console.log(`⏱️ [Perf] 消息构建耗时: ${performance.now() - messageTime}ms`);
```
