import { App, MarkdownView, TFile } from 'obsidian'
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

type DecisionSource = 'manual' | 'batch'

interface DecisionState {
  decision: BlockDecision
  source: DecisionSource
}

export default function ApplyViewRoot({
  state,
  app,
  close,
}: {
  state: ApplyViewState
  app: App
  close: () => void
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
  const [decisions, setDecisions] = useState<Map<number, DecisionState>>(
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

  // Count of decided blocks (manual or batch)
  const decidedCount = useMemo(
    () =>
      modifiedBlockIndices.filter(
        (idx) => {
          const d = decisions.get(idx);
          return d && d.decision !== 'pending';
        }
      ).length,
    [decisions, modifiedBlockIndices],
  )
  const totalModifiedBlocks = modifiedBlockIndices.length

  const scrollToDiffBlock = useCallback(
    (index: number) => {
      if (index >= 0 && index < modifiedBlockIndices.length) {
        const element = diffBlockRefs.current[modifiedBlockIndices[index]]
        if (element) {
          element.scrollIntoView({ block: 'start', behavior: 'smooth' })
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
      const decisionState = decisions.get(idx)
      if (!decisionState || decisionState.decision === 'pending') {
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
          const decisionState = decisions.get(index)

          // If a decision exists and is not pending, use it.
          // Otherwise use the default strategy.
          let decision: BlockDecision = decisionState?.decision ?? 'pending';
          if (decision === 'pending') {
            decision = defaultDecision;
          }

          switch (decision) {
            case 'incoming':
              return incoming || original
            case 'current':
              return original
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

  const applyWithStrategy = async (strategy: 'incoming' | 'current') => {
    const newContent = generateFinalContent(strategy)
    await app.vault.modify(state.file, newContent)

    const targetLeaf = app.workspace
      .getLeavesOfType('markdown')
      .find((leaf) => {
        const view = leaf.view
        return (
          view instanceof MarkdownView && view.file?.path === state.file.path
        )
      })

    close()

    if (targetLeaf) {
      app.workspace.setActiveLeaf(targetLeaf, { focus: true })
      return
    }

    const leaf = app.workspace.getLeaf(true)
    await leaf.openFile(state.file)
    app.workspace.setActiveLeaf(leaf, { focus: true })
  }

  // Individual block decisions
  const makeDecision = useCallback(
    (index: number, decision: BlockDecision, source: DecisionSource = 'manual') => {
      setDecisions((prev) => {
        const next = new Map(prev)
        next.set(index, { decision, source })
        return next
      })

      // Auto-scroll to next undecided block only if it was a manual decision
      if (source === 'manual') {
        // Small delay to allow UI to update and user to see the change briefly if needed,
        // though user requested "instant disappear".
        // We will scroll immediately or with very slight delay.
        setTimeout(() => {
          scrollToNextUndecided()
        }, 50)
      }
    },
    [scrollToNextUndecided],
  )

  const acceptIncomingBlock = useCallback(
    (index: number) => {
      makeDecision(index, 'incoming', 'manual')
    },
    [makeDecision],
  )

  const acceptCurrentBlock = useCallback(
    (index: number) => {
      makeDecision(index, 'current', 'manual') // Abandon/Skip both map to current
    },
    [makeDecision],
  )

  const undoDecision = useCallback((index: number) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
  }, [])

  // Batch action: Accept all REMAINING (undecided) blocks as incoming
  const acceptRemaining = useCallback(() => {
    setDecisions((prev) => {
      const next = new Map(prev);
      modifiedBlockIndices.forEach((idx) => {
        // If not decided yet, mark as incoming (batch)
        if (!next.has(idx) || next.get(idx)?.decision === 'pending') {
          next.set(idx, { decision: 'incoming', source: 'batch' });
        }
      });
      return next;
    });
  }, [modifiedBlockIndices]);

  const resetAllDecisions = useCallback(() => {
    setDecisions(new Map())
  }, [])

  const updateCurrentDiffFromScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const scrollerRect = scroller.getBoundingClientRect()
    const scrollerTop = scrollerRect.top
    const visibleThreshold = 50 // pixels

    // Find the first visible diff block
    for (let i = 0; i < modifiedBlockIndices.length; i++) {
      const element = diffBlockRefs.current[modifiedBlockIndices[i]]
      if (!element) continue

      const rect = element.getBoundingClientRect()
      const relativeTop = rect.top - scrollerTop

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

  const remainingCount = totalModifiedBlocks - decidedCount;

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
            onClick={() => void applyWithStrategy('incoming')}
            className="markdown-next-ai-toolbar-btn markdown-next-ai-action-btn insert"
            title={t('applyView.insertAll', 'Insert all remaining changes and apply')}
          >
            {t('applyView.insert', 'Insert')}
          </button>
          <button
            onClick={() => void applyWithStrategy('current')}
            className="markdown-next-ai-toolbar-btn markdown-next-ai-action-btn abandon"
            title={t('applyView.abandonAll', 'Abandon all remaining changes and apply')}
          >
            {t('applyView.abandon', 'Abandon')}
          </button>

          <div className="markdown-next-ai-toolbar-divider"></div>

          {decidedCount > 0 && (
            <button
              onClick={resetAllDecisions}
              className="markdown-next-ai-toolbar-btn"
              title={t('applyView.reset', 'Reset all decisions')}
            >
              {t('applyView.reset', 'Reset')}
            </button>
          )}
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
                    decisionState={decisions.get(index)}
                    onAcceptIncoming={() => acceptIncomingBlock(index)}
                    onAcceptCurrent={() => acceptCurrentBlock(index)}
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
    decisionState?: DecisionState
    onAcceptIncoming: () => void
    onAcceptCurrent: () => void
    onUndo: () => void
    t: (keyPath: string, fallback: string) => string
  }
>(
  (
    {
      block: part,
      decisionState,
      onAcceptIncoming,
      onAcceptCurrent,
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
      const isDecided = decisionState && decisionState.decision !== 'pending'
      const decision = decisionState?.decision

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

      if (isDecided) {
        // Render CLEAN decided state (no indicators, just content + hover undo)
        return (
          <div
            className="markdown-next-ai-diff-block-container decided"
            ref={ref}
          >
            <div className="markdown-next-ai-diff-block decided-content-wrapper">
              {/* Hover Undo Button */}
              <div className="markdown-next-ai-hover-undo-container">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndo();
                  }}
                  className="markdown-next-ai-hover-undo-btn"
                  title={t('applyView.undo', 'Undo decision')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                </button>
              </div>
              <div className="markdown-next-ai-diff-block-content">
                {getDecisionPreview()}
              </div>
            </div>
          </div>
        )
      }

      // Render Undecided State with 3 actions: Insert, Abandon, Skip
      return (
        <div
          className="markdown-next-ai-diff-block-container undecided"
          ref={ref}
        >
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
            <button onClick={onAcceptIncoming} className="markdown-next-ai-action-btn insert">
              {t('applyView.insert', 'Insert')}
            </button>
            <button onClick={onAcceptCurrent} className="markdown-next-ai-action-btn abandon">
              {t('applyView.abandon', 'Abandon')}
            </button>
          </div>
        </div>
      )
    }
    return null;
  },
)

DiffBlockView.displayName = 'DiffBlockView'
