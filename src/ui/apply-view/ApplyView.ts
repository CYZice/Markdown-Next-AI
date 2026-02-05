import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import { createElement } from 'react'
import { Root, createRoot } from 'react-dom/client'

import ApplyViewRoot, { ApplyViewState } from './ApplyViewRoot'

export const APPLY_VIEW_TYPE = 'markdown-next-ai-apply-view'

export class ApplyView extends ItemView {
  private root: Root | null = null
  private state: ApplyViewState | null = null

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
  }

  getViewType() {
    return APPLY_VIEW_TYPE
  }

  getDisplayText() {
    return `Applying: ${this.state?.file?.name ?? ''}`
  }

  getIcon() {
    return 'diff'
  }

  async setState(state: ApplyViewState, _result?: ViewStateResult): Promise<void> {
    this.state = state
    // Should render here because onOpen is called before setState
    this.render()
    return Promise.resolve()
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.containerEl)
    if (this.state) {
      this.render()
    }
    return Promise.resolve()
  }

  async onClose(): Promise<void> {
    this.root?.unmount()
    return Promise.resolve()
  }

  private render(): void {
    if (!this.root || !this.state) return
    this.root.render(
      createElement(ApplyViewRoot, {
        state: this.state,
        app: this.app,
        close: (shouldDetach: boolean = false) => {
          if (shouldDetach) {
            this.leaf.detach()
            return
          }
          const file = this.state?.file
          if (file) {
            void this.leaf.openFile(file)
          } else {
            this.leaf.detach()
          }
        },
      })
    )
  }
}
