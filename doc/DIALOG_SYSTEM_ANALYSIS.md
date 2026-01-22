# Markdown-Next-AI 对话框系统详细分析

## 目录
1. [对话框系统总体架构](#对话框系统总体架构)
2. [对话框唤出机制](#对话框唤出机制)
3. [对话框创建与定位](#对话框创建与定位)
4. [对话框关闭机制](#对话框关闭机制)
5. [子菜单系统](#子菜单系统)
6. [事件监听管理](#事件监听管理)
7. [潜在问题与改进建议](#潜在问题与改进建议)

---

## 对话框系统总体架构

### 核心对话框类型

```
对话框系统
├── AtTriggerPopup (主对话框) ...................... 文件: src/ui/at-trigger-popup.ts
│   ├── 修改模式 (selectedText 不为空)
│   ├── 续写模式 (selectedText 为空)
│   └── 子菜单
│       ├── PromptSelectorPopup (#触发)
│       ├── InputContextSelector (@触发)
│       ├── FileSelectionWindow (选择文件)
│       └── FolderSelectionWindow (选择文件夹)
│
├── AIResultFloatingWindow (结果浮窗) ............ 文件: src/ui/result-floating-window.ts
│   └── 浮窗确认模式（useFloatingPreview=true）
│
├── AIPreviewPopup (预览弹窗) ..................... 文件: src/ui/preview-popup.ts
│   └── 预览生成结果
│
└── PromptSelectorPopup (提示词选择器) ........... 文件: src/ui/prompt-selector.ts
    └── 常用提示词快速选择
```

---

## 对话框唤出机制

### 1. 命令触发方式

#### 1.1 编辑器指令 `open-ai-popup`
**文件**: `src/main.ts` 行 119-126

```typescript
this.addCommand({
    id: "open-ai-popup",
    name: "唤出AI对话框",
    hotkeys: [{ modifiers: ["Alt"], key: "v" }],
    editorCallback: (editor) => {
        const selectedText = editor.getSelection() || "";
        this.showAtTriggerModal(selectedText);
    }
});
```

**触发条件**:
- 需要在编辑器中激活
- 快捷键: `Alt+V`
- 自动获取编辑器选中文本

**调用链**:
```
Command → editorCallback 
    → showAtTriggerModal(selectedText) 
        → new AtTriggerPopup(...).open()
```

#### 1.2 全局指令 `open-ai-popup-global`
**文件**: `src/main.ts` 行 128-135

```typescript
this.addCommand({
    id: "open-ai-popup-global",
    name: "唤出AI对话框（全局模式）",
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "m" }],
    callback: () => {
        this.showAtTriggerModalGlobal("");
    }
});
```

**触发条件**:
- 可在任何位置激活（编辑器外部、侧边栏）
- 快捷键: `Ctrl+Shift+M`
- 使用最后活跃的编辑器视图

**改进内容**（2026-01-03）:
- 新增 `getLastActiveMarkdownView()` 方法
- 优先返回当前活跃编辑器
- 回退到最后活跃编辑器（处理侧边栏场景）
- 追踪机制: `setupLastActiveViewTracker()` 在 `active-leaf-change` 事件

**调用链**:
```
Command → callback 
    → showAtTriggerModalGlobal("") 
        → getLastActiveMarkdownView() (新增)
            → new AtTriggerPopup(...).open()
```

### 2. 事件触发方式

#### 2.1 @ 符号触发
**文件**: `src/main.ts` 行 275-305 (`setupAtTriggerListener`)

```typescript
setupAtTriggerListener(): void {
    const keydownHandler = (e: KeyboardEvent) => {
        // @ 或 &
        if (e.key === "@" || (e.shiftKey && e.key === "2") ||
            e.key === "&" || (e.shiftKey && e.key === "7")) {
            
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || !view.editor) return;

            this.atTriggerTimeout = setTimeout(() => {
                const cursor = view.editor.getCursor();
                const line = view.editor.getLine(cursor.line);
                const textBefore = line.substring(0, cursor.ch);
                const lastChar = textBefore.charAt(textBefore.length - 1);

                if (lastChar === "@" || lastChar === "&") {
                    // 避免 @@ 或 && 误触
                    if (!textBefore.endsWith("@@") && !textBefore.endsWith("&&")) {
                        this.showAtTriggerModal();
                    }
                }
            }, 500);
        }
    };
}
```

**触发流程**:
1. 键盘输入 `@` 或 `&`
2. 延迟 500ms 等待（避免连续输入误触）
3. 检验前一个字符不是 `@` 或 `&`
4. 调用 `showAtTriggerModal()`

**限制**:
- 仅在编辑器中工作
- 需要 enableAtTrigger 设置启用

#### 2.2 右键菜单触发
**文件**: `src/main.ts` 行 216-272 (`setupRightClickListener`)

**情景1：编辑器内右键**
```typescript
this.registerEvent(
    this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const selection = editor.getSelection();
        if (selection && selection.trim()) {
            menu.addItem((item) => {
                item
                    .setTitle("Markdown-Next-AI：修改所选内容")
                    .setIcon("bot")
                    .onClick(() => {
                        this.showAtTriggerModal(selection);
                    });
            });
        }
    })
);
```

**情景2：编辑器外右键（全局模式）**
```typescript
if (this.settings.enableGlobalDialog) {
    document.addEventListener("contextmenu", (event: MouseEvent) => {
        const selection = window.getSelection()?.toString().trim() || "";

        if (selection && !this.isInEditor(event.target as HTMLElement)) {
            this.showGlobalContextMenu(selection, event);
        }
    }, true);
}
```

**调用链**:
```
右键菜单 
    → showAtTriggerModal(selection) 或 showAtTriggerModalGlobal(selection)
        → new AtTriggerPopup(...).open()
```

### 3. 位置定位逻辑

#### 3.1 光标位置获取 `getCursorPosition()`
**文件**: `src/main.ts` 行 413-486

**优先级顺序**:
```
1. 有选中文本
   ├─ 选区开头坐标 (left)
   └─ 选区结尾坐标 (top, height)

2. 无选中文本但有光标
   └─ 光标所在位置坐标

3. 无光标但有鼠标选区
   └─ 鼠标选区坐标

4. 有最后鼠标抬起位置
   └─ lastMouseUpPosition

5. 编辑器容器回退位置
   └─ containerEl.left + 50, containerEl.top + 50
```

**代码**:
```typescript
getCursorPosition(): CursorPosition | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) return null;

    const editor = view.editor;

    // 场景1：有选中文本
    if (editor.somethingSelected()) {
        const startPos = editor.getCursor("from");
        const startCoords = (editor as any).coordsAtPos(startPos);
        const endPos = editor.getCursor("to");
        const endCoords = (editor as any).coordsAtPos(endPos);

        if (startCoords && endCoords) {
            return {
                left: startCoords.left,      // 选区开头
                top: endCoords.top,          // 选区结尾
                height: endCoords.bottom - endCoords.top
            };
        }
    }

    // 场景2-5: 其他回退逻辑
    // ...
}
```

#### 3.2 全局模式回退位置 `getFallbackPosition()`
**文件**: `src/main.ts` 行 488-500

```typescript
private getFallbackPosition(view: MarkdownView | null): CursorPosition | null {
    if (view && view.containerEl) {
        const rect = view.containerEl.getBoundingClientRect();
        return {
            left: rect.left + rect.width / 2,
            top: rect.top + rect.height / 3,
            height: 20
        };
    }

    return {
        left: window.innerWidth / 2,
        top: window.innerHeight / 3,
        height: 20
    };
}
```

---

## 对话框创建与定位

### AtTriggerPopup 创建流程

#### 1. 构造函数
**文件**: `src/ui/at-trigger-popup.ts` 行 70-84

```typescript
constructor(
    app: App,
    onSubmit: (prompt: string, images: ImageData[], modelId: string, contextContent: string, selectedText: string) => void,
    cursorPosition: CursorPosition | null,
    plugin: PluginInterface,
    view: EditorView | null,
    selectedText: string = ""
) {
    this.app = app;
    this.onSubmit = onSubmit;
    this.cursorPosition = cursorPosition;
    this.plugin = plugin;
    this.view = view;
    this.selectedText = selectedText;
    this.imageHandler = new ImageHandler();
}
```

#### 2. DOM 创建和挂载
**文件**: `src/ui/at-trigger-popup.ts` 行 137-203

```typescript
open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.popupEl = document.createElement("div");
    this.popupEl.addClass("markdown-next-ai-at-popup");

    const isModifyMode = this.selectedText.length > 0;
    const titleText = isModifyMode ? "修改所选内容" : "Markdown-Next-AI";
    const placeholderText = isModifyMode ? "请输入修改要求..." : "（@选择文件，#选择常用提示词）...";

    this.popupEl.innerHTML = `
        <div class="markdown-next-ai-popup-header">...</div>
        <div class="markdown-next-ai-popup-content">...</div>
        <!-- 更多内容 -->
    `;
}
```

#### 3. 位置定位
**文件**: `src/ui/at-trigger-popup.ts` 行 468-486

```typescript
private positionPopup(): void {
    if (!this.popupEl || !this.cursorPosition) return;

    // 初始位置设置
    this.popupEl.style.position = "fixed";
    this.popupEl.style.left = this.cursorPosition.left + "px";
    this.popupEl.style.top = (this.cursorPosition.top + this.cursorPosition.height + 8) + "px";

    // 确保不超出视口
    setTimeout(() => {
        if (this.popupEl) {
            const rect = this.popupEl.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                const newLeft = Math.max(8, window.innerWidth - rect.width - 8);
                this.popupEl.style.left = newLeft + "px";
            }
            if (rect.bottom > window.innerHeight) {
                const newTop = Math.max(8, this.cursorPosition.top - rect.height - 8);
                this.popupEl.style.top = newTop + "px";
            }
        }
    }, 0);
}
```

#### 4. DOM 挂载位置
**文件**: `src/ui/at-trigger-popup.ts` 行 465-480

```typescript
// 找到编辑器的滚动容器
if (this.view) {
    this.scrollContainer = this.view.containerEl.querySelector(".cm-scroller");
    if (!this.scrollContainer) {
        this.scrollContainer = this.view.containerEl.querySelector(".cm-editor");
    }
}

if (this.scrollContainer) {
    // 如果容器是 static 定位，改为 relative
    const containerStyle = window.getComputedStyle(this.scrollContainer);
    if (containerStyle.position === "static") {
        (this.scrollContainer as HTMLElement).style.position = "relative";
    }
    this.scrollContainer.appendChild(this.popupEl);
} else {
    document.body.appendChild(this.popupEl);
}
```

**挂载策略**:
- **优先**: 挂载到编辑器的滚动容器 (`.cm-scroller`)
- **其次**: 挂载到编辑器容器 (`.cm-editor`)
- **最后**: 挂载到 `document.body`

**好处**:
- 容器相对定位时，固定定位计算准确
- 跟随编辑器滚动
- 避免超出 viewport

#### 5. 宽度自适应
**文件**: `src/ui/at-trigger-popup.ts` 行 1000-1030

```typescript
private adjustPopupWidth(): void {
    if (!this.popupEl || !this.inputEl) return;

    // 自动调整输入框和弹窗宽度
    const tempDiv = document.createElement("div");
    tempDiv.style.position = "absolute";
    tempDiv.style.visibility = "hidden";
    tempDiv.style.whiteSpace = "pre";
    tempDiv.textContent = (this.inputEl as any).value || "";
    document.body.appendChild(tempDiv);

    const textWidth = tempDiv.offsetWidth;
    document.body.removeChild(tempDiv);

    const minWidth = 400;
    const maxWidth = Math.min(window.innerWidth - 40, 800);
    const width = Math.min(Math.max(textWidth + 35, minWidth), maxWidth);

    (this.inputEl as HTMLElement).style.width = width + "px";
    this.popupEl.style.width = width + "px";
}
```

---

## 对话框关闭机制

### 1. 主动关闭
**文件**: `src/ui/at-trigger-popup.ts` 行 970-1000

```typescript
close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;

    // 1. 关闭子菜单
    if (this.contextSelector) {
        this.contextSelector.close();
        this.contextSelector = null;
    }

    // 2. 清理所有事件监听
    this.eventListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    // 3. 清理外部点击监听
    if (this.outsideClickHandler) {
        document.removeEventListener("click", this.outsideClickHandler);
        this.outsideClickHandler = null;
    }

    // 4. 清理图片处理器
    this.imageHandler.clearImages();

    // 5. 移除 DOM 元素
    if (this.popupEl && this.popupEl.parentNode) {
        this.popupEl.parentNode.removeChild(this.popupEl);
    }
    this.popupEl = null;
    this.inputEl = null;
}
```

### 2. 自动关闭条件

#### 2.1 Escape 键
**文件**: `src/ui/at-trigger-popup.ts` 行 428-436

```typescript
const keydownHandler = (e: KeyboardEvent) => {
    // ...其他条件
    if (e.key === "Escape") {
        e.preventDefault();
        this.close();
    }
};
```

#### 2.2 外部点击
**文件**: `src/ui/at-trigger-popup.ts` 行 443-461

```typescript
const outsideClickHandler = (e: MouseEvent) => {
    // 检查是否有子菜单打开
    if (this.popupEl!.hasAttribute("data-prompt-selecting")) return;
    if ((e.target as HTMLElement).closest(".markdown-next-ai-prompt-selector-popup")) return;
    if ((e.target as HTMLElement).closest(".markdown-next-ai-context-suggestions")) return;
    if (this.contextSelector && this.contextSelector.isOpen) return;
    if ((e.target as HTMLElement).closest(".markdown-next-ai-file-selection-window")) return;
    if ((e.target as HTMLElement).closest(".markdown-next-ai-folder-selection-window")) return;

    // 允许编辑器/预览区域的点击（改变光标时不关闭）
    if ((e.target as HTMLElement).closest(".cm-editor")) return;
    if ((e.target as HTMLElement).closest(".markdown-source-view")) return;
    if ((e.target as HTMLElement).closest(".markdown-preview-view")) return;
    
    // 允许结果浮窗点击
    if ((e.target as HTMLElement).closest(".markdown-next-ai-result-floating-window")) return;
    
    // 允许在弹窗内点击
    if (this.popupEl!.contains(e.target as Node)) return;

    this.close();
};
```

**关闭豁免清单**:
- ✓ 提示词选择器打开
- ✓ 上下文建议打开
- ✓ 文件/文件夹选择器打开
- ✓ 编辑器/预览区点击
- ✓ 结果浮窗点击
- ✓ 弹窗内点击
- ✗ 其他区域点击 → 关闭

#### 2.3 关闭按钮
**文件**: `src/ui/at-trigger-popup.ts` 行 211-212

```typescript
const closeBtn = this.popupEl.querySelector(".markdown-next-ai-popup-close") as HTMLButtonElement;
// ...
closeBtn.onclick = () => this.close();
```

#### 2.4 提交后关闭（条件性）
**文件**: `src/main.ts` 行 547-581

```typescript
async handleContinueWriting(
    prompt: string = "",
    images: ImageData[] = [],
    modelId: string | null = null,
    context: string | null = null,
    selectedText: string = ""
): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    
    // ... 验证和处理
    
    // 非浮窗模式直接写入编辑器并关闭
    // useFloatingPreview=false 时关闭对话框
    
    // 浮窗模式保持对话框打开
    // useFloatingPreview=true 时保持对话框
}
```

---

## 子菜单系统

### 1. 提示词选择器 (PromptSelectorPopup)
**文件**: `src/ui/prompt-selector.ts`

**触发机制**:
```
用户在输入框输入 "#" 
  → inputHandler 检测 "#" 后缀
    → promptSelector.open() 打开选择器
```

**代码位置**: `src/ui/at-trigger-popup.ts` 行 374-399

```typescript
const hashIndex = textBefore.lastIndexOf("#");
if (hashIndex !== -1) {
    const charBefore = hashIndex > 0 ? textBefore.charAt(hashIndex - 1) : " ";
    if (charBefore === " " || charBefore === "\n") {
        this.promptSelector!.open(this.inputEl!);
        // 定位 PromptSelector...
    }
}
```

**菜单项**:
- 从 `settings.commonPrompts` 加载
- 显示提示词名称和内容预览
- 点击后替换 `#` 为选中提示词内容

### 2. 上下文选择器 (InputContextSelector)
**文件**: `src/ui/context-selector.ts`

**触发机制**:
```
用户在输入框输入 "@" 
  → inputHandler 检测 "@" 后缀
    → contextSelector.show() 打开选择器
```

**代码位置**: `src/ui/at-trigger-popup.ts` 行 361-373

```typescript
const atIndex = textBefore.lastIndexOf("@");
if (atIndex !== -1) {
    const query = textBefore.substring(atIndex + 1);
    if (!query.includes(" ") && !query.includes("\n")) {
        this.contextSelector!.show(atIndex, query);
        return; // 优先处理 @
    }
}
```

**菜单项**:
- 文件列表 (`.md`, `.txt`, `.pdf` 等)
- 文件夹列表
- 搜索过滤
- 支持多选

### 3. 文件选择窗口 (FileSelectionWindow)
**文件**: `src/ui/modals/file-modal.ts`

**触发**: 点击 "选择文件" 按钮
```typescript
const selectFileBtn = this.popupEl.querySelector(".markdown-next-ai-select-file-btn") as HTMLButtonElement;
selectFileBtn.onclick = () => this.showFileSelector();
```

**打开方式**:
```typescript
showFileSelector(): void {
    const extensions = ["md", "txt", "docx", "doc", "pdf", "xlsx", "xls", "epub", "mobi", "csv", "json"];
    const files = (this.plugin.app.vault.getFiles() as TFile[])
        .filter(file => extensions.includes(file.extension.toLowerCase()))
        .map(file => ({
            name: file.basename,
            path: file.path,
            extension: file.extension.toLowerCase()
        }));

    const header = this.popupEl!.querySelector(".markdown-next-ai-popup-header");
    if (header) {
        const rect = header.getBoundingClientRect();
        new FileSelectionWindow(this.plugin.app, files, (selected) => {
            this.addFilesToContext(selected);
        }).open(rect);
    }
}
```

**位置**: 相对于弹窗 header 定位

### 4. 文件夹选择窗口 (FolderSelectionWindow)
**文件**: `src/ui/modals/folder-modal.ts`

**触发**: 点击 "选择文件夹" 按钮

**实现类似 FileSelectionWindow**

### 5. 历史面板
**文件**: `src/ui/at-trigger-popup.ts` 行 700-750

**触发**: 点击 "历史" 按钮 (🕘)

```typescript
const historyBtn = this.popupEl.querySelector(".markdown-next-ai-history-btn") as HTMLButtonElement;
historyBtn.onclick = () => {
    if (this.historyContainer) {
        const isVisible = this.historyContainer.style.display !== "none";
        this.historyContainer.style.display = isVisible ? "none" : "block";
        if (!isVisible) {
            // 加载历史记录
            this.loadConversationHistory();
        }
    }
};
```

**内容**:
- 从 `conversationHistory` 加载
- 显示最近 50 条对话
- 支持点击恢复历史输入

---

## 事件监听管理

### 1. 监听器数据结构
**文件**: `src/ui/at-trigger-popup.ts` 行 56-57

```typescript
interface EventListenerEntry {
    element: HTMLElement | Document;
    event: string;
    handler: EventListener;
}

private eventListeners: EventListenerEntry[] = [];
```

### 2. 监听器添加位置

#### 2.1 提交按钮
```typescript
submitBtn.onclick = () => this.submit();
```

#### 2.2 关闭按钮
```typescript
closeBtn.onclick = () => this.close();
```

#### 2.3 文件上传
```typescript
fileChangeHandler = (e: Event) => { /* ... */ };
fileInput.addEventListener("change", fileChangeHandler);
this.eventListeners.push({ 
    element: fileInput, 
    event: "change", 
    handler: fileChangeHandler 
});
```

#### 2.4 模型选择
```typescript
modelChangeHandler = (e: Event) => { /* ... */ };
this.modelSelectEl!.addEventListener("change", modelChangeHandler);
this.eventListeners.push({ 
    element: this.modelSelectEl!, 
    event: "change", 
    handler: modelChangeHandler 
});
```

#### 2.5 输入框键盘事件
```typescript
keydownHandler = (e: KeyboardEvent) => {
    // 处理 Enter (提交)、Escape (关闭)、@ 和 # 触发
};
this.inputEl!.addEventListener("keydown", keydownHandler);
this.eventListeners.push({ 
    element: this.inputEl!, 
    event: "keydown", 
    handler: keydownHandler 
});
```

#### 2.6 外部点击监听
```typescript
outsideClickHandler = (e: MouseEvent) => { /* ... */ };
setTimeout(() => {
    document.addEventListener("click", outsideClickHandler);
}, 100);
```

#### 2.7 拖拽事件 (新增 2026-01-03)
```typescript
// header mousedown/touchstart
// document mousemove/touchmove
// document mouseup/touchend
this.eventListeners.push(
    { element: header, event: "mousedown", handler: onMouseDown },
    { element: document, event: "mousemove", handler: onMouseMove },
    { element: document, event: "mouseup", handler: onMouseUp },
    { element: header, event: "touchstart", handler: onTouchStart },
    { element: document, event: "touchmove", handler: onTouchMove },
    { element: document, event: "touchend", handler: onTouchEnd }
);
```

### 3. 监听器清理流程

```typescript
close(): void {
    // 步骤 1: 关闭子菜单
    if (this.contextSelector) {
        this.contextSelector.close();
    }

    // 步骤 2: 清理所有事件监听
    this.eventListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    // 步骤 3: 清理外部点击监听
    if (this.outsideClickHandler) {
        document.removeEventListener("click", this.outsideClickHandler);
        this.outsideClickHandler = null;
    }

    // 步骤 4: 清理其他资源
    this.imageHandler.clearImages();

    // 步骤 5: 移除 DOM
    if (this.popupEl && this.popupEl.parentNode) {
        this.popupEl.parentNode.removeChild(this.popupEl);
    }
}
```

---

## 潜在问题与改进建议

### 1. 已解决问题 ✅

#### 1.1 全局模式无法获取侧边栏中的编辑器 [已修复]
**问题**: 当侧边栏为活跃时，`getActiveViewOfType()` 返回 null

**解决方案**:
- 新增 `lastActiveMarkdownView` 属性追踪
- 新增 `setupLastActiveViewTracker()` 监听 `active-leaf-change` 事件
- 修改 `getLastActiveMarkdownView()` 优先/回退逻辑

#### 1.2 拖拽性能差与监听器泄漏 [已修复]
**问题**: 
- 使用 `left/top` 绝对定位导致频繁重排
- 拖拽监听器在关闭时未正确清理

**解决方案**:
- 改用 `transform: translate()` (GPU 加速)
- 拖拽监听器添加到 `eventListeners` 数组
- 在 `close()` 中自动清理
- 新增触摸支持

### 2. 未解决的问题与建议 ⚠️

#### 2.1 嵌套弹窗的 z-index 管理
**问题**: 多个弹窗同时打开时的层级关系不明确

**当前状态**:
- AtTriggerPopup 基础 z-index 未指定
- FileSelectionWindow, FolderSelectionWindow z-index: 10001
- ResultFloatingWindow z-index 未指定

**建议**:
```typescript
// 建议创建 z-index 管理常量
const Z_INDEX = {
    AT_POPUP: 1000,
    MODAL_OVERLAY: 10000,
    FILE_SELECTION: 10001,
    FOLDER_SELECTION: 10001,
    RESULT_WINDOW: 1001,
    TOOLTIP: 10002
};
```

#### 2.2 输入框内容验证
**问题**: 提交时未验证是否有实际输入

**当前代码** (`src/ui/at-trigger-popup.ts` 行 103):
```typescript
async submit(): Promise<void> {
    const prompt = this.contextSelector?.getTextContent().trim() || "";
    // 直接提交，无空输入检查
}
```

**建议**:
```typescript
async submit(): Promise<void> {
    const prompt = this.contextSelector?.getTextContent().trim() || "";
    const images = this.imageHandler.getImages();
    const context = await this.getContextContent();
    const selectedKb = (this.knowledgeResults || []).filter(r => 
        (this as any).selectedKnowledge?.has?.(r.source)
    );

    // 验证至少有一项输入
    if (!prompt && images.length === 0 && !context && selectedKb.length === 0) {
        new Notice("请输入提示词、上传图片或选择上下文");
        return;
    }

    // 继续提交...
}
```

#### 2.3 响应式布局支持
**问题**: 弹窗宽度和位置计算未考虑移动设备

**当前最大宽度**: `Math.min(window.innerWidth - 40, 800)`

**建议**:
```typescript
private adjustPopupWidth(): void {
    const maxWidth = window.innerWidth > 768 
        ? 800 
        : window.innerWidth - 20;  // 移动设备: 全屏减去边距
    
    // 其他逻辑...
}
```

#### 2.4 菜单项搜索性能
**问题**: 大量文件时，@ 触发的搜索可能卡顿

**当前实现**: `InputContextSelector.getAllItems()` 实时遍历全部文件

**建议**:
```typescript
// 建议使用防抖
private searchDebounce: ReturnType<typeof setTimeout> | null = null;

updateSearch(query: string): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    
    this.searchDebounce = setTimeout(() => {
        this.items = this.getAllItems(query);
        this.render();
    }, 300);
}
```

#### 2.5 键盘导航缺失
**问题**: 子菜单（文件选择、提示词）不支持方向键导航

**当前支持**: 
- ↑/↓ 导航: ✓
- Enter 选择: ✓
- Escape 关闭: ✓
- ← → 导航: ✗

**建议**: 在 PromptSelectorPopup 和 InputContextSelector 中添加左右方向键支持

#### 2.6 国际化支持缺失
**问题**: 所有文本都是硬编码中文，无 i18n

**建议**: 
```typescript
// 创建 src/i18n.ts
export const messages = {
    zh: {
        continue_writing: "智能续写",
        modify_selected: "修改所选内容",
        // ...
    },
    en: {
        continue_writing: "Continue Writing",
        modify_selected: "Modify Selection",
        // ...
    }
};
```

#### 2.7 辅助功能 (A11y)
**问题**: 弹窗和子菜单缺少 ARIA 属性

**建议**:
```typescript
this.popupEl!.setAttribute("role", "dialog");
this.popupEl!.setAttribute("aria-labelledby", "popup-title");
this.popupEl!.setAttribute("aria-modal", "true");

// 确保焦点管理
this.inputEl!.focus();
```

### 3. 特殊场景处理

#### 3.1 内存泄漏风险
**位置**: 快速打开/关闭弹窗

**当前防护**:
- ✓ eventListeners 数组清理
- ✓ outsideClickHandler 清理
- ✓ imageHandler.clearImages()
- ✓ contextSelector.close()

**可能遗漏**:
- ? markdownComponent 的资源释放 (AIResultFloatingWindow)
- ? Timer/Timeout 的清理 (@触发的 atTriggerTimeout)

#### 3.2 多窗口实例冲突
**情景**: 用户快速按 Alt+V 多次

**当前防护**: `if (this.isOpen) return;` 只在构造函数检查

**建议**: 在 showAtTriggerModal 中添加全局弹窗计数
```typescript
private static openDialogCount = 0;

showAtTriggerModal(selectedText: string = ""): void {
    if (MarkdownNextAIPlugin.openDialogCount > 0) {
        new Notice("对话框已打开，请先关闭");
        return;
    }
    
    MarkdownNextAIPlugin.openDialogCount++;
    // ...
}

// 在 close() 中
static decrementDialogCount() {
    MarkdownNextAIPlugin.openDialogCount--;
}
```

#### 3.3 编辑器卸载时的清理
**风险**: 编辑器关闭时弹窗仍存在

**建议**: 在 onunload 中关闭所有打开的弹窗
```typescript
onunload(): void {
    // 关闭任何打开的弹窗
    if (this.currentAtTriggerPopup && this.currentAtTriggerPopup.isOpen) {
        this.currentAtTriggerPopup.close();
    }
    this.cleanupEventListeners();
}
```

---

## 总结

### 对话框系统流程图

```
┌─ 触发方式 ──────────────────────────────────────┐
│  1. 命令 (Alt+V, Ctrl+Shift+M)                 │
│  2. @ 符号输入 (延迟 500ms)                     │
│  3. 右键菜单 (编辑器内/外)                      │
└─────────┬──────────────────────────────────────┘
          │
          ↓
┌─ 位置计算 ───────────────────────────────────────┐
│  1. getCursorPosition() - 优先级逻辑              │
│  2. getFallbackPosition() - 回退到视口中心        │
│  3. positionPopup() - 防止超出视口               │
└─────────┬──────────────────────────────────────┘
          │
          ↓
┌─ 弹窗创建 ───────────────────────────────────────┐
│  1. 创建 DOM 元素                               │
│  2. 挂载到滚动容器或 body                       │
│  3. 绑定事件监听                                │
│  4. 初始化子组件                                │
└─────────┬──────────────────────────────────────┘
          │
          ↓
┌─ 用户交互 ───────────────────────────────────────┐
│  • 输入提示词或修改要求                         │
│  • @ 选择文件/文件夹                            │
│  • # 选择常用提示词                             │
│  • 上传图片                                     │
│  • 查看历史记录                                 │
│  • 拖拽弹窗 (新增)                              │
└─────────┬──────────────────────────────────────┘
          │
          ↓
┌─ 提交或关闭 ──────────────────────────────────────┐
│  • Submit: 提交给 handleContinueWriting         │
│  • Close: Escape / 外部点击 / 关闭按钮          │
│  • 清理所有监听器和资源                         │
└───────────────────────────────────────────────────┘
```

### 核心代码文件清单

| 文件 | 行数 | 主要职责 |
|------|------|---------|
| `src/main.ts` | 1007 | 命令注册、触发、位置计算 |
| `src/ui/at-trigger-popup.ts` | 1313 | 主弹窗：UI、事件、子菜单 |
| `src/ui/result-floating-window.ts` | 342 | 结果浮窗：流式输出、操作 |
| `src/ui/context-selector.ts` | 469 | @ 选择器：文件列表、搜索 |
| `src/ui/prompt-selector.ts` | 159 | # 选择器：提示词列表 |
| `src/ui/modals/file-modal.ts` | 181 | 文件选择窗口 |
| `src/ui/modals/folder-modal.ts` | 170 | 文件夹选择窗口 |

### 2026-01-03 最新改进总结

✅ **已完成**:
1. 全局模式获取最后活跃编辑器
2. 拖拽功能改用 transform: translate
3. 拖拽监听器完整清理
4. 触摸设备支持

⏳ **建议后续改进**:
1. Z-index 管理系统化
2. 输入验证强化
3. 移动设备响应式设计
4. 菜单项搜索性能优化
5. 键盘导航完整支持
6. 国际化 (i18n) 框架
7. 辅助功能 (A11y) 改进
8. 内存泄漏风险防护
