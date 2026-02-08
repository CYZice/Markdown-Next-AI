import { App, MarkdownView, TFile } from 'obsidian'
import * as React from 'react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { createDiffBlocks, DiffBlock } from '../../utils/diff'

export type ApplyViewState = {
  file: TFile
  originalContent: string
  newContent: string
}

// Decision type for each diff block
type BlockDecision = 'pending' | 'incoming' | 'current' | 'both'

export default function ApplyViewRoot({
  state,
  app,
  close,
}: {
  state: ApplyViewState
  app: App
  close: (shouldDetach?: boolean) => void
}) {
  const [, setCurrentDiffIndex] = useState(0)
  const diffBlockRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Simple translation helper
  const t = (key: string, fallback: string) => fallback

  const diff = useMemo(() => {
    try {
      return createDiffBlocks(state.originalContent, state.newContent)
    } catch (e) {
      console.error('[markdown-next-ai] diff 计算失败，使用兜底逻辑:', e)
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

  // Track decisions for each modified block
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

  // Count of decided and pending blocks
  const decidedCount = useMemo(
    () =>
      modifiedBlockIndices.filter(
        (idx) => decisions.get(idx) && decisions.get(idx) !== 'pending',
      ).length,
    [decisions, modifiedBlockIndices],
  )
  const totalModifiedBlocks = modifiedBlockIndices.length

  const scrollToDiffBlock = useCallback(
    (index: number) => {
      if (index >= 0 && index < modifiedBlockIndices.length) {
        const element = diffBlockRefs.current[modifiedBlockIndices[index]]
        if (element) {
          element.scrollIntoView({ block: 'start' })
          setCurrentDiffIndex(index)
        }
      }
    },
    [modifiedBlockIndices],
  )

  // Scroll to the next undecided block
  const scrollToNextUndecided = useCallback(() => {
    for (let i = 0; i < modifiedBlockIndices.length; i++) {
      const idx = modifiedBlockIndices[i]
      const decision = decisions.get(idx)
      if (!decision || decision === 'pending') {
        scrollToDiffBlock(i)
        return
      }
    }
  }, [decisions, modifiedBlockIndices, scrollToDiffBlock])

  // Generate final content based on decisions
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
            case 'both':
              return [original, incoming].filter(Boolean).join('\n')
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

  // Individual block decisions (don't close, just mark decision)
  const makeDecision = useCallback(
    (index: number, decision: BlockDecision) => {
      setDecisions((prev) => {
        const next = new Map(prev)
        next.set(index, decision)
        return next
      })
      // Auto-scroll to next undecided block after a short delay
      setTimeout(() => {
        scrollToNextUndecided()
      }, 100)
    },
    [scrollToNextUndecided],
  )

  const acceptIncomingBlock = useCallback(
    (index: number) => {
      makeDecision(index, 'incoming')
    },
    [makeDecision],
  )

  const acceptCurrentBlock = useCallback(
    (index: number) => {
      makeDecision(index, 'current')
    },
    [makeDecision],
  )

  const acceptBothBlocks = useCallback(
    (index: number) => {
      makeDecision(index, 'both')
    },
    [makeDecision],
  )

  // Undo a decision
  const undoDecision = useCallback((index: number) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
  }, [])

  // Global actions
  const acceptAllIncoming = useCallback(() => {
    const newDecisions = new Map<number, BlockDecision>()
    modifiedBlockIndices.forEach((idx) => {
      newDecisions.set(idx, 'incoming')
    })
    setDecisions(newDecisions)
  }, [modifiedBlockIndices])

  const acceptAllCurrent = useCallback(() => {
    const newDecisions = new Map<number, BlockDecision>()
    modifiedBlockIndices.forEach((idx) => {
      newDecisions.set(idx, 'current')
    })
    setDecisions(newDecisions)
  }, [modifiedBlockIndices])

  const resetAllDecisions = useCallback(() => {
    setDecisions(new Map())
  }, [])

  const updateCurrentDiffFromScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const scrollerRect = scroller.getBoundingClientRect()
    const scrollerTop = scrollerRect.top
    const visibleThreshold = 10 // pixels from top to consider element "visible"

    // Find the first visible diff block
    for (let i = 0; i < modifiedBlockIndices.length; i++) {
      const element = diffBlockRefs.current[modifiedBlockIndices[i]]
      if (!element) continue

      const rect = element.getBoundingClientRect()
      const relativeTop = rect.top - scrollerTop

      // If element is visible (slightly below the top of the viewport)
      if (relativeTop >= -visibleThreshold) {
        setCurrentDiffIndex(i)
        break
      }
    }
  }, [modifiedBlockIndices])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const handleScroll = () => {
      updateCurrentDiffFromScroll()
    }

    scroller.addEventListener('scroll', handleScroll)
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [updateCurrentDiffFromScroll])

  useEffect(() => {
    if (modifiedBlockIndices.length > 0) {
      scrollToDiffBlock(0)
    }
  }, [modifiedBlockIndices, scrollToDiffBlock])

  return (
    <div id="markdown-next-ai-apply-view">
      <div className="view-header">
        <div className="view-header-title-container mod-at-start">
          <div className="view-header-title">
            {t('applyView.applying', 'Applying')}: {state?.file?.name ?? ''}
          </div>
        </div>
      </div>

      {/* Global actions toolbar */}
      <div className="markdown-next-ai-apply-toolbar">
        <div className="markdown-next-ai-apply-toolbar-left">
          <span className="markdown-next-ai-apply-progress">
            {decidedCount} / {totalModifiedBlocks}{' '}
            {t('applyView.changesResolved', 'changes resolved')}
          </span>
        </div>
        <div className="markdown-next-ai-apply-toolbar-right">
          <button
            onClick={acceptAllIncoming}
            className="markdown-next-ai-toolbar-btn markdown-next-ai-accept"
            title={t(
              'applyView.acceptAllIncoming',
              'Accept all incoming changes',
            )}
          >
            {t('applyView.acceptAllIncoming', 'Accept All Incoming')}
          </button>
          <button
            onClick={acceptAllCurrent}
            className="markdown-next-ai-toolbar-btn markdown-next-ai-exclude"
            title={t(
              'applyView.rejectAll',
              'Reject all changes (keep original)',
            )}
          >
            {t('applyView.rejectAll', 'Reject All')}
          </button>
          {decidedCount > 0 && (
            <button
              onClick={resetAllDecisions}
              className="markdown-next-ai-toolbar-btn"
              title={t('applyView.reset', 'Reset all decisions')}
            >
              {t('applyView.reset', 'Reset')}
            </button>
          )}
          <button
            onClick={() => void applyAndClose()}
            className="markdown-next-ai-toolbar-btn markdown-next-ai-apply-btn"
            title={t('applyView.applyAndClose', 'Apply changes and close')}
          >
            {t('applyView.applyAndClose', 'Apply & Close')}
          </button>
        </div>
      </div>

      <div className="view-content">
        <div className="markdown-source-view cm-s-obsidian mod-cm6 node-insert-event is-readable-line-width is-live-preview is-folding show-properties">
          <div className="cm-editor">
            <div className="cm-scroller" ref={scrollerRef}>
              <div className="cm-sizer">
                <div className="markdown-next-ai-inline-title">
                  {state?.file?.name
                    ? state.file.name.replace(/\.[^/.]+$/, '')
                    : ''}
                </div>

                {diff.map((block, index) => (
                  <DiffBlockView
                    key={index}
                    block={block}
                    decision={decisions.get(index)}
                    onAcceptIncoming={() => acceptIncomingBlock(index)}
                    onAcceptCurrent={() => acceptCurrentBlock(index)}
                    onAcceptBoth={() => acceptBothBlocks(index)}
                    onUndo={() => undoDecision(index)}
                    t={t}
                    ref={(el) => {
                      diffBlockRefs.current[index] = el
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DiffBlockView = forwardRef<
  HTMLDivElement,
  {
    block: DiffBlock
    decision?: BlockDecision
    onAcceptIncoming: () => void
    onAcceptCurrent: () => void
    onAcceptBoth: () => void
    onUndo: () => void
    t: (keyPath: string, fallback: string) => string
  }
>(
  (
    {
      block: part,
      decision,
      onAcceptIncoming,
      onAcceptCurrent,
      onAcceptBoth,
      onUndo,
      t,
    },
    ref,
  ) => {
    if (part.type === 'unchanged') {
      return (
        <div className="markdown-next-ai-diff-block">
          <div className="markdown-next-ai-diff-block-content">{part.value}</div>
        </div>
      )
    } else if (part.type === 'modified') {
      const isDecided = decision && decision !== 'pending'

      // Show preview of the decision result
      const getDecisionPreview = () => {
        if (!isDecided) return null
        const original = part.originalValue ?? ''
        const incoming = part.modifiedValue ?? ''

        switch (decision) {
          case 'incoming':
            return incoming || original
          case 'current':
            return original
          case 'both':
            return [original, incoming].filter(Boolean).join('\n')
          default:
            return null
        }
      }

      const decisionLabel: Record<string, string> = {
        incoming: t('applyView.acceptedIncoming', 'Accepted incoming'),
        current: t('applyView.keptCurrent', 'Kept current'),
        both: t('applyView.mergedBoth', 'Merged both'),
      }

      return (
        <div
          className={`markdown-next-ai-diff-block-container ${isDecided ? 'decided' : ''}`}
          ref={ref}
        >
          {isDecided ? (
            // Show decided state with preview
            <>
              <div className="markdown-next-ai-diff-block decided-preview">
                <div className="markdown-next-ai-decided-header">
                  <span className="markdown-next-ai-decided-label">
                    ✓ {decisionLabel[decision]}
                  </span>
                  <button
                    onClick={onUndo}
                    className="markdown-next-ai-undo-btn"
                    title={t('applyView.undo', 'Undo this decision')}
                  >
                    {t('applyView.undo', 'Undo')}
                  </button>
                </div>
                <div className="markdown-next-ai-diff-block-content">
                  {getDecisionPreview()}
                </div>
              </div>
            </>
          ) : (
            // Show original diff view with actions
            <>
              {part.originalValue && part.originalValue.length > 0 && (
                <div className="markdown-next-ai-diff-block removed">
                  <div className="markdown-next-ai-diff-block-content">
                    {part.originalValue}
                  </div>
                </div>
              )}
              {part.modifiedValue && part.modifiedValue.length > 0 && (
                <div className="markdown-next-ai-diff-block added">
                  <div className="markdown-next-ai-diff-block-content">
                    {part.modifiedValue}
                  </div>
                </div>
              )}
              <div className="markdown-next-ai-diff-block-actions">
                <button onClick={onAcceptIncoming} className="markdown-next-ai-accept">
                  {t('applyView.acceptIncoming', 'Accept incoming')}
                </button>
                <button onClick={onAcceptCurrent} className="markdown-next-ai-exclude">
                  {t('applyView.acceptCurrent', 'Accept current')}
                </button>
                <button onClick={onAcceptBoth}>
                  {t('applyView.acceptBoth', 'Accept both')}
                </button>
              </div>
            </>
          )}
        </div>
      )
    }
  },
)

DiffBlockView.displayName = 'DiffBlockView'
