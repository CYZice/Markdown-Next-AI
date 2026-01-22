# 知识库选择数据流可视化

## 完整流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 用户交互层                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

1. 知识库浮窗 (KnowledgeResultsFloatingWindow)
   ├─ 显示检索结果
   ├─ 注入复选框 (injectSelectionCheckboxes)
   │  └─ 监听 checkbox change 事件
   │     ├─ checked → selectedKnowledge.add(path)
   │     └─ unchecked → selectedKnowledge.delete(path)
   └─ 用户点击"确认选择"按钮
      └─ confirmSelection()
         ├─ 过滤选中结果: selectedResults = knowledgeResults.filter(...)
         ├─ 触发回调: onSelectCallback(selectedResults)
         └─ 关闭浮窗

┌─────────────────────────────────────────────────────────────────────────────┐
│ UI 逻辑层 (at-trigger-popup.ts)                                             │
└─────────────────────────────────────────────────────────────────────────────┘

2. AtTriggerPopup.openKnowledgeSearchWindow()
   └─ 创建 KnowledgeResultsFloatingWindow
      └─ setOnSelect((results) => {
           this.knowledgeResults = results;
           this.selectedKnowledge = new Set(...);
         })

3. 用户填写提示词并点击"提交"
   └─ handleSubmit()
      ├─ getContextContent()  // 获取手动输入的上下文
      ├─ 过滤知识库结果:
      │  selectedKb = knowledgeResults.filter(r => 
      │      selectedKnowledge.has(r.item?.path)
      │  )
      ├─ 转换为文本格式:
      │  kbCtx = scResultsToContext(selectedKb)
      │  格式:
      │    === 参考: filename (path/to/file.md) [相似度: 0.95] ===
      │    === 参考: filename2 (path/to/file2.md) [相似度: 0.87] ===
      ├─ 合并上下文:
      │  contextContent = contextContent ? 
      │    `${contextContent}\n\n${kbCtx}` : kbCtx
      └─ 调用回调:
         onSubmit(prompt, images, modelId, contextContent, selectedText)
                                         ↓
                                    知识库内容已包含

┌─────────────────────────────────────────────────────────────────────────────┐
│ 主程序逻辑层 (main.ts)                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

4. showAtTriggerModal(selectedText)
   └─ new AtTriggerPopup(
        this.app,
        (prompt, images, modelId, context, selectedText) => {
            // context = 知识库内容 + 其他上下文
            this.handleContinueWriting(
                prompt, 
                images, 
                modelId, 
                context,        // ← 知识库内容在这里
                selectedText
            );
        },
        ...
      )

5. handleContinueWriting(prompt, images, modelId, context, selectedText)
   ├─ 获取编辑器上下文
   ├─ 处理可选的自动知识库注入 (如果 enableKnowledgeSearch)
   │  let injectedContext = context || "";
   │  if (enableKnowledgeSearch && !context) {
   │      // 自动搜索并注入
   │      const results = await hybridSearch(...);
   │      const ctx = resultsToContext(results);
   │      injectedContext = ctx;
   │  }
   │  最终: injectedContext 包含用户选择的知识库内容
   └─ 调用 AI 服务:
      aiService.sendRequest(
          "continue",
          {
              selectedText,
              beforeText,
              afterText,
              cursorPosition,
              additionalContext: injectedContext  // ← 知识库内容传入
          },
          prompt,
          images,
          [],
          onStream
      )

┌─────────────────────────────────────────────────────────────────────────────┐
│ AI 服务层 (ai-service.ts)                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

6. sendRequest(mode, context, prompt, ...)
   ├─ 构建系统提示词和用户提示词
   ├─ 添加知识库内容到用户提示词:
   │  if (context.additionalContext && context.additionalContext.trim()) {
   │      userPrompt += `\n\n【重要提示：以下是参考的文档内容...】
   │                     \n\n=== 必读参考文档 ===
   │                     \n${context.additionalContext}
   │                     \n=== 参考文档结束 ===
   │                     \n\n【请确保你的回复完全基于上述文档内容...】`;
   │  }
   ├─ 构建消息数组:
   │  messages = [
   │      { role: "system", content: systemPrompt },
   │      ... 聊天历史 ...
   │      { role: "user", content: userPrompt }  // ← 包含知识库内容
   │  ]
   └─ 调用 API:
      POST /chat/completions
      {
          model: config.model,
          messages: messages,  // 包含知识库参考内容
          temperature: 0.7,
          max_tokens: ...,
          stream: true
      }

7. API 响应处理
   ├─ 流式读取响应数据
   ├─ 执行回调: onStream({ content, thinking, fullContent, isComplete })
   └─ 返回结果给 handleContinueWriting

┌─────────────────────────────────────────────────────────────────────────────┐
│ 结果处理                                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

8. 在编辑器中显示或预览生成的内容
   ├─ 内容已基于知识库参考内容生成
   ├─ 用户可以"替换"、"放弃"或"追加"
   └─ 最终内容根据用户选择插入编辑器
```

## 数据格式示例

### 知识库选择的原始数据格式（SC 结果对象）
```typescript
selectedResults: [
    {
        item: {
            path: "Essays/第一篇笔记.md",
            key: "第一篇笔记",
            // ... 其他 SC 属性
        },
        score: 0.95,
        hypothetical_i: 0
    },
    {
        item: {
            path: "Research/关键研究.md",
            key: "关键研究",
        },
        score: 0.87,
        hypothetical_i: 0
    }
]
```

### 转换后的文本格式（传递给 AI）
```
=== 参考: 第一篇笔记 (Essays/第一篇笔记.md) [相似度: 95.0%] ===

=== 参考: 关键研究 (Research/关键研究.md) [相似度: 87.0%] ===
```

### 最终注入到 API 的完整提示词
```
...其他上下文...

【重要提示：以下是参考的文档内容，请务必基于这些内容进行回复，不得忽略】

=== 必读参考文档 ===
=== 参考: 第一篇笔记 (Essays/第一篇笔记.md) [相似度: 95.0%] ===
=== 参考: 关键研究 (Research/关键研究.md) [相似度: 87.0%] ===
=== 参考文档结束 ===

【请确保你的回复完全基于上述文档内容，必须引用和使用文档中的信息】
```

## 数据检查点

### ✅ 检查点 1：知识库浮窗
- 位置：`knowledge-results-floating-window.ts` 第 261-263 行
- 验证：`selectedKnowledge` Set 中包含已勾选的文件路径

### ✅ 检查点 2：回调触发
- 位置：`knowledge-results-floating-window.ts` 第 352-356 行
- 验证：`selectedResults` 数组包含过滤后的结果对象

### ✅ 检查点 3：UI 层接收
- 位置：`at-trigger-popup.ts` 第 734-737 行
- 验证：`this.knowledgeResults` 包含传入的结果

### ✅ 检查点 4：文本转换
- 位置：`at-trigger-popup.ts` 第 125-128 行
- 验证：`contextContent` 包含格式化后的知识库文本

### ✅ 检查点 5：参数传递
- 位置：`at-trigger-popup.ts` 第 136 行
- 验证：`onSubmit()` 第 4 个参数包含知识库内容

### ✅ 检查点 6：主程序处理
- 位置：`main.ts` 第 614 行
- 验证：`additionalContext: injectedContext` 包含知识库内容

### ✅ 检查点 7：AI 服务注入
- 位置：`ai-service.ts` 第 210-218 行
- 验证：`userPrompt` 末尾包含知识库参考信息

### ✅ 检查点 8：API 请求
- 位置：`ai-service.ts` 第 250-265 行
- 验证：`messages[messages.length - 1].content` 包含完整的知识库内容

## 故障排查指南

### 场景 1：知识库内容未被传递
**检查步骤：**
1. 在 `knowledge-results-floating-window.ts` 的 `confirmSelection()` 添加日志：
   ```typescript
   console.log("selectedResults:", selectedResults);
   ```
2. 在 `at-trigger-popup.ts` 的 `handleSubmit()` 添加日志：
   ```typescript
   console.log("kbCtx:", kbCtx);
   console.log("contextContent:", contextContent);
   ```
3. 在 `main.ts` 的 `handleContinueWriting()` 添加日志：
   ```typescript
   console.log("context param:", context);
   console.log("injectedContext:", injectedContext);
   ```

### 场景 2：知识库内容未在 AI 回复中被使用
**检查步骤：**
1. 在 `ai-service.ts` 的 `sendRequest()` 添加日志：
   ```typescript
   console.log("Final userPrompt:", userPrompt);
   ```
2. 查看 API 请求体中是否包含知识库内容：
   ```typescript
   console.log("Messages sent to API:", JSON.stringify(messages, null, 2));
   ```

### 场景 3：转换格式不正确
**检查步骤：**
1. 查看 `lookup-pipeline.ts` 中的 `resultsToContext()` 函数
2. 验证返回格式是否正确：`=== 参考: title (path) [相似度: score] ===`
