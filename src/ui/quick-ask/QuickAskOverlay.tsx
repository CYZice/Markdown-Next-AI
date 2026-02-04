import { App, MarkdownView, TFile } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'
import type { CursorPosition, PluginSettings } from '../../types'
import { type QuickAskPanelHandle } from './QuickAskPanel'

type PluginInterface = {
  app: App
  settings: PluginSettings
  getAvailableModels(): { id: string; name: string }[]
  saveSettings(): Promise<void>
}

export class QuickAskOverlay {
  private app: App
  private plugin: PluginInterface
  private view: MarkdownView | null
  private onSubmit: (prompt: string, images: any[], modelId: string, contextContent: string, selectedText: string, mode: string) => void
  private pos: CursorPosition
  private selectedText: string
  private mode: string
  private overlayRoot: HTMLElement | null = null
  private container: HTMLDivElement | null = null
  private root: Root | null = null
  private panelRef: React.RefObject<QuickAskPanelHandle> = React.createRef<QuickAskPanelHandle>()
  private started = false
  private dragPosition: { x: number; y: number } | null = null
  private resizeSize: { width: number; height: number } | null = null
  private cleanup: Array<() => void> = []
  private escHandler: ((e: KeyboardEvent) => void) | null = null

  constructor(app: App, onSubmit: (prompt: string, images: any[], modelId: string, contextContent: string, selectedText: string, mode: string) => void, pos: CursorPosition, plugin: PluginInterface, view: MarkdownView | null, selectedText: string, mode: string) {
    this.app = app
    this.onSubmit = onSubmit
    this.pos = pos
    this.plugin = plugin
    this.view = view
    this.selectedText = selectedText || ''
    this.mode = mode || 'chat'
  }

  open(): void {
    const host = this.view?.containerEl.querySelector('.cm-editor') as HTMLElement | null
    const overlayHost = host ?? document.body
    let root = overlayHost.querySelector('.markdown-next-ai-react-overlay-root') as HTMLElement | null
    if (!root) {
      root = document.createElement('div')
      root.className = 'markdown-next-ai-react-overlay-root'
      overlayHost.appendChild(root)
    }
    const container = document.createElement('div')
    container.className = 'markdown-next-ai-react-overlay'
    container.style.background = 'var(--mn-bg,#fff)'
    container.style.border = '0.5px solid var(--mn-border,#e5e7eb)'
    container.style.borderRadius = '8px'
    container.style.boxShadow = '0 6px 16px rgba(0,0,0,0.05)'
    container.style.padding = '0'
    root.appendChild(container)
    this.overlayRoot = root
    this.container = container
    this.root = createRoot(container)
    this.render()

    this.updatePosition()
    const scrollTarget = host ?? window
    const handleScroll = () => this.updatePosition()
    const handleResize = () => this.updatePosition()
    if (host) {
      host.addEventListener('scroll', handleScroll as any, { passive: true } as any)
      window.addEventListener('resize', handleResize)
      this.cleanup.push(() => host.removeEventListener('scroll', handleScroll as any, { passive: true } as any))
      this.cleanup.push(() => window.removeEventListener('resize', handleResize))
    } else {
      window.addEventListener('scroll', handleScroll as any, { passive: true } as any)
      window.addEventListener('resize', handleResize)
      this.cleanup.push(() => window.removeEventListener('scroll', handleScroll as any))
      this.cleanup.push(() => window.removeEventListener('resize', handleResize))
    }
    this.attachInteractions()
    this.attachEsc()
  }

  private render(): void {
    if (!this.root) return;
    const modelName = this.getModelNameById(this.plugin.settings.currentModel)

    this.root.render(React.createElement(QuickAskPanel, {
      app: this.app,
      initialText: this.selectedText ? '' : '',
      modelName,
      onSubmit: async (prompt: string, images: ImageData[]) => {
        const id = this.plugin.settings.currentModel
        this.panelRef.current?.startAssistantMessage()

        // 解析上下文
        const contextContent = await this.resolveContextContent(prompt);

        this.onSubmit(prompt, images, id, contextContent, this.selectedText, this.mode)
      },
      onClose: () => this.close(),
      onModelClick: (e: React.MouseEvent) => {
        const menu = new Menu();
        const models = this.plugin.getAvailableModels();
        models.forEach(model => {
          menu.addItem(item => {
            item.setTitle(model.name)
              .setChecked(model.id === this.plugin.settings.currentModel)
              .onClick(async () => {
                this.plugin.settings.currentModel = model.id;
                await this.plugin.saveSettings();
                this.render(); // Re-render to update model name
              });
          });
        });
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
      }
    }, null, null) as any, {
      ref: this.panelRef as any
    } as any)
  }

  updateAssistantStreaming(content: string, isComplete?: boolean): void {
    if (!this.panelRef.current) return
    if (!this.started) {
      this.panelRef.current.startAssistantMessage()
      this.started = true
    }
    this.panelRef.current.updateAssistantMessage(content || '')
    if (isComplete) {
      this.started = false
    }
  }

  close(): void {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
      this.container = null
    }
    if (this.overlayRoot && this.overlayRoot.childElementCount === 0) {
      const host = this.overlayRoot.parentElement
      this.overlayRoot.remove()
      this.overlayRoot = null
      if (host) {
      }
    }
    if (this.escHandler) {
      window.removeEventListener('keydown', this.escHandler, true)
      this.escHandler = null
    }
    for (const c of this.cleanup) {
      try { c() } catch { }
    }
    this.cleanup = []
  }

  private async resolveContextContent(prompt: string): Promise<string> {
    let content = "";
    // 匹配 @[file:path] 格式
    const fileRegex = /@\[file:(.*?)\]/g;
    let match;
    const processedPaths = new Set<string>();

    while ((match = fileRegex.exec(prompt)) !== null) {
      const path = match[1];
      if (processedPaths.has(path)) continue;
      processedPaths.add(path);

      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        try {
          const fileContent = await this.app.vault.read(file);
          content += `\n\n--- Content of ${file.path} ---\n${fileContent}\n--- End of ${file.path} ---\n`;
        } catch (e) {
          console.error(`Failed to read file: ${path}`, e);
        }
      }
    }

    // 也可以支持 [[link]] 格式，如果需要的话
    // ...

    return content;
  }

  private getModelNameById(id: string): string {
    const models = this.plugin.getAvailableModels()
    const m = models.find(x => x.id === id)
    return m?.name || id
  }

  private updatePosition(): void {
    if (!this.container) return
    const host = this.overlayRoot?.parentElement ?? document.body
    const hostRect = host.getBoundingClientRect()
    const viewportWidth = hostRect.width
    const margin = 12
    const editorContentWidth = viewportWidth - margin * 2
    const maxPanelWidth = Math.max(120, Math.min(editorContentWidth, viewportWidth - margin * 2))
    const contentLeft = margin
    const contentRight = contentLeft + editorContentWidth
    let left = this.pos.left - hostRect.left
    left = Math.min(left, contentRight - maxPanelWidth)
    left = Math.max(left, contentLeft)
    left = Math.min(left, viewportWidth - margin - maxPanelWidth)
    left = Math.max(left, margin)
    const top = this.pos.top - hostRect.top + this.pos.height + 6
    this.container.style.position = host === document.body ? 'fixed' : 'absolute'
    if (this.dragPosition) {
      const dl = Math.round(this.dragPosition.x - hostRect.left)
      const dt = Math.round(this.dragPosition.y - hostRect.top)
      this.container.style.left = `${Math.max(margin, Math.min(dl, viewportWidth - margin - (this.resizeSize?.width ?? maxPanelWidth)))}px`
      this.container.style.top = `${Math.max(margin, dt)}px`
    } else {
      this.container.style.left = `${Math.round(left)}px`
      this.container.style.top = `${Math.round(top)}px`
    }
    this.container.style.width = `${this.resizeSize?.width ?? maxPanelWidth}px`
    if (this.resizeSize?.height) {
      this.container.style.height = `${this.resizeSize.height}px`
    }
    this.container.style.zIndex = '10002'
  }

  private attachInteractions(): void {
    if (!this.container) return
    const handle = this.container.querySelector('.markdown-next-ai-react-handle') as HTMLElement | null
    const r = this.container.querySelector('.markdown-next-ai-react-resize-right') as HTMLElement | null
    const b = this.container.querySelector('.markdown-next-ai-react-resize-bottom') as HTMLElement | null
    const br = this.container.querySelector('.markdown-next-ai-react-resize-bottom-right') as HTMLElement | null
    if (handle) {
      const onDown = (e: MouseEvent) => {
        const sx = e.clientX
        const sy = e.clientY
        const rect = this.container!.getBoundingClientRect()
        const sl = rect.left
        const st = rect.top
        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - sx
          const dy = ev.clientY - sy
          this.dragPosition = { x: sl + dx, y: st + dy }
          this.updatePosition()
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        this.cleanup.push(() => document.removeEventListener('mousemove', onMove))
        this.cleanup.push(() => document.removeEventListener('mouseup', onUp))
      }
      handle.addEventListener('mousedown', onDown)
      this.cleanup.push(() => handle.removeEventListener('mousedown', onDown))
    }
    const startResize = (dir: 'right' | 'bottom' | 'bottom-right') => (e: MouseEvent) => {
      const rect = this.container!.getBoundingClientRect()
      const sx = e.clientX
      const sy = e.clientY
      const sw = rect.width
      const sh = rect.height
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        let w = sw
        let h = sh
        if (dir === 'right' || dir === 'bottom-right') w = Math.max(300, sw + dx)
        if (dir === 'bottom' || dir === 'bottom-right') h = Math.max(200, sh + dy)
        this.resizeSize = { width: Math.round(w), height: Math.round(h) }
        this.updatePosition()
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      this.cleanup.push(() => document.removeEventListener('mousemove', onMove))
      this.cleanup.push(() => document.removeEventListener('mouseup', onUp))
    }
    if (r) {
      const h = startResize('right')
      r.addEventListener('mousedown', h)
      this.cleanup.push(() => r.removeEventListener('mousedown', h))
    }
    if (b) {
      const h = startResize('bottom')
      b.addEventListener('mousedown', h)
      this.cleanup.push(() => b.removeEventListener('mousedown', h))
    }
    if (br) {
      const h = startResize('bottom-right')
      br.addEventListener('mousedown', h)
      this.cleanup.push(() => br.removeEventListener('mousedown', h))
    }
  }

  private attachEsc(): void {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      this.close()
    }
    window.addEventListener('keydown', handler, true)
    this.escHandler = handler
  }
}
