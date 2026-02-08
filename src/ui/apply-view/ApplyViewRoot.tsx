import { App, MarkdownView, TFile } from 'obsidian'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Undo2, X } from 'lucide-react'

import { computeCharDiff, createDiffBlocks, DiffBlock } from '../../utils/diff'

export type ApplyViewState = {
  file: TFile
  originalContent: string
  newContent: string
}

type BlockDecision = 'pending' | 'incoming' | 'current'

export default function ApplyViewRoot({
  state,
  app,
  close,
}: {
  state: ApplyViewState
  app: App
  close: (shouldDetach?: boolean) => void
}) {
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0)
  const diffBlockRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)

  const t = (key: string, fallback: string) => fallback

  const diff = useMemo(() => {
    try {
      return createDiffBlocks(state.originalContent, state.newContent)
    } catch (e) {
      console.error('[markdown-next-ai] diff failed, using fallback:', e)
      if (state.originalContent === state.newContent) {
        return state.originalContent
          ? [{ type: 'unchanged', value: state.originalContent }]
          : []
      }
      return [
        {
          type: 'modified',
          originalValue:
            state.originalContent && state.originalContent.length > 0
              ? state.originalContent
              : undefined,
          modifiedValue:
            state.newContent && state.newContent.length > 0
              ? state.newContent
              : undefined,
        },
      ]
    }
  }, [state.newContent, state.originalContent])

  const [decisions, setDecisions] = useState<Map<number, BlockDecision>>(
    () => new Map(),
  )

  const modifiedBlockIndices = useMemo(
    () =>
      diff.reduce<number[]>((acc, block, index) => {
        if (block.type !== 'unchanged') {
          acc.push(index)
        }
        return acc
      }, []),
    [diff],
  )

  const decidedCount = useMemo(
    () =>
      modifiedBlockIndices.filter(
        (idx) => decisions.get(idx) && decisions.get(idx) !== 'pending',
      ).length,
    [decisions, modifiedBlockIndices],
  )

  const scrollToDiffBlock = useCallback(
    (index: number) => {
      if (index >= 0 && index < modifiedBlockIndices.length) {
        const element = diffBlockRefs.current[modifiedBlockIndices[index]]
        if (element) {
          element.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setCurrentDiffIndex(index)
        }
      }
    },
    [modifiedBlockIndices],
  )

  const generateFinalContent = useCallback(
    (defaultDecision: 'incoming' | 'current' = 'current') => {
      return diff
        .map((block, index) => {
          if (block.type === 'unchanged') return block.value
          const original = block.originalValue ?? ''
          const incoming = block.modifiedValue ?? ''
          const decision = decisions.get(index) ?? defaultDecision

          switch (decision) {
            case 'incoming':
              return incoming || original
            case 'current':
            case 'pending':
              return decision === 'pending' && defaultDecision === 'incoming'
                ? incoming || original
                : original
            default:
              return original
          }
        })
        .join('\n')
    },
    [diff, decisions],
  )

  const applyAndClose = async () => {
    const newContent = generateFinalContent('current')
    await app.vault.modify(state.file, newContent)

    close(true)

    const targetLeaf = app.workspace
      .getLeavesOfType('markdown')
      .find((leaf) => {
        const view = leaf.view
        return (
          view instanceof MarkdownView && view.file?.path === state.file.path
        )
      })

    if (targetLeaf) {
      app.workspace.setActiveLeaf(targetLeaf, { focus: true })
    } else {
      const leaf = app.workspace.getLeaf(true)
      void leaf.openFile(state.file)
      app.workspace.setActiveLeaf(leaf, { focus: true })
    }
  }

  const makeDecision = useCallback((index: number, decision: BlockDecision) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.set(index, decision)
      return next
    })
  }, [])

  const undoDecision = useCallback((index: number) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
  }, [])

  const renderDiffContent = (block: DiffBlock, index: number) => {
    if (block.type === 'unchanged') {
      return (
        <div
          className="markdown-next-ai-diff-unchanged"
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-monospace)',
            opacity: 0.6,
            padding: '4px 8px',
          }}
        >
          {block.value}
        </div>
      )
    }

    const decision = decisions.get(index) || 'pending'
    const isCurrent = currentDiffIndex === modifiedBlockIndices.indexOf(index)
    const charDiffs = computeCharDiff(
      block.originalValue || '',
      block.modifiedValue || '',
    )

    return (
      <div
        ref={(el) => {
          diffBlockRefs.current[index] = el
        }}
        className={`markdown-next-ai-diff-block ${decision} ${isCurrent ? 'focused' : ''}`}
        style={{
          display: 'flex',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '6px',
          margin: '12px 0',
          overflow: 'hidden',
          backgroundColor: 'var(--background-primary)',
          boxShadow: isCurrent ? '0 0 0 2px var(--interactive-accent)' : 'none',
        }}
        onClick={() => setCurrentDiffIndex(modifiedBlockIndices.indexOf(index))}
      >
        <div
          className="markdown-next-ai-diff-content"
          style={{
            flex: 1,
            padding: '12px',
            overflowX: 'auto',
            fontFamily: 'var(--font-monospace)',
          }}
        >
          {block.originalValue !== undefined &&
            (decision === 'pending' || decision === 'current') && (
              <div
                className="markdown-next-ai-diff-line original"
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-muted)',
                  textDecoration:
                    decision === 'current' ? 'none' : 'line-through',
                  opacity: decision === 'current' ? 1 : 0.7,
                  marginBottom: block.modifiedValue ? '4px' : '0',
                }}
              >
                {charDiffs.map((part, i) => (
                  <span
                    key={i}
                    className={`diff-char ${part.type === 'removed' ? 'removed' : ''} ${part.type === 'added' ? 'hidden' : ''}`}
                    style={{
                      backgroundColor:
                        part.type === 'removed'
                          ? 'rgba(var(--color-red-rgb), 0.2)'
                          : 'transparent',
                      display: part.type === 'added' ? 'none' : 'inline',
                    }}
                  >
                    {part.value}
                  </span>
                ))}
              </div>
            )}
          {block.modifiedValue !== undefined &&
            (decision === 'pending' || decision === 'incoming') && (
              <div
                className="markdown-next-ai-diff-line modified"
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-normal)',
                }}
              >
                {charDiffs.map((part, i) => (
                  <span
                    key={i}
                    className={`diff-char ${part.type === 'added' ? 'added' : ''} ${part.type === 'removed' ? 'hidden' : ''}`}
                    style={{
                      backgroundColor:
                        part.type === 'added'
                          ? 'rgba(var(--color-green-rgb), 0.2)'
                          : 'transparent',
                      display: part.type === 'removed' ? 'none' : 'inline',
                    }}
                  >
                    {part.value}
                  </span>
                ))}
              </div>
            )}
        </div>
        <div
          className="markdown-next-ai-diff-rail"
          style={{
            width: '40px',
            borderLeft: '1px solid var(--background-modifier-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'var(--background-secondary)',
            padding: '4px',
          }}
        >
          {decision === 'pending' ? (
            <>
              <button
                className="diff-action accept"
                onClick={(e) => {
                  e.stopPropagation()
                  makeDecision(index, 'incoming')
                }}
                title={t('applyView.acceptIncoming', 'Accept')}
                style={{
                  padding: '4px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-success)',
                }}
              >
                <Check size={18} />
              </button>
              <button
                className="diff-action reject"
                onClick={(e) => {
                  e.stopPropagation()
                  makeDecision(index, 'current')
                }}
                title={t('applyView.keepCurrent', 'Reject')}
                style={{
                  padding: '4px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-error)',
                }}
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <button
              className="diff-action undo"
              onClick={(e) => {
                e.stopPropagation()
                undoDecision(index)
              }}
              title={t('applyView.undo', 'Undo')}
              style={{
                padding: '4px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              <Undo2 size={18} />
            </button>
          )}
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (modifiedBlockIndices.length > 0) {
      scrollToDiffBlock(0)
    }
  }, [modifiedBlockIndices, scrollToDiffBlock])

  return (
    <div
      id="markdown-next-ai-apply-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      <div
        className="view-header"
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--background-modifier-border)',
        }}
      >
        <div className="view-header-title-container mod-at-start">
          <div className="view-header-title">
            {t('applyView.applying', 'Review Changes')}: {state?.file?.name ?? ''}
          </div>
        </div>
      </div>

      <div
        className="view-content"
        ref={scrollerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
      >
        <div className="markdown-source-view cm-s-obsidian mod-cm6 node-insert-event is-readable-line-width is-live-preview is-folding show-properties">
          <div className="cm-editor">
            <div className="cm-scroller">
              <div className="cm-sizer">
                <div className="markdown-next-ai-inline-title">
                  {state?.file?.name
                    ? state.file.name.replace(/\.[^/.]+$/, '')
                    : ''}
                </div>
                {diff.map((block, index) => renderDiffContent(block, index))}
                <div style={{ height: '80px' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="markdown-next-ai-apply-toolbar-floating"
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '100px',
          padding: '8px 16px',
          display: 'flex',
          gap: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 100,
          alignItems: 'center',
        }}
      >
        <span
          className="markdown-next-ai-apply-progress"
          style={{
            fontSize: '0.9em',
            color: 'var(--text-muted)',
            marginRight: '8px',
          }}
        >
          {decidedCount} / {modifiedBlockIndices.length}
        </span>
        <div
          style={{
            width: '1px',
            height: '16px',
            backgroundColor: 'var(--background-modifier-border)',
          }}
        ></div>
        <button
          onClick={() => close(false)}
          className="markdown-next-ai-toolbar-btn"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-normal)',
            cursor: 'pointer',
          }}
        >
          {t('applyView.cancel', 'Cancel')}
        </button>
        <button
          onClick={() => void applyAndClose()}
          className="markdown-next-ai-toolbar-btn mod-cta"
          style={{
            backgroundColor: 'var(--interactive-accent)',
            color: 'var(--text-on-accent)',
            border: 'none',
            borderRadius: '20px',
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          {t('applyView.applyAndClose', 'Apply Changes')}
        </button>
      </div>
    </div>
  )
}
